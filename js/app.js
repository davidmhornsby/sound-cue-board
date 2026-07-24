import * as db from './db.js?v=8';
import * as audioEngine from './audio.js?v=8';
import { EMOJI_CATEGORIES } from './emoji-data.js?v=8';
import { decodeForWaveform, computePeaks, createTrimEditor } from './waveform.js?v=8';

let currentEmojiCategory = Object.keys(EMOJI_CATEGORIES)[0];

const el = {
  grid: document.getElementById('grid'),
  emptyHint: document.getElementById('emptyHint'),
  pageTabs: document.getElementById('pageTabs'),
  menuBtn: document.getElementById('menuBtn'),
  editModeBtn: document.getElementById('editModeBtn'),
  themeBtn: document.getElementById('themeBtn'),
  panicBtn: document.getElementById('panicBtn'),
  fadeStopBtn: document.getElementById('fadeStopBtn'),
  fadeBtnProgress: document.getElementById('fadeBtnProgress'),
  fadeBtnLabel: document.getElementById('fadeBtnLabel'),
  fadeDurDecBtn: document.getElementById('fadeDurDecBtn'),
  fadeDurIncBtn: document.getElementById('fadeDurIncBtn'),
  fadeDurLabel: document.getElementById('fadeDurLabel'),

  menuOverlay: document.getElementById('menuOverlay'),
  closeMenuBtn: document.getElementById('closeMenuBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),

  buttonModal: document.getElementById('buttonModal'),
  buttonModalTitle: document.getElementById('buttonModalTitle'),
  btnName: document.getElementById('btnName'),
  btnEmoji: document.getElementById('btnEmoji'),
  emojiCatTabs: document.getElementById('emojiCatTabs'),
  emojiPresets: document.getElementById('emojiPresets'),
  emojiPane: document.getElementById('emojiPane'),
  imagePane: document.getElementById('imagePane'),
  imagePreview: document.getElementById('imagePreview'),
  btnImageFile: document.getElementById('btnImageFile'),
  btnColor: document.getElementById('btnColor'),
  btnAudioFile: document.getElementById('btnAudioFile'),
  audioInfo: document.getElementById('audioInfo'),
  previewPlayBtn: document.getElementById('previewPlayBtn'),
  previewAudio: document.getElementById('previewAudio'),
  trimCanvas: document.getElementById('trimCanvas'),
  trimInfo: document.getElementById('trimInfo'),
  resetTrimBtn: document.getElementById('resetTrimBtn'),
  fadeInRange: document.getElementById('fadeInRange'),
  fadeInValue: document.getElementById('fadeInValue'),
  fadeOutRange: document.getElementById('fadeOutRange'),
  fadeOutValue: document.getElementById('fadeOutValue'),
  btnVolume: document.getElementById('btnVolume'),
  volumeValue: document.getElementById('volumeValue'),
  btnLoop: document.getElementById('btnLoop'),
  deleteBtnBtn: document.getElementById('deleteBtnBtn'),
  cancelBtnBtn: document.getElementById('cancelBtnBtn'),
  saveBtnBtn: document.getElementById('saveBtnBtn'),

  pageModal: document.getElementById('pageModal'),
  pageModalTitle: document.getElementById('pageModalTitle'),
  pageName: document.getElementById('pageName'),
  deletePageBtn: document.getElementById('deletePageBtn'),
  cancelPageBtn: document.getElementById('cancelPageBtn'),
  savePageBtn: document.getElementById('savePageBtn'),

  confirmModal: document.getElementById('confirmModal'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn'),
};

let config = null;
let editMode = false;
const imageUrlCache = new Map(); // assetId -> object URL
let dragState = null;

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultConfig() {
  const pageId = uid();
  return {
    theme: 'dark',
    activePageId: pageId,
    fadeOutDuration: 2,
    pages: [{ id: pageId, name: 'Page 1', buttons: [] }],
  };
}

function activePage() {
  return config.pages.find((p) => p.id === config.activePageId) || config.pages[0];
}

async function init() {
  config = (await db.getConfig()) || (await loadDefaultShow());
  if (!config.pages.find((p) => p.id === config.activePageId)) {
    config.activePageId = config.pages[0].id;
  }
  if (config.fadeOutDuration == null) config.fadeOutDuration = 2;
  applyTheme();
  renderTabs();
  renderGrid();
  wireStaticEvents();
  updateFadeDurLabel();
}

// First-ever launch (no saved config yet): seed the board from the bundled default
// show so new installs aren't a blank slate, instead of the empty single-page template.
async function loadDefaultShow() {
  try {
    const res = await fetch('./default-show.json');
    if (!res.ok) throw new Error('no default-show.json');
    const payload = await res.json();
    for (const [id, asset] of Object.entries(payload.assets || {})) {
      await db.putAsset(id, base64ToBlob(asset.data, asset.type));
    }
    await db.saveConfig(payload.config);
    return payload.config;
  } catch (_) {
    return defaultConfig();
  }
}

function updateFadeDurLabel() {
  el.fadeDurLabel.textContent = `${config.fadeOutDuration.toFixed(1)}s`;
}

let fadeBtnAnimHandle = null;

function runFadeButtonAnimation(durationSec) {
  if (fadeBtnAnimHandle != null) cancelAnimationFrame(fadeBtnAnimHandle);
  const start = performance.now();
  el.fadeBtnProgress.style.width = '100%';

  function tick() {
    const elapsed = (performance.now() - start) / 1000;
    const remaining = Math.max(0, durationSec - elapsed);
    el.fadeBtnProgress.style.width = `${(remaining / durationSec) * 100}%`;
    if (remaining > 0) {
      el.fadeBtnLabel.textContent = `⤵ ${remaining.toFixed(1)}s`;
      fadeBtnAnimHandle = requestAnimationFrame(tick);
    } else {
      el.fadeBtnProgress.style.width = '0%';
      el.fadeBtnLabel.textContent = '⤵ FADE OUT';
      fadeBtnAnimHandle = null;
    }
  }
  fadeBtnAnimHandle = requestAnimationFrame(tick);
}

function persist() {
  return db.saveConfig(config);
}

// ---------- Theme ----------
function applyTheme() {
  document.documentElement.dataset.theme = config.theme;
  el.themeBtn.textContent = config.theme === 'dark' ? '🌙' : '☀️';
}

// ---------- Tabs ----------
function renderTabs() {
  el.pageTabs.innerHTML = '';
  config.pages.forEach((page, idx) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (page.id === config.activePageId ? ' active' : '');
    tab.type = 'button';

    const label = document.createElement('span');
    label.textContent = page.name;
    tab.appendChild(label);

    if (editMode) {
      const left = document.createElement('span');
      left.className = 'tab-edit';
      left.textContent = '‹';
      left.title = 'Move page left';
      left.onclick = (e) => { e.stopPropagation(); movePage(idx, -1); };
      if (idx === 0) left.style.visibility = 'hidden';

      const right = document.createElement('span');
      right.className = 'tab-edit';
      right.textContent = '›';
      right.title = 'Move page right';
      right.onclick = (e) => { e.stopPropagation(); movePage(idx, 1); };
      if (idx === config.pages.length - 1) right.style.visibility = 'hidden';

      const pencil = document.createElement('span');
      pencil.className = 'tab-edit';
      pencil.textContent = '✎';
      pencil.title = 'Rename / delete page';
      pencil.onclick = (e) => { e.stopPropagation(); openPageEditor(page); };

      tab.append(left, right, pencil);
    }

    tab.onclick = () => {
      config.activePageId = page.id;
      persist();
      renderTabs();
      renderGrid();
    };
    el.pageTabs.appendChild(tab);
  });

  if (editMode) {
    const addTab = document.createElement('button');
    addTab.className = 'tab tab-add';
    addTab.type = 'button';
    addTab.textContent = '+ Page';
    addTab.onclick = () => openPageEditor(null);
    el.pageTabs.appendChild(addTab);
  }
}

function movePage(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= config.pages.length) return;
  const [page] = config.pages.splice(idx, 1);
  config.pages.splice(newIdx, 0, page);
  persist();
  renderTabs();
}

