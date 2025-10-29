/* =============================
   Place Selector Component
   ============================= */

import { escapeHtml, el } from '../utils.js';
import { searchPlaces, getOrCreatePlace, addCurrentPlace, removeCurrentPlace, getCurrentPlaces, getPlaceById, updatePlace as updatePlaceModel } from '../models/places.js';

let placeSearchTimeout = null;

/**
 * Render the place selector in the editor
 */
export async function renderPlaceSelector(containerEl, currentPlaceIds = []) {
  if (!containerEl) return;

  let html = '<div class="place-selector-section">';
  html += '<label>Where did you have it?</label>';

  html += '<div class="place-search-wrapper">';
  html += '<input type="text" id="placeSearchInput" class="place-search-input" placeholder="Search or add a place..." autocomplete="off" />';
  html += '<button class="place-add-btn hidden" id="placeAddBtn" type="button" title="Add new place">+</button>';
  html += '<div class="place-search-results hidden" id="placeSearchResults"></div>';
  html += '</div>';

  html += '<div class="selected-places" id="selectedPlaces"></div>';
  html += '</div>';

  containerEl.innerHTML = html;

  await renderSelectedPlaces(currentPlaceIds);
  setupPlaceSearchListeners();
}

/**
 * Render the list of selected places
 */
async function renderSelectedPlaces(placeIds = getCurrentPlaces()) {
  const container = el('selectedPlaces');
  if (!container) return;

  if (!placeIds || placeIds.length === 0) {
    container.innerHTML = '<div class="empty-places">No places added yet</div>';
    return;
  }

  let html = '<div class="place-list">';

  for (const placeId of placeIds) {
    const place = await getPlaceById(placeId);
    if (place) {
      html += '<div class="place-tag" data-place-id="' + placeId + '">';
      html += '<span class="place-tag-icon" data-action="edit">📍</span>';
      html += '<span class="place-tag-name" data-action="edit">' + escapeHtml(place.name) + '</span>';
      html += '<button class="place-tag-remove" data-place-id="' + placeId + '" type="button">×</button>';
      html += '</div>';
    }
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.place-tag-remove').forEach(btn => {
    btn.onclick = async () => {
      const placeId = Number(btn.getAttribute('data-place-id'));
      removeCurrentPlace(placeId);
      await renderSelectedPlaces();
    };
  });

  // Add click listeners for editing place label
  container.querySelectorAll('.place-tag [data-action="edit"]').forEach(elm => {
    elm.addEventListener('click', async (ev) => {
      const tag = ev.target.closest('.place-tag');
      if (!tag) return;
      const placeId = Number(tag.getAttribute('data-place-id'));
      openInlinePlaceEditor(tag, placeId);
    });
  });
}

/**
 * Open a small inline editor popup next to the place tag to edit its label
 */
function openInlinePlaceEditor(tagEl, placeId) {
  // Remove any existing backdrop/editor
  const existingBackdrop = document.querySelector('.inline-place-backdrop');
  if (existingBackdrop) existingBackdrop.remove();

  // Create backdrop that darkens background and centers the popup
  const backdrop = document.createElement('div');
  backdrop.className = 'inline-place-backdrop';

  const popup = document.createElement('div');
  popup.className = 'inline-place-editor';
  popup.setAttribute('data-place-id', placeId);
  popup.innerHTML = '<input type="text" class="inline-place-input" />' +
                    '<div class="inline-place-actions">' +
                    '<button class="inline-place-save btn primary">Save</button>' +
                    '<button class="inline-place-cancel btn">Cancel</button>' +
                    '</div>';

  backdrop.appendChild(popup);
  document.body.appendChild(backdrop);

  // Ensure popup is above the backdrop
  popup.style.position = 'relative';
  popup.style.zIndex = 10002;

  // Prefill input with current name
  const input = popup.querySelector('.inline-place-input');
  getPlaceById(placeId).then(place => {
    if (place && input) input.value = place.name || '';
    // Auto-focus the input (small timeout to ensure element is in DOM)
    setTimeout(() => {
      if (input) input.focus();
      // Move cursor to end
      if (input && typeof input.setSelectionRange === 'function') {
        const len = input.value ? input.value.length : 0;
        input.setSelectionRange(len, len);
      }
    }, 10);
  });

  // Prevent background scroll while backdrop is open
  const previousBodyNoScroll = document.body.classList.contains('no-scroll');
  document.body.classList.add('no-scroll');

  // Handlers
  const saveBtn = popup.querySelector('.inline-place-save');
  const cancelBtn = popup.querySelector('.inline-place-cancel');

  // Cleanup utility
  const cleanup = () => {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    document.removeEventListener('keydown', keydownHandler);
    if (input) input.removeEventListener('keydown', inputKeyHandler);
    // Restore previous no-scroll state
    if (!previousBodyNoScroll) document.body.classList.remove('no-scroll');
  };

  // Enter to save on input
  const inputKeyHandler = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn && saveBtn.click();
    }
  };
  if (input) input.addEventListener('keydown', inputKeyHandler);

  saveBtn.addEventListener('click', async () => {
    const newName = input ? input.value.trim() : '';
    if (!newName) return;
    try {
      await updatePlaceModel(placeId, { name: newName });
      // Update displayed label in the tag
      const nameEl = tagEl.querySelector('.place-tag-name');
      if (nameEl) nameEl.textContent = newName;
      cleanup();
    } catch (err) {
      console.error('Failed to update place', err);
    }
  });

  cancelBtn.addEventListener('click', () => {
    cleanup();
  });

  // Close when clicking on backdrop (outside popup)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      cleanup();
    }
  });

  // Close on Escape key
  const keydownHandler = (e) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };
  document.addEventListener('keydown', keydownHandler);
}

