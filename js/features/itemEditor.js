/* =============================
   Item Editor Modal (Add/Edit)
   ============================= */

import { escapeHtml, el, enhanceSelectInteractivity } from '../utils.js';
import { addItem, updateItem, listAll, savePhoto, deletePhoto } from '../db.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderStars, setupStarRating } from '../components/rating.js';
import { capturePhoto, selectPhoto, renderPhotoPreview, setPhotos, getPhotos, clearPhotos, processPhotoForEditing } from '../components/photos.js';
import { getConfig, getTypeInfo } from '../config.js';
import { addPairing, removePairing } from '../models/pairings.js';
import { openPairingSelector, setCurrentPairings, getCurrentPairings } from './pairingSelector.js';
import { startScanForInput } from './scanner.js';
import { renderPlaceSelector } from '../components/placeEditor.js';
import { setCurrentPlaces, getCurrentPlaces, invalidatePlaceUsageCache } from '../models/places.js';

let currentEditingId = null;
let starRatingController = null;
let focusListenersCleanup = null;
let visualViewportListener = null;
let currentBarcodes = []; // Track barcodes being edited

export async function openEditor(item = null, onSave) {
  const config = getConfig();

  if (item) {
    el('editorTitle').textContent = 'Edit Item';
    currentEditingId = item.id;
    const itemPairings = item.pairings ? { good: [...item.pairings.good], bad: [...item.pairings.bad] } : { good: [], bad: [] };
    setCurrentPairings(itemPairings);
    const itemPlaces = item.places ? [...item.places] : [];
    setCurrentPlaces(itemPlaces);
    currentBarcodes = item.barcodes ? [...item.barcodes] : (item.barcode ? [item.barcode] : []);
    await renderEditorFields(item.type || Object.keys(config)[0], item);
  } else {
    el('editorTitle').textContent = 'Add Item';
    currentEditingId = null;
    setCurrentPairings({ good: [], bad: [] });
    setCurrentPlaces([]);
    currentBarcodes = [];
    await renderEditorFields(Object.keys(config)[0], {});
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
  setCurrentPlaces([]);
  currentBarcodes = [];
  window.__editorOnSave = null;

  // Cleanup focus listeners
  if (focusListenersCleanup) {
    focusListenersCleanup();
    focusListenersCleanup = null;
  }

  // Cleanup visualViewport listener
  if (visualViewportListener && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', visualViewportListener);
    visualViewportListener = null;
  }

  // Clear global scroll function
  window.__scrollEditorFieldIntoView = null;
}

async function renderEditorFields(selectedType, itemData = {}) {
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

  // Sub-type container (will be populated separately)
  html += '<div id="subTypeFieldContainer"></div>';

  // Name (always)
  html += `<div class="field-group"><label>Name *</label><input id="nameInput" placeholder="e.g., Cabernet Sauvignon" value="${escapeHtml(itemData.name || '')}"/></div>`;

  // Rating (always) - full width
  html += `<div class="field-group" style="grid-column:1/-1"><label>Rating *</label><div id="ratingContainer">${renderStars(Number(itemData.rating) || 0, true)}</div></div>`;

  // Barcode section (always) - similar to places UI
  html += `<div class="field-group" style="grid-column:1/-1">
    <label>Barcodes (optional)</label>
    <div class="barcode-input-wrapper">
      <input type="text" id="barcodeInput" class="barcode-input" placeholder="Enter or scan a barcode..." autocomplete="off" />
      <button class="place-add-btn hidden" id="barcodeAddBtn" type="button" title="Add barcode">+</button>
      <button class="barcode-btn" id="barcodeInputScanBtn" type="button" title="Scan barcode">
        <img src="icons/barcode.png" alt="Scan barcode" />
      </button>
    </div>
    <div class="selected-barcodes" id="selectedBarcodes"></div>
  </div>`;

  // Notes (always) - full width
  html += `<div class="field-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notesInput" rows="4" placeholder="Tasting notes, where you had it, etc.">${escapeHtml(itemData.notes || '')}</textarea></div>`;

  // Dynamic fields container (will be populated separately)
  html += '<div id="dynamicFieldsContainer" style="grid-column:1/-1"></div>';

  // Photos (optional) - full width
  html += `<div class="field-group" style="grid-column:1/-1">
    <label>Photos (optional)</label>
    <div id="photoPreviewContainer" class="photo-preview-grid"></div>
    <div class="photo-upload-buttons">
      <button class="btn primary" id="capturePhotoBtn" type="button">📷 Take Photo</button>
      <button class="btn" id="selectPhotoBtn" type="button">🖼️ Choose Photo</button>
    </div>
  </div>`;

  // Places section - full width
  html += '<div id="placesEditorContainer" style="grid-column:1/-1"></div>';

  // Pairings section - full width
  html += '<div id="pairingsEditorContainer" style="grid-column:1/-1"></div>';

  html += '</div>';

  editorFields.innerHTML = html;

  // Populate dynamic fields
  updateDynamicFields(selectedType, itemData);

  // Apply iOS select interaction enhancement after DOM insertion
  enhanceSelectInteractivity(editorFields);

  // Setup star rating
  const ratingContainer = el('ratingContainer');
  starRatingController = setupStarRating(ratingContainer, Number(itemData.rating) || 0);

  // Render initial barcode list
  renderBarcodeList();

  // Setup barcode input handlers
  setupBarcodeInputHandlers();

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
      const photoId = await processPhotoForEditing(dataURL, currentEditingId);
      setPhotos([...getPhotos(), photoId]);
      await renderPhotoPreview();
    }
  };

  el('selectPhotoBtn').onclick = async () => {
    const dataURL = await selectPhoto();
    if (dataURL) {
      const photoId = await processPhotoForEditing(dataURL, currentEditingId);
      setPhotos([...getPhotos(), photoId]);
      await renderPhotoPreview();
    }
  };

  // Initial render of photos
  if (itemData.photos && Array.isArray(itemData.photos)) {
    setPhotos(itemData.photos);
    await renderPhotoPreview();
  }

  // Render places selector
  const placesContainer = el('placesEditorContainer');
  if (placesContainer) {
    renderPlaceSelector(placesContainer, itemData.places || []);
  }

  // Setup iOS-friendly focus handling for all inputs and textareas
  setupInputFocusHandling();
}