// ---------- Grid ----------
async function getImageUrl(assetId) {
  if (imageUrlCache.has(assetId)) return imageUrlCache.get(assetId);
  const blob = await db.getAsset(assetId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  imageUrlCache.set(assetId, url);
  return url;
}

function renderGrid() {
  const page = activePage();
  el.grid.innerHTML = '';
  el.emptyHint.classList.toggle('hidden', !(editMode && page.buttons.length === 0));

  page.buttons.forEach((button) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.dataset.id = button.id;
    tile.style.background = button.color || '#3a6ea5';

    if (button.icon?.type === 'image' && button.icon.assetId) {
      const img = document.createElement('img');
      img.className = 'tile-icon is-image';
      img.alt = '';
      getImageUrl(button.icon.assetId).then((url) => { if (url) img.src = url; });
      tile.appendChild(img);
    } else {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'tile-icon';
      iconSpan.textContent = button.icon?.value || '🔊';
      tile.appendChild(iconSpan);
    }

    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = button.name || 'Untitled';
    tile.appendChild(name);

    const countdown = document.createElement('span');
    countdown.className = 'tile-countdown';
    tile.appendChild(countdown);

    const progress = document.createElement('span');
    progress.className = 'tile-progress';
    tile.appendChild(progress);

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'tile-stop';
    stopBtn.setAttribute('aria-label', `Stop ${button.name || 'sound'}`);
    stopBtn.textContent = 'STOP';
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      audioEngine.stopButton(button.id);
    });
    tile.appendChild(stopBtn);

    if (editMode) {
      const badge = document.createElement('span');
      badge.className = 'tile-edit-badge';
      badge.textContent = '✎';
      tile.appendChild(badge);
    }

    tile.addEventListener('click', (e) => {
      if (dragState) return;
      if (editMode) {
        openButtonEditor(button);
      } else {
        playButton(button);
      }
    });
    tile.addEventListener('pointerdown', (e) => onTilePointerDown(e, tile, button));

    el.grid.appendChild(tile);
  });

  if (editMode) {
    const addTile = document.createElement('button');
    addTile.type = 'button';
    addTile.className = 'add-tile';
    addTile.textContent = '+';
    addTile.onclick = () => openButtonEditor(null);
    el.grid.appendChild(addTile);
  }
}