/**
 * Setup search input listeners
 */
function setupPlaceSearchListeners() {
  const searchInput = el('placeSearchInput');
  const addBtn = el('placeAddBtn');
  const resultsContainer = el('placeSearchResults');

  if (!searchInput || !addBtn || !resultsContainer) return;

  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();

    if (placeSearchTimeout) {
      clearTimeout(placeSearchTimeout);
    }

    if (!query) {
      resultsContainer.classList.add('hidden');
      addBtn.classList.add('hidden');
      return;
    }

    placeSearchTimeout = setTimeout(async () => {
      const results = await searchPlaces(query);
      renderSearchResults(results, query);
    }, 300);
  });

  searchInput.addEventListener('focus', async (e) => {
    const query = e.target.value.trim();
    if (query) {
      const results = await searchPlaces(query);
      renderSearchResults(results, query);
    }

    scrollInputIntoView(searchInput);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.place-search-wrapper') && !e.target.closest('.place-search-results')) {
      resultsContainer.classList.add('hidden');
    }
  });

  addBtn.addEventListener('click', async () => {
    const placeName = searchInput.value.trim();
    if (!placeName) return;

    const placeId = await getOrCreatePlace(placeName);
    if (placeId) {
      addCurrentPlace(placeId);
      await renderSelectedPlaces();
      searchInput.value = '';
      addBtn.classList.add('hidden');
      resultsContainer.classList.add('hidden');
    }
  });
}

/**
 * Scroll input into view for iOS keyboard (gentle approach)
 */
function scrollInputIntoView(inputElement){
  if (!inputElement) return;
  if (window.__scrollEditorFieldIntoView){
    window.__scrollEditorFieldIntoView(inputElement);
  } else {
    const scrollContainer = document.querySelector('#editorModal .modal-content');
    const header = document.querySelector('#editorModal .modal-header');
    if (scrollContainer && header){
      const headerRect = header.getBoundingClientRect();
      const inputRect = inputElement.getBoundingClientRect();
      if (inputRect.top < headerRect.bottom + 8){
        const delta = (headerRect.bottom + 8) - inputRect.top;
        scrollContainer.scrollTop -= delta;
      }
    }
  }
}

/**
 * Render search results dropdown
 */
async function renderSearchResults(results, query) {
  const resultsContainer = el('placeSearchResults');
  const addBtn = el('placeAddBtn');

  if (!resultsContainer || !addBtn) return;

  const exactMatch = results.find(p => p.name.toLowerCase() === query.toLowerCase());

  if (results.length === 0 || !exactMatch) {
    addBtn.classList.remove('hidden');
  } else {
    addBtn.classList.add('hidden');
  }

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="place-search-empty">Type to add a new place</div>';
    resultsContainer.classList.remove('hidden');
    return;
  }

  let html = '';
  for (const place of results) {
    const isSelected = getCurrentPlaces().includes(place.id);
    html += '<div class="place-search-item ' + (isSelected ? 'selected' : '') + '" data-place-id="' + place.id + '">';
    html += '<span class="place-search-item-icon">📍</span>';
    html += '<span class="place-search-item-name">' + escapeHtml(place.name) + '</span>';
    if (isSelected) {
      html += '<span class="place-search-item-check">✓</span>';
    }
    html += '</div>';
  }

  resultsContainer.innerHTML = html;
  resultsContainer.classList.remove('hidden');

  resultsContainer.querySelectorAll('.place-search-item').forEach(item => {
    item.addEventListener('click', async () => {
      const placeId = Number(item.getAttribute('data-place-id'));
      const isSelected = getCurrentPlaces().includes(placeId);

      if (isSelected) {
        removeCurrentPlace(placeId);
      } else {
        addCurrentPlace(placeId);
      }

      await renderSelectedPlaces();

      const searchInput = el('placeSearchInput');
      if (searchInput) {
        searchInput.value = '';
      }
      resultsContainer.classList.add('hidden');

      const addBtn = el('placeAddBtn');
      if (addBtn) {
        addBtn.classList.add('hidden');
      }
    });
  });
}

/**
 * Render places in details view (clickable to filter)
 */
export async function renderPlacesInDetails(placeIds) {
  if (!placeIds || placeIds.length === 0) {
    return '';
  }

  let html = '<div class="detail-row">';
  html += '<div class="detail-label">Places</div>';
  html += '<div class="detail-value">';

  for (const placeId of placeIds) {
    const place = await getPlaceById(placeId);
    if (place) {
      html += '<span class="place-badge clickable" data-place-id="' + placeId + '">📍 ' + escapeHtml(place.name) + '</span>';
    }
  }

  html += '</div></div>';

  return html;
}
