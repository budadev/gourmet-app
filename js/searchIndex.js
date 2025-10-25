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
      barcode: item.barcode || '',
      type: item.type || '',
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
    barcode: item.barcode || '',
    type: item.type || '',
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
      entry.barcode.includes(q)
    ) {
      matchingIds.push(id);
    }
  }

  return matchingIds;
}

/**
 * Get the search index entry for an item
 * Useful for filtering/sorting without hitting the database
 */
export function getIndexEntry(id) {
  return searchIndex.get(id);
}

/**
 * Get all index entries (for filtering operations)
 */
export function getAllIndexEntries() {
  return Array.from(searchIndex.values());
}

/**
 * Clear the entire search index
 */
export function clearSearchIndex() {
  searchIndex.clear();
}

/**
 * Get the size of the search index
 */
export function getSearchIndexSize() {
  return searchIndex.size;
}