function findTileEl(buttonId) {
  return el.grid.querySelector(`.tile[data-id="${buttonId}"]`);
}

function setTilePlayingVisual(buttonId, { playing, looping, text, progressPct }) {
  const tile = findTileEl(buttonId);
  if (!tile) return;
  tile.classList.toggle('playing', !!playing);
  tile.classList.toggle('looping', !!looping);
  const countdown = tile.querySelector('.tile-countdown');
  const progress = tile.querySelector('.tile-progress');
  if (countdown) countdown.textContent = text || '';
  if (progress) progress.style.width = `${progressPct ?? 0}%`;
}

async function playButton(button) {
  if (!button.audioAssetId) return;
  audioEngine.unlockOnGesture();
  const blob = await db.getAsset(button.audioAssetId);
  if (!blob) return;
  audioEngine.trigger(
    button.id,
    button.audioAssetId,
    blob,
    {
      volume: button.volume ?? 1,
      loop: !!button.loop,
      trimStart: button.trimStart ?? 0,
      trimEnd: button.trimEnd ?? null,
      fadeIn: button.fadeIn ?? 0,
      fadeOut: button.fadeOut ?? 0,
    },
    {
      onStart: () => setTilePlayingVisual(button.id, { playing: true, looping: !!button.loop, text: '', progressPct: 100 }),
      onTick: (info) => {
        if (info.loop) {
          const pctRemaining = 100 - (info.elapsed / info.duration) * 100;
          setTilePlayingVisual(button.id, { playing: true, looping: true, text: `🔁 ${info.elapsed.toFixed(1)}s`, progressPct: pctRemaining });
        } else {
          const pctRemaining = (info.remaining / info.duration) * 100;
          setTilePlayingVisual(button.id, { playing: true, looping: false, text: `${info.remaining.toFixed(1)}s`, progressPct: pctRemaining });
        }
      },
      onEnd: () => setTilePlayingVisual(button.id, { playing: false, looping: false, text: '', progressPct: 0 }),
    }
  );
}

