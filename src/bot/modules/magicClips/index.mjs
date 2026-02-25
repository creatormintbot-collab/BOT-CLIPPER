import { randomUUID } from 'node:crypto';
import { Input } from 'telegraf';
import { MAGIC_CLIPS_JOB_TYPE } from '../../../config/constants.mjs';
import { nowIso } from '../../../core/utils/time.mjs';
import { FLOW_STEPS } from './types.mjs';
import {
  beginMagicClipsFlow,
  getMagicClipsState,
  isMagicClipsFlowActive,
  moveToStep,
  resetMagicClipsFlow
} from './flow.mjs';
import { buildMagicClipsJob, queueMagicClipsJob } from './service.mjs';
import {
  validateOutputMode,
  validateSingleTargetLength,
  validateVariantDurationsInput,
  validateYouTubeInput
} from './validators.mjs';
import {
  DEFAULT_VARIANT_DURATIONS,
  VARIANT_KEYS,
  cancelKeyboard,
  confirmKeyboard,
  editKeyboard,
  formatSummary,
  jobActionTypes,
  magicCallbacks,
  magicClipsUx,
  modeKeyboard,
  parseJobCallbackData,
  previewCandidateKeyboard,
  renderDecisionKeyboard,
  singleLengthKeyboard,
  variantDurationModeKeyboard,
  variantLabel
} from './ux.mjs';
import { formatVariantPreviewMessage } from './previewFormat.mjs';
import { MENU_CALLBACKS } from '../../ui/buttons.mjs';

const LATEST_RENDERED_JOB_PREFIX = 'magic.latest';
const SLOT_KEYS = Object.freeze(['A', 'B', 'C']);

function ensureSession(ctx) {
  ctx.state = ctx.state || {};
  ctx.state.session = ctx.state.session || {};
  return ctx.state.session;
}

function latestRenderedJobKey(chatId, userId) {
  return `${LATEST_RENDERED_JOB_PREFIX}.${chatId}:${userId}`;
}

function normalizeVariantArg(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!value) {
    return null;
  }
  if (value === 'hot' || value === 'hot-take' || value === 'hottake') {
    return 'hot_take';
  }
  if (value === 'checklist' || value === 'check') {
    return 'checklist';
  }
  if (value === 'story') {
    return 'story';
  }
  if (value === 'best' || value === 'single') {
    return 'best';
  }
  return null;
}

function parseCommandArg(text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) {
    return '';
  }
  return parts[1];
}

async function sendAskUrl(ctx) {
  await ctx.reply(magicClipsUx.askUrl, cancelKeyboard());
}

async function sendAskOutputMode(ctx) {
  await ctx.reply(magicClipsUx.askOutputMode, modeKeyboard());
}

async function sendAskSingleLength(ctx) {
  await ctx.reply(magicClipsUx.askSingleOutputLength, singleLengthKeyboard());
}

async function sendAskVariantDurationMode(ctx) {
  await ctx.reply(magicClipsUx.askVariantDurationMode, variantDurationModeKeyboard());
}

async function sendConfirmation(ctx, state) {
  await ctx.reply(formatSummary(state), confirmKeyboard(state));
}

async function sendEditMenu(ctx, session, state) {
  moveToStep(session, FLOW_STEPS.EDIT_MENU);
  await ctx.reply(magicClipsUx.editPrompt, editKeyboard(state));
}

function hasVariantDurations(state) {
  if (!state?.variantDurations || typeof state.variantDurations !== 'object') {
    return false;
  }
  return VARIANT_KEYS.every((key) => Number.isInteger(state.variantDurations[key]));
}

async function handleUrlInput(ctx, state, rawText) {
  const validated = validateYouTubeInput(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidUrl);
    await sendAskUrl(ctx);
    return;
  }

  state.urlOriginal = validated.urlOriginal;
  state.urlNormalized = validated.value;
  state.step = FLOW_STEPS.ASK_OUTPUT_MODE;
  await sendAskOutputMode(ctx);
}

async function handleSingleLengthInput(ctx, state, rawText) {
  const validated = validateSingleTargetLength(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidSingleOutputLength);
    await sendAskSingleLength(ctx);
    return;
  }

  state.targetLengthSec = validated.value;
  state.step = FLOW_STEPS.CONFIRM;
  await sendConfirmation(ctx, state);
}

