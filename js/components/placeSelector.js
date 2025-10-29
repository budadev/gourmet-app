/* =============================
   Place Selector Component
   ============================= */

import { escapeHtml, el } from '../utils.js';
import { searchPlaces, getOrCreatePlace, addCurrentPlace, removeCurrentPlace, getCurrentPlaces, getPlaceById, updatePlace as updatePlaceModel } from '../models/places.js';
import { createMap } from './map.js';

// Local cache key for last user location
const LAST_LOCATION_KEY = 'gourmet_last_location_v1';

function getLastLocation() {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return { lat: parsed.lat, lng: parsed.lng };
  } catch (e) {
    // ignore
  }
  return null;
}

function setLastLocation(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat, lng, ts: Date.now() }));
  } catch (e) {
    // ignore storage errors (privacy mode etc.)
  }
}

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
  popup.innerHTML =
    '<input type="text" class="inline-place-input" />' +
    '<div class="inline-place-map-wrapper" style="display:none;margin-top:10px">' +
    '<div class="inline-place-map-loading" style="text-align:center;padding:12px">Loading map...</div>' +
    '<div class="inline-place-map" style="width:100%;height:220px;display:none;border-radius:10px;overflow:hidden"></div>' +
    '</div>' +
    '<div class="inline-place-coords" style="font-size:12px;color:var(--text-secondary);min-height:18px;margin-top:4px"></div>' +
    '<div class="inline-place-actions" style="display:block;margin-top:8px">' +
    '<button class="inline-place-save btn primary">Save</button>' +
    '</div>';

  backdrop.appendChild(popup);
  document.body.appendChild(backdrop);

  // Ensure popup is above the backdrop
  popup.style.position = 'relative';
  popup.style.zIndex = 10002;

  // Prefill input with current name and set up map
  const input = popup.querySelector('.inline-place-input');
  const mapWrapper = popup.querySelector('.inline-place-map-wrapper');
  const mapLoading = popup.querySelector('.inline-place-map-loading');
  const mapEl = popup.querySelector('.inline-place-map');
  const coordsEl = popup.querySelector('.inline-place-coords');
  const actionsRow = popup.querySelector('.inline-place-actions');

  let mapInstance = null;
  let selectedCoords = null; // {lat,lng} if user picks

  // Show map wrapper by default (but map not initialized until user interacts)
  mapWrapper.style.display = 'block';
  mapLoading.textContent = 'Click to load map';
  mapLoading.style.display = 'block';
  mapEl.style.display = 'none';

  // Auto-init map shortly after opening (for parity with the old implementation)
  setTimeout(() => {
    if (!mapInstance) {
      mapLoading.textContent = 'Loading map...';
      try { initMapIfNeeded(null); } catch (err) { console.error('initMapIfNeeded error', err); }
    }
  }, 60);

  // Add center-to-user button into the map wrapper
  const centerBtn = document.createElement('button');
  centerBtn.className = 'inline-place-center-btn disabled';
  centerBtn.type = 'button';
  centerBtn.title = 'Center to your location';
  // Target / crosshair icon (similar to Google Maps 'my location' target)
  centerBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;">' +
    '<circle cx="12" cy="12" r="7" stroke="var(--primary)" stroke-width="1.6" fill="none"/>' +
    '<circle cx="12" cy="12" r="2.2" fill="var(--primary)" />' +
    '<path d="M12 3v2" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round" />' +
    '<path d="M12 21v-2" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round" />' +
    '<path d="M3 12h2" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round" />' +
    '<path d="M21 12h-2" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round" />' +
    '</svg>';
  mapWrapper.appendChild(centerBtn);

  // If user clicks the loading area, initialize map (lazy load)
  mapLoading.addEventListener('click', () => {
    if (!mapInstance) {
      mapLoading.textContent = 'Loading map...';
      initMapIfNeeded(null);
    }
  });

  const initMapIfNeeded = async (existingCoords) => {
    // show the map area
    mapWrapper.style.display = 'block';
    mapLoading.style.display = 'block';
    // Make the map element visible before initializing Leaflet so tiles load correctly
    mapEl.style.display = 'block';

    try {
      if (typeof L === 'undefined') {
        mapLoading.textContent = 'Map library unavailable.';
        return;
      }

      // Use cached last user location as initial center when no place coordinates
      const lastLoc = !existingCoords ? getLastLocation() : null;
      const initialCenter = existingCoords ? [existingCoords.lat, existingCoords.lng] : (lastLoc ? [lastLoc.lat, lastLoc.lng] : undefined);
      mapInstance = await createMap(mapEl, { center: initialCenter, zoom: 12 });

      // After creating the map, enable/disable the center button based on geolocation availability
      const geoAvailable = !!(navigator && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === 'function');
      if (geoAvailable) {
        centerBtn.classList.remove('disabled');
      } else {
        centerBtn.classList.add('disabled');
      }

      // Wire center button (attempt to get current position and center map)
      const centerToUser = (opts = {}) => {
        if (!geoAvailable) return Promise.reject(new Error('Geolocation unavailable'));
        return new Promise((resolve, reject) => {
          let handled = false;
          const success = (pos) => { handled = true; resolve(pos); };
          const failure = (err) => { handled = true; reject(err); };
          try {
            navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true, timeout: 10000 });
          } catch (e) { reject(e); }
          // fallback timeout
          setTimeout(() => { if (!handled) reject(new Error('Geolocation timeout')); }, 11000);
        }).then((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          try { mapInstance.map.setView([lat, lng], opts.zoom || 13); } catch (e) {}
          // Save to cache
          setLastLocation(lat, lng);
          return { lat, lng };
        });
      };

      centerBtn.onclick = (e) => {
        // don't start another request if one is in progress or geolocation is unavailable
        if (centerBtn.classList.contains('disabled') || centerBtn.classList.contains('loading')) return;
        // show spinner
        centerBtn.classList.add('loading');
        // perform geolocation and center the map only (do not move marker or update selectedCoords)
        centerToUser().then(({lat,lng}) => {
          // centerToUser already set the view; do not modify any markers or selected coordinates here
        }).catch((err) => {
          // permission denied or error — disable center button to avoid repeated prompts
          try { console.warn('Geolocation error', err); } catch (e) {}
          centerBtn.classList.add('disabled');
        }).finally(() => {
          centerBtn.classList.remove('loading');
        });
      };

      // Wait for tiles to load (or fallback via timeout inside createMap)
      try {
        await Promise.race([
          mapInstance.tilesLoaded,
          new Promise(res => setTimeout(res, 8000))
        ]);
      } catch (e) {
        // ignore
      }

      if (existingCoords && existingCoords.lat && existingCoords.lng) {
        mapInstance.setMarker([existingCoords.lat, existingCoords.lng], { draggable: true });
        selectedCoords = { lat: existingCoords.lat, lng: existingCoords.lng };
        // center map
        try { mapInstance.map.setView([existingCoords.lat, existingCoords.lng], 13); } catch (e) {}
      } else {
        // No coordinates selected yet: try to center to user's location automatically
        if (navigator && navigator.geolocation) {
          try {
            // show loading spinner on center button while requesting permission/position
            try { centerBtn.classList.add('loading'); } catch (e) {}
            navigator.geolocation.getCurrentPosition((pos) => {
              try { centerBtn.classList.remove('loading'); } catch (e) {}
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              try { mapInstance.map.setView([lat, lng], 13); } catch (e) {}
              // cache last known location
              try { setLastLocation(lat, lng); } catch (e) {}
            }, (err) => {
               try { centerBtn.classList.remove('loading'); } catch (e) {}
               // ignore if user denies; disable the button to avoid repeated prompts
               try { centerBtn.classList.add('disabled'); } catch (e) {}
               try { console.debug('geolocation init denied or failed', err); } catch (e) {}
             }, { enableHighAccuracy: true, timeout: 10000 });
          } catch (e) {
            try { centerBtn.classList.remove('loading'); } catch (err) {}
            // ignore
          }
        }
      }

      // allow clicking to set marker — explicitly set the marker here and update selectedCoords
      mapInstance.onMapClick((latlng) => {
        try {
          console.debug('[PlaceSelector] map click (wrapper)', latlng);
        } catch (e) {}
        try {
          const m = (mapInstance && typeof mapInstance.setMarker === 'function') ? mapInstance.setMarker(latlng, { draggable: true }) : null;
          if (m && m.on) {
            m.on('dragend', (ev) => {
              try {
                const p = ev.target.getLatLng();
                selectedCoords = { lat: p.lat, lng: p.lng };
                if (coordsEl) coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
              } catch (err) {}
            });
          }
        } catch (e) { console.warn('setMarker failed', e); }
        selectedCoords = { lat: latlng.lat, lng: latlng.lng };
        if (coordsEl) coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
      });

      // Also attach a direct Leaflet click listener on the raw map in case wrapper isn't wired
      try {
        mapInstance.map.on('click', (e) => {
          const latlng = e && e.latlng;
          if (!latlng) return;
          try { console.debug('[PlaceSelector] map click (direct)', latlng); } catch (e) {}
          try {
            const m2 = (mapInstance && typeof mapInstance.setMarker === 'function') ? mapInstance.setMarker(latlng, { draggable: true }) : null;
            if (m2 && m2.on) {
              m2.on('dragend', (ev) => {
                try {
                  const p = ev.target.getLatLng(); selectedCoords = { lat: p.lat, lng: p.lng };
                  if (coordsEl) coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
                } catch (err) {}
              });
            }
          } catch (err) { console.warn('setMarker direct failed', err); }
          selectedCoords = { lat: latlng.lat, lng: latlng.lng };
          if (coordsEl) coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
        });
      } catch (e) {
        // ignore if map not available
      }

      mapLoading.style.display = 'none';
      mapEl.style.display = 'block';
      try { mapInstance.map.invalidateSize(); } catch (e) {}
      // Some browsers need a delayed invalidateSize when inside hidden->visible containers
      setTimeout(() => {
        try { mapInstance.map.invalidateSize(); } catch (e) {}
      }, 250);
    } catch (err) {
      console.error('Map init error', err);
      mapLoading.textContent = 'Map failed to load.';
      mapEl.style.display = 'none';
    }
  };

  // Load place data
  getPlaceById(placeId).then(place => {
    if (place && input) input.value = place.name || '';
    // If the place already has coordinates, show map and existing pin
    if (place && place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') {
      // initialize map immediately if coords exist
      initMapIfNeeded(place.coordinates);
    }
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

  // Add a small toggle: clicking the tag's icon or name opens map area if user wants to configure location
  // We'll show map area when user double-clicks the input or clicks a small keyboard shortcut (Alt+M)
  input.addEventListener('dblclick', () => {
    if (!mapInstance) initMapIfNeeded(null);
  });
  input.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      if (!mapInstance) initMapIfNeeded(null);
    }
  });

  // Prevent background scroll while backdrop is open
  const previousBodyNoScroll = document.body.classList.contains('no-scroll');
  document.body.classList.add('no-scroll');

  // Handlers
  const saveBtn = popup.querySelector('.inline-place-save');

  // Cleanup utility
  const cleanup = () => {
    if (mapInstance && mapInstance.remove) {
      try { mapInstance.remove(); } catch (e) {}
      mapInstance = null;
    }
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
      const patch = { name: newName };
      if (selectedCoords && typeof selectedCoords.lat === 'number' && typeof selectedCoords.lng === 'number') {
        patch.coordinates = { lat: selectedCoords.lat, lng: selectedCoords.lng };
      }
      await updatePlaceModel(placeId, patch);
      // Update displayed label in the tag
      const nameEl = tagEl.querySelector('.place-tag-name');
      if (nameEl) nameEl.textContent = newName;
      cleanup();
    } catch (err) {
      console.error('Failed to update place', err);
    }
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
