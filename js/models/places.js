/* =============================
   Places Management
   ============================= */

import { addPlace, getPlace, searchPlacesByText, listAllPlaces as dbListAllPlaces, listAll, updatePlace as dbUpdatePlace } from '../db.js';

let currentPlaces = []; // Current places selected for an item

export function setCurrentPlaces(places) {
  currentPlaces = Array.isArray(places) ? places : [];
}

export function getCurrentPlaces() {
  return currentPlaces;
}

export function addCurrentPlace(placeId) {
  if (!currentPlaces.includes(placeId)) {
    currentPlaces.push(placeId);
  }
}

export function removeCurrentPlace(placeId) {
  currentPlaces = currentPlaces.filter(id => id !== placeId);
}


/**
 * Internal: cache for place usage counts to avoid recomputing too often.
 */
let _placeUsageCache = null; // { [placeId:number]: count }
let _placeUsageCacheTime = 0;
const PLACE_USAGE_CACHE_TTL = 5000; // ms

async function getPlaceUsageCounts(force = false) {
  const now = Date.now();
  if (!force && _placeUsageCache && (now - _placeUsageCacheTime) < PLACE_USAGE_CACHE_TTL) {
    return _placeUsageCache;
  }
  const items = await listAll();
  const counts = {};
  for (const item of items) {
    if (item && Array.isArray(item.places)) {
      for (const pid of item.places) {
        counts[pid] = (counts[pid] || 0) + 1;
      }
    }
  }
  _placeUsageCache = counts;
  _placeUsageCacheTime = now;
  return counts;
}

function sortPlacesByUsage(places, usageCounts) {
  return [...places].sort((a, b) => {
    const ua = usageCounts[a.id] || 0;
    const ub = usageCounts[b.id] || 0;
    if (ub !== ua) return ub - ua; // Descending usage
    // Tie-break alphabetically (case-insensitive)
    const an = (a.name || '').toLowerCase();
    const bn = (b.name || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });
}

/**
 * Explicit cache invalidation (e.g., after adding/updating an item)
 */
export function invalidatePlaceUsageCache() {
  _placeUsageCache = null;
  _placeUsageCacheTime = 0;
}

/**
 * Get user's current location
 * Returns { lat, lng } or null if unavailable
 */
async function getCurrentLocation() {
  if (!navigator || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let handled = false;
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!handled) {
            handled = true;
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          }
        },
        (error) => {
          if (!handled) {
            handled = true;
            resolve(null);
          }
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } catch (e) {
      if (!handled) {
        handled = true;
        resolve(null);
      }
    }

    // Fallback timeout
    setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve(null);
      }
    }, 5200);
  });
}

/**
 * Check if auto-add location setting is enabled
 */
function shouldAutoAddLocation() {
  try {
    const value = localStorage.getItem('placesDefaultLocation');
    const enabled = value === 'true';
    return enabled;
  } catch (e) {
    return false;
  }
}

/**
 * Get or create a place by name
 * If the place exists, return its ID
 * If not, create it and return the new ID
 * If auto-add location is enabled, add current location to new places (async)
 * Returns { placeId, loadingLocation: boolean }
 */
export async function getOrCreatePlace(placeName) {
  if (!placeName || !placeName.trim()) return null;

  const trimmedName = placeName.trim();

  // Search for existing place
  const existingPlaces = await searchPlacesByText(trimmedName);
  const exactMatch = existingPlaces.find(
    p => p.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (exactMatch) {
    return { placeId: exactMatch.id, loadingLocation: false };
  }

  // Create new place
  const placeData = { name: trimmedName };

  // Check if we should auto-add current location
  const autoAddEnabled = shouldAutoAddLocation();

  const newPlaceId = await addPlace(placeData);
  invalidatePlaceUsageCache();

  // If auto-add is enabled, fetch location asynchronously and update the place
  if (autoAddEnabled) {

    // Fetch location in the background and update the place
    getCurrentLocation().then(async (location) => {
      if (location) {
        await updatePlace(newPlaceId, { coordinates: location });

        // Dispatch event so UI can update
        window.dispatchEvent(new CustomEvent('place-location-updated', {
          detail: { placeId: newPlaceId, coordinates: location }
        }));
      } else {
        // Dispatch event so UI can remove loading state
        window.dispatchEvent(new CustomEvent('place-location-failed', {
          detail: { placeId: newPlaceId }
        }));
      }
    }).catch(error => {
      window.dispatchEvent(new CustomEvent('place-location-failed', {
        detail: { placeId: newPlaceId }
      }));
    });

    return { placeId: newPlaceId, loadingLocation: true };
  }

  return { placeId: newPlaceId, loadingLocation: false };
}

/**
 * Search places by text query (sorted by usage desc, then name)
 */
export async function searchPlaces(query) {
  const places = await searchPlacesByText(query);
  const usageCounts = await getPlaceUsageCounts();
  return sortPlacesByUsage(places, usageCounts);
}

/**
 * Get all places (sorted by usage desc, then name)
 */
export async function getAllPlaces() {
  const places = await dbListAllPlaces();
  const usageCounts = await getPlaceUsageCounts();
  return sortPlacesByUsage(places, usageCounts);
}

/**
 * Get place details by ID
 */
export async function getPlaceById(id) {
  return await getPlace(id);
}

// New: expose a wrapper to update a place and invalidate caches
export async function updatePlace(id, patch) {
  const res = await dbUpdatePlace(id, patch);
  invalidatePlaceUsageCache();
  return res;
}

// Provide explicit export for usage counts if needed elsewhere (not used now)
export async function getPlacesUsageMap() {
  return await getPlaceUsageCounts();
}

export { dbListAllPlaces as listAllPlaces };