// ---------- Drag reorder (edit mode only) ----------
function onTilePointerDown(e, tileEl, button) {
  if (!editMode) return;
  const page = activePage();
  const startX = e.clientX;
  const startY = e.clientY;
  const pointerId = e.pointerId;
  let started = false;

  const longPressTimer = setTimeout(() => {
    started = true;
    beginDrag(pointerId, tileEl, button, page, startX, startY);
  }, 300);

  const moveHandler = (ev) => {
    if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) {
      clearTimeout(longPressTimer);
      cleanup();
    }
  };
  const upHandler = () => {
    clearTimeout(longPressTimer);
    cleanup();
  };
  function cleanup() {
    tileEl.removeEventListener('pointermove', moveHandler);
    tileEl.removeEventListener('pointerup', upHandler);
  }
  tileEl.addEventListener('pointermove', moveHandler);
  tileEl.addEventListener('pointerup', upHandler, { once: true });
}

function beginDrag(pointerId, tileEl, button, page, startClientX, startClientY) {
  const rect = tileEl.getBoundingClientRect();
  const ghost = tileEl.cloneNode(true);
  ghost.classList.add('dragging');
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.margin = '0';
  ghost.style.zIndex = '999';
  document.body.appendChild(ghost);

  tileEl.style.visibility = 'hidden';
  try { tileEl.setPointerCapture(pointerId); } catch (_) { /* noop */ }

  dragState = {
    pointerId,
    tileEl,
    ghost,
    page,
    offsetX: startClientX - rect.left,
    offsetY: startClientY - rect.top,
  };

  tileEl.addEventListener('pointermove', onDragMove);
  tileEl.addEventListener('pointerup', onDragEnd, { once: true });
  tileEl.addEventListener('pointercancel', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const { ghost, offsetX, offsetY } = dragState;
  const x = e.clientX - offsetX;
  const y = e.clientY - offsetY;
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;

  const centerX = e.clientX;
  const centerY = e.clientY;
  ghost.style.pointerEvents = 'none';
  const target = document.elementFromPoint(centerX, centerY)?.closest('.tile[data-id]');
  if (target && target !== dragState.tileEl) {
    el.grid.insertBefore(dragState.tileEl, target);
  }
}

function onDragEnd() {
  if (!dragState) return;
  const { tileEl, ghost, page } = dragState;
  ghost.remove();
  tileEl.style.visibility = '';
  tileEl.removeEventListener('pointermove', onDragMove);

  const newOrderIds = Array.from(el.grid.querySelectorAll('.tile[data-id]')).map((t) => t.dataset.id);
  page.buttons.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
  persist();
  dragState = null;
  renderGrid();
}

// ---------- Button editor ----------
let editingButtonId = null;
let pendingAudioFile = null;
let pendingImageFile = null;
let iconMode = 'emoji';
let trimEditor = null;
let pendingTrimStart = 0;
let pendingTrimEnd = 0;
let pendingDuration = 0;

function ensureTrimEditor() {
  if (!trimEditor) {
    trimEditor = createTrimEditor(el.trimCanvas, {
      onChange: (start, end) => {
        pendingTrimStart = start;
        pendingTrimEnd = end;
        updateTrimInfo();
      },
    });
  }
  return trimEditor;
}

function updateTrimInfo() {
  if (!pendingDuration) {
    el.trimInfo.textContent = '';
    return;
  }
  el.trimInfo.textContent = `${pendingTrimStart.toFixed(1)}s–${pendingTrimEnd.toFixed(1)}s (${(pendingTrimEnd - pendingTrimStart).toFixed(1)}s of ${pendingDuration.toFixed(1)}s)`;
}

async function loadWaveformFromBlob(blob, initialStart, initialEnd) {
  el.trimInfo.textContent = 'Loading waveform…';
  try {
    const buffer = await decodeForWaveform(blob);
    pendingDuration = buffer.duration;
    pendingTrimStart = Math.min(Math.max(0, initialStart ?? 0), buffer.duration);
    pendingTrimEnd = Math.min(initialEnd ?? buffer.duration, buffer.duration);
    if (pendingTrimEnd <= pendingTrimStart) pendingTrimEnd = buffer.duration;
    const peaks = computePeaks(buffer, 200);
    const editor = ensureTrimEditor();
    editor.setPeaks(peaks, buffer.duration, pendingTrimStart, pendingTrimEnd);
    editor.setFades(Number(el.fadeInRange.value), Number(el.fadeOutRange.value));
    updateTrimInfo();
  } catch (_) {
    pendingDuration = 0;
    el.trimInfo.textContent = '';
  }
}

function setFadeSliders(fadeIn, fadeOut) {
  el.fadeInRange.value = fadeIn || 0;
  el.fadeInValue.textContent = `${Number(el.fadeInRange.value).toFixed(1)}s`;
  el.fadeOutRange.value = fadeOut || 0;
  el.fadeOutValue.textContent = `${Number(el.fadeOutRange.value).toFixed(1)}s`;
}

function openButtonEditor(button) {
  editingButtonId = button?.id || null;
  pendingAudioFile = null;
  pendingImageFile = null;
  pendingDuration = 0;
  pendingTrimStart = 0;
  pendingTrimEnd = 0;
  el.trimInfo.textContent = '';
  if (!button?.audioAssetId) trimEditor?.clear();
  setFadeSliders(button?.fadeIn, button?.fadeOut);

  el.buttonModalTitle.textContent = button ? 'Edit Sound' : 'New Sound';
  el.btnName.value = button?.name || '';
  el.btnColor.value = button?.color || '#3a6ea5';
  el.btnVolume.value = Math.round((button?.volume ?? 1) * 100);
  el.volumeValue.textContent = `${el.btnVolume.value}%`;
  el.btnLoop.checked = !!button?.loop;
  el.deleteBtnBtn.classList.toggle('hidden', !button);

  iconMode = button?.icon?.type === 'image' ? 'image' : 'emoji';
  setIconMode(iconMode);
  el.btnEmoji.value = button?.icon?.type === 'emoji' ? button.icon.value : '';
  el.imagePreview.classList.add('hidden');
  el.imagePreview.removeAttribute('src');
  if (button?.icon?.type === 'image' && button.icon.assetId) {
    getImageUrl(button.icon.assetId).then((url) => {
      if (url) { el.imagePreview.src = url; el.imagePreview.classList.remove('hidden'); }
    });
  }

  el.audioInfo.textContent = button?.audioName ? `Current: ${button.audioName}` : 'No sound file selected yet.';
  el.previewPlayBtn.disabled = true;
  el.previewAudio.removeAttribute('src');
  if (button?.audioAssetId) {
    db.getAsset(button.audioAssetId).then((blob) => {
      if (blob) {
        el.previewAudio.src = URL.createObjectURL(blob);
        el.previewPlayBtn.disabled = false;
        loadWaveformFromBlob(blob, button.trimStart ?? 0, button.trimEnd ?? null);
      }
    });
  }

  el.btnAudioFile.value = '';
  el.btnImageFile.value = '';
  show(el.buttonModal);
}

function setIconMode(mode) {
  iconMode = mode;
  el.emojiPane.classList.toggle('hidden', mode !== 'emoji');
  el.imagePane.classList.toggle('hidden', mode !== 'image');
  document.querySelectorAll('.icon-tab').forEach((t) => t.classList.toggle('active', t.dataset.iconMode === mode));
}

function renderEmojiCatTabs() {
  el.emojiCatTabs.innerHTML = '';
  Object.keys(EMOJI_CATEGORIES).forEach((cat) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'emoji-cat-tab' + (cat === currentEmojiCategory ? ' active' : '');
    tab.textContent = cat;
    tab.onclick = () => {
      currentEmojiCategory = cat;
      renderEmojiCatTabs();
      renderEmojiGrid(cat);
    };
    el.emojiCatTabs.appendChild(tab);
  });
}