async function handleVariantDurationsInput(ctx, state, rawText) {
  const validated = validateVariantDurationsInput(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidVariantDurations);
    await ctx.reply(magicClipsUx.askVariantDurationsCustom, cancelKeyboard());
    return;
  }

  state.variantDurations = validated.value;
  state.variantDurationMode = 'custom';
  state.step = FLOW_STEPS.CONFIRM;
  await sendConfirmation(ctx, state);
}

async function handleModeInput(ctx, state, rawMode) {
  const validated = validateOutputMode(rawMode);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidOutputMode);
    await sendAskOutputMode(ctx);
    return;
  }

  state.outputMode = validated.value;
  if (validated.value === 'variants') {
    state.targetLengthSec = null;
    state.variantDurations = null;
    state.variantDurationMode = null;
    state.step = FLOW_STEPS.ASK_VARIANT_DURATION_MODE;
    await sendAskVariantDurationMode(ctx);
    return;
  }

  state.variantDurations = null;
  state.variantDurationMode = null;
  state.step = FLOW_STEPS.ASK_SINGLE_LENGTH;
  await sendAskSingleLength(ctx);
}

function canStart(state) {
  if (state.step !== FLOW_STEPS.CONFIRM || !state.urlNormalized) {
    return false;
  }

  if (state.outputMode === 'variants') {
    return hasVariantDurations(state);
  }

  return Number.isInteger(state.targetLengthSec);
}

async function runMagicClipsJob(ctx, state, deps) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!Number.isInteger(userId) || !Number.isInteger(chatId)) {
    await ctx.reply(magicClipsUx.invalidContext);
    return;
  }

  const job = buildMagicClipsJob({ userId, chatId, state });
  await queueMagicClipsJob({ job, queue: deps.queue, storage: deps.storage });
  if (state.outputMode === 'variants') {
    await ctx.reply(magicClipsUx.acceptedAnalyze);
    return;
  }
  await ctx.reply(magicClipsUx.acceptedRenderSingle);
}

async function handleBack(ctx, session, state) {
  if (state.step === FLOW_STEPS.ASK_OUTPUT_MODE) {
    moveToStep(session, FLOW_STEPS.ASK_URL);
    await sendAskUrl(ctx);
    return;
  }

  if (
    state.step === FLOW_STEPS.ASK_SINGLE_LENGTH ||
    state.step === FLOW_STEPS.ASK_SINGLE_LENGTH_CUSTOM ||
    state.step === FLOW_STEPS.ASK_VARIANT_DURATION_MODE
  ) {
    moveToStep(session, FLOW_STEPS.ASK_OUTPUT_MODE);
    await sendAskOutputMode(ctx);
    return;
  }

  if (state.step === FLOW_STEPS.ASK_VARIANT_DURATIONS_CUSTOM) {
    moveToStep(session, FLOW_STEPS.ASK_VARIANT_DURATION_MODE);
    await sendAskVariantDurationMode(ctx);
    return;
  }

  if (state.step === FLOW_STEPS.CONFIRM || state.step === FLOW_STEPS.EDIT_MENU) {
    if (state.outputMode === 'variants') {
      moveToStep(session, FLOW_STEPS.ASK_VARIANT_DURATION_MODE);
      await sendAskVariantDurationMode(ctx);
      return;
    }

    moveToStep(session, FLOW_STEPS.ASK_SINGLE_LENGTH);
    await sendAskSingleLength(ctx);
    return;
  }

  await sendAskUrl(ctx);
}

async function handleEditSelection(ctx, session, state, data) {
  if (data === magicCallbacks.EDIT_URL) {
    moveToStep(session, FLOW_STEPS.ASK_URL);
    await sendAskUrl(ctx);
    return;
  }

  if (data === magicCallbacks.EDIT_DURATIONS) {
    if (state.outputMode === 'variants') {
      moveToStep(session, FLOW_STEPS.ASK_VARIANT_DURATION_MODE);
      await sendAskVariantDurationMode(ctx);
      return;
    }
    moveToStep(session, FLOW_STEPS.ASK_SINGLE_LENGTH);
    await sendAskSingleLength(ctx);
    return;
  }

  if (data === magicCallbacks.EDIT_MODE) {
    moveToStep(session, FLOW_STEPS.ASK_OUTPUT_MODE);
    await sendAskOutputMode(ctx);
    return;
  }

  if (data === magicCallbacks.EDIT_BACK) {
    moveToStep(session, FLOW_STEPS.CONFIRM);
    await sendConfirmation(ctx, state);
  }
}

