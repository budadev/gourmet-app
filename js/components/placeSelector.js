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

  // Search input with '+' button inside
  html += `
    <div class="place-search-wrapper">
      <input 
        type="text" 
        id="placeSearchInput" 
        class="place-search-input"
        placeholder="Search or add a place (e.g., Buddha Bar Monaco)..."
        autocomplete="off"
      />
      <button class="place-add-btn hidden" id="placeAddBtn" type="button" title="Add new place">+</button>
      <div class="place-search-results hidden" id="placeSearchResults"></div>
    </div>
  `;

  // Selected places
  html += '<div class="selected-places" id="selectedPlaces"></div>';

  html += '</div>';

  containerEl.innerHTML = html;

  // Render currently selected places
  await renderSelectedPlaces(currentPlaceIds);

  // Setup event listeners
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
      html += `
        <div class="place-tag">
          <span class="place-tag-icon">📍</span>
          <span class="place-tag-name">${escapeHtml(place.name)}</span>
          <button class="place-tag-remove" data-place-id="${placeId}" type="button">×</button>
        </div>
      `;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind remove buttons
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

    // Clear previous timeout
    if (placeSearchTimeout) {
      clearTimeout(placeSearchTimeout);
    }

    if (!query) {
      resultsContainer.classList.add('hidden');
      addBtn.classList.add('hidden');
      return;
    }

    // Debounce search
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

    // Scroll the places section to the top of the modal on iOS
    scrollPlacesSectionIntoView();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.place-search-wrapper') &&
        !e.target.closest('.place-search-results')) {
      resultsContainer.classList.add('hidden');
    }
  });

  // Add new place button
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
 * Scroll the places section into view (for iOS keyboard visibility)
 */
function scrollPlacesSectionIntoView() {
  // Wait a brief moment for keyboard to appear
  setTimeout(() => {
    const placesSection = document.querySelector('.place-selector-section');
    const modalBody = document.querySelector('#editorModal .modal-body');

    if (placesSection && modalBody) {
      // Get the label element to scroll to
      const label = placesSection.querySelector('label');

      if (label) {
        // Use scrollIntoView with block: 'start' for better iOS compatibility
        label.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      } else {
        // Fallback: calculate offset manually
        const placesSectionTop = placesSection.offsetTop;
        modalBody.scrollTop = placesSectionTop - 10;
      }
    }
  }, 350); // Slightly longer delay for iOS keyboard animation
}

/**
 * Render search results dropdown
 */
async function renderSearchResults(results, query) {
  const resultsContainer = el('placeSearchResults');
  const addBtn = el('placeAddBtn');

  if (!resultsContainer || !addBtn) return;

  const exactMatch = results.find(
    p => p.name.toLowerCase() === query.toLowerCase()
  );

  if (results.length === 0 || !exactMatch) {
    // Show add button if no exact match
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
    html += `
      <div class="place-search-item ${isSelected ? 'selected' : ''}" data-place-id="${place.id}">
        <span class="place-search-item-icon">📍</span>
        <span class="place-search-item-name">${escapeHtml(place.name)}</span>
        ${isSelected ? '<span class="place-search-item-check">✓</span>' : ''}
      </div>
    `;
  }

  resultsContainer.innerHTML = html;
  resultsContainer.classList.remove('hidden');

  // Bind click handlers
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

      // Clear search input and hide results after selection
      const searchInput = el('placeSearchInput');
      if (searchInput) {
        searchInput.value = '';
      }
      resultsContainer.classList.add('hidden');

      // Hide the add button as well
      const addBtn = el('placeAddBtn');
      if (addBtn) {
        addBtn.classList.add('hidden');
      }
    });
  });
}

/**
 * Render places in details view (read-only)
 */
export async function renderPlacesInDetails(placeIds) {
  if (!placeIds || placeIds.length === 0) {
    return '';
  }

  let html = '<div class="detail-row">';
  html += '<div class="detail-label">Places</div>';
  html += '<div class="detail-value">';

  const places = [];
  for (const placeId of placeIds) {
    const place = await getPlaceById(placeId);
    if (place) {
      places.push(place.name);
    }
  }

  html += places.map(name => `<span class="place-badge">📍 ${escapeHtml(name)}</span>`).join(' ');
  html += '</div></div>';

  return html;
}
