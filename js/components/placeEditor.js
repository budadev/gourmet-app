/* Place selector component - final complete implementation
   - Safe DOM guards
   - Map integration via createMap
   - Search box with clear button
   - Outside click hides results
   - Selecting a search result updates the input value
   - Exports: renderPlaceSelector, renderPlacesInDetails
*/

import { escapeHtml, el } from '../utils.js';
import { searchPlaces, getOrCreatePlace, addCurrentPlace, removeCurrentPlace, getCurrentPlaces, getPlaceById, updatePlace } from '../models/places.js';
import { deletePlace, listAll, updateItem } from '../db.js';
import { createMap } from './map.js';
import { MAPTILER_API_KEY } from '../config.js';

const LAST_LOCATION_KEY = 'gourmet_last_location_v1';
function getLastLocation() {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return { lat: parsed.lat, lng: parsed.lng };
  } catch (e) {}
  return null;
}
function setLastLocation(lat, lng) {
  try { if (typeof lat === 'number' && typeof lng === 'number') localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat, lng, ts: Date.now() })); } catch (e) {}
}

let placeSearchTimeout = null;

// Add this utility for the custom SVG pin icon
const customPinIcon = L.icon({
  iconUrl: '/icons/map-pin.svg',
  iconSize: [40, 40],
  iconAnchor: [16, 32],
});

export async function renderPlaceSelector(containerEl, currentPlaceIds = []) {
  if (!containerEl) return;
  const html = `
    <div class="place-selector-section">
      <label>Where did you have it?</label>
      <div class="place-search-wrapper">
        <input type="text" id="placeSearchInput" class="place-search-input" placeholder="Search or add a place..." autocomplete="off" />
        <button class="place-add-btn hidden" id="placeAddBtn" type="button" title="Add new place">+</button>
        <div class="place-search-results hidden" id="placeSearchResults"></div>
      </div>
      <div class="selected-places" id="selectedPlaces"></div>
    </div>`;
  containerEl.innerHTML = html;
  await renderSelectedPlaces(currentPlaceIds);
  setupPlaceSearchListeners();
}