async function handleMagicAction(ctx, deps) {
  const session = ensureSession(ctx);
  const state = getMagicClipsState(session);
  const data = ctx.callbackQuery?.data || '';

  if (data === magicCallbacks.CANCEL) {
    await ctx.answerCbQuery();
    resetMagicClipsFlow(session);
    await ctx.reply(magicClipsUx.cancelled);
    return;
  }

  if (!state.active) {
    await ctx.answerCbQuery();
    await ctx.reply(magicClipsUx.noActiveFlow);
    return;
  }

  if (data === magicCallbacks.BACK) {
    await ctx.answerCbQuery();
    await handleBack(ctx, session, state);
    return;
  }

  if (data === magicCallbacks.START) {
    if (!canStart(state)) {
      await ctx.answerCbQuery(magicClipsUx.completePreviousSteps);
      return;
    }

    await ctx.answerCbQuery(state.outputMode === 'variants' ? magicClipsUx.analyzeToast : magicClipsUx.startToast);
    await runMagicClipsJob(ctx, state, deps);
    resetMagicClipsFlow(session);
    return;
  }

  if (data === magicCallbacks.EDIT) {
    await ctx.answerCbQuery();
    await sendEditMenu(ctx, session, state);
    return;
  }

  if (
    data === magicCallbacks.EDIT_URL ||
    data === magicCallbacks.EDIT_DURATIONS ||
    data === magicCallbacks.EDIT_MODE ||
    data === magicCallbacks.EDIT_BACK
  ) {
    await ctx.answerCbQuery();
    await handleEditSelection(ctx, session, state, data);
    return;
  }

  if (data.startsWith(magicCallbacks.MODE_PREFIX)) {
    await ctx.answerCbQuery();
    if (state.step !== FLOW_STEPS.ASK_OUTPUT_MODE) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }
    const value = data.slice(magicCallbacks.MODE_PREFIX.length);
    await handleModeInput(ctx, state, value);
    return;
  }

  if (data.startsWith(magicCallbacks.SINGLE_LENGTH_PREFIX)) {
    await ctx.answerCbQuery();
    if (state.step !== FLOW_STEPS.ASK_SINGLE_LENGTH && state.step !== FLOW_STEPS.ASK_SINGLE_LENGTH_CUSTOM) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }

    const value = data.slice(magicCallbacks.SINGLE_LENGTH_PREFIX.length);
    if (value === 'custom') {
      moveToStep(session, FLOW_STEPS.ASK_SINGLE_LENGTH_CUSTOM);
      await ctx.reply(magicClipsUx.askSingleOutputLengthCustom, cancelKeyboard());
      return;
    }

    await handleSingleLengthInput(ctx, state, value);
    return;
  }

  if (data.startsWith(magicCallbacks.VARIANT_DURATION_MODE_PREFIX)) {
    await ctx.answerCbQuery();
    if (state.step !== FLOW_STEPS.ASK_VARIANT_DURATION_MODE) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }

    const value = data.slice(magicCallbacks.VARIANT_DURATION_MODE_PREFIX.length);
    if (value === 'default') {
      state.variantDurationMode = 'default';
      state.variantDurations = { ...DEFAULT_VARIANT_DURATIONS };
      state.step = FLOW_STEPS.CONFIRM;
      await sendConfirmation(ctx, state);
      return;
    }

    if (value === 'custom') {
      moveToStep(session, FLOW_STEPS.ASK_VARIANT_DURATIONS_CUSTOM);
      await ctx.reply(magicClipsUx.askVariantDurationsCustom, cancelKeyboard());
      return;
    }
  }
}

function rotateVariantOptions(pool, nextOffset) {
  const safePool = Array.isArray(pool) ? pool : [];
  if (safePool.length === 0) {
    return { options: { A: null, B: null, C: null }, nextOffset: 0 };
  }

  const offset = Math.max(0, Number(nextOffset) || 0) % safePool.length;
  const picks = {};
  SLOT_KEYS.forEach((slot, index) => {
    picks[slot] = safePool[(offset + index) % safePool.length] || null;
  });

  return { options: picks, nextOffset: offset };
}

function allVariantsSelected(preview) {
  return VARIANT_KEYS.every((key) => {
    const selectedSlot = preview?.variants?.[key]?.selectedSlot;
    return SLOT_KEYS.includes(selectedSlot);
  });
}

