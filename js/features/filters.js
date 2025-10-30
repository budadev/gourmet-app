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
  minRating: 0,
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
    minRating: 0,
    maxRating: 5
  };
}

/**
 * Apply a single place filter, clearing all other filters
 */
export async function applyPlaceFilter(placeId) {
  // Clear all filters
  clearAllFilters();

  // Set the specific place filter
  currentFilters.places = [placeId];

  // Update the UI
  await renderFilterPanel();
  updateFilterButtonBadge();

  // Trigger filter change to update the item list
  triggerFilterChange();
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
  const footer = el('filterPanelFooter');
  let count = 0;

  if (currentFilters.types.length > 0) count++;
  if (currentFilters.places.length > 0) count++;
  if (currentFilters.minRating !== 0 || currentFilters.maxRating !== 5) count++;

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
    if (footer) footer.classList.add('active');
  } else {
    badge.style.display = 'none';
    if (footer) footer.classList.remove('active');
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

  // Update footer visibility
  updateFilterButtonBadge();
}

/**
 * Render type multi-select dropdown
 */
async function renderTypeMultiSelect(container) {
  if (!container) return;

  const typeConfig = getConfig();
  const types = Object.keys(typeConfig);

  let html = '<div class="filter-multiselect">';
  html += '<div class="filter-multiselect-dropdown" id="typeMultiselectDropdown">';

  types.forEach(type => {
    const info = typeConfig[type];
    const checked = currentFilters.types.includes(type) ? 'checked' : '';
    html += `
      <label class="filter-multiselect-option">
        <input type="checkbox" value="${type}" ${checked} data-filter-type="type">
        <span class="filter-multiselect-option-label">${info.icon} ${info.label}</span>
      </label>
    `;
  });

  html += '</div>';

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
  html += '<span class="filter-multiselect-arrow">▼</span>';
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
  html += '<div class="filter-place-search-wrapper" style="position:relative;">';
  html += '<input type="text" class="filter-place-input" id="filterPlaceInput" placeholder="Search places..." autocomplete="off" style="padding-right:38px;">';
  // Modern SVG map icon button, right-aligned inside input
  html += '<button class="filter-place-map-btn" id="filterPlaceMapBtn" title="Show map filter" type="button" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;">'
    + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><circle cx="12" cy="13" r="3.2"/></svg>'
    + '</button>';
  html += '<div class="filter-place-dropdown" id="filterPlaceDropdown"></div>';
  html += '</div>';
  html += '<div class="filter-selected-places" id="filterSelectedPlaces"></div>';
  // Remove modal from here; it will be created dynamically
  html += '</div>';

  container.innerHTML = html;

  const input = el('filterPlaceInput');
  const dropdown = el('filterPlaceDropdown');
  const mapBtn = el('filterPlaceMapBtn');

  // Render selected places
  await renderSelectedPlaces();

  // Map button event handler
  mapBtn.onclick = () => {
    // Create modal content element and append to body (no overlay)
    let mapModalContent = document.createElement('div');
    mapModalContent.className = 'filter-place-map-modal-content';
    mapModalContent.setAttribute('role', 'dialog');
    mapModalContent.setAttribute('aria-modal', 'true');
    document.body.appendChild(mapModalContent);
    // Helper to close and fully remove modal content
    function closeMapModal() {
      if (mapModalContent && mapModalContent.parentNode) {
        mapModalContent.parentNode.removeChild(mapModalContent);
        mapModalContent = null;
      }
    }
    import('../components/placeSelector.js').then(({ renderPlaceMapFilterModal }) => {
      renderPlaceMapFilterModal(mapModalContent, async (selection) => {
        if (selection && selection.type === 'place' && selection.placeId) {
          await applyPlaceFilter(selection.placeId);
        }
        // If area selection, do nothing for now (can be handled in the future)
        closeMapModal();
      });
    });
    // Close modal on Escape key
    function escListener(e) {
      if (e.key === 'Escape') {
        closeMapModal();
        document.removeEventListener('keydown', escListener);
      }
    }
    document.addEventListener('keydown', escListener);
  };

  // Search on input
  let searchTimeout;
  input.oninput = async (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (!query) {
      dropdown.classList.remove('active');
      return;
    }

    searchTimeout = setTimeout(async () => {
      await showPlaceDropdown(query);
    }, 200);
  };

  // Show dropdown on focus - show first 3 places if input is empty
  input.onfocus = async (e) => {
    const query = e.target.value.trim();
    if (query) {
      await showPlaceDropdown(query);
    } else {
      // Show all places from DB (no limit)
      await showPlaceDropdown('');
    }
  };

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-place-search-wrapper')) {
      dropdown.classList.remove('active');
    }
  });
}

/**
 * Show place dropdown with search results
 */
