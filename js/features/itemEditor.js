/* =============================
   Item Editor Modal (Add/Edit)
   ============================= */

import { escapeHtml, el, enhanceSelectInteractivity } from '../utils.js';
import { addItem, updateItem, listAll } from '../db.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderStars, setupStarRating } from '../components/rating.js';
import { capturePhoto, selectPhoto, renderPhotoPreview, setPhotos, getPhotos, clearPhotos } from '../components/photos.js';
import { getConfig, getTypeInfo } from '../config.js';
import { addPairing, removePairing } from '../models/pairings.js';
import { openPairingSelector, setCurrentPairings, getCurrentPairings } from './pairingSelector.js';
import { startScanForInput } from './scanner.js';

let currentEditingId = null;
let starRatingController = null;

export function openEditor(item = null, onSave) {
  const config = getConfig();

  if (item) {
    el('editorTitle').textContent = 'Edit Item';
    currentEditingId = item.id;
    const itemPairings = item.pairings ? { good: [...item.pairings.good], bad: [...item.pairings.bad] } : { good: [], bad: [] };
    setCurrentPairings(itemPairings);
    renderEditorFields(item.type || Object.keys(config)[0], item);
  } else {
    el('editorTitle').textContent = 'Add Item';
    currentEditingId = null;
    setCurrentPairings({ good: [], bad: [] });
    renderEditorFields(Object.keys(config)[0], {});
  }

  openModal('editorModal');
  enhanceSelectInteractivity(el('editorModal'));
  // Reinforce save binding in case initial binding was lost
  const saveBtn = el('saveBtn');
  if (saveBtn) { saveBtn.onclick = saveItem; }
  setStatus('');

  // Initialize pairings section after a brief delay
  setTimeout(() => renderPairingsInEditor(), 100);

  // Store the onSave callback
  window.__editorOnSave = onSave;
}

export function closeEditor() {
  closeModal('editorModal');
  currentEditingId = null;
  starRatingController = null;
  clearPhotos();
  setCurrentPairings({ good: [], bad: [] });
  window.__editorOnSave = null;
}

function renderEditorFields(selectedType, itemData = {}) {
  const editorFields = el('editorFields');
  const config = getConfig();

  let html = '<div class="grid">';

  // Type selector
  html += '<div class="field-group"><label>Type *</label><select id="typeSelect">';
  Object.keys(config).forEach(key => {
    const cfg = config[key];
    html += `<option value="${key}" ${key === selectedType ? 'selected' : ''}>${cfg.icon} ${cfg.label}</option>`;
  });
  html += '</select></div>';

  // Name (always)
  html += `<div class="field-group"><label>Name *</label><input id="nameInput" placeholder="e.g., Cabernet Sauvignon" value="${escapeHtml(itemData.name || '')}"/></div>`;

  // Barcode (always) with scan button
  html += `<div class="field-group"><label>Barcode (optional)</label>
    <div class="input-with-barcode">
      <input id="barcodeInput" placeholder="e.g., 5991234567890" value="${escapeHtml(itemData.barcode || '')}"/>
      <button class="barcode-btn" id="barcodeInputScanBtn" type="button" title="Scan barcode">
        <img src="icons/barcode.png" alt="Scan barcode" />
      </button>
    </div>
  </div>`;

  // Rating (always) - full width
  html += `<div class="field-group" style="grid-column:1/-1"><label>Rating *</label><div id="ratingContainer">${renderStars(Number(itemData.rating) || 0, true)}</div></div>`;

  // Dynamic fields container (will be populated separately)
  html += `<div id="dynamicFieldsContainer" style="grid-column:1/-1"></div>`;

  // Notes (always) - full width
  html += `<div class="field-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notesInput" rows="4" placeholder="Tasting notes, where you had it, etc.">${escapeHtml(itemData.notes || '')}</textarea></div>`;

  // Photos (optional) - full width
  html += `<div class="field-group" style="grid-column:1/-1">
    <label>Photos (optional)</label>
    <div id="photoPreviewContainer" class="photo-preview-grid"></div>
    <div class="photo-upload-buttons">
      <button class="btn primary" id="capturePhotoBtn" type="button">📷 Take Photo</button>
      <button class="btn" id="selectPhotoBtn" type="button">🖼️ Choose Photo</button>
    </div>
  </div>`;

  // Pairings section - full width
  html += `<div id="pairingsEditorContainer" style="grid-column:1/-1"></div>`;

  html += '</div>';

  editorFields.innerHTML = html;

  // Populate dynamic fields
  updateDynamicFields(selectedType, itemData);

  // Apply iOS select interaction enhancement after DOM insertion
  enhanceSelectInteractivity(editorFields);

  // Setup star rating
  const ratingContainer = el('ratingContainer');
  starRatingController = setupStarRating(ratingContainer, Number(itemData.rating) || 0);

  // Setup barcode input scan button
  const barcodeInputScanBtn = el('barcodeInputScanBtn');
  if (barcodeInputScanBtn) {
    barcodeInputScanBtn.onclick = () => {
      startScanForInput(async (code) => {
        const barcodeInput = el('barcodeInput');
        if (barcodeInput) {
          barcodeInput.value = code;
        }
      });
    };
  }

  // Handle type change - update only dynamic fields instead of full re-render
  const typeSelect = el('typeSelect');
  typeSelect.onchange = (e) => {
    const newType = e.target.value;
    setTimeout(() => {
      const baseData = collectFormData();
      updateDynamicFields(newType, baseData);
    }, 120);
  };

  // Setup photo capture and selection
  el('capturePhotoBtn').onclick = async () => {
    const dataURL = await capturePhoto();
    if (dataURL) {
      setPhotos([...getPhotos(), dataURL]);
      renderPhotoPreview();
    }
  };

  el('selectPhotoBtn').onclick = async () => {
    const dataURL = await selectPhoto();
    if (dataURL) {
      setPhotos([...getPhotos(), dataURL]);
      renderPhotoPreview();
    }
  };

  // Initial render of photos
  if (itemData.photos && Array.isArray(itemData.photos)) {
    setPhotos(itemData.photos);
    renderPhotoPreview();
  }
}

