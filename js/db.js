/* =============================
   IndexedDB Wrapper
   ============================= */

const DB_NAME = 'gourmetapp-db';
const STORE = 'items';
const PLACES_STORE = 'places';

let dbp = null;
let dbInitialized = false;

function initDb() {
  if (dbp) return dbp;

  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
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
    const r = store.add({ ...item, createdAt: Date.now(), updatedAt: Date.now() });
    r.onsuccess = () => res(r.result);
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
      const put = store.put({ ...cur, ...patch, updatedAt: Date.now() });
      put.onsuccess = () => res(put.result);
      put.onerror = () => rej(put.error);
    };
    get.onerror = () => rej(get.error);
  });
}

export async function deleteItem(id) {
  const store = await tx('readwrite');
  return new Promise((res, rej) => {
    const r = store.delete(id);
    r.onsuccess = () => res();
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
