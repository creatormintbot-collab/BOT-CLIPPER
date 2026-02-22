import { MAGIC_CLIPS_SESSION_KEY } from '../../../config/constants.mjs';
import { FLOW_STEPS } from './types.mjs';

function defaultState() {
  return {
    active: false,
    step: null,
    url: null,
    clipCount: null,
    maxDurationSec: null
  };
}

export function getMagicClipsState(session) {
  if (!session[MAGIC_CLIPS_SESSION_KEY] || typeof session[MAGIC_CLIPS_SESSION_KEY] !== 'object') {
    session[MAGIC_CLIPS_SESSION_KEY] = defaultState();
  }

  return session[MAGIC_CLIPS_SESSION_KEY];
}

export function beginMagicClipsFlow(session) {
  const state = getMagicClipsState(session);
  state.active = true;
  state.step = FLOW_STEPS.ASK_URL;
  state.url = null;
  state.clipCount = null;
  state.maxDurationSec = null;
  return state;
}

export function resetMagicClipsFlow(session) {
  session[MAGIC_CLIPS_SESSION_KEY] = defaultState();
  return session[MAGIC_CLIPS_SESSION_KEY];
}

export function isMagicClipsFlowActive(session) {
  const state = getMagicClipsState(session);
  return Boolean(state.active);
}

export function moveToStep(session, step) {
  const state = getMagicClipsState(session);
  state.step = step;
  state.active = true;
  return state;
}