/**
 * Setup focus handlers for all inputs to ensure they stay visible on iOS
 */
function setupInputFocusHandling() {
  const editorModal = el('editorModal');
  if (!editorModal) return;
  const scrollContainer = editorModal.querySelector('.modal-content');
  const header = editorModal.querySelector('.modal-header');
  if (!scrollContainer || !header) return;

  // Clean up existing listeners before setting up new ones
  if (focusListenersCleanup) {
    focusListenersCleanup();
    focusListenersCleanup = null;
  }

  if (visualViewportListener && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', visualViewportListener);
    visualViewportListener = null;
  }

  function ensureVisible(input){
    if (!input) return;
    // Second pass after keyboard settle
    const attempt = () => {
      const headerRect = header.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();

      const topGap = 8; // space below header
      const bottomGap = 56; // breathing space above keyboard area

      // If input sits above header bottom + gap
      if (inputRect.top < headerRect.bottom + topGap) {
        const delta = (headerRect.bottom + topGap) - inputRect.top;
        scrollContainer.scrollTop -= delta;
      }
      // If input bottom is below container bottom - bottomGap
      else if (inputRect.bottom > containerRect.bottom - bottomGap) {
        const delta = inputRect.bottom - (containerRect.bottom - bottomGap);
        scrollContainer.scrollTop += delta;
      }
    };
    attempt();
    setTimeout(attempt, 300); // re-adjust after potential visualViewport resize
  }

  window.__scrollEditorFieldIntoView = ensureVisible;

  // Store focus handlers for cleanup
  const focusHandlers = new Map();
  const inputs = editorModal.querySelectorAll('input[type="text"], input[type="number"], textarea');

  inputs.forEach(inp => {
    const handler = () => ensureVisible(inp);
    focusHandlers.set(inp, handler);
    inp.addEventListener('focus', handler);
  });

  // Setup visualViewport listener only once
  if (window.visualViewport && !visualViewportListener){
    visualViewportListener = () => {
      const active = document.activeElement;
      if (active && editorModal.contains(active) && /INPUT|TEXTAREA/.test(active.tagName)) {
        ensureVisible(active);
      }
    };
    window.visualViewport.addEventListener('resize', visualViewportListener);
  }

  // Return cleanup function
  focusListenersCleanup = () => {
    focusHandlers.forEach((handler, inp) => {
      inp.removeEventListener('focus', handler);
    });
    focusHandlers.clear();
  };
}

