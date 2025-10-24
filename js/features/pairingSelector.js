/* =============================
   Pairing Selector Modal
   ============================= */

import { escapeHtml, el } from '../utils.js';
import { searchByText, listAll } from '../db.js';
import { openModal, closeModal } from '../components/modal.js';
import { addPairing, removePairing } from '../models/pairings.js';
import { getTypeInfo } from '../config.js';

let pairingMode = null; // 'good' or 'bad'
let pairingSourceId = null;
let currentPairings = { good: [], bad: [] };
let pairingCallback = null; // new: callback to re-render editor after selection

export function openPairingSelector(type, sourceId, pairings, onPairingAdded) {
  pairingMode = type;
  pairingSourceId = sourceId;
  currentPairings = pairings;
  pairingCallback = typeof onPairingAdded === 'function' ? onPairingAdded : null;

  const title = type === 'good' ? 'Select Good Pairing' : 'Select Bad Pairing';
  el('pairingSelectorTitle').textContent = title;
  el('pairingSearchInput').value = '';

  // Clear any previous status messages when opening
  el('pairingStatus').textContent = '';

  openModal('pairingSelectorModal');

  // Initial list render then bind click handlers
  refreshPairingList().then(() => setupPairingListClickHandlers(pairingCallback));
}

export function closePairingSelector() {
  closeModal('pairingSelectorModal');
  pairingMode = null;
  pairingSourceId = null;
  pairingCallback = null;
}

export async function refreshPairingList() {
  const query = el('pairingSearchInput').value.trim();
  const allItems = await searchByText(query);

  // Exclude current item being edited
  const availableItems = allItems.filter(item => item.id !== pairingSourceId);

  const goodSet = new Set(currentPairings.good || []);
  const badSet = new Set(currentPairings.bad || []);

  // Sort: unpaired first (keep original relative order for stability), then paired
  const indexed = availableItems.map((item, idx) => ({ item, idx }));
  indexed.sort((a, b) => {
    const aPaired = goodSet.has(a.item.id) || badSet.has(a.item.id);
    const bPaired = goodSet.has(b.item.id) || badSet.has(b.item.id);
    if (aPaired !== bPaired) return aPaired ? 1 : -1; // unpaired first
    return a.idx - b.idx; // stable fallback (explicit)
  });

  const pairingItemsList = el('pairingItemsList');

  if (indexed.length === 0) {
    pairingItemsList.innerHTML = '<div class="empty-state" style="padding:40px 20px">No items available to pair</div>';
    return;
  }

  pairingItemsList.innerHTML = indexed.map(({ item }) => {
    const typeInfo = getTypeInfo(item.type);
    const isGood = goodSet.has(item.id);
    const isBad = badSet.has(item.id);
    const isPaired = isGood || isBad;
    const pairedClass = isGood ? 'paired paired-good' : isBad ? 'paired paired-bad' : '';
    const label = isGood ? 'Good pairing' : isBad ? 'Bad pairing' : '';

    return `
      <div class="item ${pairedClass}" data-pairing-item-id="${item.id}" ${isPaired ? 'data-paired="true"' : ''}>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:16px;display:flex;align-items:center;gap:6px;${isPaired ? 'opacity:.85;' : ''}">${typeInfo.icon} <span class="truncate">${escapeHtml(item.name || 'Unnamed')}</span></div>
            <div class="muted" style="font-size:12px;margin-top:4px">${typeInfo.label}</div>
          </div>
          ${isPaired ? `<div class="pairing-chip ${isGood ? 'good' : 'bad'}">${label}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return { mode: pairingMode, sourceId: pairingSourceId };
}

export async function handlePairingSelection(targetId, onPairingAdded) {
  // Check if already paired
  if (currentPairings.good.includes(targetId) || currentPairings.bad.includes(targetId)) {
    el('pairingStatus').textContent = 'This item is already paired';
    return;
  }

  // Add to current pairings
  currentPairings[pairingMode].push(targetId);

  // If editing existing item, save immediately with bidirectional link
  if (pairingSourceId) {
    await addPairing(pairingSourceId, targetId, pairingMode);
    el('pairingStatus').textContent = `${pairingMode === 'good' ? 'Good' : 'Bad'} pairing added!`;
    setTimeout(() => {
      closePairingSelector();
      if (onPairingAdded) onPairingAdded();
    }, 500);
  } else {
    // For new items, just add to current pairings
    el('pairingStatus').textContent = 'Pairing added! Save the item to finalize.';
    setTimeout(() => {
      closePairingSelector();
      if (onPairingAdded) onPairingAdded();
    }, 500);
  }
}

export function getCurrentPairings() {
  return currentPairings;
}

export function setCurrentPairings(pairings) {
  currentPairings = pairings;
}

export function setupPairingListClickHandlers(onPairingAdded) {
  const pairingItemsList = el('pairingItemsList');
  if (!pairingItemsList) return;
  pairingItemsList.querySelectorAll('.item').forEach(itemEl => {
    itemEl.onclick = async () => {
      if (itemEl.hasAttribute('data-paired')) {
        // Provide subtle feedback instead of re-adding
        el('pairingStatus').textContent = 'Already paired';
        return;
      }
      const targetId = Number(itemEl.getAttribute('data-pairing-item-id'));
      await handlePairingSelection(targetId, onPairingAdded);
    };
  });
}
