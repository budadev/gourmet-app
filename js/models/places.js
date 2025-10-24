/* =============================
   Places Management
   ============================= */

import { addPlace, getPlace, searchPlacesByText, listAllPlaces } from '../db.js';

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
 * Get or create a place by name
 * If the place exists, return its ID
 * If not, create it and return the new ID
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
    return exactMatch.id;
  }

  // Create new place
  const newPlaceId = await addPlace({ name: trimmedName });
  return newPlaceId;
}

/**
 * Search places by text query
 */
export async function searchPlaces(query) {
  return await searchPlacesByText(query);
}

/**
 * Get all places
 */
export async function getAllPlaces() {
  return await listAllPlaces();
}

/**
 * Get place details by ID
 */
export async function getPlaceById(id) {
  return await getPlace(id);
}

