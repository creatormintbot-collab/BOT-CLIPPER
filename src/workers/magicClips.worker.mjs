import fs from 'node:fs/promises';
import path from 'node:path';
import { Input } from 'telegraf';
import { nowIso } from '../core/utils/time.mjs';
import { cutVerticalSegment, concatSegments } from '../services/clipper/render.mjs';
import {
  convertAudioToWav,
  downloadAudioOnly,
  downloadSourceVideo,
  runCommand
} from '../services/youtube/download.mjs';

const INSTALL_COMMANDS = [
  'apt update && apt install -y ffmpeg wget python3 python3-venv python3-pip',
  'wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp',
  'python3 -m venv .venv && . .venv/bin/activate && pip install faster-whisper'
].join('\n');

const STOPWORDS_ID = new Set([
  'yang',
  'dan',
  'atau',
  'di',
  'ke',
  'dari',
  'itu',
  'ini',
  'untuk',
  'dengan',
  'pada',
  'kita',
  'kamu',
  'aku',
  'saya',
  'gue',
  'lo',
  'jadi',
  'karena',
  'ada',
  'aja',
  'sih',
  'nih',
  'deh',
  'the',
  'a',
  'an',
  'to',
  'of',
  'is',
  'are'
]);

const HOOK_TERMS = ['stop', 'jangan', 'kalau lo', 'masalahnya', 'yang orang', '?'];
const PAIN_TERMS = ['capek', 'stuck', 'bingung', 'gagal', 'takut', 'nggak', 'tidak', 'ga', 'gak'];
const DESIRE_TERMS = ['pengen', 'mau', 'biar', 'supaya', 'target', 'impian'];
const SOLUTION_TERMS = [
  'caranya',
  'solusinya',
  'yang harus',
  'coba',
  'mulai',
  'pertama',
  'kedua',
  'ketiga'
];
const AGITATE_TERMS = ['parah', 'gila', 'serius', 'banget', 'fatal', 'kalau nggak', 'bakal'];
const STEP_TERMS = ['pertama', 'kedua', 'ketiga', 'langkah', 'step'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function wordCount(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function parseWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countOccurrences(source, pattern) {
  if (!source || !pattern) {
    return 0;
  }

  if (pattern === '?') {
    return (source.match(/\?/g) || []).length;
  }

  let from = 0;
  let hits = 0;
  while (from < source.length) {
    const index = source.indexOf(pattern, from);
    if (index === -1) {
      break;
    }
    hits += 1;
    from = index + pattern.length;
  }
  return hits;
}

function scoreFromTerms(textLower, terms, weight = 1) {
  let score = 0;
  for (const term of terms) {
    const occurrences = countOccurrences(textLower, term);
    if (occurrences > 0) {
      score += occurrences * weight;
    }
  }
  return score;
}

function detectStepOrder(textLower) {
  if (textLower.includes('pertama') || textLower.includes('first')) {
    return 1;
  }
  if (textLower.includes('kedua') || textLower.includes('second')) {
    return 2;
  }
  if (textLower.includes('ketiga') || textLower.includes('third')) {
    return 3;
  }
  return 99;
}

function scoreCandidate(candidate) {
  const textLower = candidate.text.toLowerCase();
  const wc = wordCount(candidate.text);
  const durationSec = Math.max(0.4, candidate.end - candidate.start);

  const hookScore = scoreFromTerms(textLower, HOOK_TERMS, 1.1);
  const painScore = scoreFromTerms(textLower, PAIN_TERMS, 1);
  const desireScore = scoreFromTerms(textLower, DESIRE_TERMS, 1);
  const solutionScore = scoreFromTerms(textLower, SOLUTION_TERMS, 1.1);
  const agitateBoost = scoreFromTerms(textLower, AGITATE_TERMS, 1.3);
  const listPatternScore = scoreFromTerms(textLower, STEP_TERMS, 1.2);
  const fillerPenalty =
    scoreFromTerms(textLower, ['eee', 'eem', 'anu', 'hmm', 'emm'], 0.7) +
    (textLower.match(/\b(\w+)(\s+\1){2,}\b/g) || []).length * 0.8;
  const lengthPenalty = wc < 20 || wc > 110 ? 1.2 : 0;
  const clarity = clamp(3.4 - fillerPenalty - lengthPenalty + listPatternScore * 0.3, 0, 3.5);

  const labels = {
    HOOK: hookScore,
    PAIN: painScore,
    DESIRE: desireScore,
    SOLUTION: solutionScore
  };
  const label = Object.entries(labels).sort((a, b) => b[1] - a[1])[0][0];

  const singleScore = hookScore + painScore + solutionScore + agitateBoost + clarity - fillerPenalty;
  const hotTakeScore = hookScore * 2 + painScore * 1.5 + agitateBoost * 2 + solutionScore * 0.6 + clarity;
  const checklistScore = solutionScore * 2 + listPatternScore * 2 + clarity - fillerPenalty * 0.3;
  const storyScore = desireScore * 2 + painScore * 1.1 + clarity + solutionScore * 0.6 + agitateBoost * 0.4;

  return {
    ...candidate,
    durationSec: round3(durationSec),
    wordCount: wc,
    label,
    scores: {
      hookScore: round3(hookScore),
      painScore: round3(painScore),
      desireScore: round3(desireScore),
      solutionScore: round3(solutionScore),
      agitateBoost: round3(agitateBoost),
      listPatternScore: round3(listPatternScore),
      fillerPenalty: round3(fillerPenalty),
      lengthPenalty: round3(lengthPenalty),
      clarity: round3(clarity),
      stepOrder: detectStepOrder(textLower)
    },
    singleScore: round3(singleScore),
    hotTakeScore: round3(hotTakeScore),
    checklistScore: round3(checklistScore),
    storyScore: round3(storyScore)
  };
}

function normalizeTranscriptSegments(items) {
  return items
    .map((item, index) => ({
      id: `t-${index + 1}`,
      start: clamp(Number(item?.start) || 0, 0, Number.MAX_SAFE_INTEGER),
      end: clamp(Number(item?.end) || 0, 0, Number.MAX_SAFE_INTEGER),
      text: String(item?.text || '').trim()
    }))
    .filter((segment) => segment.text && segment.end > segment.start + 0.2)
    .sort((a, b) => a.start - b.start);
}

function buildCandidates(transcriptSegments) {
  const generated = [];
  for (let i = 0; i < transcriptSegments.length; i += 1) {
    const first = transcriptSegments[i];
    const texts = [];

    for (let j = i; j < transcriptSegments.length; j += 1) {
      const current = transcriptSegments[j];
      texts.push(current.text);

      const start = first.start;
      const end = current.end;
      const durationSec = end - start;

      if (durationSec < 12) {
        continue;
      }

      if (durationSec > 28) {
        break;
      }

      generated.push(
        scoreCandidate({
          id: `c-${i + 1}-${j + 1}`,
          start: round3(start),
          end: round3(end),
          text: texts.join(' ').replace(/\s+/g, ' ').trim()
        })
      );
    }
  }

  if (generated.length === 0) {
    for (let i = 0; i < transcriptSegments.length; i += 1) {
      const segment = transcriptSegments[i];
      const durationSec = segment.end - segment.start;
      if (durationSec >= 8 && durationSec <= 28) {
        generated.push(
          scoreCandidate({
            id: `fallback-${i + 1}`,
            start: round3(segment.start),
            end: round3(segment.end),
            text: segment.text
          })
        );
      }
    }
  }

  const deduped = new Map();
  for (const candidate of generated) {
    const key = `${Math.round(candidate.start * 10)}-${Math.round(candidate.end * 10)}`;
    const existing = deduped.get(key);
    if (!existing || candidate.singleScore > existing.singleScore) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].sort((a, b) => a.start - b.start);
}

function determineHighlightCount(targetLengthSec) {
  if (targetLengthSec >= 83) {
    return 5;
  }
  if (targetLengthSec >= 70) {
    return 4;
  }
  return 3;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function overlapsAny(segment, list) {
  for (const item of list) {
    if (overlaps(segment, item)) {
      return true;
    }
  }
  return false;
}

function totalDuration(segments) {
  return round3(segments.reduce((acc, item) => acc + Math.max(0, item.end - item.start), 0));
}

function cloneSegment(segment) {
  return {
    ...segment,
    scores: { ...segment.scores },
    reusedFrom: segment.reusedFrom || null
  };
}

function dedupeById(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function pullBestSolutionCandidate(ranked, selected) {
  for (const candidate of ranked) {
    if (selected.some((item) => item.id === candidate.id)) {
      continue;
    }
    if (candidate.scores.solutionScore < 1) {
      continue;
    }
    if (overlapsAny(candidate, selected)) {
      continue;
    }
    return cloneSegment(candidate);
  }
  return null;
}

function trimToTarget(segments, targetLengthSec, maxEndSec) {
  const selected = dedupeById(segments.map((item) => cloneSegment(item)));
  if (selected.length === 0) {
    return selected;
  }

  while (totalDuration(selected) > targetLengthSec + 8 && selected.length > 1) {
    let lowestIndex = 0;
    let lowestScore = selected[0].singleScore;
    for (let i = 1; i < selected.length; i += 1) {
      if (selected[i].singleScore < lowestScore) {
        lowestIndex = i;
        lowestScore = selected[i].singleScore;
      }
    }
    selected.splice(lowestIndex, 1);
  }

  let total = totalDuration(selected);
  if (total > targetLengthSec + 2) {
    const overflow = total - targetLengthSec;
    const last = selected[selected.length - 1];
    const currentDuration = last.end - last.start;
    const minDuration = 8;
    const reducible = Math.max(0, currentDuration - minDuration);
    const delta = Math.min(reducible, overflow);
    last.end = round3(last.end - delta);
    last.durationSec = round3(last.end - last.start);
    total = totalDuration(selected);
  }

  if (total < targetLengthSec - 10) {
    const last = selected[selected.length - 1];
    const extend = Math.min(targetLengthSec - total, 8);
    last.end = round3(Math.min(maxEndSec, last.end + extend));
    last.durationSec = round3(last.end - last.start);
  }

  return selected.filter((item) => item.end > item.start + 0.4);
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function sentenceParts(text) {
  const parts = String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (parts.length > 0) {
    return parts;
  }

  return [String(text).trim()].filter(Boolean);
}

function firstStrongSentence(text) {
  const parts = sentenceParts(text);
  for (const part of parts) {
    if (wordCount(part) >= 5) {
      return part;
    }
  }
  return parts[0] || text;
}

function corePoint(text) {
  const parts = sentenceParts(text);
  if (parts.length <= 1) {
    return parts[0] || text;
  }
  return `${parts[0]} ${parts[1]}`.trim();
}

function payoffSentence(text) {
  const parts = sentenceParts(text);
  return parts[parts.length - 1] || text;
}

function extractKeywords(text, limit = 3) {
  const counts = new Map();
  for (const token of parseWords(text)) {
    if (token.length <= 2 || STOPWORDS_ID.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((entry) => entry[0]);

  if (ranked.length >= limit) {
    return ranked;
  }

  const fallback = ['fokus', 'aksi', 'hasil'];
  for (const item of fallback) {
    if (ranked.length >= limit) {
      break;
    }
    if (!ranked.includes(item)) {
      ranked.push(item);
    }
  }

  return ranked;
}

function headlineFromKeywords(keywords) {
  const words = keywords.slice(0, 3).map((item) => item.charAt(0).toUpperCase() + item.slice(1));
  if (words.length < 2) {
    return 'Inti Pesan';
  }
  return words.join(' ');
}

function mapPurposeByLabel(label) {
  if (label === 'HOOK') {
    return 'Pattern interrupt untuk mempertahankan perhatian.';
  }
  if (label === 'PAIN') {
    return 'Memvisualkan masalah agar konteks lebih jelas.';
  }
  if (label === 'DESIRE') {
    return 'Menunjukkan outcome yang diinginkan audiens.';
  }
  return 'Menegaskan langkah solusi praktis.';
}

function fireflyPromptByLabel(label, keywords) {
  const keywordText = keywords.join(', ');
  if (label === 'HOOK') {
    return {
      textToImage: `Vertical 9:16 cinematic portrait of a creator interrupted by a bold realization, dynamic contrast lighting, expressive face, modern Indonesian city backdrop, high detail, no text, no logo, no watermark, inspired by ${keywordText}`,
      imageToVideo:
        'Animate subtle handheld movement with a quick push-in, natural eye motion, soft parallax in background, keep framing vertical 9:16 and realistic.',
      negative: 'text, logo, watermark, low resolution, blur, artifacts, distorted hands, deformed face'
    };
  }

  if (label === 'PAIN') {
    return {
      textToImage: `Vertical 9:16 scene of an overwhelmed person at a cluttered workspace, late-night atmosphere, emotional realism, cinematic shadows, realistic textures, no text, no logo, no watermark, theme: ${keywordText}`,
      imageToVideo:
        'Animate gentle camera dolly-in, subtle breathing motion, monitor flicker and ambient room movement, maintain realistic cinematic style.',
      negative: 'text, logo, watermark, cartoon style, blurry details, oversaturated colors, distorted anatomy'
    };
  }

  if (label === 'DESIRE') {
    return {
      textToImage: `Vertical 9:16 aspirational scene, confident person reviewing progress milestones, warm morning light, clean workspace, hopeful tone, photorealistic, no text, no logo, no watermark, inspired by ${keywordText}`,
      imageToVideo:
        'Animate smooth upward camera movement, subtle sunlight shifts, gentle motion on background elements, keep realistic and calm pacing.',
      negative: 'text, logo, watermark, low quality, grainy image, unrealistic body proportions, extra limbs'
    };
  }

  return {
    textToImage: `Vertical 9:16 practical scene of hands writing a clear step-by-step action plan in notebook, clean desk setup, realistic lighting, crisp detail, no text, no logo, no watermark, inspired by ${keywordText}`,
    imageToVideo:
      'Animate subtle top-down camera drift, realistic hand movement, small page turns, stable cinematic look with gentle motion.',
    negative: 'text, logo, watermark, blurry, low quality, glitch, distorted fingers, warped perspective'
  };
}

function withMergedTimeline(segments) {
  let cursor = 0;
  return segments.map((segment) => {
    const durationSec = round3(Math.max(0.4, segment.end - segment.start));
    const mergedStart = cursor;
    const mergedEnd = cursor + durationSec;
    cursor = mergedEnd;
    return {
      ...segment,
      durationSec,
      mergedStart: round3(mergedStart),
      mergedEnd: round3(mergedEnd)
    };
  });
}

function buildFireflySuggestions(segments) {
  const safeSegments = segments.length > 0 ? segments : [];
  if (safeSegments.length === 0) {
    return [];
  }

  const count = clamp(safeSegments.length || 2, 2, 4);
  const suggestions = [];

  for (let i = 0; i < count; i += 1) {
    const segment = safeSegments[i % safeSegments.length];
    const keywords = extractKeywords(segment.text, 3);
    const prompt = fireflyPromptByLabel(segment.label, keywords);
    const insertStart = round3(segment.mergedStart + Math.min(1.2, segment.durationSec * 0.2));
    const insertEnd = round3(Math.min(segment.mergedEnd, insertStart + Math.min(3, segment.durationSec * 0.35 + 0.9)));

    suggestions.push({
      start: insertStart,
      end: insertEnd,
      purpose: mapPurposeByLabel(segment.label),
      textToImage: prompt.textToImage,
      imageToVideo: prompt.imageToVideo,
      negative: prompt.negative
    });
  }

  return suggestions;
}

function buildGuideMarkdown({ job, output, mergedTimeline }) {
  const modeText = output.mode === 'single' ? 'Single (Best)' : '3 Variants';
  const lines = [];

  lines.push(`# Panduan Editing - ${output.strategyName}`);
  lines.push('');
  lines.push('## Ringkasan');
  lines.push(`- URL: ${job.payload.urlNormalized}`);
  lines.push(`- Target durasi: ${job.payload.targetLengthSec}s`);
  lines.push(`- Mode output: ${modeText}`);
  lines.push(`- Strategi: ${output.strategyName}`);
  if (output.reuseNotes.length > 0) {
    lines.push(`- Catatan overlap: ${output.reuseNotes.join('; ')}`);
  }
  lines.push('');
  lines.push('## Timeline Video Merged');
  for (const segment of mergedTimeline) {
    const preview = firstStrongSentence(segment.text).slice(0, 90);
    lines.push(
      `- ${formatClock(segment.mergedStart)}-${formatClock(segment.mergedEnd)} | ${segment.label} | ${preview}`
    );
  }
  lines.push('');
  lines.push('## Rincian per Segmen');

  mergedTimeline.forEach((segment, index) => {
    const keywords = extractKeywords(segment.text, 3);
    lines.push(`### Segmen ${index + 1}`);
    lines.push(`- Label peran: ${segment.label}`);
    lines.push(`- Kalimat hook: ${firstStrongSentence(segment.text)}`);
    lines.push(`- Poin inti: ${corePoint(segment.text)}`);
    lines.push(`- Kalimat payoff: ${payoffSentence(segment.text)}`);
    lines.push(`- Rencana overlay text: Headline "${headlineFromKeywords(keywords)}"`);
    lines.push(`- Rencana overlay text: 3 keyword pops -> ${keywords.join(', ')}`);
    lines.push('- Catatan motion: hard cut di awal, punch-in saat kalimat kunci, pop text pada keyword.');
    lines.push('');
  });

  const suggestions = buildFireflySuggestions(mergedTimeline);
  lines.push('## Paket Prompt Firefly');
  suggestions.forEach((item, index) => {
    lines.push(`### Saran Insert ${index + 1}`);
    lines.push(`- Waktu insert (merged): ${formatClock(item.start)}-${formatClock(item.end)}`);
    lines.push(`- Tujuan: ${item.purpose}`);
    lines.push(`- Text-to-Image prompt (English): ${item.textToImage}`);
    lines.push(`- Image-to-Video prompt (English): ${item.imageToVideo}`);
    lines.push(`- Negative prompt (English): ${item.negative}`);
    lines.push('');
  });

  return `${lines.join('\n').trim()}\n`;
}

function rankByScore(candidates, scoreKey) {
  return [...candidates].sort((a, b) => b[scoreKey] - a[scoreKey]);
}

function pickSegments({
  ranked,
  targetCount,
  targetLengthSec,
  usedRanges,
  outputKey,
  reuseTracker,
  allowReuse
}) {
  const selected = [];

  for (const candidate of ranked) {
    if (selected.some((item) => item.id === candidate.id)) {
      continue;
    }
    if (overlapsAny(candidate, selected)) {
      continue;
    }

    const overlapWithUsed = usedRanges.find((range) => overlaps(range, candidate));
    let reusedFrom = null;

    if (overlapWithUsed) {
      if (!allowReuse || reuseTracker.count >= 1) {
        continue;
      }
      reusedFrom = overlapWithUsed.outputKey;
      reuseTracker.count += 1;
      reuseTracker.notes.push(
        `Segmen ${formatClock(candidate.start)}-${formatClock(candidate.end)} dipakai ulang dari ${overlapWithUsed.outputKey}.`
      );
    }

    selected.push({
      ...cloneSegment(candidate),
      reusedFrom
    });

    if (
      selected.length >= targetCount &&
      totalDuration(selected) >= targetLengthSec - 8
    ) {
      break;
    }

    if (selected.length >= 6) {
      break;
    }
  }

  return selected.map((item) => ({
    ...item,
    outputKey
  }));
}

function topUpSegments({ selected, ranked, targetLengthSec, maxEndSec }) {
  const next = [...selected];

  for (const candidate of ranked) {
    if (next.some((item) => item.id === candidate.id)) {
      continue;
    }
    if (overlapsAny(candidate, next)) {
      continue;
    }
    next.push(cloneSegment(candidate));
    if (totalDuration(next) >= targetLengthSec - 8 || next.length >= 6) {
      break;
    }
  }

  return trimToTarget(next, targetLengthSec, maxEndSec);
}

function orderSingleArc(selected) {
  const all = dedupeById(selected);
  if (all.length <= 1) {
    return all;
  }

  const intro = [...all]
    .filter((item) => item.label === 'HOOK' || item.label === 'PAIN')
    .sort((a, b) => b.singleScore - a.singleScore);
  const solutions = [...all]
    .filter((item) => item.label === 'SOLUTION')
    .sort((a, b) => b.scores.solutionScore - a.scores.solutionScore);
  const recap = [...all]
    .filter((item) => item.label !== 'SOLUTION')
    .sort((a, b) => b.scores.clarity - a.scores.clarity);
  const middle = [...all]
    .filter((item) => !intro.some((x) => x.id === item.id) && !solutions.some((x) => x.id === item.id))
    .sort((a, b) => b.singleScore - a.singleScore);

  const ordered = [];
  if (intro[0]) {
    ordered.push(intro[0]);
  }

  ordered.push(...middle);
  ordered.push(...solutions);

  if (recap[0] && !ordered.some((item) => item.id === recap[0].id)) {
    ordered.push(recap[0]);
  }

  for (const item of all) {
    if (!ordered.some((picked) => picked.id === item.id)) {
      ordered.push(item);
    }
  }

  return dedupeById(ordered);
}

function orderHotTake(selected) {
  const intro = selected
    .filter((item) => item.label === 'HOOK' || item.label === 'PAIN')
    .sort((a, b) => b.hotTakeScore - a.hotTakeScore);
  const body = selected
    .filter((item) => item.label !== 'SOLUTION' && !intro.some((x) => x.id === item.id))
    .sort((a, b) => b.hotTakeScore - a.hotTakeScore);
  const solution = selected
    .filter((item) => item.label === 'SOLUTION')
    .sort((a, b) => b.scores.solutionScore - a.scores.solutionScore);

  return dedupeById([...intro, ...body, ...solution]);
}

function orderChecklist(selected) {
  return dedupeById(
    [...selected].sort((a, b) => {
      const stepDelta = a.scores.stepOrder - b.scores.stepOrder;
      if (stepDelta !== 0) {
        return stepDelta;
      }
      return b.checklistScore - a.checklistScore;
    })
  );
}

function orderStory(selected) {
  const start = selected
    .filter((item) => item.label === 'DESIRE' || item.label === 'PAIN')
    .sort((a, b) => b.storyScore - a.storyScore);
  const middle = selected
    .filter((item) => item.label !== 'SOLUTION' && !start.some((x) => x.id === item.id))
    .sort((a, b) => b.storyScore - a.storyScore);
  const ending = selected
    .filter((item) => item.label === 'SOLUTION')
    .sort((a, b) => b.scores.solutionScore - a.scores.solutionScore);

  return dedupeById([...start, ...middle, ...ending]);
}

function ensureSingleRequirements(selected, ranked, targetLengthSec, maxEndSec) {
  const next = [...selected];
  if (!next.some((item) => item.scores.solutionScore >= 1)) {
    const solution = pullBestSolutionCandidate(ranked, next);
    if (solution) {
      next.push(solution);
    }
  }

  const ordered = orderSingleArc(trimToTarget(next, targetLengthSec, maxEndSec));
  return trimToTarget(ordered, targetLengthSec, maxEndSec);
}

function ensureHotTakeRequirements(selected, ranked, targetLengthSec, maxEndSec) {
  const next = [...selected];
  if (!next.some((item) => item.scores.solutionScore >= 1)) {
    const solution = pullBestSolutionCandidate(ranked, next);
    if (solution) {
      next.push(solution);
    }
  }
  return trimToTarget(orderHotTake(next), targetLengthSec, maxEndSec);
}

function isChecklistStep(segment) {
  return segment.scores.listPatternScore >= 1 || segment.scores.stepOrder < 99;
}

function ensureChecklistRequirements(selected, ranked, targetLengthSec, maxEndSec) {
  const next = [...selected];
  while (next.filter(isChecklistStep).length < 2) {
    const step = ranked.find(
      (candidate) =>
        isChecklistStep(candidate) &&
        !next.some((item) => item.id === candidate.id) &&
        !overlapsAny(candidate, next)
    );
    if (!step) {
      break;
    }
    next.push(cloneSegment(step));
  }
  return trimToTarget(orderChecklist(next), targetLengthSec, maxEndSec);
}

function ensureStoryRequirements(selected, ranked, targetLengthSec, maxEndSec) {
  const next = [...selected];
  if (!next.some((item) => item.scores.solutionScore >= 1)) {
    const solution = pullBestSolutionCandidate(ranked, next);
    if (solution) {
      next.push(solution);
    }
  }

  let ordered = orderStory(next);
  const tailSolutionIndex = ordered.findIndex((item) => item.label === 'SOLUTION');
  if (tailSolutionIndex > -1 && tailSolutionIndex !== ordered.length - 1) {
    const [solution] = ordered.splice(tailSolutionIndex, 1);
    ordered.push(solution);
  }

  return trimToTarget(ordered, targetLengthSec, maxEndSec);
}

function assembleSingleOutput({ candidates, targetLengthSec, maxEndSec }) {
  const highlightCount = determineHighlightCount(targetLengthSec);
  const ranked = rankByScore(candidates, 'singleScore');
  let selected = pickSegments({
    ranked,
    targetCount: highlightCount,
    targetLengthSec,
    usedRanges: [],
    outputKey: 'best',
    reuseTracker: { count: 0, notes: [] },
    allowReuse: false
  });

  selected = topUpSegments({ selected, ranked, targetLengthSec, maxEndSec });
  selected = ensureSingleRequirements(selected, ranked, targetLengthSec, maxEndSec);

  return [
    {
      key: 'best',
      mode: 'single',
      strategyName: 'Single (Best)',
      variantHeader: null,
      segments: selected,
      reuseNotes: []
    }
  ];
}

function assembleVariantOutput({ candidates, targetLengthSec, maxEndSec }) {
  const highlightCount = determineHighlightCount(targetLengthSec);
  const usedRanges = [];
  const reuseTracker = { count: 0, notes: [] };

  const plans = [
    {
      key: 'hot_take',
      strategyName: 'Hot Take / Pattern Interrupt',
      variantHeader: 'Variant A — Hot Take',
      scoreKey: 'hotTakeScore',
      ensure: ensureHotTakeRequirements
    },
    {
      key: 'checklist',
      strategyName: 'Checklist / Practical Steps',
      variantHeader: 'Variant B — Checklist',
      scoreKey: 'checklistScore',
      ensure: ensureChecklistRequirements
    },
    {
      key: 'story',
      strategyName: 'Story / Reflection',
      variantHeader: 'Variant C — Story',
      scoreKey: 'storyScore',
      ensure: ensureStoryRequirements
    }
  ];

  const outputs = [];

  for (const plan of plans) {
    const ranked = rankByScore(candidates, plan.scoreKey);
    let selected = pickSegments({
      ranked,
      targetCount: highlightCount,
      targetLengthSec,
      usedRanges,
      outputKey: plan.key,
      reuseTracker,
      allowReuse: false
    });

    if (selected.length < 3 && reuseTracker.count < 1) {
      const withReuse = pickSegments({
        ranked,
        targetCount: highlightCount,
        targetLengthSec,
        usedRanges,
        outputKey: plan.key,
        reuseTracker,
        allowReuse: true
      });

      for (const item of withReuse) {
        if (!selected.some((existing) => existing.id === item.id)) {
          selected.push(item);
        }
      }
    }

    selected = topUpSegments({ selected, ranked, targetLengthSec, maxEndSec });
    selected = plan.ensure(selected, ranked, targetLengthSec, maxEndSec);

    const reuseNotes = selected
      .filter((item) => item.reusedFrom)
      .map((item) => `Segmen ${formatClock(item.start)}-${formatClock(item.end)} reuse dari ${item.reusedFrom}.`);

    outputs.push({
      key: plan.key,
      mode: 'variants',
      strategyName: plan.strategyName,
      variantHeader: plan.variantHeader,
      segments: selected,
      reuseNotes
    });

    selected.forEach((item) => {
      usedRanges.push({
        start: item.start,
        end: item.end,
        outputKey: plan.key
      });
    });
  }

  return outputs;
}

function assembleOutputs({ candidates, targetLengthSec, outputMode, maxEndSec }) {
  if (outputMode === 'variants') {
    return assembleVariantOutput({ candidates, targetLengthSec, maxEndSec });
  }
  return assembleSingleOutput({ candidates, targetLengthSec, maxEndSec });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function checkCommand(command, args, logger) {
  try {
    await runCommand(command, args, { logger });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function resolvePythonBin(env, logger) {
  const preferredVenvBin = '/opt/bot-clipper/.venv/bin/python';
  const candidates = [];

  if (await pathExists(preferredVenvBin)) {
    candidates.push(preferredVenvBin);
  }
  if (env.PYTHON_BIN) {
    candidates.push(env.PYTHON_BIN);
  }
  if (!candidates.includes('python3')) {
    candidates.push('python3');
  }

  const checked = [];
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const versionCheck = await checkCommand(candidate, ['--version'], logger);
    if (!versionCheck.ok) {
      checked.push(`${candidate} unavailable`);
      continue;
    }

    const whisperCheck = await checkCommand(candidate, ['-c', 'import faster_whisper'], logger);
    if (whisperCheck.ok) {
      return { ok: true, pythonBin: candidate };
    }

    checked.push(`${candidate} cannot import faster_whisper`);
  }

  return {
    ok: false,
    pythonBin: null,
    reasons: checked
  };
}

function toolingError(lines) {
  const error = new Error(lines.join('\n'));
  error.userFacing = lines.join('\n');
  error.isTooling = true;
  return error;
}

async function ensureRuntimeTools({ env, logger }) {
  const missing = [];

  const ytDlpCheck = await checkCommand('yt-dlp', ['--version'], logger);
  if (!ytDlpCheck.ok) {
    missing.push('- yt-dlp (binary not found or not executable)');
  }

  const ffmpegCheck = await checkCommand('ffmpeg', ['-version'], logger);
  if (!ffmpegCheck.ok) {
    missing.push('- ffmpeg (binary not found or not executable)');
  }

  const pythonResolution = await resolvePythonBin(env, logger);
  if (!pythonResolution.ok) {
    missing.push('- python3 with faster-whisper importable');
    if (pythonResolution.reasons.length > 0) {
      missing.push(...pythonResolution.reasons.map((item) => `  ${item}`));
    }
  }

  if (missing.length > 0) {
    throw toolingError([
      'Magic Clips prerequisites are missing.',
      ...missing,
      '',
      'Install commands (Ubuntu 24.04):',
      INSTALL_COMMANDS
    ]);
  }

  return {
    ytDlpBin: 'yt-dlp',
    ffmpegBin: 'ffmpeg',
    pythonBin: pythonResolution.pythonBin
  };
}

async function safeSendMessage(telegram, chatId, text, logger) {
  if (!telegram || !Number.isInteger(chatId)) {
    return;
  }

  try {
    await telegram.sendMessage(chatId, text);
  } catch (error) {
    logger.warn('Failed to send Telegram message.', {
      chatId,
      message: error?.message
    });
  }
}

async function transcribeAudio({
  pythonBin,
  wavPath,
  transcriptPath,
  modelName,
  language,
  logger
}) {
  const scriptPath = path.resolve('scripts/transcribe_faster_whisper.py');
  await runCommand(
    pythonBin,
    [
      scriptPath,
      '--audio',
      wavPath,
      '--output',
      transcriptPath,
      '--model',
      modelName,
      '--language',
      language
    ],
    { logger }
  );
}

async function loadTranscript(transcriptPath) {
  const raw = await fs.readFile(transcriptPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Transcript output must be an array of segments.');
  }
  return normalizeTranscriptSegments(parsed);
}

async function updateJob(storage, jobId, updater) {
  return storage.update(`jobs.${jobId}`, (current = {}) => {
    const existingPayload =
      current.payload && typeof current.payload === 'object' ? current.payload : {};
    const next = updater(current, existingPayload);
    return next;
  });
}

async function setJobRunning(storage, jobId) {
  return updateJob(storage, jobId, (current, payload) => ({
    ...current,
    status: 'running',
    stage: 'starting',
    startedAt: nowIso(),
    payload: {
      ...payload,
      status: 'running'
    }
  }));
}

async function setJobStage(storage, jobId, stage, meta = {}) {
  return updateJob(storage, jobId, (current, payload) => ({
    ...current,
    stage,
    ...meta,
    payload: {
      ...payload,
      status: current.status || 'running'
    }
  }));
}

async function setJobFailed(storage, jobId, errorMessage) {
  return updateJob(storage, jobId, (current, payload) => ({
    ...current,
    status: 'failed',
    stage: 'failed',
    failedAt: nowIso(),
    error: errorMessage,
    payload: {
      ...payload,
      status: 'failed'
    }
  }));
}

async function setJobCompleted(storage, jobId, outputs) {
  return updateJob(storage, jobId, (current, payload) => ({
    ...current,
    status: 'completed',
    stage: 'completed',
    completedAt: nowIso(),
    outputs,
    payload: {
      ...payload,
      status: 'completed'
    }
  }));
}

async function cutSegmentsForOutput({
  sourceVideoPath,
  output,
  tmpJobDir,
  ffmpegBin,
  width,
  height,
  logger
}) {
  const outputTmpDir = path.resolve(tmpJobDir, output.key);
  await fs.mkdir(outputTmpDir, { recursive: true });

  const segmentFiles = [];
  for (let i = 0; i < output.segments.length; i += 1) {
    const segment = output.segments[i];
    const fileName = `seg-${String(i + 1).padStart(2, '0')}.mp4`;
    const segmentPath = path.resolve(outputTmpDir, fileName);

    await cutVerticalSegment({
      sourcePath: sourceVideoPath,
      outputPath: segmentPath,
      startSec: segment.start,
      endSec: segment.end,
      width,
      height,
      ffmpegBin,
      logger
    });

    segmentFiles.push(segmentPath);
  }

  return { outputTmpDir, segmentFiles };
}

async function mergeOutputAndWriteGuide({
  job,
  output,
  segmentFiles,
  outputTmpDir,
  jobsJobDir,
  ffmpegBin,
  logger
}) {
  const outputJobDir = path.resolve(jobsJobDir, output.key);
  await fs.mkdir(outputJobDir, { recursive: true });

  const mergedPath = path.resolve(outputJobDir, 'MERGED.mp4');
  await concatSegments({
    segmentPaths: segmentFiles,
    outputPath: mergedPath,
    tempDir: outputTmpDir,
    ffmpegBin,
    logger
  });

  const mergedTimeline = withMergedTimeline(output.segments);
  const guideMarkdown = buildGuideMarkdown({
    job,
    output,
    mergedTimeline
  });
  const guidePath = path.resolve(outputJobDir, 'editing-guide.md');
  await fs.writeFile(guidePath, guideMarkdown, 'utf8');

  return {
    ...output,
    mergedTimeline,
    mergedPath,
    guidePath
  };
}

async function uploadOutputs({ telegram, chatId, mode, outputs, logger }) {
  if (!telegram || !Number.isInteger(chatId)) {
    throw new Error('Telegram client is unavailable for upload.');
  }

  if (mode === 'single') {
    const output = outputs[0];
    await telegram.sendVideo(chatId, Input.fromLocalFile(output.mergedPath));
    await telegram.sendDocument(chatId, Input.fromLocalFile(output.guidePath));
    await telegram.sendMessage(chatId, 'Done. Merged video + Editing Guide attached.');
    return;
  }

  const orderedKeys = ['hot_take', 'checklist', 'story'];
  for (const key of orderedKeys) {
    const output = outputs.find((item) => item.key === key);
    if (!output) {
      continue;
    }

    await telegram.sendMessage(chatId, output.variantHeader);
    await telegram.sendVideo(chatId, Input.fromLocalFile(output.mergedPath));
    await telegram.sendDocument(chatId, Input.fromLocalFile(output.guidePath));
  }

  logger.info('Variant uploads completed.', { chatId });
}

function sanitizePayload(payload) {
  const outputMode = payload?.outputMode === 'variants' ? 'variants' : 'single';
  const targetLengthSec = clamp(Number(payload?.targetLengthSec) || 75, 60, 90);
  const urlNormalized = String(payload?.urlNormalized || payload?.urlOriginal || '').trim();
  const urlOriginal = String(payload?.urlOriginal || payload?.urlNormalized || '').trim();

  if (!urlNormalized) {
    throw new Error('Job payload is missing YouTube URL.');
  }

  return {
    urlOriginal,
    urlNormalized,
    targetLengthSec,
    outputMode
  };
}

export async function processMagicClipsJob(job, { storage, logger, env, telegram }) {
  const chatId = job.chatId;
  await setJobRunning(storage, job.id);

  try {
    const payload = sanitizePayload(job.payload || {});
    const dataDir = path.resolve(env.DATA_DIR || './data');
    const tmpJobDir = path.resolve(dataDir, 'tmp', job.id);
    const jobsJobDir = path.resolve(dataDir, 'jobs', job.id);

    await fs.mkdir(tmpJobDir, { recursive: true });
    await fs.mkdir(jobsJobDir, { recursive: true });

    const tools = await ensureRuntimeTools({ env, logger });
    await setJobStage(storage, job.id, 'tools_checked');

    await safeSendMessage(telegram, chatId, 'Downloading audio...', logger);
    const downloadedAudioPath = await downloadAudioOnly({
      url: payload.urlNormalized,
      workDir: tmpJobDir,
      ytDlpBin: tools.ytDlpBin,
      logger
    });
    const wavPath = path.resolve(tmpJobDir, 'audio.wav');
    await convertAudioToWav({
      inputPath: downloadedAudioPath,
      outputPath: wavPath,
      ffmpegBin: tools.ffmpegBin,
      logger
    });
    await setJobStage(storage, job.id, 'audio_ready');

    await safeSendMessage(telegram, chatId, 'Transcribing...', logger);
    const transcriptPath = path.resolve(tmpJobDir, 'transcript.json');
    await transcribeAudio({
      pythonBin: tools.pythonBin,
      wavPath,
      transcriptPath,
      modelName: env.WHISPER_MODEL,
      language: env.WHISPER_LANGUAGE,
      logger
    });
    const transcriptSegments = await loadTranscript(transcriptPath);
    if (transcriptSegments.length === 0) {
      throw new Error('Transcribing completed but no transcript segments were produced.');
    }
    await setJobStage(storage, job.id, 'transcribed', {
      transcriptSegments: transcriptSegments.length
    });

    await safeSendMessage(telegram, chatId, 'Selecting highlights...', logger);
    const candidates = buildCandidates(transcriptSegments);
    if (candidates.length === 0) {
      throw new Error('No valid candidates found from transcript.');
    }
    const maxEndSec = transcriptSegments[transcriptSegments.length - 1].end;
    const outputPlans = assembleOutputs({
      candidates,
      targetLengthSec: payload.targetLengthSec,
      outputMode: payload.outputMode,
      maxEndSec
    });
    await setJobStage(storage, job.id, 'highlights_selected', {
      candidateCount: candidates.length
    });

    await safeSendMessage(telegram, chatId, 'Cutting...', logger);
    const sourceVideoPath = await downloadSourceVideo({
      url: payload.urlNormalized,
      workDir: tmpJobDir,
      ytDlpBin: tools.ytDlpBin,
      ffmpegBin: tools.ffmpegBin,
      logger
    });

    const cutOutputs = [];
    for (const output of outputPlans) {
      const cuts = await cutSegmentsForOutput({
        sourceVideoPath,
        output,
        tmpJobDir,
        ffmpegBin: tools.ffmpegBin,
        width: env.OUTPUT_WIDTH,
        height: env.OUTPUT_HEIGHT,
        logger
      });

      cutOutputs.push({
        ...output,
        outputTmpDir: cuts.outputTmpDir,
        segmentFiles: cuts.segmentFiles
      });
    }
    await setJobStage(storage, job.id, 'cut_done');

    await safeSendMessage(telegram, chatId, 'Merging...', logger);
    const renderedOutputs = [];
    for (const output of cutOutputs) {
      const merged = await mergeOutputAndWriteGuide({
        job: {
          ...job,
          payload
        },
        output,
        segmentFiles: output.segmentFiles,
        outputTmpDir: output.outputTmpDir,
        jobsJobDir,
        ffmpegBin: tools.ffmpegBin,
        logger
      });
      renderedOutputs.push(merged);
    }
    await setJobStage(storage, job.id, 'merged');

    await safeSendMessage(telegram, chatId, 'Uploading to Telegram...', logger);
    await uploadOutputs({
      telegram,
      chatId,
      mode: payload.outputMode,
      outputs: renderedOutputs,
      logger
    });

    const storedOutputs = renderedOutputs.map((item) => ({
      key: item.key,
      strategyName: item.strategyName,
      mode: item.mode,
      mergedPath: item.mergedPath,
      guidePath: item.guidePath,
      durationSec: totalDuration(item.segments),
      segments: item.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        label: segment.label,
        reusedFrom: segment.reusedFrom || null
      }))
    }));

    const completed = await setJobCompleted(storage, job.id, storedOutputs);
    logger.info('Magic Clips job completed.', {
      jobId: job.id,
      outputs: storedOutputs.length
    });
    return completed;
  } catch (error) {
    const detail = error?.message || 'Unknown failure.';
    const userMessage = error?.userFacing || `Magic Clips failed: ${detail}`;

    await setJobFailed(storage, job.id, detail);
    await safeSendMessage(telegram, chatId, userMessage, logger);
    logger.error('Magic Clips job failed.', {
      jobId: job.id,
      message: detail,
      stack: error?.stack
    });
    return storage.get(`jobs.${job.id}`, job);
  }
}
