import { FLOW_STEPS } from './types.mjs';
import {
  beginMagicClipsFlow,
  getMagicClipsState,
  isMagicClipsFlowActive,
  moveToStep,
  resetMagicClipsFlow
} from './flow.mjs';
import { buildMagicClipsJob, queueMagicClipsJob } from './service.mjs';
import { validateOutputMode, validateTargetLength, validateYouTubeInput } from './validators.mjs';
import {
  cancelKeyboard,
  confirmKeyboard,
  editKeyboard,
  formatSummary,
  lengthKeyboard,
  magicCallbacks,
  magicClipsUx,
  modeKeyboard
} from './ux.mjs';
import { MENU_CALLBACKS } from '../../ui/buttons.mjs';

function ensureSession(ctx) {
  ctx.state = ctx.state || {};
  ctx.state.session = ctx.state.session || {};
  return ctx.state.session;
}

async function sendAskUrl(ctx) {
  await ctx.reply(magicClipsUx.askUrl, cancelKeyboard());
}

async function sendAskOutputLength(ctx) {
  await ctx.reply(magicClipsUx.askOutputLength, lengthKeyboard());
}

async function sendAskOutputMode(ctx) {
  await ctx.reply(magicClipsUx.askOutputMode, modeKeyboard());
}

async function sendConfirmation(ctx, state) {
  await ctx.reply(formatSummary(state), confirmKeyboard());
}

async function sendEditMenu(ctx, session) {
  moveToStep(session, FLOW_STEPS.EDIT_MENU);
  await ctx.reply(magicClipsUx.editPrompt, editKeyboard());
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
  state.step = FLOW_STEPS.ASK_OUTPUT_LENGTH;
  await sendAskOutputLength(ctx);
}

async function handleLengthInput(ctx, state, rawText) {
  const validated = validateTargetLength(rawText);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidOutputLength);
    await sendAskOutputLength(ctx);
    return;
  }

  state.targetLengthSec = validated.value;
  state.step = FLOW_STEPS.ASK_OUTPUT_MODE;
  await sendAskOutputMode(ctx);
}

async function handleModeInput(ctx, state, rawMode) {
  const validated = validateOutputMode(rawMode);
  if (!validated.ok) {
    await ctx.reply(magicClipsUx.invalidOutputMode);
    await sendAskOutputMode(ctx);
    return;
  }

  state.outputMode = validated.value;
  state.step = FLOW_STEPS.CONFIRM;
  await sendConfirmation(ctx, state);
}

function canStart(state) {
  return (
    state.step === FLOW_STEPS.CONFIRM &&
    Boolean(state.urlNormalized) &&
    Number.isInteger(state.targetLengthSec) &&
    (state.outputMode === 'single' || state.outputMode === 'variants')
  );
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
  await ctx.reply(magicClipsUx.accepted);
}

async function handleBack(ctx, session, state) {
  if (state.step === FLOW_STEPS.ASK_OUTPUT_LENGTH || state.step === FLOW_STEPS.ASK_OUTPUT_LENGTH_CUSTOM) {
    moveToStep(session, FLOW_STEPS.ASK_URL);
    await sendAskUrl(ctx);
    return;
  }

  if (state.step === FLOW_STEPS.ASK_OUTPUT_MODE) {
    moveToStep(session, FLOW_STEPS.ASK_OUTPUT_LENGTH);
    await sendAskOutputLength(ctx);
    return;
  }

  if (state.step === FLOW_STEPS.CONFIRM || state.step === FLOW_STEPS.EDIT_MENU) {
    moveToStep(session, FLOW_STEPS.ASK_OUTPUT_MODE);
    await sendAskOutputMode(ctx);
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

  if (data === magicCallbacks.EDIT_LEN) {
    moveToStep(session, FLOW_STEPS.ASK_OUTPUT_LENGTH);
    await sendAskOutputLength(ctx);
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

    await ctx.answerCbQuery(magicClipsUx.startToast);
    await runMagicClipsJob(ctx, state, deps);
    resetMagicClipsFlow(session);
    return;
  }

  if (data === magicCallbacks.EDIT) {
    await ctx.answerCbQuery();
    await sendEditMenu(ctx, session);
    return;
  }

  if (
    data === magicCallbacks.EDIT_URL ||
    data === magicCallbacks.EDIT_LEN ||
    data === magicCallbacks.EDIT_MODE ||
    data === magicCallbacks.EDIT_BACK
  ) {
    await ctx.answerCbQuery();
    await handleEditSelection(ctx, session, state, data);
    return;
  }

  if (data.startsWith(magicCallbacks.LENGTH_PREFIX)) {
    await ctx.answerCbQuery();
    if (state.step !== FLOW_STEPS.ASK_OUTPUT_LENGTH && state.step !== FLOW_STEPS.ASK_OUTPUT_LENGTH_CUSTOM) {
      await ctx.reply(magicClipsUx.noActiveFlow);
      return;
    }

    const value = data.slice(magicCallbacks.LENGTH_PREFIX.length);
    if (value === 'custom') {
      moveToStep(session, FLOW_STEPS.ASK_OUTPUT_LENGTH_CUSTOM);
      await ctx.reply(magicClipsUx.askOutputLengthCustom, cancelKeyboard());
      return;
    }

    await handleLengthInput(ctx, state, value);
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

  if (state.step === FLOW_STEPS.ASK_OUTPUT_LENGTH_CUSTOM) {
    await handleLengthInput(ctx, state, text);
    return;
  }

  if (state.step === FLOW_STEPS.CONFIRM) {
    const lowered = text.toLowerCase();
    if (lowered === 'start') {
      if (canStart(state)) {
        await runMagicClipsJob(ctx, state, ctx.state.deps);
        resetMagicClipsFlow(session);
      } else {
        await ctx.reply(magicClipsUx.completePreviousSteps);
      }
      return;
    }

    if (lowered === 'edit') {
      await sendEditMenu(ctx, session);
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

  bot.on('text', async (ctx, next) => {
    ctx.state = ctx.state || {};
    ctx.state.deps = deps;
    await handleMagicText(ctx);
    await next();
  });
}

export { isMagicClipsFlowActive, resetMagicClipsFlow };