async function renderSelectedPlaces(placeIds = getCurrentPlaces()) {
  const container = el('selectedPlaces');
  if (!container) return;
  if (!placeIds || placeIds.length === 0) {
    container.innerHTML = '<div class="empty-places">No places added yet</div>';
    return;
  }
  let html = '<div class="place-list">';
  for (const id of placeIds) {
    const place = await getPlaceById(id);
    if (!place) continue;

    // Check if this place is currently loading location
    const isLoading = place._loadingLocation === true;

    html += `<div class="place-tag ${isLoading ? 'loading-location' : ''}" data-place-id="${id}">`;
    html += '<span class="place-tag-icon" data-action="edit">📍</span>';
    html += `<span class="place-tag-name" data-action="edit">${escapeHtml(place.name)}</span>`;

    if (isLoading) {
      // Show spinner instead of remove button while loading
      html += '<span class="place-tag-spinner"></span>';
    } else {
      html += `<button class="place-tag-remove" data-place-id="${id}" type="button">×</button>`;
    }

    html += '</div>';
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

  container.querySelectorAll('.place-tag [data-action="edit"]').forEach(elm => {
    elm.addEventListener('click', (ev) => {
      const tag = ev.target.closest('.place-tag');
      if (!tag) return;
      const placeId = Number(tag.getAttribute('data-place-id'));
      openInlinePlaceEditor(tag, placeId);
    });
  });
}

export function openInlinePlaceEditor(tagEl, placeId, options = {}) {
  // ensure only one editor at a time
  const existing = document.querySelector('.inline-place-backdrop'); if (existing) existing.remove();

  const backdrop = document.createElement('div'); backdrop.className = 'inline-place-backdrop';
  const popup = document.createElement('div'); popup.className = 'inline-place-editor'; popup.setAttribute('data-place-id', placeId);

  popup.innerHTML = `
    <label class="inline-place-field-label">Place name</label>
    <input type="text" class="inline-place-input" />
    <label class="inline-place-map-title">Location</label>
    <div class="inline-place-map-search-wrapper">
      <input type="text" class="inline-place-map-search" placeholder="Search map (city, place, address)..." />
      <button type="button" class="inline-place-map-search-clear" aria-label="Clear">×</button>
      <div class="inline-place-map-search-results hidden"></div>
    </div>
    <div class="inline-place-map-wrapper" style="display:none;margin-top:0">
      <div class="inline-place-map-loading" style="text-align:center;padding:12px">Loading map...</div>
      <div class="inline-place-map" style="width:100%;height:220px;display:none;border-radius:10px;overflow:hidden"></div>
    </div>
    <div class="inline-place-coords" style="font-size:12px;color:var(--text-secondary);min-height:18px;margin-top:4px;display:none"></div>
    <div class="inline-place-actions ${options.showDelete ? 'has-multiple' : ''}" style="margin-top:8px">
      <button class="inline-place-save btn primary">Save</button>
      ${options.showDelete ? '<button class="inline-place-delete btn">Delete</button>' : ''}
    </div>
  `;

  backdrop.appendChild(popup);
  document.body.appendChild(backdrop);
  popup.style.position = 'relative'; popup.style.zIndex = 10002;

  const nameInput = popup.querySelector('.inline-place-input');
  const mapWrapper = popup.querySelector('.inline-place-map-wrapper');
  const mapLoading = popup.querySelector('.inline-place-map-loading');
  const mapEl = popup.querySelector('.inline-place-map');
  const mapSearchInput = popup.querySelector('.inline-place-map-search');
  const mapSearchResults = popup.querySelector('.inline-place-map-search-results');
  const mapSearchClear = popup.querySelector('.inline-place-map-search-clear');
  const coordsEl = popup.querySelector('.inline-place-coords');
  const saveBtn = popup.querySelector('.inline-place-save');
  const deleteBtn = popup.querySelector('.inline-place-delete');

  let mapInstance = null;
  let selectedCoords = null;
  const outsideListeners = [];

  const hideMapSearchResults = () => { if (mapSearchResults) mapSearchResults.classList.add('hidden'); };
  const showMapSearchResults = () => { if (mapSearchResults) mapSearchResults.classList.remove('hidden'); };

  if (mapWrapper) mapWrapper.style.display = 'block';
  if (mapLoading) { mapLoading.textContent = 'Click to load map'; mapLoading.style.display = 'block'; }
  if (mapEl) mapEl.style.display = 'none';

  const centerBtn = document.createElement('button');
  centerBtn.type = 'button';
  centerBtn.className = 'inline-place-center-btn disabled';
  centerBtn.title = 'Center to your location';
  centerBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
  try { if (mapWrapper) mapWrapper.appendChild(centerBtn); else popup.appendChild(centerBtn); } catch (e) {}

  const initMapIfNeeded = async (existingCoords) => {
    if (mapWrapper) mapWrapper.style.display = 'block';
    if (mapLoading) mapLoading.style.display = 'block';
    if (mapEl) mapEl.style.display = 'block';

    if (typeof L === 'undefined') {
      if (mapLoading) mapLoading.textContent = 'Map library unavailable.';
      return;
    }

    const lastLoc = !existingCoords ? getLastLocation() : null;
    const initialCenter = existingCoords ? [existingCoords.lat, existingCoords.lng] : (lastLoc ? [lastLoc.lat, lastLoc.lng] : undefined);

    mapInstance = await createMap(mapEl, { center: initialCenter, zoom: 12 });

    const geoAvailable = !!(navigator && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === 'function');
    if (geoAvailable) centerBtn.classList.remove('disabled'); else centerBtn.classList.add('disabled');

    // Try geolocation once for better search proximity if we don't already have a last location
    let geoRequested = false;

    const centerToUser = () => {
      if (!geoAvailable) return Promise.reject(new Error('Geolocation unavailable'));
      return new Promise((resolve, reject) => {
        let handled = false;
        const success = pos => { handled = true; resolve(pos); };
        const failure = err => { handled = true; reject(err); };
        try { navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true, timeout: 10000 }); } catch (e) { reject(e); }
        setTimeout(() => { if (!handled) reject(new Error('Geolocation timeout')); }, 11000);
      }).then(position => { const lat = position.coords.latitude; const lng = position.coords.longitude; try { mapInstance.map.setView([lat, lng], 13); } catch (e) {} setLastLocation(lat, lng); return { lat, lng }; });
    };

    centerBtn.onclick = () => {
      if (centerBtn.classList.contains('disabled') || centerBtn.classList.contains('loading')) return;
      centerBtn.classList.add('loading');
      centerToUser().then(() => {}).catch(() => { centerBtn.classList.add('disabled'); }).finally(() => { centerBtn.classList.remove('loading'); });
    };

    const doMapSearch = async (q) => {
      if (!q || !MAPTILER_API_KEY) return [];
      try {
        // Try to provide a proximity parameter to MapTiler so results are biased toward
        // the user's or map's current location. MapTiler expects proximity as lon,lat.
        let proximityParam = '';
        let bboxParam = '';
        try {
          const lastLoc = getLastLocation();
          if (lastLoc && typeof lastLoc.lat === 'number' && typeof lastLoc.lng === 'number') {
            proximityParam = `&proximity=${encodeURIComponent(lastLoc.lng)},${encodeURIComponent(lastLoc.lat)}`;
            // create a small bbox (~±0.15 degrees ~ ~15km) around last location to prioritize truly nearby results
            const delta = 0.15;
            const minLon = lastLoc.lng - delta;
            const minLat = lastLoc.lat - delta;
            const maxLon = lastLoc.lng + delta;
            const maxLat = lastLoc.lat + delta;
            bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
          } else if (mapInstance && mapInstance.map && typeof mapInstance.map.getCenter === 'function') {
            try {
              const c = mapInstance.map.getCenter();
              if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
                proximityParam = `&proximity=${encodeURIComponent(c.lng)},${encodeURIComponent(c.lat)}`;
                const delta = 0.15;
                const minLon = c.lng - delta;
                const minLat = c.lat - delta;
                const maxLon = c.lng + delta;
                const maxLat = c.lat + delta;
                bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
              }
            } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }

        // If still no proximity, attempt to request geolocation once (this may prompt the user).
        if (!proximityParam && !geoRequested && navigator && navigator.geolocation) {
          geoRequested = true;
          try {
            const pos = await new Promise((resolve) => {
              let handled = false;
              try {
                navigator.geolocation.getCurrentPosition((p) => { if (!handled) { handled = true; resolve(p); } }, () => { if (!handled) { handled = true; resolve(null); } }, { enableHighAccuracy: true, timeout: 5000 });
              } catch (e) { if (!handled) { handled = true; resolve(null); } }
              // fallback timeout to avoid waiting too long
              setTimeout(() => { if (!handled) { handled = true; resolve(null); } }, 5200);
            });
            if (pos && pos.coords) {
              const lat = pos.coords.latitude; const lng = pos.coords.longitude;
              setLastLocation(lat, lng);
              proximityParam = `&proximity=${encodeURIComponent(lng)},${encodeURIComponent(lat)}`;
              // also set bbox for stronger bias
              const delta = 0.15;
              const minLon = lng - delta; const minLat = lat - delta; const maxLon = lng + delta; const maxLat = lat + delta;
              bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
            }
          } catch (e) { /* ignore */ }
        }

        // Helper to map MapTiler features to our lighter result objects
        const mapFeatures = (features) => (features || []).map(f => ({
          id: f.properties && (f.properties.osm_id || f.id),
          title: f.properties && (f.properties.name || f.place_name || ''),
          subtitle: f.properties && (f.properties.place_name_en || f.properties.place_name || f.properties.label || ''),
          center: f.geometry && f.geometry.coordinates ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null
        }));

        // First, try local (proximity + bbox) search if we have any of those params
        let localResults = [];
        if (proximityParam || bboxParam) {
          const localUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_API_KEY}&limit=6${proximityParam}${bboxParam}&language=en`;
          try {
            const resLocal = await fetch(localUrl);
            if (resLocal && resLocal.ok) {
              const dataLocal = await resLocal.json();
              if (dataLocal && Array.isArray(dataLocal.features) && dataLocal.features.length > 0) {
                localResults = mapFeatures(dataLocal.features);
              }
            }
          } catch (e) { /* ignore local fetch errors and fall back to global */ }
        }

        // Always fetch global results so we can append worldwide options after local ones.
        const globalUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_API_KEY}&limit=8&language=en`;
        let globalResults = [];
        try {
          const resGlobal = await fetch(globalUrl);
          if (resGlobal && resGlobal.ok) {
            const dataGlobal = await resGlobal.json();
            if (dataGlobal && Array.isArray(dataGlobal.features) && dataGlobal.features.length > 0) {
              globalResults = mapFeatures(dataGlobal.features);
            }
          }
        } catch (e) { /* ignore global fetch errors */ }

        // If no local results, return global only (may be empty)
        if (!localResults || localResults.length === 0) return globalResults.slice(0, 6);

        // Otherwise merge local + deduped global (local first), limit to 6 results
        const merged = [];
        const addToMerged = (item) => {
          // simple dedupe by exact coords if available, otherwise by title+subtitle
          const exists = merged.some(m => {
            if (m.center && item.center && typeof m.center.lat === 'number' && typeof item.center.lat === 'number') {
              return m.center.lat === item.center.lat && m.center.lng === item.center.lng;
            }
            return (m.title && item.title && m.title === item.title && m.subtitle === item.subtitle);
          });
          if (!exists) merged.push(item);
        };
        for (const r of localResults) { if (merged.length >= 6) break; addToMerged(r); }
        for (const g of globalResults) { if (merged.length >= 6) break; addToMerged(g); }
        return merged;
      } catch (e) { return []; }
    };

    try {
      mapInstance.onClick((latlng) => {
        try { if (mapInstance && typeof mapInstance.setMarker === 'function') mapInstance.setMarker(latlng, { icon: customPinIcon, draggable: true }); } catch (e) {}
        selectedCoords = { lat: latlng.lat, lng: latlng.lng };
        if (coordsEl) { coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`; coordsEl.style.display = ''; }
      });

      // when marker is dragged, update selectedCoords
      try { if (mapInstance && typeof mapInstance.onMarkerDrag === 'function') {
        mapInstance.onMarkerDrag((latlng) => {
          try {
            if (!latlng) return;
            selectedCoords = { lat: latlng.lat, lng: latlng.lng };
            if (coordsEl) { coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`; coordsEl.style.display = ''; }
            setLastLocation(selectedCoords.lat, selectedCoords.lng);
          } catch (e) {}
        });
      } } catch (e) {}
    } catch (e) {}

    if (existingCoords && existingCoords.lat && existingCoords.lng) {
      try { mapInstance.setMarker([existingCoords.lat, existingCoords.lng], { icon: customPinIcon, draggable: true }); } catch (e) {}
      selectedCoords = { lat: existingCoords.lat, lng: existingCoords.lng };
      try { mapInstance.map.setView([existingCoords.lat, existingCoords.lng], 13); } catch (e) {}
      if (coordsEl) { coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`; coordsEl.style.display = ''; }
    } else {
      const last = getLastLocation();
      if (last) { try { mapInstance.map.setView([last.lat, last.lng], 12); } catch (e) {} }
      if (navigator && navigator.geolocation) {
        try {
          centerBtn.classList.add('loading');
          navigator.geolocation.getCurrentPosition((pos) => {
            try { centerBtn.classList.remove('loading'); const lat = pos.coords.latitude; const lng = pos.coords.longitude; try { mapInstance.map.setView([lat, lng], 13); } catch (e) {} setLastLocation(lat, lng); } catch (e) {}
          }, () => { try { centerBtn.classList.remove('loading'); centerBtn.classList.add('disabled'); } catch (e) {} }, { enableHighAccuracy: true, timeout: 10000 });
        } catch (e) { try { centerBtn.classList.remove('loading'); } catch (e) {} }
      }
    }

    if (mapLoading) mapLoading.style.display = 'none'; if (mapEl) mapEl.style.display = 'block'; try { mapInstance.map.invalidateSize(); } catch (e) {}
    setTimeout(() => { try { mapInstance.map.invalidateSize(); } catch (e) {} }, 250);

    // map search wiring
    if (mapSearchInput) {
      let searchTimer = null;
      mapSearchInput.addEventListener('input', (ev) => {
        const q = (ev.target.value || '').trim();
        if (searchTimer) clearTimeout(searchTimer);
        if (!q) { hideMapSearchResults(); if (mapSearchResults) mapSearchResults.innerHTML = ''; return; }
        searchTimer = setTimeout(async () => {
          if (!mapSearchResults) return;
          mapSearchResults.innerHTML = '<div class="result-item"><div class="ri-main">Searching...</div></div>';
          showMapSearchResults();
          const results = await doMapSearch(q);
          if (!results || results.length === 0) { mapSearchResults.innerHTML = '<div class="result-item"><div class="ri-main">No results</div></div>'; return; }
          mapSearchResults.innerHTML = results.map(r => `
            <div class="result-item" data-lat="${r.center ? r.center.lat : ''}" data-lng="${r.center ? r.center.lng : ''}">
              <div class="ri-main">
                <span class="ri-title">${escapeHtml(r.title || '')}</span>
                ${r.subtitle ? `<span class="ri-sub">${escapeHtml(r.subtitle)}</span>` : ''}
              </div>
            </div>
          `).join('');
          mapSearchResults.querySelectorAll('.result-item').forEach(item => {
            item.onclick = () => {
              const titleEl = item.querySelector('.ri-title');
              const title = titleEl ? (titleEl.textContent || '').trim() : '';
              try { mapSearchInput.value = title; } catch (e) {}
              const lat = parseFloat(item.getAttribute('data-lat'));
              const lng = parseFloat(item.getAttribute('data-lng'));
              if (!isNaN(lat) && !isNaN(lng)) {
                try { mapInstance.map.setView([lat, lng], 13); } catch (e) {}
                try { mapInstance.setMarker([lat, lng], { icon: customPinIcon, draggable: true }); } catch (e) {}
                selectedCoords = { lat, lng };
                if (coordsEl) { coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`; coordsEl.style.display = ''; }
                setLastLocation(lat, lng);
              }
              hideMapSearchResults();
            };
          });
        }, 350);
      });

      // focus-copy behavior: only copy when user focused directly
      let programmaticFocus = false;
      mapSearchInput.addEventListener('focus', () => {
        if (programmaticFocus) { programmaticFocus = false; return; }
        try { if (!mapSearchInput.value && nameInput && nameInput.value) { mapSearchInput.value = nameInput.value; mapSearchInput.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) {}
      });

      if (mapSearchClear) {
        mapSearchClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { mapSearchInput.value = ''; } catch (e) {}
          try { if (mapSearchResults) mapSearchResults.innerHTML = ''; } catch (e) {}
          hideMapSearchResults();
          programmaticFocus = true;
        });
      }

      const outsideHandler = (ev) => {
        try {
          const t = ev.target;
          if (mapSearchInput && mapSearchInput.contains(t)) return;
          if (mapSearchResults && mapSearchResults.contains(t)) return;
          hideMapSearchResults();
        } catch (e) {}
      };
      document.addEventListener('click', outsideHandler);
      outsideListeners.push(() => document.removeEventListener('click', outsideHandler));
    }
  };

  // load place and init map
  getPlaceById(placeId).then(place => {
    if (place && nameInput) nameInput.value = place.name || '';
    if (place && place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') initMapIfNeeded(place.coordinates);
    else initMapIfNeeded(null);
    setTimeout(() => { try { if (nameInput) { nameInput.focus(); if (typeof nameInput.setSelectionRange === 'function') { const len = nameInput.value ? nameInput.value.length : 0; nameInput.setSelectionRange(len, len); } } } catch (e) {} }, 10);
  }).catch(() => { initMapIfNeeded(null); });

  const previousBodyNoScroll = document.body.classList.contains('no-scroll'); document.body.classList.add('no-scroll');

  function cleanup() {
    try { if (mapInstance && mapInstance.remove) mapInstance.remove(); } catch (e) {}
    try { outsideListeners.forEach(fn => { try { fn(); } catch (e) {} }); } catch (e) {}
    try { if (mapInstance && typeof mapInstance.onMarkerDrag === 'function') mapInstance.onMarkerDrag(null); } catch (e) {}
    try { if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) {}
    try { if (!previousBodyNoScroll) document.body.classList.remove('no-scroll'); } catch (e) {}
    try { document.removeEventListener('keydown', onKeydown); } catch (e) {}
  }

  const onKeydown = (ev) => { if (ev.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', onKeydown);

  const onSave = async () => {
    const newName = nameInput ? nameInput.value.trim() : '';
    if (!newName) return;
    try {
      const patch = { name: newName };
      if (selectedCoords && typeof selectedCoords.lat === 'number' && typeof selectedCoords.lng === 'number') patch.coordinates = { lat: selectedCoords.lat, lng: selectedCoords.lng };
      await updatePlace(placeId, patch);
      const nameEl = tagEl.querySelector('.place-tag-name'); if (nameEl) nameEl.textContent = newName;
      // Dispatch event so other components can refresh
      window.dispatchEvent(new CustomEvent('place-updated', { detail: { placeId, patch } }));
      cleanup();
    } catch (e) { console.error('Failed to update place', e); }
  };

  const onDelete = async () => {
    if (!confirm('Are you sure you want to delete this place? This will also remove it from all items.')) return;

    try {
      // First, remove this place from all items that reference it
      const allItems = await listAll();
      const itemsToUpdate = allItems.filter(item => item.places && Array.isArray(item.places) && item.places.includes(placeId));

      // Update each item to remove this place
      for (const item of itemsToUpdate) {
        const updatedPlaces = item.places.filter(pid => pid !== placeId);
        await updateItem(item.id, { places: updatedPlaces });
      }

      // Now delete the place itself
      await deletePlace(placeId);

      // Dispatch event so other components can refresh
      window.dispatchEvent(new CustomEvent('place-deleted', { detail: { placeId } }));
      cleanup();
    } catch (e) {
      console.error('Failed to delete place', e);
      alert('Failed to delete place. Please try again.');
    }
  };

  if (saveBtn) saveBtn.addEventListener('click', onSave);
  if (deleteBtn) deleteBtn.addEventListener('click', onDelete);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
}

export function openCreatePlaceEditor() {
  // ensure only one editor at a time
  const existing = document.querySelector('.inline-place-backdrop'); if (existing) existing.remove();

  const backdrop = document.createElement('div'); backdrop.className = 'inline-place-backdrop';
  const popup = document.createElement('div'); popup.className = 'inline-place-editor';

  popup.innerHTML = `
    <label class="inline-place-field-label">Place name</label>
    <input type="text" class="inline-place-input" />
    <label class="inline-place-map-title">Location</label>
    <div class="inline-place-map-search-wrapper">
      <input type="text" class="inline-place-map-search" placeholder="Search map (city, place, address)..." />
      <button type="button" class="inline-place-map-search-clear" aria-label="Clear">×</button>
      <div class="inline-place-map-search-results hidden"></div>
    </div>
    <div class="inline-place-map-wrapper" style="display:none;margin-top:0">
      <div class="inline-place-map-loading" style="text-align:center;padding:12px">Loading map...</div>
      <div class="inline-place-map" style="width:100%;height:220px;display:none;border-radius:10px;overflow:hidden"></div>
    </div>
    <div class="inline-place-coords" style="font-size:12px;color:var(--text-secondary);min-height:18px;margin-top:4px;display:none"></div>
    <div class="inline-place-actions" style="display:block;margin-top:8px">
      <button class="inline-place-save btn primary">Create</button>
    </div>
  `;

  // Declare missing variables
  let mapInstance = null;
  let selectedCoords = null;
  let mapLoading = null;
  let mapEl = null;
  let coordsEl = null;
  let mapSearchInput = null;
  let mapSearchClear = null;
  let mapSearchResults = null;
  let outsideListeners = [];
  let nameInput = null;
  let saveBtn = null;
  let mapWrapper = null;

  // Assign DOM elements after setting innerHTML
  mapWrapper = popup.querySelector('.inline-place-map-wrapper');
  mapLoading = popup.querySelector('.inline-place-map-loading');
  mapEl = popup.querySelector('.inline-place-map');
  coordsEl = popup.querySelector('.inline-place-coords');
  mapSearchInput = popup.querySelector('.inline-place-map-search');
  mapSearchClear = popup.querySelector('.inline-place-map-search-clear');
  mapSearchResults = popup.querySelector('.inline-place-map-search-results');
  nameInput = popup.querySelector('.inline-place-input');
  saveBtn = popup.querySelector('.inline-place-save');

  backdrop.appendChild(popup);
  document.body.appendChild(backdrop);

  let geoRequested = false; // Track if we've requested geolocation to avoid multiple prompts

  const doMapSearch = async (q) => {
    if (!q || !MAPTILER_API_KEY) return [];
    try {
      let proximityParam = '';
      let bboxParam = '';
      try {
        const lastLoc = getLastLocation();
        if (lastLoc && typeof lastLoc.lat === 'number' && typeof lastLoc.lng === 'number') {
          proximityParam = `&proximity=${encodeURIComponent(lastLoc.lng)},${encodeURIComponent(lastLoc.lat)}`;
          const delta = 0.15;
          const minLon = lastLoc.lng - delta;
          const minLat = lastLoc.lat - delta;
          const maxLon = lastLoc.lng + delta;
          const maxLat = lastLoc.lat + delta;
          bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
        } else if (mapInstance && mapInstance.map && typeof mapInstance.map.getCenter === 'function') {
          try {
            const c = mapInstance.map.getCenter();
            if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
              proximityParam = `&proximity=${encodeURIComponent(c.lng)},${encodeURIComponent(c.lat)}`;
              const delta = 0.15;
              const minLon = c.lng - delta;
              const minLat = c.lat - delta;
              const maxLon = c.lng + delta;
              const maxLat = c.lat + delta;
              bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      if (!proximityParam && !geoRequested && navigator && navigator.geolocation) {
        geoRequested = true;
        try {
          const pos = await new Promise((resolve) => {
            let handled = false;
            try {
              navigator.geolocation.getCurrentPosition((p) => { if (!handled) { handled = true; resolve(p); } }, () => { if (!handled) { handled = true; resolve(null); } }, { enableHighAccuracy: true, timeout: 5000 });
            } catch (e) { if (!handled) { handled = true; resolve(null); } }
            setTimeout(() => { if (!handled) { handled = true; resolve(null); } }, 5200);
          });
          if (pos && pos.coords) {
            const lat = pos.coords.latitude; const lng = pos.coords.longitude;
            setLastLocation(lat, lng);
            proximityParam = `&proximity=${encodeURIComponent(lng)},${encodeURIComponent(lat)}`;
            const delta = 0.15;
            const minLon = lng - delta; const minLat = lat - delta; const maxLon = lng + delta; const maxLat = lat + delta;
            bboxParam = `&bbox=${encodeURIComponent(minLon)},${encodeURIComponent(minLat)},${encodeURIComponent(maxLon)},${encodeURIComponent(maxLat)}`;
          }
        } catch (e) { /* ignore */ }
      }

      const mapFeatures = (features) => (features || []).map(f => ({
        id: f.properties && (f.properties.osm_id || f.id),
        title: f.properties && (f.properties.name || f.place_name || ''),
        subtitle: f.properties && (f.properties.place_name_en || f.properties.place_name || f.properties.label || ''),
        center: f.center && f.center.length === 2 ? { lng: f.center[0], lat: f.center[1] } : null
      }));

      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_API_KEY}&limit=5${proximityParam}${bboxParam}`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return mapFeatures(data.features || []);
    } catch (err) {
      console.error('Map search error:', err);
      return [];
    }
  };

  const initMapIfNeeded = async () => {
    if (mapInstance) {
      return;
    }

    if (!mapEl || !mapWrapper) {
      return;
    }

    mapWrapper.style.display = 'block';
    if (mapLoading) mapLoading.style.display = 'block';
    if (mapEl) mapEl.style.display = 'none';

    // For create place, center on last location or default, but DON'T set selectedCoords initially
    const coords = getLastLocation() || { lat: 51.505, lng: -0.09 };
    selectedCoords = null; // No coordinates selected initially

    try {
      // Use correct createMap signature: createMap(container, opts)
      mapInstance = await createMap(mapEl, {
        center: [coords.lat, coords.lng],
        zoom: 13,
        apiKey: MAPTILER_API_KEY
      });

      if (mapLoading) mapLoading.style.display = 'none';
      if (mapEl) mapEl.style.display = 'block';

      // DON'T set marker initially - show instruction instead
      if (coordsEl) { coordsEl.textContent = 'Click map or search to set location'; coordsEl.style.display = ''; }

      // Create and add center button
      const centerBtn = document.createElement('button');
      centerBtn.type = 'button';
      centerBtn.className = 'inline-place-center-btn';
      centerBtn.title = 'Center to your location';
      centerBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';

      // Check if geolocation is available
      const geoAvailable = !!(navigator && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === 'function');
      if (!geoAvailable) centerBtn.classList.add('disabled');

      try { if (mapWrapper) mapWrapper.appendChild(centerBtn); else popup.appendChild(centerBtn); } catch (e) {}

      // Center button click handler
      centerBtn.onclick = () => {
        if (!geoAvailable || centerBtn.classList.contains('disabled') || centerBtn.classList.contains('loading')) return;
        centerBtn.classList.add('loading');

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            try {
              mapInstance.map.setView([lat, lng], 13);
              setLastLocation(lat, lng);
            } catch (e) {}
            centerBtn.classList.remove('loading');
          },
          (error) => {
            console.warn('Geolocation error:', error.message);
            centerBtn.classList.add('disabled');
            centerBtn.classList.remove('loading');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };

      // Set up click handler to add/move marker
      mapInstance.onClick((latlng) => {
        selectedCoords = latlng;
        mapInstance.setMarker([latlng.lat, latlng.lng], { icon: customPinIcon, draggable: true });
        if (coordsEl) { coordsEl.textContent = `Selected: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; coordsEl.style.display = ''; }
        setLastLocation(latlng.lat, latlng.lng);
      });

      // Set up drag handler for when marker is moved
      mapInstance.onMarkerDrag((latlng) => {
        selectedCoords = latlng;
        if (coordsEl) coordsEl.textContent = `Selected: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
        setLastLocation(latlng.lat, latlng.lng);
      });

      // Try to get current location and recenter map automatically
      if (geoAvailable) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            try {
              mapInstance.map.setView([lat, lng], 13);
              setLastLocation(lat, lng);
            } catch (e) {}
          },
          (error) => {
            console.log('Initial geolocation failed:', error.message);
            // Not a critical error, just continue with last known location
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }

    } catch (err) {
      if (mapLoading) { mapLoading.textContent = 'Map failed to load.'; mapLoading.style.display = 'block'; }
      if (mapEl) mapEl.style.display = 'none';
    }

    // Map search handlers (same as edit version)
    if (mapSearchInput && mapSearchResults && mapSearchClear) {
      let searchTimer = null;
      const hideMapSearchResults = () => { try { if (mapSearchResults) mapSearchResults.classList.add('hidden'); } catch (e) {} };
      const showMapSearchResults = () => { try { if (mapSearchResults) mapSearchResults.classList.remove('hidden'); } catch (e) {} };

      mapSearchInput.addEventListener('input', () => {
        const q = (mapSearchInput.value || '').trim();
        if (searchTimer) clearTimeout(searchTimer);
        if (!q) { hideMapSearchResults(); if (mapSearchResults) mapSearchResults.innerHTML = ''; return; }
        searchTimer = setTimeout(async () => {
          if (!mapSearchResults) return;
          mapSearchResults.innerHTML = '<div class="result-item"><div class="ri-main">Searching...</div></div>';
          showMapSearchResults();
          const results = await doMapSearch(q);
          if (!results || results.length === 0) { mapSearchResults.innerHTML = '<div class="result-item"><div class="ri-main">No results</div></div>'; return; }
          mapSearchResults.innerHTML = results.map(r => `
            <div class="result-item" data-lat="${r.center ? r.center.lat : ''}" data-lng="${r.center ? r.center.lng : ''}">
              <div class="ri-main">
                <span class="ri-title">${escapeHtml(r.title || '')}</span>
                ${r.subtitle ? `<span class="ri-sub">${escapeHtml(r.subtitle)}</span>` : ''}
              </div>
            </div>
          `).join('');
          mapSearchResults.querySelectorAll('.result-item').forEach(item => {
            item.onclick = () => {
              const titleEl = item.querySelector('.ri-title');
              const title = titleEl ? (titleEl.textContent || '').trim() : '';
              try { mapSearchInput.value = title; } catch (e) {}
              const lat = parseFloat(item.getAttribute('data-lat'));
              const lng = parseFloat(item.getAttribute('data-lng'));
              if (!isNaN(lat) && !isNaN(lng)) {
                try { mapInstance.map.setView([lat, lng], 13); } catch (e) {}
                try { mapInstance.setMarker([lat, lng], { icon: customPinIcon, draggable: true }); } catch (e) {}
                selectedCoords = { lat, lng };
                if (coordsEl) { coordsEl.textContent = `Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`; coordsEl.style.display = ''; }
                setLastLocation(lat, lng);
              }
              hideMapSearchResults();
            };
          });
        }, 350);
      });

      let programmaticFocus = false;
      mapSearchInput.addEventListener('focus', () => {
        if (programmaticFocus) { programmaticFocus = false; return; }
        try { if (!mapSearchInput.value && nameInput && nameInput.value) { mapSearchInput.value = nameInput.value; mapSearchInput.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) {}
      });

      if (mapSearchClear) {
        mapSearchClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { mapSearchInput.value = ''; } catch (e) {}
          try { if (mapSearchResults) mapSearchResults.innerHTML = ''; } catch (e) {}
          hideMapSearchResults();
          programmaticFocus = true;
        });
      }

      const outsideHandler = (ev) => {
        try {
          const t = ev.target;
          if (mapSearchInput && mapSearchInput.contains(t)) return;
          if (mapSearchResults && mapSearchResults.contains(t)) return;
          hideMapSearchResults();
        } catch (e) {}
      };
      document.addEventListener('click', outsideHandler);
      outsideListeners.push(() => document.removeEventListener('click', outsideHandler));
    }
  };

  // Initialize map after DOM is ready
  setTimeout(() => {
    initMapIfNeeded(null);
    try { if (nameInput) { nameInput.focus(); } } catch (e) {}
  }, 10);

  const previousBodyNoScroll = document.body.classList.contains('no-scroll'); document.body.classList.add('no-scroll');

  function cleanup() {
    try { if (mapInstance && mapInstance.remove) mapInstance.remove(); } catch (e) {}
    try { outsideListeners.forEach(fn => { try { fn(); } catch (e) {} }); } catch (e) {}
    try { if (mapInstance && typeof mapInstance.onMarkerDrag === 'function') mapInstance.onMarkerDrag(null); } catch (e) {}
    try { if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) {}
    try { if (!previousBodyNoScroll) document.body.classList.remove('no-scroll'); } catch (e) {}
    try { document.removeEventListener('keydown', onKeydown); } catch (e) {}
  }

  const onKeydown = (ev) => { if (ev.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', onKeydown);

  const onSave = async () => {
    const newName = nameInput ? nameInput.value.trim() : '';
    if (!newName) return;
    try {
      const placeData = { name: newName };
      if (selectedCoords && typeof selectedCoords.lat === 'number' && typeof selectedCoords.lng === 'number') {
        placeData.coordinates = { lat: selectedCoords.lat, lng: selectedCoords.lng };
      }

      // Create new place using addPlace from db
      const { addPlace } = await import('../db.js');
      const newPlaceId = await addPlace(placeData);

      // Dispatch event so other components can refresh
      window.dispatchEvent(new CustomEvent('place-created', { detail: { placeId: newPlaceId, place: placeData } }));

      cleanup();
    } catch (e) { console.error('Failed to create place', e); }
  };

  if (saveBtn) saveBtn.addEventListener('click', onSave);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
}

function setupPlaceSearchListeners() {
  const searchInput = el('placeSearchInput'); const addBtn = el('placeAddBtn'); const resultsContainer = el('placeSearchResults');
  if (!searchInput || !addBtn || !resultsContainer) return;

  searchInput.addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if (placeSearchTimeout) clearTimeout(placeSearchTimeout);
    if (!q) { resultsContainer.classList.add('hidden'); addBtn.classList.add('hidden'); return; }
    placeSearchTimeout = setTimeout(async () => { const results = await searchPlaces(q); renderSearchResults(results, q); }, 300);
  });

  searchInput.addEventListener('focus', async (e) => { const q = e.target.value.trim(); if (q) { const results = await searchPlaces(q); renderSearchResults(results, q); } });

  const outsideHandler = (e) => { if (!e.target.closest('.place-search-wrapper') && !e.target.closest('.place-search-results')) resultsContainer.classList.add('hidden'); };
  document.addEventListener('click', outsideHandler);

  addBtn.addEventListener('click', async () => {
    const placeName = searchInput.value.trim();
    if (!placeName) return;

    const result = await getOrCreatePlace(placeName);
    if (result) {
      const placeId = result.placeId || result; // Handle both old format (just ID) and new format ({placeId, loadingLocation})
      const loadingLocation = result.loadingLocation || false;

      addCurrentPlace(placeId);

      // Mark place as loading if location is being fetched
      if (loadingLocation) {
        const place = await getPlaceById(placeId);
        if (place) {
          place._loadingLocation = true;
          await updatePlace(placeId, place); // Store the loading state
        }
      }

      await renderSelectedPlaces();
      searchInput.value = '';
      addBtn.classList.add('hidden');
      resultsContainer.classList.add('hidden');
    }
  });

  // Listen for location update events to refresh the UI
  const locationUpdateHandler = async (event) => {
    if (event.detail && event.detail.placeId) {
      const place = await getPlaceById(event.detail.placeId);
      if (place) {
        place._loadingLocation = false;
        await updatePlace(event.detail.placeId, place);
        await renderSelectedPlaces();
      }
    }
  };

  window.addEventListener('place-location-updated', locationUpdateHandler);
  window.addEventListener('place-location-failed', locationUpdateHandler);
}

async function renderSearchResults(results, query) {
  const resultsContainer = el('placeSearchResults'); const addBtn = el('placeAddBtn'); if (!resultsContainer || !addBtn) return;
  const exactMatch = (results || []).find(p => p.name && p.name.toLowerCase() === (query || '').toLowerCase());
  if (!results || results.length === 0 || !exactMatch) addBtn.classList.remove('hidden'); else addBtn.classList.add('hidden');
  if (!results || results.length === 0) { resultsContainer.innerHTML = '<div class="place-search-empty">Type to add a new place</div>'; resultsContainer.classList.remove('hidden'); return; }
  let html = '';
  for (const place of results) {
    const isSelected = getCurrentPlaces().includes(place.id);
    html += `<div class="place-search-item ${isSelected ? 'selected' : ''}" data-place-id="${place.id}">`;
    html += '<span class="place-search-item-icon">📍</span>';
    html += `<span class="place-search-item-name">${escapeHtml(place.name)}</span>`;
    if (isSelected) html += '<span class="place-search-item-check">✓</span>';
    html += '</div>';
  }
  resultsContainer.innerHTML = html; resultsContainer.classList.remove('hidden');
  resultsContainer.querySelectorAll('.place-search-item').forEach(item => {
    item.addEventListener('click', async () => {
      const placeId = Number(item.getAttribute('data-place-id'));
      const isSelected = getCurrentPlaces().includes(placeId);
      if (isSelected) removeCurrentPlace(placeId); else addCurrentPlace(placeId);
      await renderSelectedPlaces();
      const searchInput = el('placeSearchInput'); if (searchInput) searchInput.value = '';
      resultsContainer.classList.add('hidden'); addBtn.classList.add('hidden');
    });
  });
}

export async function renderPlacesInDetails(placeIds) {
  if (!placeIds || placeIds.length === 0) return '';
  let html = '<div class="detail-row">';
  html += '<div class="detail-label">Places</div>';
  html += '<div class="detail-value">';
  for (const placeId of placeIds) {
    const place = await getPlaceById(placeId);
    if (!place) continue;
    // Render as a simple clickable badge, no remove button or edit actions
    html += `<div class="place-tag clickable" data-place-id="${placeId}">`;
    html += '<span class="place-tag-icon">📍</span>';
    html += `<span class="place-tag-name">${escapeHtml(place.name)}</span>`;
    html += '</div>';
  }
  html += '</div></div>';
  return html;
}