function renderEmojiGrid(category) {
  el.emojiPresets.innerHTML = '';
  EMOJI_CATEGORIES[category].forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-preset-btn';
    btn.textContent = emoji;
    btn.onclick = () => { el.btnEmoji.value = emoji; };
    el.emojiPresets.appendChild(btn);
  });
}

function closeButtonEditor() {
  hide(el.buttonModal);
  editingButtonId = null;
  pendingAudioFile = null;
  pendingImageFile = null;
}

async function saveButtonEditor() {
  const page = activePage();
  const isNew = !editingButtonId;
  const existing = isNew ? null : page.buttons.find((b) => b.id === editingButtonId);

  if (iconMode === 'image' && !pendingImageFile && !(existing?.icon?.type === 'image')) {
    alert('Please choose an image, or switch to Emoji.');
    return;
  }
  if (!pendingAudioFile && !existing?.audioAssetId) {
    alert('Please choose a sound file.');
    return;
  }

  const button = existing ? { ...existing } : {
    id: uid(),
    name: '',
    icon: { type: 'emoji', value: '🔊' },
    color: '#3a6ea5',
    volume: 1,
    loop: false,
    audioAssetId: null,
    audioName: '',
  };

  button.name = el.btnName.value.trim() || 'Untitled';
  button.color = el.btnColor.value;
  button.volume = Number(el.btnVolume.value) / 100;
  button.loop = el.btnLoop.checked;
  button.trimStart = pendingTrimStart || 0;
  button.trimEnd = pendingTrimEnd || null;
  button.fadeIn = Number(el.fadeInRange.value) || 0;
  button.fadeOut = Number(el.fadeOutRange.value) || 0;

  if (iconMode === 'emoji') {
    if (existing?.icon?.type === 'image' && existing.icon.assetId) {
      await db.deleteAsset(existing.icon.assetId);
      audioEngine.invalidateAsset(existing.icon.assetId);
      imageUrlCache.delete(existing.icon.assetId);
    }
    button.icon = { type: 'emoji', value: el.btnEmoji.value.trim() || '🔊' };
  } else if (pendingImageFile) {
    if (existing?.icon?.type === 'image' && existing.icon.assetId) {
      await db.deleteAsset(existing.icon.assetId);
      imageUrlCache.delete(existing.icon.assetId);
    }
    const assetId = uid();
    await db.putAsset(assetId, pendingImageFile);
    button.icon = { type: 'image', assetId };
  }

  if (pendingAudioFile) {
    if (existing?.audioAssetId) {
      await db.deleteAsset(existing.audioAssetId);
      audioEngine.invalidateAsset(existing.audioAssetId);
    }
    const assetId = uid();
    await db.putAsset(assetId, pendingAudioFile);
    button.audioAssetId = assetId;
    button.audioName = pendingAudioFile.name;
  }

  if (isNew) {
    page.buttons.push(button);
  } else {
    const idx = page.buttons.findIndex((b) => b.id === button.id);
    page.buttons[idx] = button;
  }

  await persist();
  closeButtonEditor();
  renderGrid();
}

