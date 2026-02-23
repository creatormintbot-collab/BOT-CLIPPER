import { Markup } from 'telegraf';

export const magicClipsUx = Object.freeze({
  askUrl: 'Send a YouTube URL.',
  invalidUrl: 'Please send a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).',
  askOutputLength: 'Choose output length (final merged video):',
  askOutputLengthCustom: 'Send target length in seconds (60–90).',
  invalidOutputLength: 'Target length must be an integer from 60 to 90.',
  askOutputMode: 'Choose output mode:',
  invalidOutputMode: 'Please choose Single (Best) or 3 Variants.',
  summaryTitle: 'Confirm your Magic Clips request:',
  completePreviousSteps: 'Complete previous steps first.',
  startToast: 'Starting...',
  cancelled: 'Magic Clips flow cancelled.',
  noActiveFlowToCancel: 'There is no active flow to cancel.',
  noActiveFlow: 'No active Magic Clips flow. Choose Magic Clips from the start menu.',
  invalidContext: 'Unable to start job in this chat context.',
  editPrompt: 'What do you want to edit?',
  queuedFallback: 'Job queued. Processing will run serially.',
  accepted: 'Job accepted. Processing will run now and progress updates will follow in this chat.',
  errorPrefix: 'Magic Clips failed:'
});

export const magicCallbacks = Object.freeze({
  LENGTH_PREFIX: 'mc:len:',
  MODE_PREFIX: 'mc:mode:',
  START: 'mc:start',
  EDIT: 'mc:edit',
  CANCEL: 'mc:cancel',
  BACK: 'mc:back',
  EDIT_URL: 'mc:edit:url',
  EDIT_LEN: 'mc:edit:len',
  EDIT_MODE: 'mc:edit:mode',
  EDIT_BACK: 'mc:edit:back'
});

export function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Cancel', magicCallbacks.CANCEL)]]);
}

export function lengthKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('60s', `${magicCallbacks.LENGTH_PREFIX}60`),
      Markup.button.callback('75s (Rec)', `${magicCallbacks.LENGTH_PREFIX}75`)
    ],
    [
      Markup.button.callback('90s', `${magicCallbacks.LENGTH_PREFIX}90`),
      Markup.button.callback('Custom', `${magicCallbacks.LENGTH_PREFIX}custom`)
    ],
    [
      Markup.button.callback('Back', magicCallbacks.BACK),
      Markup.button.callback('Cancel', magicCallbacks.CANCEL)
    ]
  ]);
}

export function modeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Single (Best)', `${magicCallbacks.MODE_PREFIX}single`),
      Markup.button.callback('3 Variants', `${magicCallbacks.MODE_PREFIX}variants`)
    ],
    [
      Markup.button.callback('Back', magicCallbacks.BACK),
      Markup.button.callback('Cancel', magicCallbacks.CANCEL)
    ]
  ]);
}

export function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Start', magicCallbacks.START),
      Markup.button.callback('Edit', magicCallbacks.EDIT)
    ],
    [Markup.button.callback('Cancel', magicCallbacks.CANCEL)]
  ]);
}

export function editKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Change URL', magicCallbacks.EDIT_URL),
      Markup.button.callback('Change length', magicCallbacks.EDIT_LEN)
    ],
    [
      Markup.button.callback('Change mode', magicCallbacks.EDIT_MODE),
      Markup.button.callback('Back', magicCallbacks.EDIT_BACK)
    ],
    [Markup.button.callback('Cancel', magicCallbacks.CANCEL)]
  ]);
}

function modeLabel(mode) {
  if (mode === 'variants') {
    return '3 Variants (Hot Take / Checklist / Story)';
  }
  return 'Single (Best)';
}

export function formatSummary(state) {
  return [
    magicClipsUx.summaryTitle,
    `- URL: ${state.urlNormalized}`,
    '- Output: Single merged highlights video',
    `- Target length: ${state.targetLengthSec}s`,
    `- Mode: ${modeLabel(state.outputMode)}`,
    '- Highlights: Auto (3–5 best moments)',
    '- Insert prompts: Auto (2–4 suggestions)'
  ].join('\n');
}