function buildRenderJobFromAnalyze(analyzeJob, renderJobId) {
  const payload = analyzeJob?.payload || {};
  return {
    id: renderJobId,
    type: MAGIC_CLIPS_JOB_TYPE,
    userId: analyzeJob.userId,
    chatId: analyzeJob.chatId,
    status: 'queued',
    createdAt: nowIso(),
    payload: {
      phase: 'render',
      analysisJobId: analyzeJob.id,
      urlOriginal: payload.urlOriginal,
      urlNormalized: payload.urlNormalized,
      outputMode: 'variants',
      variantDurations: payload.variantDurations || { ...DEFAULT_VARIANT_DURATIONS },
      createdAt: nowIso(),
      status: 'queued'
    }
  };
}

function isJobOwner(ctx, job) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!Number.isInteger(chatId) || !Number.isInteger(userId)) {
    return false;
  }
  return job.chatId === chatId && job.userId === userId;
}

async function handlePreviewSelection(ctx, deps, parsed, job) {
  let shouldSendRenderPrompt = false;
  const updated = await deps.storage.update(`jobs.${job.id}`, (current = {}) => {
    const preview = current.preview && typeof current.preview === 'object' ? { ...current.preview } : null;
    if (!preview) {
      return current;
    }
    const variants = preview.variants && typeof preview.variants === 'object' ? { ...preview.variants } : {};
    const variantState =
      variants[parsed.variantKey] && typeof variants[parsed.variantKey] === 'object'
        ? { ...variants[parsed.variantKey] }
        : null;
    if (!variantState) {
      return current;
    }

    const options = variantState.options && typeof variantState.options === 'object' ? variantState.options : {};
    if (!options[parsed.slot]) {
      return current;
    }

    variantState.selectedSlot = parsed.slot;
    variants[parsed.variantKey] = variantState;
    preview.variants = variants;
    if (allVariantsSelected(preview) && !preview.renderPromptSent) {
      preview.renderPromptSent = true;
      shouldSendRenderPrompt = true;
    }
    preview.updatedAt = nowIso();
    return {
      ...current,
      preview
    };
  });

  const variantState = updated?.preview?.variants?.[parsed.variantKey];
  await ctx.answerCbQuery(`Selected ${parsed.slot} for ${variantLabel(parsed.variantKey)}.`);

  if (variantState) {
    await ctx
      .editMessageReplyMarkup(
        previewCandidateKeyboard({
          jobId: job.id,
          variantKey: parsed.variantKey,
          selectedSlot: variantState.selectedSlot || null
        }).reply_markup
      )
      .catch(() => {});
  }

  if (shouldSendRenderPrompt) {
    await deps.telegram.sendMessage(job.chatId, 'All variants selected. Render now?', renderDecisionKeyboard({ jobId: job.id }));
  }
}

async function handlePreviewRegenerate(ctx, deps, parsed, job) {
  const updated = await deps.storage.update(`jobs.${job.id}`, (current = {}) => {
    const preview = current.preview && typeof current.preview === 'object' ? { ...current.preview } : null;
    if (!preview) {
      return current;
    }
    const variants = preview.variants && typeof preview.variants === 'object' ? { ...preview.variants } : {};
    const variantState =
      variants[parsed.variantKey] && typeof variants[parsed.variantKey] === 'object'
        ? { ...variants[parsed.variantKey] }
        : null;
    if (!variantState) {
      return current;
    }

    const pool = Array.isArray(variantState.pool) ? variantState.pool : [];
    if (pool.length === 0) {
      return current;
    }

    const currentOffset = Number(variantState.regenOffset) || 0;
    const nextOffset = pool.length > 1 ? (currentOffset + 3) % pool.length : currentOffset;
    const rotated = rotateVariantOptions(pool, nextOffset);

    variantState.regenOffset = rotated.nextOffset;
    variantState.options = rotated.options;
    variantState.selectedSlot = null;
    variants[parsed.variantKey] = variantState;
    preview.variants = variants;
    preview.renderPromptSent = false;
    preview.updatedAt = nowIso();
    return {
      ...current,
      preview
    };
  });

  const variantState = updated?.preview?.variants?.[parsed.variantKey];
  if (!variantState) {
    await ctx.answerCbQuery('Unable to regenerate this variant.');
    return;
  }

  const previewText = formatVariantPreviewMessage(variantState, null);
  await ctx.answerCbQuery(`Regenerated ${variantLabel(parsed.variantKey)}.`);
  try {
    await ctx.editMessageText(
      previewText,
      previewCandidateKeyboard({
        jobId: job.id,
        variantKey: parsed.variantKey,
        selectedSlot: null
      })
    );
  } catch {
    await deps.telegram.sendMessage(
      job.chatId,
      previewText,
      previewCandidateKeyboard({
        jobId: job.id,
        variantKey: parsed.variantKey,
        selectedSlot: null
      })
    );
  }
}