function deleteButtonFromEditor() {
  if (!editingButtonId) return;
  const page = activePage();
  const button = page.buttons.find((b) => b.id === editingButtonId);
  if (!button) return;
  askConfirm(`Delete "${button.name}"? This cannot be undone.`, async () => {
    audioEngine.stopButton(button.id);
    if (button.audioAssetId) {
      await db.deleteAsset(button.audioAssetId);
      audioEngine.invalidateAsset(button.audioAssetId);
    }
    if (button.icon?.type === 'image' && button.icon.assetId) {
      await db.deleteAsset(button.icon.assetId);
      imageUrlCache.delete(button.icon.assetId);
    }
    page.buttons = page.buttons.filter((b) => b.id !== button.id);
    await persist();
    closeButtonEditor();
    renderGrid();
  });
}

// ---------- Page editor ----------
let editingPageId = null;

function openPageEditor(page) {
  editingPageId = page?.id || null;
  el.pageModalTitle.textContent = page ? 'Edit Page' : 'New Page';
  el.pageName.value = page?.name || '';
  el.deletePageBtn.classList.toggle('hidden', !page || config.pages.length <= 1);
  show(el.pageModal);
}

function closePageEditor() {
  hide(el.pageModal);
  editingPageId = null;
}

async function savePageEditor() {
  const name = el.pageName.value.trim() || 'Page';
  if (editingPageId) {
    const page = config.pages.find((p) => p.id === editingPageId);
    page.name = name;
  } else {
    const newPage = { id: uid(), name, buttons: [] };
    config.pages.push(newPage);
    config.activePageId = newPage.id;
  }
  await persist();
  closePageEditor();
  renderTabs();
  renderGrid();
}

