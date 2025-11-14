/* =============================
   Lightweight Search Index
   Purpose: In-memory text index for fast searching without reading entire DB on each keystroke
   ============================= */

import { listAll } from './db.js';

// In-memory search index: Map of id -> searchable fields
let searchIndex = new Map();

/**
 * Build the search index from all items in the database
 * Call this once on app initialization
 */
export async function buildSearchIndex() {
  const items = await listAll();
  searchIndex.clear();

  for (const item of items) {
    const indexEntry = {
      id: item.id,
      name_lc: (item.name || '').toLowerCase(),
      notes_lc: (item.notes || '').toLowerCase(),
      barcodes: item.barcodes || [],
      type: item.type || '',
      sub_type_lc: (item.sub_type || '').toLowerCase(),
      place: item.place || '',
      rating: item.rating || 0,
      // Keep a reference to commonly accessed fields for sorting/filtering
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
    searchIndex.set(item.id, indexEntry);
  }

  console.log(`Search index built with ${searchIndex.size} items`);
  return searchIndex.size;
}

/**
 * Add or update an item in the search index
 * Call this when an item is added or updated
 */
export function updateSearchIndex(item) {
  const indexEntry = {
    id: item.id,
    name_lc: (item.name || '').toLowerCase(),
    notes_lc: (item.notes || '').toLowerCase(),
    barcodes: item.barcodes || [],
    type: item.type || '',
    sub_type_lc: (item.sub_type || '').toLowerCase(),
    place: item.place || '',
    rating: item.rating || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
  searchIndex.set(item.id, indexEntry);
}

/**
 * Remove an item from the search index
 * Call this when an item is deleted
 */
export function removeFromSearchIndex(id) {
  searchIndex.delete(id);
}

/**
 * Search the index for items matching the query
 * Returns array of item IDs that match
 */
export function searchIndex_fast(query) {
  if (!query || query.trim() === '') {
    // Return all IDs if no query
    return Array.from(searchIndex.keys());
  }

  const q = query.toLowerCase().trim();
  const matchingIds = [];

  for (const [id, entry] of searchIndex) {
    if (
      entry.name_lc.includes(q) ||
      entry.notes_lc.includes(q) ||
      entry.barcodes.some(barcode => barcode.includes(q)) ||
      entry.sub_type_lc.includes(q)
    ) {
      matchingIds.push(id);
    }
  }

  return matchingIds;
}
