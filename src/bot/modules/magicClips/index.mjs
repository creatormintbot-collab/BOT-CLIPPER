import { FLOW_STEPS } from './types.mjs';
import {
  beginMagicClipsFlow,
  getMagicClipsState,
  isMagicClipsFlowActive,
  moveToStep,
  resetMagicClipsFlow
} from './flow.mjs';
import { buildMagicClipsJob, formatJobOutputList, queueMagicClipsJob } from './service.mjs';
import { validateClipCount, validateMaxDuration, validateYouTubeInput } from './validators.mjs';
import {
  clipCountKeyboard,
  confirmKeyboard,
  formatSummary,
  magicCallbacks,
  magicClipsUx,
  maxDurationKeyboard
} from './ux.mjs';
import { MENU_CALLBACKS } from '../../ui/buttons.mjs';

function ensureSession(ctx) {
  ctx.state = ctx.state || {};
  ctx.state.session = ctx.state.session || {};
  return ctx.state.session;
}

async function sendConfirmation(ctx, state) {
  await ctx.reply(formatSummary(state), confirmKeyboard());
}

async function handleUrlInput(ctx, state, rawText) {
  const validated = validateYouTubeInput(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidUrl);
    await ctx.reply(magicClipsUx.askUrl);
    return;
  }

  state.url = validated.value;
  state.step = FLOW_STEPS.ASK_CLIP_COUNT;
  await ctx.reply(magicClipsUx.askClipCount, clipCountKeyboard());
}

async function handleClipCountInput(ctx, state, rawText) {
  const validated = validateClipCount(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidClipCount);
    await ctx.reply(magicClipsUx.askClipCount, clipCountKeyboard());
    return;
  }

  state.clipCount = validated.value;
  state.step = FLOW_STEPS.ASK_MAX_DURATION;
  await ctx.reply(magicClipsUx.askMaxDuration, maxDurationKeyboard());
}

async function handleMaxDurationInput(ctx, state, rawText) {
  const validated = validateMaxDuration(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidMaxDuration);
    await ctx.reply(magicClipsUx.askMaxDuration, maxDurationKeyboard());
    return;
  }

  state.maxDurationSec = validated.value;
  state.step = FLOW_STEPS.CONFIRM;
  await sendConfirmation(ctx, state);
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

  let result = null;
  if (deps.env.QUEUE_DRIVER === 'inmem' && typeof deps.queue.runNext === 'function') {
    result = await deps.queue.runNext();
  }

  if (result?.status === 'completed') {
    await ctx.reply(`${magicClipsUx.completedTitle}\n${formatJobOutputList(result.outputs)}`);
    return;
  }

  await ctx.reply(magicClipsUx.queuedFallback);
}

async function handleMagicAction(ctx, deps) {
  const session = ensureSession(ctx);
  const state = getMagicClipsState(session);
  const data = ctx.callbackQuery?.data || '';

  if (data === magicCallbacks.START) {
    if (state.step !== FLOW_STEPS.CONFIRM) {
      await ctx.answerCbQuery(magicClipsUx.completePreviousSteps);
      return;
    }

    await ctx.answerCbQuery(magicClipsUx.startToast);
    await runMagicClipsJob(ctx, state, deps);
    resetMagicClipsFlow(session);
    return;
  }

  if (data === magicCallbacks.EDIT) {
    await ctx.answerCbQuery();
    moveToStep(session, FLOW_STEPS.ASK_URL);
    state.url = null;
    state.clipCount = null;
    state.maxDurationSec = null;
    await ctx.reply(magicClipsUx.editPrompt);
    return;
  }

  if (data === magicCallbacks.CANCEL) {
    await ctx.answerCbQuery();
    resetMagicClipsFlow(session);
    await ctx.reply(magicClipsUx.cancelled);
    return;
  }

  if (data.startsWith(magicCallbacks.COUNT_PREFIX)) {
    await ctx.answerCbQuery();
    if (!state.active || state.step !== FLOW_STEPS.ASK_CLIP_COUNT) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }

    const value = data.slice(magicCallbacks.COUNT_PREFIX.length);
    if (value === 'custom') {
      await ctx.reply(magicClipsUx.askClipCountCustom);
      return;
    }

    await handleClipCountInput(ctx, state, value);
    return;
  }

  if (data.startsWith(magicCallbacks.DURATION_PREFIX)) {
    await ctx.answerCbQuery();
    if (!state.active || state.step !== FLOW_STEPS.ASK_MAX_DURATION) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }

    const value = data.slice(magicCallbacks.DURATION_PREFIX.length);
    if (value === 'custom') {
      await ctx.reply(magicClipsUx.askMaxDurationCustom);
      return;
    }

    await handleMaxDurationInput(ctx, state, value);
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

  if (state.step === FLOW_STEPS.ASK_CLIP_COUNT) {
    await handleClipCountInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.ASK_MAX_DURATION) {
    await handleMaxDurationInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.CONFIRM) {
    const lowered = text.toLowerCase();
    if (lowered === 'start') {
      await runMagicClipsJob(ctx, state, ctx.state.deps);
      resetMagicClipsFlow(session);
      return;
    }

    if (lowered === 'edit') {
      moveToStep(session, FLOW_STEPS.ASK_URL);
      state.url = null;
      state.clipCount = null;
      state.maxDurationSec = null;
      await ctx.reply(magicClipsUx.editPrompt);
      return;
    }

    if (lowered === 'cancel') {
      resetMagicClipsFlow(session);
      await ctx.reply(magicClipsUx.cancelled);
      return;
    }

    await ctx.reply(magicClipsUx.confirmHint, confirmKeyboard());
  }
}

export function register(bot, deps) {
  bot.action(MENU_CALLBACKS.MAGIC_CLIPS, async (ctx) => {
    const session = ensureSession(ctx);
    beginMagicClipsFlow(session);
    await ctx.answerCbQuery();
    await ctx.reply(magicClipsUx.askUrl);
  });

  bot.action(/^magic:/, async (ctx) => {
    await handleMagicAction(ctx, deps);
  });

  bot.on('text', async (ctx, next) => {
    ctx.state = ctx.state || {};
    ctx.state.deps = deps;
    await handleMagicText(ctx);
    await next();
  });
}

export { isMagicClipsFlowActive, resetMagicClipsFlow };
