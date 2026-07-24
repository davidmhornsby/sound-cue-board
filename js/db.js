// IndexedDB wrapper: one "config" store holding a single JSON document (pages/buttons/settings),
// and one "assets" store holding binary blobs (audio + button images) keyed by id.
const DB_NAME = 'cue-board-db';
const DB_VERSION = 1;
const CONFIG_STORE = 'config';
const ASSETS_STORE = 'assets';
const CONFIG_KEY = 'main';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE);
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function getConfig() {
  const store = await tx(CONFIG_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(CONFIG_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveConfig(configObj) {
  const store = await tx(CONFIG_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(configObj, CONFIG_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putAsset(id, blob) {
  const store = await tx(ASSETS_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAsset(id) {
  const store = await tx(ASSETS_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAsset(id) {
  const store = await tx(ASSETS_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllAssetIds() {
  const store = await tx(ASSETS_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  const configStore = await tx(CONFIG_STORE, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = configStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  const assetsStore = await tx(ASSETS_STORE, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = assetsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
