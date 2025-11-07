/* =============================
   Item Details Modal
   ============================= */

import { escapeHtml, el, formatDate } from '../utils.js';
import { getItem, deleteItem, listAll, getPhoto, deletePhotosByItemId, getPhotoThumbnails } from '../db.js';
import { renderStars } from '../components/rating.js';
import { openModal, closeModal } from '../components/modal.js';
import { showPhotoModal, blobToDataURL } from '../components/photos.js';
import { getTypeInfo } from '../config.js';
import { cleanupPairingsOnDelete } from '../models/pairings.js';
import { renderPlacesInDetails } from '../components/placeEditor.js';
import { invalidatePlaceUsageCache } from '../models/places.js';

export async function showItemDetails(id, onEdit, onDelete) {
  const item = await getItem(id);
  if (!item) return;

  const typeInfo = getTypeInfo(item.type);
  const detailsContent = el('detailsContent');
  const detailsButtons = el('detailsButtons');

  // Update header with item name or fallback to "Item Details"
  const detailsHeader = document.querySelector('#detailsModal .modal-header h2');
  if (detailsHeader) {
    detailsHeader.textContent = item.name || 'Item Details';
  }

  // Remove the name row from details - start with Type instead
  let fieldsHTML = `
    <div class="detail-row">
      <div class="detail-label">Type</div>
      <div class="detail-value">${typeInfo.icon} ${escapeHtml(typeInfo.label)}</div>
    </div>
    ${(typeInfo.subTypeEnabled && item.sub_type) ? `<div class="detail-row">
      <div class="detail-label">Sub-type</div>
      <div class="detail-value">${escapeHtml(item.sub_type)}</div>
    </div>` : ''}
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
  `;

  // Add places if available
  if (item.places && item.places.length > 0) {
    fieldsHTML += await renderPlacesInDetails(item.places);
  }

  fieldsHTML += `
    <div class="detail-row">
      <div class="detail-label">Last Updated</div>
      <div class="detail-value">${formatDate(item.updatedAt)}</div>
    </div>
  `;

  // Add photos if available
  let photosHTML = '';
  if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
    // Load thumbnails from photos table (only when viewing this item's details)
    const photoData = await getPhotoThumbnails(item.photos);

    // Convert any thumbnail Blobs to dataURLs so <img src=> works
    const preparedThumbs = await Promise.all(photoData.map(async (p) => {
      if (!p) return null;
      let thumb = p.thumbnail;
      if (thumb && typeof thumb !== 'string') {
        try {
          thumb = await blobToDataURL(thumb);
        } catch (err) {
          console.error('Error converting thumbnail blob to dataURL', err);
          thumb = '';
        }
      }
      return { id: p.id, thumbnail: thumb };
    }));

    photosHTML = `
      <div style="margin-top:20px;padding-top:20px;border-top:2px solid var(--border-light)">
        <label>Photos</label>
        <div class="photo-gallery">
          ${preparedThumbs.filter(p => p !== null).map((photo, index) => `
            <img src="${photo.thumbnail}" alt="Photo ${index + 1}" data-photo-id="${photo.id}" class="photo-thumbnail" />
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
    img.onclick = async () => {
      const photoId = img.getAttribute('data-photo-id');
      try {
        // Load full photo from photos store
        const photoBlob = await getPhoto(photoId);
        if (photoBlob) {
          const photoDataURL = await blobToDataURL(photoBlob);

          // Load all full photos for navigation (item.photos is now array of IDs)
          const allPhotoDataURLs = await Promise.all(
            item.photos.map(async (photoId) => {
              const blob = await getPhoto(photoId);
              return blob ? await blobToDataURL(blob) : null;
            })
          );

          // Filter out any failed loads
          const validPhotoURLs = allPhotoDataURLs.filter(url => url !== null);
          showPhotoModal(photoDataURL, validPhotoURLs);
        }
      } catch (err) {
        console.error('Error loading photo:', err);
        // Fallback to thumbnail if full photo fails to load
        showPhotoModal(img.src, [img.src]);
      }
    };
  });

  // Bind pairing items to show their details
  detailsContent.querySelectorAll('[data-view-item-id]').forEach(pairingEl => {
    pairingEl.onclick = () => {
      const pairedItemId = Number(pairingEl.getAttribute('data-view-item-id'));
      showItemDetails(pairedItemId, onEdit, onDelete);
    };
  });

  // Bind place badges to filter by that place
  detailsContent.querySelectorAll('.place-badge.clickable').forEach(placeBadge => {
    placeBadge.onclick = async () => {
      const placeId = Number(placeBadge.getAttribute('data-place-id'));
      // Close the details modal
      closeModal('detailsModal');
      // Apply the place filter (which clears other filters)
      const { applyPlaceFilter } = await import('./filters.js');
      await applyPlaceFilter(placeId);
      // Close the item details modal after applying the filter
      const { closeModal } = await import('../components/modal.js');
      closeModal('item-details-modal');
    };
  });

  // Bind place tags to filter by that place
  detailsContent.querySelectorAll('.place-tag.clickable').forEach(placeTag => {
    placeTag.onclick = async (event) => {
      // Prevent filter if clicking remove button or edit actions
      if (event.target.closest('.place-tag-remove') || event.target.getAttribute('data-action') === 'edit') {
        return;
      }
      const placeId = Number(placeTag.getAttribute('data-place-id'));
      const { applyPlaceFilter } = await import('./filters.js');
      await applyPlaceFilter(placeId);
      const { closeModal } = await import('../components/modal.js');
      closeModal('detailsModal');
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
      // Delete associated photos
      if (item.photos && item.photos.length > 0) {
        await deletePhotosByItemId(id);
      }
      await deleteItem(id);
      // Invalidate place usage cache so filters & selectors pick up decreased usage
      invalidatePlaceUsageCache();
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