function deletePageFromEditor() {
  if (!editingPageId || config.pages.length <= 1) return;
  const page = config.pages.find((p) => p.id === editingPageId);
  askConfirm(`Delete page "${page.name}" and its ${page.buttons.length} sound button(s)? This cannot be undone.`, async () => {
    for (const button of page.buttons) {
      audioEngine.stopButton(button.id);
      if (button.audioAssetId) await db.deleteAsset(button.audioAssetId);
      if (button.icon?.type === 'image' && button.icon.assetId) await db.deleteAsset(button.icon.assetId);
    }
    config.pages = config.pages.filter((p) => p.id !== page.id);
    if (config.activePageId === page.id) config.activePageId = config.pages[0].id;
    await persist();
    closePageEditor();
    renderTabs();
    renderGrid();
  });
}

// ---------- Confirm modal ----------
let confirmCallback = null;
function askConfirm(message, onConfirm) {
  el.confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  show(el.confirmModal);
}

// ---------- Export / Import ----------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type });
}

function collectAssetIds() {
  const ids = new Set();
  for (const page of config.pages) {
    for (const button of page.buttons) {
      if (button.audioAssetId) ids.add(button.audioAssetId);
      if (button.icon?.type === 'image' && button.icon.assetId) ids.add(button.icon.assetId);
    }
  }
  return ids;
}

