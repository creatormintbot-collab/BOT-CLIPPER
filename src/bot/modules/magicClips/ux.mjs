import { Markup } from 'telegraf';

export const VARIANT_KEYS = Object.freeze(['hot_take', 'checklist', 'story']);

export const VARIANT_META = Object.freeze({
  hot_take: { key: 'hot_take', label: 'Hot Take', short: 'hot' },
  checklist: { key: 'checklist', label: 'Checklist', short: 'checklist' },
  story: { key: 'story', label: 'Story', short: 'story' }
});

export const DEFAULT_VARIANT_DURATIONS = Object.freeze({
  hot_take: 60,
  checklist: 75,
  story: 90
});

export const magicClipsUx = Object.freeze({
  askUrl: 'Send a YouTube URL.',
  invalidUrl: 'Please send a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).',
  askOutputMode: 'Choose output mode:',
  invalidOutputMode: 'Please choose Single (Best) or 3 Variants.',
  askSingleOutputLength: 'Choose output length (Single mode):',
  askSingleOutputLengthCustom: 'Send target length in seconds for Single mode (60–90).',
  invalidSingleOutputLength: 'Single mode length must be an integer from 60 to 90.',
  askVariantDurationMode:
    'Choose 3 Variants duration plan:\n- Default bundle: Hot Take 60s, Checklist 75s, Story 90s\n- Or set custom per variant.',
  askVariantDurationsCustom:
    'Send custom durations in seconds:\n- `90,60,120` (hot/checklist/story)\n- or `hot=90 checklist=60 story=120`\nAllowed range: 45–180 seconds each.',
  invalidVariantDurations:
    'Invalid custom durations. Use `90,60,120` or `hot=90 checklist=60 story=120` (45–180 each).',
  summaryTitle: 'Confirm your Magic Clips plan:',
  completePreviousSteps: 'Complete previous steps first.',
  analyzeToast: 'Analyzing preview...',
  startToast: 'Starting...',
  cancelled: 'Magic Clips flow cancelled.',
  noActiveFlowToCancel: 'There is no active flow to cancel.',
  noActiveFlow: 'No active Magic Clips flow. Choose Magic Clips from the start menu.',
  invalidContext: 'Unable to start job in this chat context.',
  editPrompt: 'What do you want to edit?',
  acceptedAnalyze:
    'Plan confirmed. Running analysis first and preparing preview cards for Hot Take / Checklist / Story.',
  acceptedRenderSingle: 'Job accepted. Rendering Single (Best) now.'
});

export const magicCallbacks = Object.freeze({
  SINGLE_LENGTH_PREFIX: 'mc:slen:',
  MODE_PREFIX: 'mc:mode:',
  VARIANT_DURATION_MODE_PREFIX: 'mc:vdm:',
  START: 'mc:start',
  EDIT: 'mc:edit',
  CANCEL: 'mc:cancel',
  BACK: 'mc:back',
  EDIT_URL: 'mc:edit:url',
  EDIT_DURATIONS: 'mc:edit:dur',
  EDIT_MODE: 'mc:edit:mode',
  EDIT_BACK: 'mc:edit:back'
});

const JOB_CALLBACK_PREFIX = 'mcj';

export const jobActionTypes = Object.freeze({
  SELECT: 's',
  REGENERATE: 'g',
  RENDER_ALL: 'r',
  CANCEL: 'x',
  REANALYZE_ALL: 'a'
});

export function formatDuration(value) {
  return `${Number(value) || 0}s`;
}

export function variantLabel(key) {
  return VARIANT_META[key]?.label || key;
}

function jobCallback(...parts) {
  return [JOB_CALLBACK_PREFIX, ...parts].join(':');
}

export function buildSelectCandidateCallback(jobId, variantKey, slot) {
  return jobCallback(jobId, jobActionTypes.SELECT, variantKey, slot);
}

export function buildRegenerateVariantCallback(jobId, variantKey) {
  return jobCallback(jobId, jobActionTypes.REGENERATE, variantKey);
}

export function buildRenderAllCallback(jobId) {
  return jobCallback(jobId, jobActionTypes.RENDER_ALL);
}

export function buildCancelRenderCallback(jobId) {
  return jobCallback(jobId, jobActionTypes.CANCEL);
}

export function buildReanalyzeAllCallback(jobId) {
  return jobCallback(jobId, jobActionTypes.REANALYZE_ALL);
}

