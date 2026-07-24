// Web Audio playback engine: decodes+caches AudioBuffers, plays overlapping sounds,
// and drives a single rAF loop that reports per-button countdown/elapsed progress.
let ctx = null;
const bufferCache = new Map(); // assetId -> Promise<AudioBuffer>
const active = new Map(); // buttonId -> { source, gain, startedAt, duration, loop, onTick, onEnd }
let rafHandle = null;

// Safari's newer navigator.audioSession API defaults new pages to type "auto", which
// lets WebKit heuristically treat short sound-effect-style audio as interruptible
// "ambient" sound — audible on some devices/OS versions, silently suppressed on others,
// with no error and no change to AudioContext.state. Forcing "playback" makes this
// behave like real media playback unconditionally.
function ensureAudioSessionType() {
  try {
    if ('audioSession' in navigator) {
      navigator.audioSession.type = 'playback';
    }
  } catch (_) {
    /* noop */
  }
}

function ensureContext() {
  ensureAudioSessionType();
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

async function decode(assetId, blob) {
  if (bufferCache.has(assetId)) return bufferCache.get(assetId);
  const p = blob
    .arrayBuffer()
    .then((arrayBuffer) => ensureContext().decodeAudioData(arrayBuffer.slice(0)));
  bufferCache.set(assetId, p);
  try {
    return await p;
  } catch (err) {
    bufferCache.delete(assetId);
    throw err;
  }
}

export function invalidateAsset(assetId) {
  bufferCache.delete(assetId);
}

function tick() {
  const c = ensureContext();
  for (const [buttonId, inst] of active) {
    const elapsed = c.currentTime - inst.startedAt;
    if (inst.loop) {
      const pos = elapsed % inst.duration;
      inst.onTick({ loop: true, elapsed: pos, duration: inst.duration });
    } else {
      const remaining = Math.max(0, inst.duration - elapsed);
      inst.onTick({ loop: false, remaining, duration: inst.duration });
    }
  }
  if (active.size > 0) {
    rafHandle = requestAnimationFrame(tick);
  } else {
    rafHandle = null;
  }
}

function startTicking() {
  if (rafHandle == null) {
    rafHandle = requestAnimationFrame(tick);
  }
}

function stopInstance(buttonId) {
  const inst = active.get(buttonId);
  if (!inst) return;
  active.delete(buttonId);
  try {
    inst.source.onended = null;
    inst.source.stop();
  } catch (_) {
    /* already stopped */
  }
  inst.onEnd();
}

export function isPlaying(buttonId) {
  return active.has(buttonId);
}

// Toggle/trigger semantics:
// - looping sound not yet playing -> start it, playing -> stop it (acts as its own on/off)
// - one-shot sound already playing -> restart from the top
// - anything else -> start fresh
export async function trigger(buttonId, assetId, blob, { volume, loop, trimStart = 0, trimEnd = null, fadeIn = 0, fadeOut = 0 }, { onStart, onTick, onEnd }) {
  const c = ensureContext();
  const wasPlaying = active.has(buttonId);
  if (wasPlaying) {
    stopInstance(buttonId);
    if (loop) return; // loop toggle: second tap just stops it
  }

  const buffer = await decode(assetId, blob);
  const effectiveEnd = trimEnd != null ? Math.min(trimEnd, buffer.duration) : buffer.duration;
  const effectiveStart = Math.min(Math.max(0, trimStart), Math.max(0, effectiveEnd - 0.01));
  const playDuration = Math.max(0.01, effectiveEnd - effectiveStart);
  const safeFadeIn = Math.max(0, Math.min(fadeIn, playDuration));
  const safeFadeOut = !loop ? Math.max(0, Math.min(fadeOut, playDuration - safeFadeIn)) : 0;

  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = !!loop;
  if (loop) {
    source.loopStart = effectiveStart;
    source.loopEnd = effectiveEnd;
  }
  const gain = c.createGain();
  source.connect(gain).connect(c.destination);

  const startedAt = c.currentTime;
  if (safeFadeIn > 0) {
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(volume, startedAt + safeFadeIn);
  } else {
    gain.gain.setValueAtTime(volume, startedAt);
  }
  if (safeFadeOut > 0) {
    const fadeStart = startedAt + playDuration - safeFadeOut;
    gain.gain.setValueAtTime(volume, fadeStart);
    gain.gain.linearRampToValueAtTime(0, startedAt + playDuration);
  }

  const inst = { source, gain, startedAt, duration: playDuration, loop: !!loop, onTick, onEnd };
  source.onended = () => {
    if (active.get(buttonId) === inst) {
      active.delete(buttonId);
      onEnd();
    }
  };
  active.set(buttonId, inst);
  if (loop) {
    source.start(startedAt, effectiveStart);
  } else {
    source.start(startedAt, effectiveStart, playDuration);
  }
  onStart();
  startTicking();
}

export function stopButton(buttonId) {
  stopInstance(buttonId);
}

export function stopAll() {
  for (const buttonId of Array.from(active.keys())) {
    stopInstance(buttonId);
  }
}

export function fadeOutAndStopAll(durationSec) {
  const c = ensureContext();
  const now = c.currentTime;
  for (const [buttonId, inst] of active) {
    try {
      inst.gain.gain.cancelScheduledValues(now);
      inst.gain.gain.setValueAtTime(inst.gain.gain.value, now);
      inst.gain.gain.linearRampToValueAtTime(0, now + durationSec);
    } catch (_) {
      /* noop */
    }
    setTimeout(() => {
      if (active.get(buttonId) === inst) {
        stopInstance(buttonId);
      }
    }, durationSec * 1000 + 30);
  }
}

let unlocked = false;

// iOS Safari's Web Audio output can stay silently muted even after resume() reports
// "running" — no error, no visual difference, sound just never reaches the speaker —
// unless a real source has actually been started on this exact context during a user
// gesture. Playing a silent buffer synchronously here (not awaited, not decoded) is the
// standard reliable unlock for that.
export function unlockOnGesture() {
  const c = ensureContext();
  if (unlocked) return;
  unlocked = true;
  try {
    const buffer = c.createBuffer(1, 1, 22050);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(0);
  } catch (_) {
    /* noop */
  }
}

// On-device diagnostics — lets someone read the real AudioContext state directly off
// their screen when there's no way to attach a debugger (e.g. an iPhone with no Mac handy).
export function getContextInfo() {
  const c = ensureContext();
  return { state: c.state, sampleRate: c.sampleRate, baseLatency: c.baseLatency };
}

// A pure oscillator tone, no file decoding involved — isolates whether Web Audio can
// produce ANY sound at all on this device from whether the problem is specific to
// decoding/playing back a particular audio file.
export function playTestTone() {
  const c = ensureContext();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = 440;
  gain.gain.value = 0.3;
  osc.connect(gain).connect(c.destination);
  const now = c.currentTime;
  osc.start(now);
  osc.stop(now + 0.6);
  return getContextInfo();
}
