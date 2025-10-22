/* =============================
   Item Details Modal
   ============================= */

import { escapeHtml, el, formatDate } from '../utils.js';
import { getItem, deleteItem, listAll } from '../db.js';
import { renderStars } from '../components/rating.js';
import { openModal, closeModal } from '../components/modal.js';
import { showPhotoModal } from '../components/photos.js';
import { getTypeInfo } from '../config.js';
import { cleanupPairingsOnDelete } from '../models/pairings.js';

export async function showItemDetails(id, onEdit, onDelete) {
  const item = await getItem(id);
  if (!item) return;

  const typeInfo = getTypeInfo(item.type);
  const detailsContent = el('detailsContent');
  const detailsButtons = el('detailsButtons');

  let fieldsHTML = `
    <div class="detail-row">
      <div class="detail-label">Name</div>
      <div class="detail-value">${escapeHtml(item.name || 'Unnamed')}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Type</div>
      <div class="detail-value">${typeInfo.icon} ${escapeHtml(typeInfo.label)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Rating</div>
      <div class="detail-value">${renderStars(Number(item.rating) || 0, false)}</div>
    </div>
    ${item.barcode ? `<div class="detail-row">
      <div class="detail-label">Barcode</div>
      <div class="detail-value">${escapeHtml(item.barcode)}</div>
    </div>` : ''}
  `;

  // Add dynamic fields
  typeInfo.fields.forEach(field => {
    if (item[field.name]) {
      fieldsHTML += `
        <div class="detail-row">
          <div class="detail-label">${escapeHtml(field.label)}</div>
          <div class="detail-value">${escapeHtml(String(item[field.name]))}</div>
        </div>
      `;
    }
  });

  fieldsHTML += `
    ${item.notes ? `<div class="detail-row">
      <div class="detail-label">Notes</div>
      <div class="detail-value">${escapeHtml(item.notes)}</div>
    </div>` : ''}
    <div class="detail-row">
      <div class="detail-label">Last Updated</div>
      <div class="detail-value">${formatDate(item.updatedAt)}</div>
    </div>
  `;

  // Add photos if available
  let photosHTML = '';
  if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
    photosHTML = `
      <div style="margin-top:20px;padding-top:20px;border-top:2px solid var(--border-light)">
        <label>Photos</label>
        <div class="photo-gallery">
          ${item.photos.map((photo, index) => `
            <img src="${photo}" alt="Photo ${index + 1}" data-photo-url="${photo}" class="photo-thumbnail" />
          `).join('')}
        </div>
      </div>
    `;
  }

  // Render pairings
  const pairingsHTML = await renderPairingsHTML(item, showItemDetails);

  detailsContent.innerHTML = `
    <div class="detail-section">${fieldsHTML}</div>
    ${photosHTML}
    ${pairingsHTML}
  `;

  // Set buttons in footer
  detailsButtons.innerHTML = `
    <button class="btn primary" id="editDetailsBtn">Edit</button>
    <button class="btn" id="deleteDetailsBtn">Delete</button>
  `;

  openModal('detailsModal');

  // Bind photo thumbnails to show full screen
  detailsContent.querySelectorAll('.photo-thumbnail').forEach(img => {
    img.onclick = () => {
      const photoUrl = img.getAttribute('data-photo-url');
      showPhotoModal(photoUrl);
    };
  });

  // Bind pairing items to show their details
  detailsContent.querySelectorAll('[data-view-item-id]').forEach(pairingEl => {
    pairingEl.onclick = () => {
      const pairedItemId = Number(pairingEl.getAttribute('data-view-item-id'));
      showItemDetails(pairedItemId, onEdit, onDelete);
    };
  });

  // Bind edit button
  el('editDetailsBtn').onclick = () => {
    closeModal('detailsModal');
    if (onEdit) onEdit(item);
  };

  // Bind delete button
  el('deleteDetailsBtn').onclick = async () => {
    if (confirm(`Delete "${item.name}"?`)) {
      await cleanupPairingsOnDelete(id, item.pairings);
      await deleteItem(id);
      closeModal('detailsModal');
      if (onDelete) onDelete();
    }
  };
}

async function renderPairingsHTML(item, onPairingClick) {
  if (!item.pairings || (item.pairings.good.length === 0 && item.pairings.bad.length === 0)) {
    return '';
  }

  const allItems = await listAll();
  let html = '<div class="pairings-section">';

  // Good pairings
  if (item.pairings.good.length > 0) {
    html += '<div class="pairing-category">';
    html += '<h3>✅ Pairs well with...</h3>';
    html += '<div class="pairing-list">';

    for (const pairedId of item.pairings.good) {
      const pairedItem = allItems.find(it => it.id === pairedId);
      if (pairedItem) {
        const typeInfo = getTypeInfo(pairedItem.type);
        html += `
          <div class="pairing-item good" style="cursor:pointer" data-view-item-id="${pairedId}">
            <div class="pairing-item-name">
              <span>${typeInfo.icon}</span>
              <span>${escapeHtml(pairedItem.name)}</span>
            </div>
          </div>
        `;
      }
    }
    html += '</div></div>';
  }

  // Bad pairings
  if (item.pairings.bad.length > 0) {
    html += '<div class="pairing-category">';
    html += '<h3>❌ Not a good match for...</h3>';
    html += '<div class="pairing-list">';

    for (const pairedId of item.pairings.bad) {
      const pairedItem = allItems.find(it => it.id === pairedId);
      if (pairedItem) {
        const typeInfo = getTypeInfo(pairedItem.type);
        html += `
          <div class="pairing-item bad" style="cursor:pointer" data-view-item-id="${pairedId}">
            <div class="pairing-item-name">
              <span>${typeInfo.icon}</span>
              <span>${escapeHtml(pairedItem.name)}</span>
            </div>
          </div>
        `;
      }
    }
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

export function closeDetails() {
  closeModal('detailsModal');
}