async function exportShow() {
  const assetIds = collectAssetIds();
  const assets = {};
  for (const id of assetIds) {
    const blob = await db.getAsset(id);
    if (!blob) continue;
    assets[id] = { type: blob.type || 'application/octet-stream', data: await blobToBase64(blob) };
  }
  const payload = { version: 1, exportedAt: new Date().toISOString(), config, assets };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `sound-cue-board-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importShowFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (_) {
    alert('That file could not be read as a valid backup.');
    return;
  }
  if (!payload?.config?.pages) {
    alert('That file does not look like a valid Sound Cue Board backup.');
    return;
  }
  askConfirm('Import this backup? It will replace everything currently on this iPad.', async () => {
    audioEngine.stopAll();
    imageUrlCache.clear();
    await db.clearAll();
    for (const [id, asset] of Object.entries(payload.assets || {})) {
      await db.putAsset(id, base64ToBlob(asset.data, asset.type));
    }
    await db.saveConfig(payload.config);
    config = payload.config;
    applyTheme();
    renderTabs();
    renderGrid();
    hide(el.menuOverlay);
  });
}

// ---------- Modal helpers ----------
function show(overlay) { overlay.classList.remove('hidden'); }
function hide(overlay) { overlay.classList.add('hidden'); }

// ---------- Static event wiring ----------
function wireStaticEvents() {
  el.menuBtn.onclick = () => show(el.menuOverlay);
  el.closeMenuBtn.onclick = () => hide(el.menuOverlay);
  el.menuOverlay.addEventListener('click', (e) => { if (e.target === el.menuOverlay) hide(el.menuOverlay); });

  function adjustFadeDuration(delta) {
    const next = Math.round((config.fadeOutDuration + delta) * 10) / 10;
    config.fadeOutDuration = Math.min(5, Math.max(0.5, next));
    updateFadeDurLabel();
    persist();
  }
  el.fadeDurDecBtn.onclick = () => adjustFadeDuration(-0.5);
  el.fadeDurIncBtn.onclick = () => adjustFadeDuration(0.5);

  el.editModeBtn.onclick = () => {
    editMode = !editMode;
    el.editModeBtn.setAttribute('aria-pressed', String(editMode));
    el.editModeBtn.textContent = editMode ? 'Editing…' : 'Edit Mode';
    document.body.classList.toggle('edit-mode-active', editMode);
    renderTabs();
    renderGrid();
  };

  el.themeBtn.onclick = () => {
    config.theme = config.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persist();
  };

  el.panicBtn.onclick = () => audioEngine.stopAll();
  el.fadeStopBtn.onclick = () => {
    const duration = config.fadeOutDuration ?? 2;
    audioEngine.fadeOutAndStopAll(duration);
    runFadeButtonAnimation(duration);
  };

  el.exportBtn.onclick = exportShow;
  el.importBtn.onclick = () => el.importFile.click();
  el.importFile.onchange = () => {
    const file = el.importFile.files[0];
    if (file) importShowFile(file);
    el.importFile.value = '';
  };

  document.querySelectorAll('.icon-tab').forEach((tab) => {
    tab.onclick = () => setIconMode(tab.dataset.iconMode);
  });
  el.btnImageFile.onchange = () => {
    const file = el.btnImageFile.files[0];
    if (!file) return;
    pendingImageFile = file;
    el.imagePreview.src = URL.createObjectURL(file);
    el.imagePreview.classList.remove('hidden');
  };
  el.btnAudioFile.onchange = () => {
    const file = el.btnAudioFile.files[0];
    if (!file) return;
    pendingAudioFile = file;
    el.audioInfo.textContent = `New: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    el.previewAudio.src = URL.createObjectURL(file);
    el.previewPlayBtn.disabled = false;
    setFadeSliders(0, 0);
    loadWaveformFromBlob(file, 0, null);
  };
  el.fadeInRange.oninput = () => {
    el.fadeInValue.textContent = `${Number(el.fadeInRange.value).toFixed(1)}s`;
    trimEditor?.setFades(Number(el.fadeInRange.value), Number(el.fadeOutRange.value));
  };
  el.fadeOutRange.oninput = () => {
    el.fadeOutValue.textContent = `${Number(el.fadeOutRange.value).toFixed(1)}s`;
    trimEditor?.setFades(Number(el.fadeInRange.value), Number(el.fadeOutRange.value));
  };
  el.resetTrimBtn.onclick = () => {
    if (!pendingDuration) return;
    pendingTrimStart = 0;
    pendingTrimEnd = pendingDuration;
    trimEditor?.setRange(pendingTrimStart, pendingTrimEnd);
    updateTrimInfo();
  };
  el.previewPlayBtn.onclick = () => {
    if (el.previewAudio.paused) {
      el.previewAudio.currentTime = pendingTrimStart || 0;
      el.previewAudio.play();
      el.previewPlayBtn.textContent = '■ Stop preview';
    } else {
      el.previewAudio.pause();
      el.previewPlayBtn.textContent = '▶ Preview sound';
    }
  };
  el.previewAudio.addEventListener('timeupdate', () => {
    if (pendingTrimEnd && el.previewAudio.currentTime >= pendingTrimEnd) {
      el.previewAudio.pause();
      el.previewAudio.currentTime = pendingTrimStart || 0;
      el.previewPlayBtn.textContent = '▶ Preview sound';
    }
  });
  el.previewAudio.addEventListener('ended', () => { el.previewPlayBtn.textContent = '▶ Preview sound'; });
  el.btnVolume.oninput = () => { el.volumeValue.textContent = `${el.btnVolume.value}%`; };

  el.saveBtnBtn.onclick = saveButtonEditor;
  el.cancelBtnBtn.onclick = () => { el.previewAudio.pause(); closeButtonEditor(); };
  el.deleteBtnBtn.onclick = deleteButtonFromEditor;
  el.buttonModal.addEventListener('click', (e) => { if (e.target === el.buttonModal) { el.previewAudio.pause(); closeButtonEditor(); } });

  el.savePageBtn.onclick = savePageEditor;
  el.cancelPageBtn.onclick = closePageEditor;
  el.deletePageBtn.onclick = deletePageFromEditor;
  el.pageModal.addEventListener('click', (e) => { if (e.target === el.pageModal) closePageEditor(); });

  el.confirmOkBtn.onclick = () => { const cb = confirmCallback; hide(el.confirmModal); if (cb) cb(); };
  el.confirmCancelBtn.onclick = () => hide(el.confirmModal);
  el.confirmModal.addEventListener('click', (e) => { if (e.target === el.confirmModal) hide(el.confirmModal); });

  renderEmojiCatTabs();
  renderEmojiGrid(currentEmojiCategory);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