export function parseJobCallbackData(data) {
  const raw = String(data || '').trim();
  if (!raw.startsWith(`${JOB_CALLBACK_PREFIX}:`)) {
    return null;
  }

  const parts = raw.split(':');
  if (parts.length < 3) {
    return null;
  }

  const [, jobId, action] = parts;
  if (!jobId || !action) {
    return null;
  }

  if (action === jobActionTypes.SELECT && parts.length >= 5) {
    return {
      kind: action,
      jobId,
      variantKey: parts[3],
      slot: parts[4]
    };
  }

  if (action === jobActionTypes.REGENERATE && parts.length >= 4) {
    return {
      kind: action,
      jobId,
      variantKey: parts[3]
    };
  }

  if (
    action === jobActionTypes.RENDER_ALL ||
    action === jobActionTypes.CANCEL ||
    action === jobActionTypes.REANALYZE_ALL
  ) {
    return {
      kind: action,
      jobId
    };
  }

  return null;
}

export function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Cancel', magicCallbacks.CANCEL)]]);
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

export function singleLengthKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('60s', `${magicCallbacks.SINGLE_LENGTH_PREFIX}60`),
      Markup.button.callback('75s (Rec)', `${magicCallbacks.SINGLE_LENGTH_PREFIX}75`)
    ],
    [
      Markup.button.callback('90s', `${magicCallbacks.SINGLE_LENGTH_PREFIX}90`),
      Markup.button.callback('Custom', `${magicCallbacks.SINGLE_LENGTH_PREFIX}custom`)
    ],
    [
      Markup.button.callback('Back', magicCallbacks.BACK),
      Markup.button.callback('Cancel', magicCallbacks.CANCEL)
    ]
  ]);
}

export function variantDurationModeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        'Default Bundle (Rec)',
        `${magicCallbacks.VARIANT_DURATION_MODE_PREFIX}default`
      )
    ],
    [Markup.button.callback('Custom per variant', `${magicCallbacks.VARIANT_DURATION_MODE_PREFIX}custom`)],
    [
      Markup.button.callback('Back', magicCallbacks.BACK),
      Markup.button.callback('Cancel', magicCallbacks.CANCEL)
    ]
  ]);
}

export function confirmKeyboard(state) {
  const isVariants = state?.outputMode === 'variants';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(isVariants ? 'Analyze Preview' : 'Start Render', magicCallbacks.START),
      Markup.button.callback('Edit', magicCallbacks.EDIT)
    ],
    [Markup.button.callback('Cancel', magicCallbacks.CANCEL)]
  ]);
}

export function editKeyboard(state) {
  const durationLabel = state?.outputMode === 'variants' ? 'Change durations' : 'Change length';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Change URL', magicCallbacks.EDIT_URL),
      Markup.button.callback(durationLabel, magicCallbacks.EDIT_DURATIONS)
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
    return '3 Variants';
  }
  return 'Single (Best)';
}

function formatVariantDurationBlock(variantDurations) {
  if (!variantDurations) {
    return '- Durations: not set';
  }

  return [
    `- Hot Take: ${formatDuration(variantDurations.hot_take)}`,
    `- Checklist: ${formatDuration(variantDurations.checklist)}`,
    `- Story: ${formatDuration(variantDurations.story)}`
  ].join('\n');
}

export function formatSummary(state) {
  const lines = [magicClipsUx.summaryTitle, `- URL: ${state.urlNormalized}`, `- Mode: ${modeLabel(state.outputMode)}`];

  if (state.outputMode === 'variants') {
    lines.push('- Workflow: Analyze preview -> Approve -> Render All');
    lines.push(formatVariantDurationBlock(state.variantDurations));
  } else {
    lines.push(`- Target length: ${formatDuration(state.targetLengthSec)}`);
    lines.push('- Workflow: Render now');
  }

  return lines.join('\n');
}

function slotButtonLabel(slot, selectedSlot, defaultLabel) {
  if (selectedSlot === slot) {
    return `✓ ${defaultLabel}`;
  }
  return defaultLabel;
}

export function previewCandidateKeyboard({ jobId, variantKey, selectedSlot = null }) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        slotButtonLabel('A', selectedSlot, 'Approve A'),
        buildSelectCandidateCallback(jobId, variantKey, 'A')
      ),
      Markup.button.callback(
        slotButtonLabel('B', selectedSlot, 'Use B'),
        buildSelectCandidateCallback(jobId, variantKey, 'B')
      ),
      Markup.button.callback(
        slotButtonLabel('C', selectedSlot, 'Use C'),
        buildSelectCandidateCallback(jobId, variantKey, 'C')
      )
    ],
    [Markup.button.callback('Regenerate', buildRegenerateVariantCallback(jobId, variantKey))]
  ]);
}

export function renderDecisionKeyboard({ jobId }) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Render All', buildRenderAllCallback(jobId))],
    [
      Markup.button.callback('Cancel', buildCancelRenderCallback(jobId)),
      Markup.button.callback('Re-analyze all', buildReanalyzeAllCallback(jobId))
    ]
  ]);
}
