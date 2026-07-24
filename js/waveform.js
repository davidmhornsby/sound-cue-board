// Decodes an audio blob purely to extract waveform peaks — uses an OfflineAudioContext
// so it never touches the shared playback AudioContext in audio.js.
export async function decodeForWaveform(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtx(1, 1, 44100);
  return offlineCtx.decodeAudioData(arrayBuffer.slice(0));
}

export function computePeaks(audioBuffer, bucketCount) {
  const channel = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / bucketCount));
  const peaks = new Float32Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize && start + j < channel.length; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

function drawWaveform(canvas, peaks, { trimStartFrac, trimEndFrac, duration, fadeIn, fadeOut }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const mid = h / 2;
  const barWidth = w / peaks.length;

  for (let i = 0; i < peaks.length; i++) {
    const frac = i / peaks.length;
    const inRange = frac >= trimStartFrac && frac <= trimEndFrac;
    ctx.fillStyle = inRange ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
    const barH = Math.max(2, peaks[i] * (h - 8));
    ctx.fillRect(i * barWidth, mid - barH / 2, Math.max(1, barWidth - 1), barH);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, trimStartFrac * w, h);
  ctx.fillRect(trimEndFrac * w, 0, w - trimEndFrac * w, h);

  ctx.fillStyle = '#e63946';
  ctx.fillRect(trimStartFrac * w - 2, 0, 4, h);
  ctx.fillRect(trimEndFrac * w - 2, 0, 4, h);

  const playDuration = Math.max(0.001, (trimEndFrac - trimStartFrac) * duration);
  const safeFadeIn = Math.max(0, Math.min(fadeIn || 0, playDuration));
  const safeFadeOut = Math.max(0, Math.min(fadeOut || 0, playDuration - safeFadeIn));
  if (safeFadeIn > 0 || safeFadeOut > 0) {
    const startX = trimStartFrac * w;
    const endX = trimEndFrac * w;
    const fadeInX = startX + (safeFadeIn / duration) * w;
    const fadeOutX = endX - (safeFadeOut / duration) * w;
    ctx.beginPath();
    ctx.moveTo(startX, h);
    ctx.lineTo(fadeInX, 2);
    ctx.lineTo(fadeOutX, 2);
    ctx.lineTo(endX, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Wires up a canvas to show a waveform and let the user drag two handles to pick
// a start/end trim range. Returns { setPeaks, setRange, destroy }.
export function createTrimEditor(canvas, { onChange }) {
  let peaks = null;
  let duration = 0;
  let trimStart = 0;
  let trimEnd = 0;
  let fadeIn = 0;
  let fadeOut = 0;
  let dragging = null; // 'start' | 'end' | null
  const MIN_GAP = 0.1;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(64 * dpr));
  }

  function redraw() {
    if (!peaks || duration <= 0) return;
    drawWaveform(canvas, peaks, {
      trimStartFrac: trimStart / duration,
      trimEndFrac: trimEnd / duration,
      duration,
      fadeIn,
      fadeOut,
    });
  }

  function setPeaks(newPeaks, newDuration, initialStart, initialEnd) {
    peaks = newPeaks;
    duration = newDuration;
    trimStart = initialStart ?? 0;
    trimEnd = initialEnd ?? newDuration;
    resizeCanvas();
    redraw();
  }

  function setRange(start, end) {
    trimStart = start;
    trimEnd = end;
    redraw();
  }

  function setFades(newFadeIn, newFadeOut) {
    fadeIn = newFadeIn || 0;
    fadeOut = newFadeOut || 0;
    redraw();
  }

  function clear() {
    peaks = null;
    duration = 0;
    resizeCanvas();
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  function xToTime(clientX) {
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * duration;
  }

  function onPointerDown(e) {
    if (!peaks) return;
    canvas.setPointerCapture(e.pointerId);
    const t = xToTime(e.clientX);
    dragging = Math.abs(t - trimStart) <= Math.abs(t - trimEnd) ? 'start' : 'end';
    onPointerMove(e);
  }

  function onPointerMove(e) {
    if (!dragging || !peaks) return;
    const t = xToTime(e.clientX);
    if (dragging === 'start') {
      trimStart = Math.min(t, trimEnd - MIN_GAP);
      trimStart = Math.max(0, trimStart);
    } else {
      trimEnd = Math.max(t, trimStart + MIN_GAP);
      trimEnd = Math.min(duration, trimEnd);
    }
    redraw();
    onChange(trimStart, trimEnd);
  }

  function onPointerUp() {
    dragging = null;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  }

  return { setPeaks, setRange, setFades, clear, destroy };
}