async function handleRenderAllAction(ctx, deps, job) {
  let renderJobId = null;

  const updated = await deps.storage.update(`jobs.${job.id}`, (current = {}) => {
    const preview = current.preview && typeof current.preview === 'object' ? { ...current.preview } : null;
    if (!preview || !allVariantsSelected(preview)) {
      return current;
    }
    if (preview.renderJobId) {
      return current;
    }
    renderJobId = randomUUID();
    preview.renderJobId = renderJobId;
    preview.renderRequestedAt = nowIso();
    preview.renderStatus = 'queued';
    preview.updatedAt = nowIso();
    return {
      ...current,
      preview
    };
  });

  const preview = updated?.preview;
  if (!preview || !allVariantsSelected(preview)) {
    await ctx.answerCbQuery('Select A/B/C for all variants first.');
    return;
  }

  if (!renderJobId) {
    await ctx.answerCbQuery('Render job already queued.');
    return;
  }

  const renderJob = buildRenderJobFromAnalyze(updated, renderJobId);
  await queueMagicClipsJob({ job: renderJob, queue: deps.queue, storage: deps.storage });
  await ctx.answerCbQuery('Render queued.');
  await deps.telegram.sendMessage(job.chatId, 'Rendering started for all selected variants.');
}

async function handleReanalyzeAllAction(ctx, deps, job) {
  const payload = job?.payload || {};
  const analyzeJob = {
    id: randomUUID(),
    type: MAGIC_CLIPS_JOB_TYPE,
    userId: job.userId,
    chatId: job.chatId,
    status: 'queued',
    createdAt: nowIso(),
    payload: {
      phase: 'analyze',
      urlOriginal: payload.urlOriginal,
      urlNormalized: payload.urlNormalized,
      outputMode: 'variants',
      variantDurationMode: payload.variantDurationMode || 'custom',
      variantDurations: payload.variantDurations || { ...DEFAULT_VARIANT_DURATIONS },
      createdAt: nowIso(),
      status: 'queued'
    }
  };

  await queueMagicClipsJob({ job: analyzeJob, queue: deps.queue, storage: deps.storage });
  await ctx.answerCbQuery('Re-analyze queued.');
  await deps.telegram.sendMessage(job.chatId, 'Re-analyzing all variants. New preview cards will arrive shortly.');
}

async function handleCancelPreviewAction(ctx, deps, job) {
  await deps.storage.update(`jobs.${job.id}`, (current = {}) => ({
    ...current,
    preview: {
      ...(current.preview || {}),
      cancelledAt: nowIso(),
      renderStatus: 'cancelled'
    }
  }));
  await ctx.answerCbQuery('Selection cancelled.');
  await deps.telegram.sendMessage(job.chatId, 'Preview selection cancelled. You can start a new job anytime.');
}

async function handleMagicJobAction(ctx, deps) {
  const parsed = parseJobCallbackData(ctx.callbackQuery?.data || '');
  if (!parsed) {
    await ctx.answerCbQuery('Unknown action.');
    return;
  }

  const job = await deps.storage.get(`jobs.${parsed.jobId}`, null);
  if (!job) {
    await ctx.answerCbQuery('This job is no longer available.');
    return;
  }

  if (!isJobOwner(ctx, job)) {
    await ctx.answerCbQuery('This job belongs to another chat.', { show_alert: true }).catch(() => {});
    return;
  }

  if (parsed.kind === jobActionTypes.SELECT) {
    await handlePreviewSelection(ctx, deps, parsed, job);
    return;
  }

  if (parsed.kind === jobActionTypes.REGENERATE) {
    await handlePreviewRegenerate(ctx, deps, parsed, job);
    return;
  }

  if (parsed.kind === jobActionTypes.RENDER_ALL) {
    await handleRenderAllAction(ctx, deps, job);
    return;
  }

  if (parsed.kind === jobActionTypes.CANCEL) {
    await handleCancelPreviewAction(ctx, deps, job);
    return;
  }

  if (parsed.kind === jobActionTypes.REANALYZE_ALL) {
    await handleReanalyzeAllAction(ctx, deps, job);
  }
}

