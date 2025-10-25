/* =============================
   IndexedDB Wrapper
   ============================= */

import { updateSearchIndex, removeFromSearchIndex } from './searchIndex.js';

const DB_NAME = 'gourmetapp-db';
const STORE = 'items';
const PLACES_STORE = 'places';
const PHOTOS_STORE = 'photos';

let dbp = null;
let dbInitialized = false;

function initDb() {
  if (dbp) return dbp;

  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // Version 1: items store
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_barcode', 'barcode', { unique: false });
        store.createIndex('by_name', 'name', { unique: false });
        store.createIndex('by_type', 'type', { unique: false });
      }

      // Version 2: places store
      if (oldVersion < 2) {
        const placesStore = db.createObjectStore(PLACES_STORE, { keyPath: 'id', autoIncrement: true });
        placesStore.createIndex('by_name', 'name', { unique: false });
      }

      // Version 3: photos store
      if (oldVersion < 3) {
        const photosStore = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
        photosStore.createIndex('by_itemId', 'itemId', { unique: false });
      }
    };
    req.onsuccess = () => {
      dbInitialized = true;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });

  return dbp;
}

// Ensure database is initialized and ready
export async function ensureDbReady() {
  if (!dbp) {
    initDb();
  }
  await dbp;
  return dbInitialized;
}

// Initialize database on module load
initDb();

async function tx(mode = 'readonly', storeName = STORE) {
  const db = await dbp;
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function addItem(item) {
  const store = await tx('readwrite');
  return new Promise((res, rej) => {
    const itemWithTimestamps = { ...item, createdAt: Date.now(), updatedAt: Date.now() };
    const r = store.add(itemWithTimestamps);
    r.onsuccess = () => {
      const newId = r.result;
      const fullItem = { ...itemWithTimestamps, id: newId };
      // Update search index with the new item
      updateSearchIndex(fullItem);
      res(newId);
    };
    r.onerror = () => rej(r.error);
  });
}

export async function updateItem(id, patch) {
  const store = await tx('readwrite');
  const get = store.get(id);
  return new Promise((res, rej) => {
    get.onsuccess = () => {
      const cur = get.result;
      if (!cur) return rej(new Error('Not found'));
      const updatedItem = { ...cur, ...patch, updatedAt: Date.now() };
      const put = store.put(updatedItem);
      put.onsuccess = () => {
        // Update search index with the modified item
        updateSearchIndex(updatedItem);
        res(put.result);
      };
      put.onerror = () => rej(put.error);
    };
    get.onerror = () => rej(get.error);
  });
}

export async function deleteItem(id) {
  const store = await tx('readwrite');
  return new Promise((res, rej) => {
    const r = store.delete(id);
    r.onsuccess = () => {
      // Remove from search index
      removeFromSearchIndex(id);
      res();
    };
    r.onerror = () => rej(r.error);
  });
}

export async function getItem(id) {
  const store = await tx('readonly');
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listAll() {
  const store = await tx('readonly');
  return new Promise((res) => {
    const out = [];
    const c = store.openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        out.push(cur.value);
        cur.continue();
      } else res(out);
    };
  });
}

export async function findByBarcode(code) {
  const store = await tx('readonly');
  return new Promise((res) => {
    const idx = store.index('by_barcode');
    const r = idx.getAll(code);
    r.onsuccess = () => res(r.result || []);
  });
}

/**
 * Fast search by text using the search index
 * Only fetches items that match from the database
 * @param {Array<number>} ids - Array of item IDs to fetch
 * @returns {Promise<Array>} Array of matching items
 */
export async function getItemsByIds(ids) {
  if (!ids || ids.length === 0) return [];

  const store = await tx('readonly');
  const promises = ids.map(id => {
    return new Promise((res) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null); // Return null for failed fetches
    });
  });

  const results = await Promise.all(promises);
  return results.filter(item => item !== null); // Filter out nulls
}

/**
 * Legacy text search function - reads entire DB and filters
 * NOTE: This is kept for backward compatibility but the app now uses
 * the index-based approach (searchIndex.js + getItemsByIds) for better performance.
 * Consider using searchIndex_fast() + getItemsByIds() instead.
 */
export async function searchByText(q) {
  q = (q || '').toLowerCase();
  const all = await listAll();
  if (!q) return all;
  return all.filter(it =>
    (it.name || '').toLowerCase().includes(q) ||
    (it.notes || '').toLowerCase().includes(q) ||
    (it.barcode || '').includes(q)
  );
}

/* =============================
   Places Store Functions
   ============================= */

export async function addPlace(place) {
  const store = await tx('readwrite', PLACES_STORE);
  return new Promise((res, rej) => {
    const r = store.add({ ...place, createdAt: Date.now() });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function getPlace(id) {
  const store = await tx('readonly', PLACES_STORE);
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listAllPlaces() {
  const store = await tx('readonly', PLACES_STORE);
  return new Promise((res) => {
    const out = [];
    const c = store.openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        out.push(cur.value);
        cur.continue();
      } else res(out);
    };
  });
}

export async function searchPlacesByText(q) {
  q = (q || '').toLowerCase();
  const all = await listAllPlaces();
  if (!q) return all;
  return all.filter(place =>
    (place.name || '').toLowerCase().includes(q)
  );
}

export async function deletePlace(id) {
  const store = await tx('readwrite', PLACES_STORE);
  return new Promise((res, rej) => {
    const r = store.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* =============================
   Photos Store Functions
   ============================= */

/**
 * Save a photo blob to the photos store
 * @param {string} id - Unique photo ID (e.g., UUID)
 * @param {Blob} blob - Photo blob data
 * @param {number} itemId - ID of the item this photo belongs to
 * @returns {Promise<string>} Photo ID
 */
export async function savePhoto(id, blob, itemId) {
  const store = await tx('readwrite', PHOTOS_STORE);
  return new Promise((res, rej) => {
    const r = store.put({ id, blob, itemId, createdAt: Date.now() });
    r.onsuccess = () => res(id);
    r.onerror = () => rej(r.error);
  });
}

/**
 * Get a photo blob by ID
 * @param {string} id - Photo ID
 * @returns {Promise<Blob|null>} Photo blob or null if not found
 */
export async function getPhoto(id) {
  const store = await tx('readonly', PHOTOS_STORE);
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result ? r.result.blob : null);
    r.onerror = () => rej(r.error);
  });
}

/**
 * Get all photos for a specific item
 * @param {number} itemId - Item ID
 * @returns {Promise<Array>} Array of photo objects with id and blob
 */
export async function getPhotosByItemId(itemId) {
  const store = await tx('readonly', PHOTOS_STORE);
  return new Promise((res) => {
    const idx = store.index('by_itemId');
    const r = idx.getAll(itemId);
    r.onsuccess = () => res(r.result || []);
  });
}

/**
 * Delete a photo by ID
 * @param {string} id - Photo ID
 * @returns {Promise<void>}
 */
export async function deletePhoto(id) {
  const store = await tx('readwrite', PHOTOS_STORE);
  return new Promise((res, rej) => {
    const r = store.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/**
 * Delete all photos for a specific item
 * @param {number} itemId - Item ID
 * @returns {Promise<void>}
 */
export async function deletePhotosByItemId(itemId) {
  const photos = await getPhotosByItemId(itemId);
  const promises = photos.map(photo => deletePhoto(photo.id));
  await Promise.all(promises);
}

