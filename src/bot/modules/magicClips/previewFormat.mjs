import { variantLabel } from './ux.mjs';

function toClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function clipOneLine(text, limit = 98) {
  const safe = String(text || '').replace(/\s+/g, ' ').trim();
  if (!safe) {
    return '-';
  }
  if (safe.length <= limit) {
    return safe;
  }
  return `${safe.slice(0, limit - 1)}...`;
}

function ensureThreeWhyBullets(items) {
  const safe = Array.isArray(items) ? items.filter(Boolean).slice(0, 3) : [];
  while (safe.length < 3) {
    safe.push('Strong clarity and easy-to-follow structure.');
  }
  return safe.slice(0, 3);
}

function normalizePreviewLines(lines) {
  const safe = Array.isArray(lines)
    ? lines.map((line) => clipOneLine(line, 92)).filter(Boolean)
    : [];
  while (safe.length < 4) {
    safe.push('Tight edit keeps one idea moving forward.');
  }
  return safe.slice(0, 7);
}

function formatCandidateBlock(slot, candidate) {
  if (!candidate) {
    return [
      `Candidate ${slot}`,
      '- Source range: 00:00 -> 00:00',
      '- Main topic: Not available',
      '- Hook: Not available',
      '- Virality score: 0/100',
      '- Why it works:',
      '  1) Clear structure',
      '  2) Concise framing',
      '  3) Practical payoff',
      '- Edited preview script:',
      '  • N/A',
      '  • N/A',
      '  • N/A',
      '  • N/A'
    ].join('\n');
  }

  const whyBullets = ensureThreeWhyBullets(candidate.whyItWorks);
  const scriptLines = normalizePreviewLines(candidate.editedPreviewScriptLines);
  return [
    `Candidate ${slot}`,
    `- Source range: ${toClock(candidate.sourceStartSec)} -> ${toClock(candidate.sourceEndSec)}`,
    `- Main topic: ${clipOneLine(candidate.mainTopic, 60)}`,
    `- Hook: ${clipOneLine(candidate.hook, 120)}`,
    `- Virality score: ${Math.round(Number(candidate.viralityScore) || 0)}/100`,
    '- Why it works:',
    `  1) ${clipOneLine(whyBullets[0], 90)}`,
    `  2) ${clipOneLine(whyBullets[1], 90)}`,
    `  3) ${clipOneLine(whyBullets[2], 90)}`,
    '- Edited preview script:',
    ...scriptLines.map((line) => `  • ${line}`)
  ].join('\n');
}

export function formatVariantPreviewMessage(variantState, selectedSlot = null) {
  const options = variantState?.options || {};
  const lines = [
    `${variantLabel(variantState?.key)} Preview`,
    selectedSlot ? `Selected: Candidate ${selectedSlot}` : 'Selected: None',
    '',
    formatCandidateBlock('A', options.A),
    '',
    formatCandidateBlock('B', options.B),
    '',
    formatCandidateBlock('C', options.C)
  ];

  return lines.join('\n').trim();
}

export function splitForTelegram(text, hardLimit = 3500) {
  const source = String(text || '').trim();
  if (!source) {
    return [];
  }

  if (source.length <= hardLimit) {
    return [source];
  }

  const lines = source.split('\n');
  const chunks = [];
  let buffer = [];
  let size = 0;
  const safeLimit = Math.max(1200, hardLimit - 20);

  for (const line of lines) {
    const nextSize = size + line.length + 1;
    if (nextSize > safeLimit && buffer.length > 0) {
      chunks.push(buffer.join('\n').trim());
      buffer = [line];
      size = line.length + 1;
    } else {
      buffer.push(line);
      size = nextSize;
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer.join('\n').trim());
  }

  if (chunks.length <= 1) {
    return chunks;
  }

  return chunks.map((chunk, index) => `(${index + 1}/${chunks.length})\n${chunk}`);
}
