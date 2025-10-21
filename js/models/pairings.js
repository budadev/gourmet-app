/* =============================
   Pairing Management (Bidirectional Linking)
   ============================= */

import { getItem, updateItem } from '../db.js';

// Add pairing bidirectionally
export async function addPairing(sourceId, targetId, type) {
  const sourceItem = await getItem(sourceId);
  const targetItem = await getItem(targetId);

  if (!sourceItem || !targetItem) return;

  // Initialize pairings if not exist
  if (!sourceItem.pairings) sourceItem.pairings = { good: [], bad: [] };
  if (!targetItem.pairings) targetItem.pairings = { good: [], bad: [] };

  // Add to source item
  if (!sourceItem.pairings[type].includes(targetId)) {
    sourceItem.pairings[type].push(targetId);
  }

  // Add reverse pairing to target item
  if (!targetItem.pairings[type].includes(sourceId)) {
    targetItem.pairings[type].push(sourceId);
  }

  // Save both items
  await updateItem(sourceId, { pairings: sourceItem.pairings });
  await updateItem(targetId, { pairings: targetItem.pairings });
}

// Remove pairing bidirectionally
export async function removePairing(sourceId, targetId, type) {
  const sourceItem = await getItem(sourceId);
  const targetItem = await getItem(targetId);

  if (!sourceItem || !targetItem) return;

  // Remove from source item
  if (sourceItem.pairings && sourceItem.pairings[type]) {
    sourceItem.pairings[type] = sourceItem.pairings[type].filter(id => id !== targetId);
    await updateItem(sourceId, { pairings: sourceItem.pairings });
  }

  // Remove from target item
  if (targetItem.pairings && targetItem.pairings[type]) {
    targetItem.pairings[type] = targetItem.pairings[type].filter(id => id !== sourceId);
    await updateItem(targetId, { pairings: targetItem.pairings });
  }
}

// Clean up pairing references when deleting an item
export async function cleanupPairingsOnDelete(itemId, pairings) {
  if (!pairings) return;

  const allPairedIds = [...(pairings.good || []), ...(pairings.bad || [])];

  for (const pairedId of allPairedIds) {
    const pairedItem = await getItem(pairedId);
    if (pairedItem && pairedItem.pairings) {
      // Remove this item's ID from both good and bad pairings
      if (pairedItem.pairings.good) {
        pairedItem.pairings.good = pairedItem.pairings.good.filter(pid => pid !== itemId);
      }
      if (pairedItem.pairings.bad) {
        pairedItem.pairings.bad = pairedItem.pairings.bad.filter(pid => pid !== itemId);
      }
      await updateItem(pairedId, { pairings: pairedItem.pairings });
    }
  }
}