async function handleGuideFileCommand(ctx, deps) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!Number.isInteger(chatId) || !Number.isInteger(userId)) {
    return;
  }

  const variantArg = parseCommandArg(ctx.message?.text);
  const variantKey = normalizeVariantArg(variantArg);
  if (!variantKey) {
    await ctx.reply('Usage: /guidefile hot | /guidefile checklist | /guidefile story');
    return;
  }

  const latestJobId = await deps.storage.get(latestRenderedJobKey(chatId, userId), '');
  if (!latestJobId) {
    await ctx.reply('No completed render job found for this chat/user yet.');
    return;
  }

  const latestJob = await deps.storage.get(`jobs.${latestJobId}`, null);
  const output = latestJob?.outputs?.find((item) => item.key === variantKey);
  const guidePath = output?.guidePath;
  if (!guidePath) {
    await ctx.reply(`Guide file for "${variantArg}" is not available in the latest job.`);
    return;
  }

  try {
    await ctx.replyWithDocument(Input.fromLocalFile(guidePath));
  } catch {
    await ctx.reply('Failed to send guide file. Please check server file paths.');
  }
}

async function handleSrtCommand(ctx, deps) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!Number.isInteger(chatId) || !Number.isInteger(userId)) {
    return;
  }

  const variantArg = parseCommandArg(ctx.message?.text);
  const variantKey = normalizeVariantArg(variantArg);
  if (!variantKey) {
    await ctx.reply('Usage: /srt hot | /srt checklist | /srt story');
    return;
  }

  const latestJobId = await deps.storage.get(latestRenderedJobKey(chatId, userId), '');
  if (!latestJobId) {
    await ctx.reply('No completed render job found for this chat/user yet.');
    return;
  }

  const latestJob = await deps.storage.get(`jobs.${latestJobId}`, null);
  const output = latestJob?.outputs?.find((item) => item.key === variantKey);
  const srtPath = output?.srtPath;
  if (!srtPath) {
    await ctx.reply(`SRT for "${variantArg}" is not available in the latest job.`);
    return;
  }

  try {
    await ctx.replyWithDocument(Input.fromLocalFile(srtPath));
  } catch {
    await ctx.reply('Failed to send SRT file. Please check server file paths.');
  }
}

async function handleMagicText(ctx) {
  const session = ensureSession(ctx);
  const state = getMagicClipsState(session);

  if (!state.active) {
    return;
  }

  const text = ctx.message?.text?.trim() || '';
  if (!text || text.startsWith('/')) {
    return;
  }

  if (state.step === FLOW_STEPS.ASK_URL) {
    await handleUrlInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.ASK_SINGLE_LENGTH || state.step === FLOW_STEPS.ASK_SINGLE_LENGTH_CUSTOM) {
    await handleSingleLengthInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.ASK_OUTPUT_MODE) {
    await handleModeInput(ctx, state, text.toLowerCase());
    return;
  }

  if (state.step === FLOW_STEPS.ASK_VARIANT_DURATIONS_CUSTOM) {
    await handleVariantDurationsInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.CONFIRM) {
    const lowered = text.toLowerCase();
    if (lowered === 'start' || lowered === 'analyze') {
      if (canStart(state)) {
        await runMagicClipsJob(ctx, state, ctx.state.deps);
        resetMagicClipsFlow(session);
      } else {
        await ctx.reply(magicClipsUx.completePreviousSteps);
      }
      return;
    }

    if (lowered === 'edit') {
      await sendEditMenu(ctx, session, state);
      return;
    }

    if (lowered === 'cancel') {
      resetMagicClipsFlow(session);
      await ctx.reply(magicClipsUx.cancelled);
      return;
    }

    await sendConfirmation(ctx, state);
  }
}

export function register(bot, deps) {
  bot.action(MENU_CALLBACKS.MAGIC_CLIPS, async (ctx) => {
    const session = ensureSession(ctx);
    beginMagicClipsFlow(session);
    await ctx.answerCbQuery();
    await sendAskUrl(ctx);
  });

  bot.action(/^mc:/, async (ctx) => {
    await handleMagicAction(ctx, deps);
  });

  bot.action(/^mcj:/, async (ctx) => {
    await handleMagicJobAction(ctx, deps);
  });

  bot.command('guidefile', async (ctx) => {
    await handleGuideFileCommand(ctx, deps);
  });

  bot.command('srt', async (ctx) => {
    await handleSrtCommand(ctx, deps);
  });

  bot.on('text', async (ctx, next) => {
    ctx.state = ctx.state || {};
    ctx.state.deps = deps;
    await handleMagicText(ctx);
    await next();
  });
}

export { isMagicClipsFlowActive, resetMagicClipsFlow };