// Update only dynamic fields section to avoid full form rebuild
function updateDynamicFields(selectedType, itemData = {}) {
  const container = document.getElementById('dynamicFieldsContainer');
  if (!container) return;
  const typeInfo = getTypeInfo(selectedType);
  let html = '<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">';
  typeInfo.fields.forEach(field => {
    html += '<div class="field-group">';
    html += `<label>${escapeHtml(field.label)}</label>`;
    if (field.type === 'enum') {
      html += `<select id="field_${field.name}">`;
      html += '<option value="">-- Select --</option>';
      field.options.forEach(opt => {
        const selected = itemData[field.name] === opt ? 'selected' : '';
        html += `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
      });
      html += '</select>';
    } else if (field.type === 'number') {
      html += `<input type="number" id="field_${field.name}" value="${itemData[field.name] || ''}" placeholder="e.g., 2015"/>`;
    } else {
      html += `<input type="text" id="field_${field.name}" value="${escapeHtml(itemData[field.name] || '')}" placeholder="Enter ${field.label.toLowerCase()}"/>`;
    }
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  enhanceSelectInteractivity(container);
}

function collectFormData() {
  const config = getConfig();
  const selectedType = el('typeSelect')?.value || Object.keys(config)[0];
  const typeInfo = getTypeInfo(selectedType);
  const data = {
    type: selectedType,
    name: el('nameInput')?.value?.trim() || '',
    barcode: el('barcodeInput')?.value?.trim() || '',
    rating: starRatingController?.getValue() || 0,
    notes: el('notesInput')?.value?.trim() || ''
  };
  typeInfo.fields.forEach(field => {
    const fieldEl = el(`field_${field.name}`);
    if (fieldEl && fieldEl.value) {
      data[field.name] = field.type === 'number' ? Number(fieldEl.value) : fieldEl.value;
    }
  });
  data.photos = getPhotos();
  data.pairings = getCurrentPairings();
  return data;
}

export async function saveItem() {
  const payload = collectFormData();
  if (!payload.name) {
    setStatus('Please enter a name.');
    return false;
  }

  try {
    if (currentEditingId) {
      await updateItem(currentEditingId, payload);
      setStatus('Item updated!');
    } else {
      const newItemId = await addItem(payload);
      if (payload.pairings && (payload.pairings.good.length > 0 || payload.pairings.bad.length > 0)) {
        for (const targetId of payload.pairings.good) await addPairing(newItemId, targetId, 'good');
        for (const targetId of payload.pairings.bad) await addPairing(newItemId, targetId, 'bad');
      }
      // Clear any active search so the newly added item is visible immediately
      const searchInput = el('searchInput');
      if (searchInput) searchInput.value = '';
      setStatus('Item added!');
    }
    // Immediately refresh list (via callback) and close editor without delay
    if (window.__editorOnSave) window.__editorOnSave();
    closeEditor();
    return true;
  } catch (e) {
    setStatus('Error: ' + e.message);
    return false;
  }
}

async function renderPairingsInEditor() {
  const container = document.getElementById('pairingsEditorContainer');
  if (!container) return;

  const allItems = await listAll();
  const currentPairings = getCurrentPairings();

  let html = '<div class="pairings-section">';

  // Good pairings
  html += '<div class="pairing-category">';
  html += '<h3>✅ Pairs well with...</h3>';

  if (currentPairings.good.length === 0) {
    html += '<div class="empty-pairings">No pairings yet</div>';
  } else {
    html += '<div class="pairing-list">';
    for (const pairedId of currentPairings.good) {
      const pairedItem = allItems.find(it => it.id === pairedId);
      if (pairedItem) {
        const typeInfo = getTypeInfo(pairedItem.type);
        html += `
          <div class="pairing-item good">
            <div class="pairing-item-name">
              <span>${typeInfo.icon}</span>
              <span>${escapeHtml(pairedItem.name)}</span>
            </div>
            <button class="pairing-item-remove" data-pairing-id="${pairedId}" data-pairing-type="good" type="button">×</button>
          </div>
        `;
      }
    }
    html += '</div>';
  }
  html += '<button class="add-pairing-btn" id="addGoodPairingBtn" type="button">+ Add Pairing</button>';
  html += '</div>';

  // Bad pairings
  html += '<div class="pairing-category">';
  html += '<h3>❌ Not a good match for...</h3>';

  if (currentPairings.bad.length === 0) {
    html += '<div class="empty-pairings">No pairings yet</div>';
  } else {
    html += '<div class="pairing-list">';
    for (const pairedId of currentPairings.bad) {
      const pairedItem = allItems.find(it => it.id === pairedId);
      if (pairedItem) {
        const typeInfo = getTypeInfo(pairedItem.type);
        html += `
          <div class="pairing-item bad">
            <div class="pairing-item-name">
              <span>${typeInfo.icon}</span>
              <span>${escapeHtml(pairedItem.name)}</span>
            </div>
            <button class="pairing-item-remove" data-pairing-id="${pairedId}" data-pairing-type="bad" type="button">×</button>
          </div>
        `;
      }
    }
    html += '</div>';
  }
  html += '<button class="add-pairing-btn" id="addBadPairingBtn" type="button">+ Add Pairing</button>';
  html += '</div>';

  html += '</div>';

  container.innerHTML = html;

  // Bind add buttons
  const addGoodBtn = document.getElementById('addGoodPairingBtn');
  if (addGoodBtn) {
    addGoodBtn.onclick = () => {
      openPairingSelector('good', currentEditingId, getCurrentPairings(), renderPairingsInEditor);
    };
  }

  const addBadBtn = document.getElementById('addBadPairingBtn');
  if (addBadBtn) {
    addBadBtn.onclick = () => {
      openPairingSelector('bad', currentEditingId, getCurrentPairings(), renderPairingsInEditor);
    };
  }

  // Bind remove buttons
  container.querySelectorAll('.pairing-item-remove').forEach(btn => {
    btn.onclick = async () => {
      const pairedId = Number(btn.getAttribute('data-pairing-id'));
      const type = btn.getAttribute('data-pairing-type');

      const updatedPairings = getCurrentPairings();
      updatedPairings[type] = updatedPairings[type].filter(id => id !== pairedId);
      setCurrentPairings(updatedPairings);

      // If editing existing item, remove bidirectionally
      if (currentEditingId) {
        await removePairing(currentEditingId, pairedId, type);
      }

      await renderPairingsInEditor();
    };
  });
}

export function setStatus(msg) {
  el('status').textContent = msg;
}

export { renderPairingsInEditor };
