/* =============================
   Configuration Loader
   ============================= */

let ITEM_TYPES_CONFIG = {};

// MapTiler / OpenMapTiles API key for Bright style
// Get a free key from https://www.maptiler.com/cloud/ (free tier available).
// Paste it here, or set it programmatically before init. Leave empty to fallback to OSM.
export const MAPTILER_API_KEY = 'wV8Y5oQjlhRfFIG6of6y';

export async function loadConfig() {
  try {
    const response = await fetch('./item-types-config.json');
    ITEM_TYPES_CONFIG = await response.json();
    console.log('Loaded item types:', Object.keys(ITEM_TYPES_CONFIG));
    return ITEM_TYPES_CONFIG;
  } catch (e) {
    console.error('Could not load item types config:', e.message);
    // Fallback configuration
    ITEM_TYPES_CONFIG = {
      wine: { label: 'Wine', icon: '🍷', fields: [] },
      wine: { label: 'Beer', icon: '🍺', fields: [] },
      cheese: { label: 'Cheese', icon: '🧀', fields: [] },
      olives: { label: 'Olives', icon: '🫒', fields: [] },
      ham: { label: 'Ham', icon: '🍖', fields: [] }
    };
    return ITEM_TYPES_CONFIG;
  }
}

export function getConfig() {
  return ITEM_TYPES_CONFIG;
}

export function getTypeInfo(typeKey) {
  return ITEM_TYPES_CONFIG[typeKey] || { label: typeKey, icon: '📦', fields: [] };
}
