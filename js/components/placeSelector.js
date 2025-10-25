/* =============================
   Place Selector Component
   ============================= */

import { escapeHtml, el } from '../utils.js';
import { searchPlaces, getOrCreatePlace, addCurrentPlace, removeCurrentPlace, getCurrentPlaces, getPlaceById } from '../models/places.js';

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
      html += '<div class="place-tag">';
      html += '<span class="place-tag-icon">📍</span>';
      html += '<span class="place-tag-name">' + escapeHtml(place.name) + '</span>';
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
