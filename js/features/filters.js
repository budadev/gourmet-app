/* =============================
   Filters Feature
   ============================= */

import { el } from '../utils.js';
import { getConfig } from '../config.js';
import { getAllPlaces, searchPlaces } from '../models/places.js';
import { renderStars, setupStarRating } from '../components/rating.js';

// Current filter state
let currentFilters = {
  types: [], // Array of selected type strings
  places: [], // Array of selected place IDs
  minRating: 0.5,
  maxRating: 5
};

export function getCurrentFilters() {
  return { ...currentFilters };
}

export function setCurrentFilters(filters) {
  currentFilters = { ...filters };
}

export function clearAllFilters() {
  currentFilters = {
    types: [],
    places: [],
    minRating: 0.5,
    maxRating: 5
  };
}

/**
 * Apply current filters to a list of items
 */
export function applyFilters(items) {
  let filtered = [...items];

  // Filter by type
  if (currentFilters.types.length > 0) {
    filtered = filtered.filter(item => currentFilters.types.includes(item.type));
  }

  // Filter by places
  if (currentFilters.places.length > 0) {
    filtered = filtered.filter(item => {
      if (!item.places || !Array.isArray(item.places) || item.places.length === 0) {
        return false;
      }
      // Item must have at least one of the selected places
      return item.places.some(placeId => currentFilters.places.includes(placeId));
    });
  }

  // Filter by rating
  filtered = filtered.filter(item => {
    const rating = Number(item.rating) || 0;
    return rating >= currentFilters.minRating && rating <= currentFilters.maxRating;
  });

  return filtered;
}

/**
 * Initialize filter UI
 */
export async function initFilters(onFilterChange) {
  // Store the callback
  if (onFilterChange) {
    filterChangeCallback = onFilterChange;
  }

  const filterBtn = el('filterBtn');
  const filterPanel = el('filterPanel');
  const filterOverlay = el('filterOverlay');
  const clearFiltersBtn = el('clearFiltersBtn');

  // Toggle filter panel
  filterBtn.onclick = async () => {
    const isOpen = filterPanel.classList.contains('active');
    if (!isOpen) {
      await renderFilterPanel();
      filterPanel.classList.add('active');
      filterOverlay.classList.add('active');
    } else {
      filterPanel.classList.remove('active');
      filterOverlay.classList.remove('active');
    }
  };

  // Close on overlay click
  filterOverlay.onclick = () => {
    filterPanel.classList.remove('active');
    filterOverlay.classList.remove('active');
  };

  // Clear all filters
  clearFiltersBtn.onclick = () => {
    clearAllFilters();
    renderFilterPanel();
    triggerFilterChange();
  };

  // Update filter button badge on init
  updateFilterButtonBadge();
}

/**
 * Open filter panel
 */
export async function openFilterPanel() {
  const filterPanel = el('filterPanel');
  const filterOverlay = el('filterOverlay');
  await renderFilterPanel();
  filterPanel.classList.add('active');
  filterOverlay.classList.add('active');
}

/**
 * Close filter panel
 */
export function closeFilterPanel() {
  const filterPanel = el('filterPanel');
  const filterOverlay = el('filterOverlay');
  filterPanel.classList.remove('active');
  filterOverlay.classList.remove('active');
}

/**
 * Update the filter button badge to show active filter count
 */
export async function updateFilterButtonBadge() {
  const badge = el('filterBadge');
  let count = 0;

  if (currentFilters.types.length > 0) count++;
  if (currentFilters.places.length > 0) count++;
  if (currentFilters.minRating !== 0.5 || currentFilters.maxRating !== 5) count++;

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Render the filter panel with current filter state
 */
async function renderFilterPanel() {
  const typeDropdownContainer = el('typeDropdownContainer');
  const placeSearchContainer = el('placeSearchContainer');
  const minRatingContainer = el('minRatingContainer');
  const maxRatingContainer = el('maxRatingContainer');

  // Render type multi-select dropdown
  await renderTypeMultiSelect(typeDropdownContainer);

  // Render place search/select
  await renderPlaceSearch(placeSearchContainer);

  // Render star rating selectors
  renderStarRating(minRatingContainer, currentFilters.minRating, 'min');
  renderStarRating(maxRatingContainer, currentFilters.maxRating, 'max');
}

/**
 * Render type multi-select dropdown
 */
async function renderTypeMultiSelect(container) {
  if (!container) return;

  const typeConfig = getConfig();
  const types = Object.keys(typeConfig);

  let html = '<div class="filter-multiselect">';
  html += '<div class="filter-multiselect-trigger" id="typeMultiselectTrigger">';
  html += '<span class="filter-multiselect-label">';

  if (currentFilters.types.length === 0) {
    html += 'All Types';
  } else if (currentFilters.types.length === 1) {
    const typeInfo = typeConfig[currentFilters.types[0]];
    html += typeInfo.icon + ' ' + typeInfo.label;
  } else {
    html += currentFilters.types.length + ' types selected';
  }

  html += '</span>';
  html += '</div>';

  html += '<div class="filter-multiselect-dropdown" id="typeMultiselectDropdown">';

  types.forEach(type => {
    const info = typeConfig[type];
    const checked = currentFilters.types.includes(type) ? 'checked' : '';
    html += `
      <label class="filter-multiselect-option">
        <input type="checkbox" value="${type}" ${checked} data-filter-type="type">
        <span class="filter-multiselect-option-label">${info.icon} ${info.label}</span>
        <span class="filter-multiselect-check">✓</span>
      </label>
    `;
  });

  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Setup dropdown toggle
  const trigger = el('typeMultiselectTrigger');
  const dropdown = el('typeMultiselectDropdown');

  trigger.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  };

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  // Handle checkbox changes
  container.querySelectorAll('[data-filter-type="type"]').forEach(checkbox => {
    checkbox.onchange = (e) => {
      const type = e.target.value;
      if (e.target.checked) {
        if (!currentFilters.types.includes(type)) {
          currentFilters.types.push(type);
        }
      } else {
        currentFilters.types = currentFilters.types.filter(t => t !== type);
      }
      renderTypeMultiSelect(container);
      triggerFilterChange();
    };
  });
}