async function showPlaceDropdown(query, limit = null) {
  const dropdown = el('filterPlaceDropdown');
  if (!dropdown) return;

  let places;
  if (query) {
    places = await searchPlaces(query);
  } else {
    // Get all places and limit if needed
    places = await getAllPlaces();
    if (limit && places.length > limit) {
      places = places.slice(0, limit);
    }
  }

  if (places.length === 0) {
    dropdown.innerHTML = '<div class="filter-empty-state">No places found</div>';
    dropdown.classList.add('active');
    return;
  }

  let html = '';
  places.forEach(place => {
    const isSelected = currentFilters.places.includes(place.id);
    html += `
      <div class="filter-place-dropdown-item ${isSelected ? 'selected' : ''}" data-place-id="${place.id}">
        <span class="filter-place-dropdown-icon">📍</span>
        <span class="filter-place-dropdown-name">${place.name}</span>
        ${isSelected ? '<span class="filter-place-dropdown-check">✓</span>' : ''}
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.classList.add('active');

  // Handle place selection
  dropdown.querySelectorAll('.filter-place-dropdown-item').forEach(item => {
    item.onclick = async () => {
      const placeId = Number(item.getAttribute('data-place-id'));
      const isSelected = currentFilters.places.includes(placeId);

      if (isSelected) {
        // Remove place
        currentFilters.places = currentFilters.places.filter(p => p !== placeId);
      } else {
        // Add place
        currentFilters.places.push(placeId);
      }

      await renderSelectedPlaces();
      triggerFilterChange();

      // Clear search input and close dropdown
      const input = el('filterPlaceInput');
      if (input) {
        input.value = '';
      }
      dropdown.classList.remove('active');
    };
  });
}

/**
 * Render selected places
 */
async function renderSelectedPlaces() {
  const container = el('filterSelectedPlaces');
  if (!container) return;

  if (currentFilters.places.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="filter-place-tags">';

  for (const placeId of currentFilters.places) {
    const { getPlaceById } = await import('../models/places.js');
    const place = await getPlaceById(placeId);
    if (place) {
      html += `
        <div class="filter-place-tag">
          <span class="filter-place-tag-icon">📍</span>
          <span class="filter-place-tag-name">${place.name}</span>
          <button class="filter-place-tag-remove" data-place-id="${placeId}" type="button">×</button>
        </div>
      `;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // Handle remove buttons
  container.querySelectorAll('.filter-place-tag-remove').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const placeId = Number(btn.getAttribute('data-place-id'));
      currentFilters.places = currentFilters.places.filter(p => p !== placeId);
      await renderSelectedPlaces();
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
  html += `<span class="filter-range-value" id="filterRating${type}">${rating}</span>`;
  html += `</div>`;
  html += '<div class="filter-star-container" id="filterStarContainer${type}">';
  html += renderStars(rating, true);
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Setup star rating interaction
  const starContainer = container.querySelector('.star-rating');
  if (starContainer) {
    const ratingController = setupStarRating(starContainer, rating);

    // Store initial rating
    let lastValidRating = rating;

    // Listen for star clicks and changes
    const stars = starContainer.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('mouseup', () => {
        const newRating = ratingController.getValue();

        // Validate rating constraints
        let isValid = true;
        if (type === 'min' && newRating > currentFilters.maxRating) {
          isValid = false;
        } else if (type === 'max' && newRating < currentFilters.minRating) {
          isValid = false;
        }

        if (isValid) {
          lastValidRating = newRating;
          if (type === 'min') {
            currentFilters.minRating = newRating;
          } else {
            currentFilters.maxRating = newRating;
          }

          // Update the displayed value
          const valueDisplay = container.querySelector('.filter-range-value');
          if (valueDisplay) {
            valueDisplay.textContent = newRating;
          }

          triggerFilterChange();
        } else {
          // Revert to last valid rating
          ratingController.setValue(lastValidRating);
          const valueDisplay = container.querySelector('.filter-range-value');
          if (valueDisplay) {
            valueDisplay.textContent = lastValidRating;
          }
        }
      });

      star.addEventListener('touchend', () => {
        const newRating = ratingController.getValue();

        // Validate rating constraints
        let isValid = true;
        if (type === 'min' && newRating > currentFilters.maxRating) {
          isValid = false;
        } else if (type === 'max' && newRating < currentFilters.minRating) {
          isValid = false;
        }

        if (isValid) {
          lastValidRating = newRating;
          if (type === 'min') {
            currentFilters.minRating = newRating;
          } else {
            currentFilters.maxRating = newRating;
          }

          // Update the displayed value
          const valueDisplay = container.querySelector('.filter-range-value');
          if (valueDisplay) {
            valueDisplay.textContent = newRating;
          }

          triggerFilterChange();
        } else {
          // Revert to last valid rating
          ratingController.setValue(lastValidRating);
          const valueDisplay = container.querySelector('.filter-range-value');
          if (valueDisplay) {
            valueDisplay.textContent = lastValidRating;
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

// Helper to close all map modals and any inline backdrops (robust cleanup)
function closeAllMapModals() {
  document.querySelectorAll('.filter-place-map-modal, .inline-place-backdrop').forEach(modal => {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  });
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
  // Debug log
  console.log('[Modal] All overlays cleaned up');
}