/**
 * Update only dynamic fields section to avoid full form rebuild
 */
function updateDynamicFields(selectedType, itemData = {}) {
  const typeInfo = getTypeInfo(selectedType);

  // Update sub-type field container
  const subTypeContainer = document.getElementById('subTypeFieldContainer');
  if (subTypeContainer) {
    if (typeInfo.subTypeEnabled && typeInfo.subTypeOptions && typeInfo.subTypeOptions.length > 0) {
      let subTypeHtml = '<div class="field-group">';
      subTypeHtml += `<label>Sub-type</label>`;
      subTypeHtml += `<select id="field_sub_type">`;
      subTypeHtml += '<option value="">-- Select --</option>';
      typeInfo.subTypeOptions.forEach(opt => {
        const selected = itemData.sub_type === opt ? 'selected' : '';
        subTypeHtml += `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
      });
      subTypeHtml += '</select>';
      subTypeHtml += '</div>';
      subTypeContainer.innerHTML = subTypeHtml;
      enhanceSelectInteractivity(subTypeContainer);
    } else {
      subTypeContainer.innerHTML = '';
    }
  }

  // Update dynamic fields container (other custom fields)
  const container = document.getElementById('dynamicFieldsContainer');
  if (!container) return;

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
      html += `<input type="number" id="field_${field.name}" value="${itemData[field.name] || ''}" placeholder="Enter a number"/>`;
    } else {
      html += `<input type="text" id="field_${field.name}" value="${escapeHtml(itemData[field.name] || '')}" placeholder="Enter ${field.label.toLowerCase()}"/>`;
    }
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  enhanceSelectInteractivity(container);

  // Re-setup focus handling for dynamically added inputs
  setupInputFocusHandling();
}

/**
 * Render the list of barcodes
 */
function renderBarcodeList() {
  const container = el('selectedBarcodes');
  if (!container) return;

  if (!currentBarcodes || currentBarcodes.length === 0) {
    container.innerHTML = '<div class="empty-places">No barcodes added yet</div>';
    return;
  }

  let html = '<div class="place-list">';
  currentBarcodes.forEach((barcode, index) => {
    html += `<div class="place-tag" data-barcode-index="${index}">`;
    html += '<span class="place-tag-icon">🏷️</span>';
    html += `<span class="place-tag-name">${escapeHtml(barcode)}</span>`;
    html += `<button class="place-tag-remove" data-barcode-index="${index}" type="button">×</button>`;
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;

  // Add remove handlers
  container.querySelectorAll('.place-tag-remove').forEach(btn => {
    btn.onclick = () => {
      const index = Number(btn.getAttribute('data-barcode-index'));
      currentBarcodes.splice(index, 1);
      renderBarcodeList();
      // Trigger input event to update add button visibility
      const barcodeInput = el('barcodeInput');
      if (barcodeInput) {
        barcodeInput.dispatchEvent(new Event('input'));
      }
    };
  });
}

/**
 * Setup barcode input handlers (add button, scan button, input events)
 */
function setupBarcodeInputHandlers() {
  const barcodeInput = el('barcodeInput');
  const barcodeAddBtn = el('barcodeAddBtn');
  const barcodeInputScanBtn = el('barcodeInputScanBtn');

  if (!barcodeInput || !barcodeAddBtn || !barcodeInputScanBtn) return;

  // Show/hide add button based on input value
  const updateBarcodeAddButton = () => {
    const value = barcodeInput.value.trim();
    if (value && !currentBarcodes.includes(value)) {
      barcodeAddBtn.classList.remove('hidden');
    } else {
      barcodeAddBtn.classList.add('hidden');
    }
  };

  // Add barcode from input
  const addBarcodeFromInput = async () => {
    const value = barcodeInput.value.trim();
    if (!value) return;

    if (currentBarcodes.includes(value)) {
      alert('This barcode is already added.');
      return;
    }

    // Check if barcode exists in other items
    const { findByBarcode } = await import('../db.js');
    const existingItems = await findByBarcode(value);
    const duplicates = existingItems ? existingItems.filter(item => item.id !== currentEditingId) : [];

    if (duplicates.length > 0) {
      const itemNames = duplicates.map(item => `"${item.name}"`).join(', ');
      const message = duplicates.length === 1
        ? `This barcode already exists for ${itemNames}. Are you sure you want to add it?`
        : `This barcode already exists for ${duplicates.length} items: ${itemNames}. Are you sure you want to add it?`;
      if (!confirm(message)) {
        return;
      }
    }

    currentBarcodes.push(value);
    barcodeInput.value = '';
    renderBarcodeList();
    updateBarcodeAddButton();
  };

  // Input event to show/hide add button
  barcodeInput.oninput = updateBarcodeAddButton;

  // Add button click
  barcodeAddBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addBarcodeFromInput();
  };

  // Enter key to add barcode
  barcodeInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBarcodeFromInput();
    }
  };

  // Setup barcode scan button
  let editorBarcodeScanning = false;
  const triggerEditorScan = async () => {
    if (editorBarcodeScanning) return;
    editorBarcodeScanning = true;
    barcodeInputScanBtn.classList.add('scanning');
    barcodeInputScanBtn.setAttribute('aria-disabled', 'true');
    try {
      startScanForInput(async (code) => {
        // After scan, immediately add to list without requiring user to click add button
        if (currentBarcodes.includes(code)) {
          alert('This barcode is already added.');
          return;
        }

        // Check if barcode exists in other items
        const { findByBarcode } = await import('../db.js');
        const existingItems = await findByBarcode(code);
        const duplicates = existingItems ? existingItems.filter(item => item.id !== currentEditingId) : [];

        if (duplicates.length > 0) {
          const itemNames = duplicates.map(item => `"${item.name}"`).join(', ');
          const message = duplicates.length === 1
            ? `This barcode already exists for ${itemNames}. Are you sure you want to add it?`
            : `This barcode already exists for ${duplicates.length} items: ${itemNames}. Are you sure you want to add it?`;
          if (!confirm(message)) {
            return;
          }
        }

        currentBarcodes.push(code);
        barcodeInput.value = '';
        renderBarcodeList();
        updateBarcodeAddButton();
      });
    } finally {
      setTimeout(() => {
        editorBarcodeScanning = false;
        barcodeInputScanBtn.classList.remove('scanning');
        barcodeInputScanBtn.removeAttribute('aria-disabled');
      }, 400);
    }
  };

  // Fast gesture capture
  barcodeInputScanBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerEditorScan();
  }, { passive: false });

  // Fallback for keyboard / non-pointer
  barcodeInputScanBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerEditorScan();
  };
}

/**
 * Collect form data from the editor
 */
function collectFormData() {
  const config = getConfig();
  const selectedType = el('typeSelect')?.value || Object.keys(config)[0];
  const typeInfo = getTypeInfo(selectedType);
  const data = {
    type: selectedType,
    name: el('nameInput')?.value?.trim() || '',
    barcodes: [...currentBarcodes],
    rating: starRatingController?.getValue() || 0,
    notes: el('notesInput')?.value?.trim() || ''
  };

  // Collect sub_type if enabled
  if (typeInfo.subTypeEnabled) {
    const subTypeEl = el('field_sub_type');
    if (subTypeEl && subTypeEl.value) {
      data.sub_type = subTypeEl.value;
    }
  }

  typeInfo.fields.forEach(field => {
    const fieldEl = el(`field_${field.name}`);
    if (fieldEl && fieldEl.value) {
      data[field.name] = field.type === 'number' ? Number(fieldEl.value) : fieldEl.value;
    }
  });
  data.photos = getPhotos();
  data.pairings = getCurrentPairings();
  data.places = getCurrentPlaces();
  return data;
}

/**
 * Save the item (add or update)
 */
export async function saveItem() {
  const payload = collectFormData();
  if (!payload.name) {
    setStatus('Please enter a name.');
    return false;
  }

  try {
    let itemId = currentEditingId;

    // Photos are already in DB, just store IDs (array of strings)
    payload.photos = getPhotos();

    if (currentEditingId) {
      // When updating, delete removed photos
      const oldItem = await import('../db.js').then(m => m.getItem(currentEditingId));
      if (oldItem && oldItem.photos) {
        const oldPhotoIds = new Set(oldItem.photos);
        const newPhotoIds = new Set(payload.photos);

        for (const oldId of oldPhotoIds) {
          if (!newPhotoIds.has(oldId)) {
            await deletePhoto(oldId);
          }
        }
      }

      await updateItem(currentEditingId, payload);

      // Update itemId for all photos (in case they were added before item was saved)
      const { getPhotoMetadata, getPhoto } = await import('../db.js');
      for (const photoId of payload.photos) {
        const photo = await getPhotoMetadata(photoId);
        if (photo && photo.itemId !== currentEditingId) {
          // Update itemId reference
          const blob = await getPhoto(photoId);
          if (blob) {
            await savePhoto(photoId, blob, photo.thumbnail, currentEditingId);
          }
        }
      }

      setStatus('Item updated!');
    } else {
      const newItemId = await addItem(payload);
      // itemId assignment removed - was unused

      // Update itemId for all photos
      const { getPhotoMetadata, getPhoto } = await import('../db.js');
      for (const photoId of payload.photos) {
        const photo = await getPhotoMetadata(photoId);
        if (photo) {
          const blob = await getPhoto(photoId);
          if (blob) {
            await savePhoto(photoId, blob, photo.thumbnail, newItemId);
          }
        }
      }

      if (payload.pairings && (payload.pairings.good.length > 0 || payload.pairings.bad.length > 0)) {
        for (const targetId of payload.pairings.good) await addPairing(newItemId, targetId, 'good');
        for (const targetId of payload.pairings.bad) await addPairing(newItemId, targetId, 'bad');
      }
      const searchInput = el('searchInput');
      if (searchInput) searchInput.value = '';
      setStatus('Item added!');
    }
    // Invalidate place usage cache so filters & selectors reflect new usage ordering
    invalidatePlaceUsageCache();
    // Immediately refresh list (via callback) and close editor without delay
    if (window.__editorOnSave) window.__editorOnSave();
    closeEditor();
    return true;
  } catch (e) {
    setStatus('Error: ' + e.message);
    return false;
  }
}

/**
 * Render the pairings section in the editor
 */
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

/**
 * Set the status message in the editor
 */
export function setStatus(msg) {
  el('status').textContent = msg;
}

export { renderPairingsInEditor };