/**
 * Render place search component
 */
async function renderPlaceSearch(container) {
  if (!container) return;

  let html = '<div class="filter-place-search">';
  html += '<input type="text" class="filter-place-input" id="filterPlaceInput" placeholder="Search places...">';
  html += '<div class="filter-place-results" id="filterPlaceResults"></div>';
  html += '</div>';

  container.innerHTML = html;

  const input = el('filterPlaceInput');
  const resultsContainer = el('filterPlaceResults');

  // Show all places initially
  await updatePlaceResults('');

  // Search on input
  let searchTimeout;
  input.oninput = async (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      await updatePlaceResults(e.target.value.trim());
    }, 200);
  };
}

/**
 * Update place search results
 */
async function updatePlaceResults(query) {
  const resultsContainer = el('filterPlaceResults');
  if (!resultsContainer) return;

  const places = query ? await searchPlaces(query) : await getAllPlaces();

  if (places.length === 0) {
    resultsContainer.innerHTML = '<div class="filter-empty-state">No places found</div>';
    return;
  }

  let html = '';
  places.forEach(place => {
    const checked = currentFilters.places.includes(place.id) ? 'checked' : '';
    html += `
      <label class="filter-place-option">
        <input type="checkbox" value="${place.id}" ${checked} data-filter-type="place">
        <span class="filter-place-option-label">📍 ${place.name}</span>
        <span class="filter-place-check">✓</span>
      </label>
    `;
  });

  resultsContainer.innerHTML = html;

  // Handle checkbox changes
  resultsContainer.querySelectorAll('[data-filter-type="place"]').forEach(checkbox => {
    checkbox.onchange = (e) => {
      const placeId = Number(e.target.value);
      if (e.target.checked) {
        if (!currentFilters.places.includes(placeId)) {
          currentFilters.places.push(placeId);
        }
      } else {
        currentFilters.places = currentFilters.places.filter(p => p !== placeId);
      }
      triggerFilterChange();
    };
  });
}

/**
 * Render star rating selector
 */
function renderStarRating(container, rating, type) {
  if (!container) return;

  const label = type === 'min' ? 'Minimum' : 'Maximum';

  let html = '<div class="filter-star-rating">';
  html += `<div class="filter-range-label">`;
  html += `<span class="filter-range-label-text">${label}</span>`;
  html += `<span class="filter-range-value">${rating}</span>`;
  html += `</div>`;
  html += '<div class="filter-star-container">';
  html += renderStars(rating, true);
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Setup star rating interaction
  const starContainer = container.querySelector('.star-rating');
  if (starContainer) {
    setupStarRating(starContainer, rating);

    // Listen for rating changes
    const stars = starContainer.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const newRating = parseFloat(star.getAttribute('data-value'));

        if (type === 'min') {
          if (newRating <= currentFilters.maxRating) {
            currentFilters.minRating = newRating;
            renderStarRating(container, newRating, type);
            triggerFilterChange();
          }
        } else {
          if (newRating >= currentFilters.minRating) {
            currentFilters.maxRating = newRating;
            renderStarRating(container, newRating, type);
            triggerFilterChange();
          }
        }
      });
    });
  }
}

/**
 * Trigger filter change callback
 */
let filterChangeCallback = null;

export function setFilterChangeCallback(callback) {
  filterChangeCallback = callback;
}

function triggerFilterChange() {
  updateFilterButtonBadge();
  if (filterChangeCallback) {
    filterChangeCallback();
  }
}
