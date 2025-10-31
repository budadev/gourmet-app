/* Place selector component - final complete implementation
   - Safe DOM guards
   - Map integration via createMap
   - Search box with clear button
   - Outside click hides results
   - Selecting a search result updates the input value
   - Exports: renderPlaceSelector, renderPlacesInDetails
*/

import { escapeHtml, el } from '../utils.js';
import { searchPlaces, getOrCreatePlace, addCurrentPlace, removeCurrentPlace, getCurrentPlaces, getPlaceById, updatePlace as updatePlaceModel, listAllPlaces } from '../models/places.js';
import { createMap } from './map.js';
import { MAPTILER_API_KEY } from '../config.js';
import { closeModal } from './modal.js';

const LAST_LOCATION_KEY = 'gourmet_last_location_v1';
function getLastLocation() {
    try {
        const raw = localStorage.getItem(LAST_LOCATION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Re-enable swipe gestures when popup closes
        if (window.enableSwipeGestures) window.enableSwipeGestures();
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
        html += `<div class="place-tag" data-place-id="${id}">`;
        html += `<span class="place-tag-icon" data-action="edit">📍</span>`;
        html += `<span class="place-tag-name" data-action="edit">${escapeHtml(place.name)}</span>`;
        html += `<button class="place-tag-remove" data-place-id="${id}" type="button">×</button>`;
        html += `</div>`;
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

async function openInlinePlaceEditor(tagEl, placeId) {
    // ensure only one editor at a time
    const existing = document.querySelector('.inline-place-backdrop'); if (existing) existing.remove();

    // Disable swipe gestures while popup is open
    if (window.disableSwipeGestures) window.disableSwipeGestures();

    const backdrop = document.createElement('div'); backdrop.className = 'inline-place-backdrop';
    const popup = document.createElement('div'); popup.className = 'inline-place-editor'; popup.setAttribute('data-place-id', placeId);

    // Prevent swipe/touch gestures from propagating to the document
    ['touchstart', 'touchmove', 'touchend'].forEach(evt => {
        backdrop.addEventListener(evt, function(e) { e.stopPropagation(); e.preventDefault(); }, { passive: false });
        popup.addEventListener(evt, function(e) { e.stopPropagation(); e.preventDefault(); }, { passive: false });
    });

    // Declare missing variables
    let mapInstance = null;
    let selectedCoords = null;
    let existingCoords = null;
    let mapWrapper = null;
    let mapLoading = null;
    let mapEl = null;
    let centerBtn = null;
    let coordsEl = null;
    let mapSearchInput = null;
    let mapSearchClear = null;
    let mapSearchResults = null;
    let outsideListeners = [];
    let nameInput = null;
    let saveBtn = null;

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
      <button class="inline-place-save btn primary">Save</button>
    </div>
  `;

    // Assign DOM elements after setting innerHTML
    mapWrapper = popup.querySelector('.inline-place-map-wrapper');
    mapLoading = popup.querySelector('.inline-place-map-loading');
    mapEl = popup.querySelector('.inline-place-map');
    centerBtn = document.createElement('button');
    centerBtn.type = 'button';
    centerBtn.className = 'inline-place-center-btn disabled';
    centerBtn.title = 'Center to your location';
    centerBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    mapEl.parentNode.appendChild(centerBtn);
    coordsEl = popup.querySelector('.inline-place-coords');
    mapSearchInput = popup.querySelector('.inline-place-map-search');
    mapSearchClear = popup.querySelector('.inline-place-map-search-clear');
    mapSearchResults = popup.querySelector('.inline-place-map-search-results');
    nameInput = popup.querySelector('.inline-place-input');
    saveBtn = popup.querySelector('.inline-place-save');

    // JS code must be outside the template string
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
        mapInstance.onMapClick((latlng) => {
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
                }, (err) => { try { centerBtn.classList.remove('loading'); centerBtn.classList.add('disabled'); } catch (e) {} }, { enableHighAccuracy: true, timeout: 10000 });
            } catch (e) { try { centerBtn.classList.remove('loading'); } catch (e) {} }
        }
    }

    if (mapLoading) mapLoading.style.display = 'none'; if (mapEl) mapEl.style.display = 'block'; try { mapInstance.map.invalidateSize(); } catch (e) {};
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
            await updatePlaceModel(placeId, patch);
            const nameEl = tagEl.querySelector('.place-tag-name'); if (nameEl) nameEl.textContent = newName;
            cleanup();
        } catch (e) { console.error('Failed to update place', e); }
    };

    if (saveBtn) saveBtn.addEventListener('click', onSave);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
}

export async function renderPlaceMapFilterModal(containerEl, onPlaceSelect) {
    if (!containerEl) return;
    // Disable swipe gestures while modal is open
    if (window.disableSwipeGestures) window.disableSwipeGestures();
    // Define non-linear radius steps (in meters)
    const radiusSteps = [100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 40000, 50000, 75000, 100000];
    containerEl.innerHTML = `
    <div id="place-map-filter-modal" class="place-map-filter-modal-backdrop" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:10000;"></div>
    <div class="place-map-filter-modal-content" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 4px 32px rgba(0,0,0,0.18);padding:24px 16px 16px 16px;z-index:10001;min-width:320px;max-width:95vw;max-height:90vh;overflow:auto;">
      <button class="place-map-filter-modal-close" style="position:absolute;top:8px;right:12px;font-size:22px;background:none;border:none;cursor:pointer;">×</button>
      <div class="place-map-filter-modal-title" style="font-size:1.2em;font-weight:600;margin-bottom:10px;">Select a Place on Map</div>
      <div class="place-search-wrapper" style="position:relative;">
        <input type="text" id="placeMapFilterSearchInput" class="place-search-input" placeholder="Search map (city, place, address)..." autocomplete="off" style="width:100%;margin-bottom:8px;" />
        <div class="place-search-results hidden" id="placeMapFilterSearchResults" style="position:absolute;left:0;right:0;top:40px;z-index:10010;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.10);max-height:180px;overflow-y:auto;"></div>
      </div>
      <div style="position:relative;width:100%;height:260px;margin-bottom:8px;">
        <div id="placeMapFilterMap" style="width:100%;height:260px;border-radius:10px;overflow:hidden;position:relative;z-index:1;"></div>
        <button class="place-map-filter-center-btn" title="Center to my location" style="position:absolute;bottom:12px;left:12px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.12);border:none;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:10;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
        </button>
      </div>
      <div id="placeMapFilterRadiusSliderWrapper" style="margin-bottom:16px;text-align:center;">
        <label for="placeMapFilterRadiusSlider" style="font-size:13px;color:#555;display:block;margin-bottom:2px;">Radius: <span id="placeMapFilterRadiusValue">1.00</span> km</label>
        <div style="position:relative;width:90%;max-width:340px;margin:0 auto;">
          <input type="range" id="placeMapFilterRadiusSlider" min="0" max="${radiusSteps.length-1}" step="1" value="6" style="width:100%;accent-color:#3b82f6;margin-left:-12px;margin-right:-12px;">
          <div id="radius-slider-labels" style="display:flex;justify-content:space-between;width:100%;font-size:12px;color:#888;margin-top:2px;pointer-events:none;">
            <span style="text-align:left;">0.1</span>
            <span>1</span>
            <span>10</span>
            <span style="text-align:right;">100 km</span>
          </div>
        </div>
      </div>
      <button id="placeMapFilterSelectAreaBtn" class="btn primary" style="width:100%;margin-top:8px;">Select Area</button>
    </div>
  `;

    // Setup map
    const mapEl = containerEl.querySelector('#placeMapFilterMap');
    const selectAreaBtn = containerEl.querySelector('#placeMapFilterSelectAreaBtn');
    const radiusSlider = containerEl.querySelector('#placeMapFilterRadiusSlider');
    const radiusValueEl = containerEl.querySelector('#placeMapFilterRadiusValue');
    const { createMap } = await import('./map.js');
    let mapInstance = null;
    let userLocation = null;
    let areaCenter = null;
    let areaRadius = radiusSteps[6]; // default 1000m
    let marker = null;

    async function centerToUser() {
        if (navigator.geolocation) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
                });
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (mapInstance) mapInstance.map.setView([userLocation.lat, userLocation.lng], 13);
            } catch (e) {}
        }
    }

    mapInstance = await createMap(mapEl, { zoom: 13 });
    await centerToUser();

    // Add pins for all saved locations
    try {
        const allPlaces = await listAllPlaces();
        console.log('[MapFilter] Places fetched for pins:', allPlaces);
        if (Array.isArray(allPlaces)) {
            allPlaces.forEach(place => {
                let lat = null, lng = null;
                if (place && typeof place.lat === 'number' && typeof place.lng === 'number') {
                    lat = place.lat;
                    lng = place.lng;
                } else if (place && place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') {
                    lat = place.coordinates.lat;
                    lng = place.coordinates.lng;
                }
                if (lat !== null && lng !== null) {
                    L.marker([lat, lng]).addTo(mapInstance.map);
                }
            });
        }
    } catch (e) {
        console.error('[MapFilter] Error adding place pins:', e);
    }

    // Area select: click to set center, draw circle
    mapInstance.onClick((latlng) => {
        areaCenter = { lat: latlng.lat, lng: latlng.lng };
        mapInstance.setCircle(areaCenter, areaRadius, { color: '#007aff', fillColor: '#007aff', fillOpacity: 0.15, interactive: true });
        updateAreaInfo();
    });

    // Allow resizing the circle by dragging its edge (optional, interactive: true)
    mapInstance.onCircleChange(({ center, radius }) => {
        areaCenter = { lat: center.lat, lng: center.lng };
        areaRadius = radius;
        updateAreaInfo();
    });

    // Update slider and value
    function updateAreaInfo() {
        // No coordinates/radius text shown anymore
        if (radiusValueEl) radiusValueEl.textContent = (areaRadius/1000).toFixed(2);
        if (radiusSlider) {
            // Find the closest index for the current areaRadius
            let idx = radiusSteps.findIndex(r => r >= areaRadius);
            if (idx === -1) idx = radiusSteps.length-1;
            if (Number(radiusSlider.value) !== idx) radiusSlider.value = idx;
        }
        // Enable/disable select button
        selectAreaBtn.disabled = !areaCenter;
    }
    updateAreaInfo();

    // Slider event: update radius in real time
    if (radiusSlider) {
        radiusSlider.addEventListener('input', (e) => {
            const idx = Number(e.target.value);
            areaRadius = radiusSteps[idx];
            if (areaCenter) mapInstance.setCircle(areaCenter, areaRadius, { color: '#007aff', fillColor: '#007aff', fillOpacity: 0.15, interactive: true });
            updateAreaInfo();
        });
    }

    // Place search logic (MapTiler/Leaflet search, same as edit popup)
    const searchInput = containerEl.querySelector('#placeMapFilterSearchInput');
    const searchResults = containerEl.querySelector('#placeMapFilterSearchResults');

    async function doMapSearch(query) {
        if (!query) {
            searchResults.classList.add('hidden');
            searchResults.innerHTML = '';
            return;
        }
        const { MAPTILER_API_KEY } = await import('../config.js');
        let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_API_KEY}&limit=6&language=en`;
        if (userLocation && userLocation.lat && userLocation.lng) {
            url += `&proximity=${userLocation.lng},${userLocation.lat}`;
        }
        let results = [];
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.features)) {
                    results = data.features;
                }
            }
        } catch (e) {}
        if (!results || results.length === 0) {
            searchResults.innerHTML = '<div class="place-search-empty">No results</div>';
            searchResults.classList.remove('hidden');
            return;
        }
        let html = '';
        for (const feature of results) {
            const name = feature.properties && (feature.properties.name || feature.properties.label || feature.place_name || '');
            const subtitle = feature.properties && (feature.properties.place_name_en || feature.properties.place_name || '');
            html += `<div class="place-search-item" data-lat="${feature.geometry.coordinates[1]}" data-lng="${feature.geometry.coordinates[0]}">`;
            html += `<span class="place-search-item-icon">📍</span>`;
            html += `<span class="place-search-item-name">${name}</span>`;
            if (subtitle && subtitle !== name) html += `<span class="place-search-item-sub">${subtitle}</span>`;
            html += `</div>`;
        }
        searchResults.innerHTML = html;
        searchResults.classList.remove('hidden');
        searchResults.querySelectorAll('.place-search-item').forEach(item => {
            item.onclick = async () => {
                const lat = parseFloat(item.getAttribute('data-lat'));
                const lng = parseFloat(item.getAttribute('data-lng'));
                if (!isNaN(lat) && !isNaN(lng)) {
                    mapInstance.map.setView([lat, lng], 15);
                    areaCenter = { lat, lng };
                    mapInstance.setCircle(areaCenter, areaRadius, { color: '#007aff', fillColor: '#007aff', fillOpacity: 0.15, interactive: true });
                    updateAreaInfo();
                }
                searchResults.classList.add('hidden');
            };
        });
    }

    searchInput.oninput = (e) => { doMapSearch(e.target.value.trim()); };
    searchInput.onfocus = (e) => { if (e.target.value.trim()) doMapSearch(e.target.value.trim()); };

    // Center button
    containerEl.querySelector('.place-map-filter-center-btn').onclick = async () => {
        await centerToUser();
    };

    // Select Area button logic
    selectAreaBtn.onclick = () => {
        if (areaCenter && typeof onPlaceSelect === 'function') {
            onPlaceSelect({ type: 'area', center: areaCenter, radius: areaRadius });
            // Close modal
            const modal = containerEl.querySelector('#place-map-filter-modal');
            if (modal && modal.parentNode) modal.parentNode.innerHTML = '';
            document.body.classList.remove('no-scroll');
        }
    };

    // --- Z-INDEX FIXES ---
    // Ensure dropdown overlays zoom controls
    const style = document.createElement('style');
    style.innerHTML = `
    #placeMapFilterMap .leaflet-control-zoom {
      z-index: 1 !important;
    }
    #placeMapFilterSearchResults {
      z-index: 10 !important;
      position: absolute !important;
      left: 0; right: 0;
      top: 40px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.10);
      max-height: 180px;
      overflow-y: auto;
    }
    .place-search-wrapper { position: relative !important; }
  `;
    containerEl.appendChild(style);

    // --- MODAL BACKDROP LOGIC ---
    // Prevent backdrop click from closing parent overlays
    const backdrop = containerEl.querySelector('.place-map-filter-modal-backdrop');
    if (backdrop) {
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                e.stopPropagation(); // Prevent bubbling to parent overlays
                // Remove modal from DOM
                containerEl.innerHTML = '';
                document.body.classList.remove('no-scroll');
                // Re-enable swipe gestures
                if (window.enableSwipeGestures) window.enableSwipeGestures();
            }
        };
    }
    // Add close button logic
    const closeBtn = containerEl.querySelector('.place-map-filter-modal-close');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.preventDefault();
            containerEl.innerHTML = '';
            document.body.classList.remove('no-scroll');
            // Re-enable swipe gestures
            if (window.enableSwipeGestures) window.enableSwipeGestures();
        };
    }

    // Also re-enable swipe gestures if modal is closed programmatically (e.g., after area select)
    const originalInnerHTML = containerEl.innerHTML;
    const observer = new MutationObserver(() => {
        if (containerEl.innerHTML === '' && window.enableSwipeGestures) window.enableSwipeGestures();
    });
    observer.observe(containerEl, { childList: true });

    // After setting innerHTML, adjust the slider labels for perfect alignment
    const sliderLabels = containerEl.querySelector('#radius-slider-labels');
    if (sliderLabels) {
        // Set flex-basis for each label to align with the slider's steps
        const labels = sliderLabels.querySelectorAll('span');
        if (labels.length === 4) {
            labels[0].style.flexBasis = '0%'; // min
            labels[1].style.flexBasis = '33%';
            labels[2].style.flexBasis = '33%';
            labels[3].style.flexBasis = '0%'; // max
            labels[0].style.textAlign = 'left';
            labels[3].style.textAlign = 'right';
        }
    }
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

    addBtn.addEventListener('click', async () => { const placeName = searchInput.value.trim(); if (!placeName) return; const placeId = await getOrCreatePlace(placeName); if (placeId) { addCurrentPlace(placeId); await renderSelectedPlaces(); searchInput.value = ''; addBtn.classList.add('hidden'); resultsContainer.classList.add('hidden'); } });
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
        html += `<span class="place-search-item-icon">📍</span>`;
        html += `<span class="place-search-item-name">${escapeHtml(place.name)}</span>`;
        if (isSelected) html += `<span class="place-search-item-check">✓</span>`;
        html += `</div>`;
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
        html += `<span class="place-tag-icon">📍</span>`;
        html += `<span class="place-tag-name">${escapeHtml(place.name)}</span>`;
        html += `</div>`;
    }
    html += '</div></div>';
    return html;
}
