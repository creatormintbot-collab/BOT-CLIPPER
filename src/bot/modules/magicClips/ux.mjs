import { Markup } from 'telegraf';

export const magicClipsUx = Object.freeze({
  askUrl: 'Send a YouTube URL.',
  invalidUrl: 'Please send a valid YouTube URL (youtube.com or youtu.be).',
  askClipCount: 'How many clips?',
  askClipCountCustom: 'Send the number of clips (1-20).',
  invalidClipCount: 'Clip count must be a number between 1 and 20.',
  askMaxDuration: 'Max duration per clip?',
  askMaxDurationCustom: 'Send max duration in seconds (5-300).',
  invalidMaxDuration: 'Max duration must be a number between 5 and 300 seconds.',
  summaryTitle: 'Confirm your Magic Clips request:',
  completedTitle: 'Job completed (stub). Clip links will appear here once the clipper is implemented.',
  queuedFallback: 'Job queued. Processing will start when a worker is available.',
  startToast: 'Starting...',
  completePreviousSteps: 'Complete previous steps first.',
  cancelled: 'Magic Clips flow cancelled.',
  noActiveFlowToCancel: 'There is no active flow to cancel.',
  noActiveFlow: 'No active Magic Clips flow. Choose Magic Clips from the start menu.',
  invalidContext: 'Unable to start job in this chat context.',
  confirmHint: 'Press Start, Edit, or Cancel.',
  editPrompt: 'Let\'s edit your request. Send a YouTube URL.'
});

export const magicCallbacks = Object.freeze({
  COUNT_PREFIX: 'magic:count:',
  DURATION_PREFIX: 'magic:duration:',
  START: 'magic:start',
  EDIT: 'magic:edit',
  CANCEL: 'magic:cancel'
});

export function clipCountKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('3', `${magicCallbacks.COUNT_PREFIX}3`),
      Markup.button.callback('5', `${magicCallbacks.COUNT_PREFIX}5`)
    ],
    [
      Markup.button.callback('8', `${magicCallbacks.COUNT_PREFIX}8`),
      Markup.button.callback('Custom', `${magicCallbacks.COUNT_PREFIX}custom`)
    ]
  ]);
}

export function maxDurationKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('15s', `${magicCallbacks.DURATION_PREFIX}15`),
      Markup.button.callback('30s', `${magicCallbacks.DURATION_PREFIX}30`)
    ],
    [
      Markup.button.callback('45s', `${magicCallbacks.DURATION_PREFIX}45`),
      Markup.button.callback('60s', `${magicCallbacks.DURATION_PREFIX}60`)
    ],
    [Markup.button.callback('Custom', `${magicCallbacks.DURATION_PREFIX}custom`)]
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

export function formatSummary(state) {
  return [
    magicClipsUx.summaryTitle,
    `- URL: ${state.url}`,
    `- Clip count: ${state.clipCount}`,
    `- Max duration: ${state.maxDurationSec}s`,
    '',
    magicClipsUx.confirmHint
  ].join('\n');
}
