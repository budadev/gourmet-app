/* =============================
   Item Types Model
   ============================= */

import {
  addItemType,
  getItemType,
  listAllItemTypes,
  updateItemType,
  deleteItemType
} from '../db.js';

let itemTypesCache = null;

/**
 * Generate a key from a display name
 * @param {string} displayName - The display name (e.g., "Fine Wine")
 * @returns {string} - The generated key (e.g., "fine_wine")
 */
export function generateKey(displayName) {
  return displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Initialize item types from JSON config (called on first app load)
 */
export async function seedItemTypesFromConfig() {
  try {
    // Check if we already have item types in the DB
    const existingTypes = await listAllItemTypes();
    if (existingTypes && existingTypes.length > 0) {
      console.log('Item types already seeded, skipping');
      return;
    }

    // Load the default config from JSON
    const response = await fetch('./item-types-config.json');
    const config = await response.json();

    // Add each type to the database
    const promises = Object.entries(config).map(([key, value]) => {
      return addItemType({
        key,
        label: value.label,
        icon: value.icon,
        fields: value.fields || [],
        rank: value.rank || 999
      });
    });

    await Promise.all(promises);
    console.log('Successfully seeded item types from config');

    // Invalidate cache
    itemTypesCache = null;
  } catch (e) {
    console.error('Failed to seed item types:', e);
  }
}

/**
 * Get all item types from DB (with caching)
 */
export async function getAllItemTypes() {
  if (itemTypesCache) {
    return itemTypesCache;
  }

  const types = await listAllItemTypes();

  // Sort by rank
  types.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // Convert to config format for compatibility
  const config = {};
  types.forEach(type => {
    config[type.key] = {
      label: type.label,
      icon: type.icon,
      fields: type.fields || [],
      rank: type.rank || 999
    };
  });

  itemTypesCache = config;
  return config;
}

/**
 * Get a single item type by key
 */
export async function getItemTypeByKey(key) {
  const type = await getItemType(key);
  if (!type) return null;

  return {
    label: type.label,
    icon: type.icon,
    fields: type.fields || []
  };
}

/**
 * Create a new item type
 */
export async function createItemType(key, label, icon, fields = []) {
  await addItemType({
    key,
    label,
    icon,
    fields
  });

  // Invalidate cache
  itemTypesCache = null;

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('itemtype-created', { detail: { key } }));
}

/**
 * Update an existing item type
 */
export async function updateItemTypeData(key, updates) {
  await updateItemType(key, updates);

  // Invalidate cache
  itemTypesCache = null;

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('itemtype-updated', { detail: { key } }));
}

/**
 * Delete an item type
 */
export async function deleteItemTypeData(key) {
  await deleteItemType(key);

  // Invalidate cache
  itemTypesCache = null;

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('itemtype-deleted', { detail: { key } }));
}

/**
 * Invalidate the cache (useful after updates)
 */
export function invalidateItemTypesCache() {
  itemTypesCache = null;
}

/**
 * Update ranks for multiple item types (for drag & drop reordering)
 */
export async function updateItemTypeRanks(rankedKeys) {
  const promises = rankedKeys.map((key, index) => {
    return updateItemType(key, { rank: index + 1 });
  });

  await Promise.all(promises);

  // Invalidate cache
  itemTypesCache = null;

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('itemtype-reordered'));
}

