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

  const pairingItemsList = el('pairingItemsList');

  if (availableItems.length === 0) {
    pairingItemsList.innerHTML = '<div class="empty-state" style="padding:40px 20px">No items available to pair</div>';
    return;
  }

  pairingItemsList.innerHTML = availableItems.map(item => {
    const typeInfo = getTypeInfo(item.type);
    const isAlreadyPaired = currentPairings.good.includes(item.id) || currentPairings.bad.includes(item.id);

    return `
      <div class="item ${isAlreadyPaired ? 'selected' : ''}" data-pairing-item-id="${item.id}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="flex:1">
            <div style="font-weight:700;font-size:16px">${typeInfo.icon} ${escapeHtml(item.name || 'Unnamed')}</div>
            <div class="muted" style="font-size:12px;margin-top:4px">${typeInfo.label}</div>
          </div>
          ${isAlreadyPaired ? '<div class="badge">Already paired</div>' : ''}
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
      const targetId = Number(itemEl.getAttribute('data-pairing-item-id'));
      await handlePairingSelection(targetId, onPairingAdded);
    };
  });
}
