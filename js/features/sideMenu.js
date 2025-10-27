/* =============================
   Side Menu Feature
   ============================= */

import { el } from '../utils.js';
import { listAll, addItem, updatePlace, getPlace } from '../db.js';
import { checkUpdateStatus, showUpdateBannerManually } from '../updateManager.js';
import { getAllPlaces, getPlacesUsageMap } from '../models/places.js';

let sideMenuOpen = false;
let aboutDialogOpen = false;

export function initSideMenu() {
  const hamburgerBtn = el('hamburgerBtn');
  const overlay = el('sideMenuOverlay');
  const aboutDialog = el('aboutDialog');
  const closeAboutBtn = el('closeAboutBtn');

  // Toggle menu
  hamburgerBtn.addEventListener('click', () => {
    toggleSideMenu();
  });

  // Close on overlay click
  overlay.addEventListener('click', () => {
    closeSideMenu();
  });

  // Menu item actions
  el('exportDataBtn').addEventListener('click', () => {
    exportData();
    closeSideMenu();
  });

  el('importDataBtn').addEventListener('click', () => {
    el('importFileInput').click();
  });

  el('importFileInput').addEventListener('change', (e) => {
    handleImportFile(e);
    closeSideMenu();
  });

  el('aboutBtn').addEventListener('click', () => {
    showAboutDialog();
    closeSideMenu();
  });

  el('configurationsBtn').addEventListener('click', () => {
    closeSideMenu();
    showConfigurations();
  });

  // Configurations modal
  el('backConfigurationsBtn').addEventListener('click', closeConfigurations);
  el('placesConfigBtn').addEventListener('click', () => {
    closeConfigurations();
    showPlaces();
  });

  // Places modal
  el('backPlacesBtn').addEventListener('click', closePlaces);

  // Place Editor modal
  el('backPlaceEditorBtn').addEventListener('click', closePlaceEditor);
  el('savePlaceBtn').addEventListener('click', savePlace);

  // About dialog
  closeAboutBtn.addEventListener('click', () => {
    closeAboutDialog();
  });

  aboutDialog.addEventListener('click', (e) => {
    if (e.target === aboutDialog) {
      closeAboutDialog();
    }
  });

  // Click outside modal to close
  [el('configurationsModal'), el('placesModal')].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    });
  });
}

function toggleSideMenu() {
  if (sideMenuOpen) {
    closeSideMenu();
  } else {
    openSideMenu();
  }
}

export function openSideMenu() {
  sideMenuOpen = true;
  el('sideMenuOverlay').classList.add('active');
  el('sideMenu').classList.add('active');
  el('hamburgerBtn').classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

export function closeSideMenu() {
  sideMenuOpen = false;
  el('sideMenuOverlay').classList.remove('active');
  el('sideMenu').classList.remove('active');
  el('hamburgerBtn').classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

async function exportData() {
  try {
    const items = await listAll();

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      appName: 'GourmetApp',
      itemCount: items.length,
      items: items
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `gourmetapp-export-${timestamp}.json`;

    // Detection for installed PWA / iOS standalone
    const isStandalone = (
      window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    ) || window.navigator.standalone === true; // iOS legacy

    let shared = false;

    if (isStandalone && navigator.share) {
      try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'GourmetApp Export',
            text: `Exported ${items.length} items on ${new Date().toLocaleString()}`
          });
          shared = true;
        } else {
            // Fallback: share raw JSON as text
            await navigator.share({
              title: 'GourmetApp Export',
              text: dataStr
            });
            shared = true;
        }
      } catch (shareErr) {
        if (shareErr && (shareErr.name === 'AbortError' || /abort/i.test(shareErr.message || ''))) {
          // User cancelled share sheet intentionally -> treat as success, no download fallback
          console.info('Share cancelled by user. Not falling back to download.');
          shared = true; // prevents fallback
        } else {
          console.warn('Share failed (non-cancel). Will fallback to download.', shareErr);
        }
      }
    }

    if (!shared) {
      // Traditional download fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Always show success (even if share cancelled) per requirement
    showNotification(`\u2713 Exported ${items.length} items successfully!`, 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('\u2717 Failed to export data', 'error');
  }
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset the input so the same file can be imported again if needed
  event.target.value = '';

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate the import data structure
    if (!importData.items || !Array.isArray(importData.items)) {
      throw new Error('Invalid import file format');
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Get existing items to check for duplicates by barcode
    const existingItems = await listAll();
    const existingBarcodes = new Set(
      existingItems
        .filter(item => item.barcode)
        .map(item => item.barcode)
    );

    for (const item of importData.items) {
      try {
        const { id, ...itemData } = item; // remove legacy id

        if (itemData.barcode && existingBarcodes.has(itemData.barcode)) {
          skipped++;
          continue;
        }

        await addItem(itemData);
        imported++;
        if (itemData.barcode) existingBarcodes.add(itemData.barcode);
      } catch (err) {
        console.error('Error importing item:', err);
        errors++;
      }
    }

    let message = `\u2713 Import complete!\n`;
    if (imported > 0) message += `Imported: ${imported} items\n`;
    if (skipped > 0) message += `Skipped (duplicates): ${skipped}\n`;
    if (errors > 0) message += `Errors: ${errors}`;

    showNotification(message, imported > 0 ? 'success' : 'warning');

    if (imported > 0) {
      window.dispatchEvent(new CustomEvent('data-imported'));
    }
  } catch (error) {
    console.error('Import error:', error);
    showNotification('\u2717 Failed to import data. Please check the file format.', 'error');
  }
}

function showAboutDialog() {
  aboutDialogOpen = true;
  const dialog = el('aboutDialog');
  dialog.classList.add('active');

  // Fetch version and check for updates
  fetch(`./version.json?t=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
      el('aboutVersion').textContent = `Version ${data.version}`;
      el('aboutReleaseDate').textContent = data.releaseDate || 'N/A';
    })
    .catch(() => {
      el('aboutVersion').textContent = 'Version N/A';
      el('aboutReleaseDate').textContent = 'N/A';
    });

  // Check for updates
  checkUpdateStatus().then(status => {
    const updateSection = el('aboutUpdateStatus');
    const updateText = el('aboutUpdateText');
    const updateButton = el('aboutUpdateButton');

    if (status.hasUpdate) {
      // Update available
      updateText.textContent = `Update available! Version ${status.latestVersion}`;
      updateButton.textContent = 'Check for Details';
      updateButton.style.display = 'inline-block';
      updateSection.classList.add('has-update');
      updateSection.classList.remove('up-to-date');

      // Remove old listener by cloning and replacing
      const newButton = updateButton.cloneNode(true);
      updateButton.parentNode.replaceChild(newButton, updateButton);

      // Add click handler to show update banner
      newButton.addEventListener('click', () => {
        closeAboutDialog();
        showUpdateBannerManually();
      });
    } else {
      // Up to date
      updateText.textContent = 'App is up to date';
      updateButton.style.display = 'none';
      updateSection.classList.add('up-to-date');
      updateSection.classList.remove('has-update');
    }
  }).catch(err => {
    console.error('Error checking update status:', err);
    const updateSection = el('aboutUpdateStatus');
    const updateText = el('aboutUpdateText');
    const updateButton = el('aboutUpdateButton');
    updateText.textContent = 'Unable to check for updates';
    updateButton.style.display = 'none';
  });

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function closeAboutDialog() {
  aboutDialogOpen = false;
  el('aboutDialog').classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

function showConfigurations() {
  const modal = el('configurationsModal');
  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function closeConfigurations() {
  const modal = el('configurationsModal');
  modal.classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

async function showPlaces() {
  const modal = el('placesModal');
  const content = el('placesContent');

  // Reset merge mode state
  el('placesFooter').style.display = 'none';

  // Load places
  const places = await getAllPlaces();
  const usageCounts = await getPlacesUsageMap();

  let currentPlaces = places; // Keep original for filtering
  let isMergeMode = false;
  let selectedPlaceId = null;

  function renderPlaces(filteredPlaces) {
    if (filteredPlaces.length === 0) {
      content.innerHTML = '<div class="muted" style="text-align: center; padding: 40px 20px;">No places found.</div>';
    } else {
      const placesHTML = filteredPlaces.map((place, index) => `
        <div class="places-list-item">
          <div class="places-list-item-content">
            <div class="places-list-item-name">${place.name}</div>
            <div class="places-list-item-usage">Used in ${usageCounts[place.id] || 0} items</div>
          </div>
          ${isMergeMode ?
            `<input type="checkbox" class="place-checkbox" data-place-id="${place.id}" ${place.id === selectedPlaceId ? 'checked' : ''}>` :
            `<button class="places-list-item-menu-btn" data-place-id="${place.id}" data-index="${index}" aria-label="Menu">⋯</button>
            <div class="places-list-item-menu" id="menu-${index}" style="display: none;">
              <button class="places-menu-option" data-action="merge" data-place-id="${place.id}">Merge place...</button>
              <button class="places-menu-option" data-action="edit" data-place-id="${place.id}">Edit</button>
            </div>`
          }
        </div>
      `).join('');
      content.innerHTML = `<div class="places-list">${placesHTML}</div>`;
    }

    // Add menu button listeners or checkbox listeners
    if (isMergeMode) {
      const checkboxes = content.querySelectorAll('.place-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', updateMergeButton);
      });
    } else {
      const menuBtns = content.querySelectorAll('.places-list-item-menu-btn');
      menuBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = btn.dataset.index;
          // Create a clean portal menu element appended to body so it's never clipped and listeners are local
          // Remove any existing portal menus
          document.querySelectorAll('.places-list-item-menu.portal').forEach(p => p.remove());

          // Build portal
          const origMenu = el(`menu-${index}`);
          const rect = btn.getBoundingClientRect();
          const portal = document.createElement('div');
          portal.className = 'places-list-item-menu portal';
          portal.style.position = 'fixed';
          portal.style.left = `${rect.right - 160}px`; // align right edge, fallback width 160
          portal.style.top = `${rect.bottom + 6}px`;
          portal.style.zIndex = '12000';
          portal.style.minWidth = '160px';
          portal.style.display = 'flex';
          portal.style.flexDirection = 'column';
          portal.innerHTML = `
            <button class="places-menu-option" data-action="merge" data-place-id="${btn.dataset.placeId}">Merge place...</button>
            <button class="places-menu-option" data-action="edit" data-place-id="${btn.dataset.placeId}">Edit</button>
          `;
          document.body.appendChild(portal);

          // Attach listeners
          portal.querySelectorAll('.places-menu-option').forEach(opt => {
            opt.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const action = opt.dataset.action;
              const placeId = opt.dataset.placeId;
              if (action === 'merge') {
                enterMergeMode(placeId);
              } else if (action === 'edit') {
                showPlaceEditor(placeId);
              }
              // remove portal
              portal.remove();
            });
          });

          // Close portal if clicking elsewhere
          const _closePortal = (ev) => {
            if (!portal.contains(ev.target) && ev.target !== btn) {
              portal.remove();
              document.removeEventListener('click', _closePortal, true);
            }
          };
          document.addEventListener('click', _closePortal, true);
        });
      });

      // Add direct click handlers to menu options to be robust against event propagation issues
      const menuOptions = content.querySelectorAll('.places-menu-option');
      menuOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          console.log('[Places] menu option clicked (direct)', opt.dataset.action, opt.dataset.placeId);
          const action = opt.dataset.action;
          const placeId = opt.dataset.placeId;
          if (action === 'merge') {
            enterMergeMode(placeId);
          } else if (action === 'edit') {
            showPlaceEditor(placeId);
          }
          // Hide menus
          content.querySelectorAll('.places-list-item-menu').forEach(m => m.style.display = 'none');
        });
      });
    }
  }

  function updateMergeButton() {
    const checkedBoxes = content.querySelectorAll('.place-checkbox:checked');
    const count = checkedBoxes.length;
    if (count === 0) {
      exitMergeMode();
    } else {
      const btn = el('mergePlacesBtn');
      btn.textContent = `Merge ${count} items`;
      btn.disabled = count < 2;
    }
  }

  function exitMergeMode() {
    isMergeMode = false;
    selectedPlaceId = null;
    el('placesFooter').style.display = 'none';
    renderPlaces(currentPlaces);
    // adjust modal-body padding when footer hidden
    updateModalBodyPadding();
  }

  function enterMergeMode(placeId) {
    isMergeMode = true;
    selectedPlaceId = parseInt(placeId); // Ensure it's a number
    el('placesFooter').style.display = 'block';
    renderPlaces(currentPlaces);
    updateMergeButton();
    // adjust modal-body padding to make room for footer
    updateModalBodyPadding();
  }

  // Helper: adjust modal body padding-bottom to account for placesFooter height
  const modalBody = modal.querySelector('.modal-body');
  const DEFAULT_BODY_PADDING_BOTTOM = 32; // matches modal.css modal-body padding-bottom
  function updateModalBodyPadding() {
    try {
      const footer = el('placesFooter');
      if (footer && footer.style.display !== 'none' && footer.offsetParent !== null) {
        const rect = footer.getBoundingClientRect();
        // Add small breathing space
        const extra = 8;
        modalBody.style.paddingBottom = (Math.ceil(rect.height) + extra) + 'px';
      } else {
        modalBody.style.paddingBottom = DEFAULT_BODY_PADDING_BOTTOM + 'px';
      }
    } catch (err) {
      // fallback: ensure base padding
      modalBody.style.paddingBottom = DEFAULT_BODY_PADDING_BOTTOM + 'px';
    }
  }

  renderPlaces(currentPlaces);

  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Ensure modal-body padding accounts for whether footer is visible initially
  updateModalBodyPadding();

  // Add search functionality
  const searchInput = el('placesSearchInput');
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    const filteredPlaces = places.filter(place => place.name.toLowerCase().includes(query));
    currentPlaces = filteredPlaces;
    renderPlaces(filteredPlaces);
  });

  // Add menu option listeners
  content.addEventListener('click', (e) => {
    // Use closest to handle clicks on inner elements (icons/text) inside the button
    const opt = e.target.closest && e.target.closest('.places-menu-option');
    if (opt && content.contains(opt)) {
      e.stopPropagation(); // prevent modal-level click handler from immediately closing the menu
      const action = opt.dataset.action;
      const placeId = opt.dataset.placeId;
      if (action === 'merge') {
        enterMergeMode(placeId);
      } else if (action === 'edit') {
        showPlaceEditor(placeId);
      }
      // Hide menu
      content.querySelectorAll('.places-list-item-menu').forEach(m => m.style.display = 'none');
    }
  });

  // Close menus when clicking outside
  modal.addEventListener('click', () => {
    content.querySelectorAll('.places-list-item-menu').forEach(m => {
      m.style.display = 'none';
      if (m._portal) { m._portal.remove(); m._portal = null; }
    });
  });

  // Capture-phase handler: ensure menu option clicks are processed before any modal-level bubble handlers
  function _placesMenuCaptureHandler(e) {
    const opt = e.target.closest && e.target.closest('.places-menu-option');
    if (opt && modal.contains(opt)) {
      // Intercept early to prevent modal click from closing menus
      e.stopPropagation();
      e.preventDefault();
      const action = opt.dataset.action;
      const placeId = opt.dataset.placeId;
      if (action === 'merge') {
        enterMergeMode(placeId);
      } else if (action === 'edit') {
        showPlaceEditor(placeId);
      }
      // Hide menus
      content.querySelectorAll('.places-list-item-menu').forEach(m => m.style.display = 'none');
    }
  }
  document.addEventListener('click', _placesMenuCaptureHandler, true);
  // Store handler for cleanup when modal is closed
  window._placesMenuCaptureHandler = _placesMenuCaptureHandler;
}

function closePlaces() {
  const modal = el('placesModal');
  modal.classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  // Reset modal body padding to default to avoid affecting other modals
  try {
    const mb = modal.querySelector('.modal-body');
    if (mb) mb.style.paddingBottom = '';
  } catch (err) {}
  // Clean up any moved menus and placeholders
  const menus = document.querySelectorAll('.places-list-item-menu');
  menus.forEach(m => {
    try {
      if (m._moved) {
        // restore to placeholder location
        if (m._placeholder && m._placeholder.parentNode) {
          m._placeholder.parentNode.replaceChild(m, m._placeholder);
        }
        m.style.position = '';
        m.style.left = '';
        m.style.top = '';
        m.style.zIndex = '';
        m.style.display = 'none';
        m._moved = false;
      }
      if (m._portal) {
        m._portal.remove();
        m._portal = null;
      }
    } catch (err) {
      // ignore cleanup errors
      console.warn('Error cleaning up place menu:', err);
    }
  });

  // Remove capture phase handler if added
  if (window._placesMenuCaptureHandler) {
    document.removeEventListener('click', window._placesMenuCaptureHandler, true);
    delete window._placesMenuCaptureHandler;
  }
}

async function showPlaceEditor(placeId) {
  const modal = el('placeEditorModal');
  modal.dataset.placeId = placeId;
  const place = await getPlace(parseInt(placeId));
  const hasCoords = !!place.coordinates;

  el('placeNameInput').value = place.name;
  el('placeLocationToggle').checked = hasCoords;

  const mapContainer = el('placeMapContainer');
  const mapElement = el('placeMap');

  let map;

  async function initMap(lat = 51.505, lng = -0.09, hasCoords = false) {
    // Clean up any previous Leaflet map instance if present
    try {
      if (window.marker && window.marker.remove) {
        window.marker.remove();
        window.marker = null;
      }
      if (window.placeMapInstance && window.placeMapInstance.remove) {
        window.placeMapInstance.remove();
        window.placeMapInstance = null;
      }
    } catch (err) { /* ignore cleanup errors */ }

    // Ensure Leaflet is available
    if (typeof L === 'undefined') {
      el('placeMapLoading').textContent = 'Map library unavailable.';
      el('placeMapLoading').style.display = 'block';
      el('placeMap').style.display = 'none';
      return;
    }

    // Initialize Leaflet map (use slightly lower initial zoom to reduce tile requests)
    map = L.map(mapElement, { center: [lat, lng], zoom: 12, zoomControl: true });

    // Determine tile URL: prefer MapTiler Bright if API key provided, otherwise fallback to Esri/OSM
    // Load MAPTILER_API_KEY from config module
    let apiKey = '';
    try {
      const cfg = await import('../config.js');
      apiKey = cfg.MAPTILER_API_KEY || '';
    } catch (err) {
      apiKey = '';
    }

    let tileUrl = '';
    let attribution = '';

    if (apiKey && apiKey.length > 8) {
      // MapTiler Bright raster tiles (MapTiler Cloud)
      // Use the documented raster endpoint. If you experience 403s, check the key and HTTP referrer restrictions in your MapTiler account.
      tileUrl = `https://api.maptiler.com/maps/bright/{z}/{x}/{y}.png?key=${apiKey}`;
      attribution = '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; OpenStreetMap contributors';
    } else {
      // Fallback to Esri World_Street_Map (no key required for light use)
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, NGA, USGS, Intermap, INCREMENT P, NRCan, METI, TomTom, and other contributors';
    }
    // Provider state for diagnostics and manual switching
    let currentProvider = (apiKey && apiKey.length > 8) ? 'MapTiler' : 'Esri';
    const providerBadgeEl = document.getElementById('placeMapProviderBadge');
    function updateProviderBadge() {
      if (!providerBadgeEl) return;
      providerBadgeEl.textContent = currentProvider;
      providerBadgeEl.style.opacity = '0.85';
      providerBadgeEl.style.padding = '4px 8px';
      providerBadgeEl.style.background = 'var(--bg-secondary)';
      providerBadgeEl.style.borderRadius = '999px';
      providerBadgeEl.style.fontWeight = '600';
      providerBadgeEl.style.cursor = 'pointer';
    }
    updateProviderBadge();

    // Allow user to click the badge to manually toggle provider (useful when automatic switching misfires)
    if (providerBadgeEl) {
      providerBadgeEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (currentProvider === 'MapTiler') {
          // switch to Esri
          addEsriFallback();
          currentProvider = 'Esri';
        } else {
          // attempt to switch back to MapTiler if key present
          if (apiKey && apiKey.length > 8) {
            try { if (window._currentTileLayer) window._currentTileLayer.remove(); } catch (e) {}
            const mtLayer = L.tileLayer(`https://api.maptiler.com/maps/bright/{z}/{x}/{y}.png?key=${apiKey}`, { attribution, maxZoom: 19, errorTileUrl: errorTile });
            mtLayer.addTo(map);
            window._currentTileLayer = mtLayer;
            currentProvider = 'MapTiler';
            showNotification('Switched to MapTiler (manual).', 'info');
          } else {
            showNotification('MapTiler key not configured. Add MAPTILER_API_KEY in js/config.js to use MapTiler.', 'warning');
          }
        }
        updateProviderBadge();
      });
    }

    // Provide a friendly error tile (small SVG) so tiles that fail are visually consistent instead of large grey blocks.
    const errorTile = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='#f3f4f6'/><text x='50%' y='50%' font-size='13' fill='#9ca3af' text-anchor='middle' dominant-baseline='central'>Tile unavailable</text></svg>`);

    // Create tile layer with conservative options to reduce retina/extra tile requests
    const tileLayer = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
      tileSize: 256,
      detectRetina: false,
      errorTileUrl: errorTile,
      // Performance-oriented options to reduce bandwidth & jitter on slow connections
      updateWhenIdle: true,       // wait until idle to update tiles
      updateWhenZooming: false,   // don't update tiles continuously while zooming
      reuseTiles: true,           // reuse tiles to reduce redraws
      keepBuffer: 1,              // number of extra rows/cols to keep beyond view
      crossOrigin: true           // request CORS headers (MapTiler supports CORS)
    });

    // Add basic resilience: if many tiles error (often due to API key restrictions), fall back to Esri
    let tileErrorCount = 0;
    const TILE_ERROR_THRESHOLD = 8;
    const resetTimerMs = 8000;

    function addEsriFallback() {
      try {
        tileLayer.remove();
      } catch (e) {}
      const esriUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      const esriAttr = 'Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, NGA, USGS, Intermap, INCREMENT P, NRCan, METI, TomTom, and other contributors';
      const esriLayer = L.tileLayer(esriUrl, { attribution: esriAttr, maxZoom: 19, errorTileUrl: errorTile });
      esriLayer.addTo(map);
      // Ensure map reflows in modal and show map area immediately
      try { map.invalidateSize(); } catch (e) {}
      el('placeMapLoading').style.display = 'none';
      el('placeMap').style.display = 'block';
      showNotification('Switched to fallback map provider (Esri). If you intended to use MapTiler, check your API key and referrer restrictions.', 'warning');
    }

    tileLayer.on('tileerror', (err) => {
      tileErrorCount++;
      // reset counter after a while
      clearTimeout(tileLayer._tileErrorResetTimer);
      tileLayer._tileErrorResetTimer = setTimeout(() => { tileErrorCount = 0; }, resetTimerMs);
      if (tileErrorCount >= TILE_ERROR_THRESHOLD) {
        console.warn('[Places] Map tile errors exceeded threshold, switching to fallback provider.');
        addEsriFallback();
      }
    });

    // When tiles finish loading, show the map area and ensure correct sizing inside modal
    tileLayer.on('load', () => {
      try { map.invalidateSize(); } catch (e) {}
      el('placeMapLoading').style.display = 'none';
      el('placeMap').style.display = 'block';
    });

    tileLayer.addTo(map);

    // SVG marker for Leaflet
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='28' height='40' viewBox='0 0 28 40'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='%238b5cf6'/><stop offset='1' stop-color='%2310b981'/></linearGradient></defs><path d='M14 0C8 0 4 4.5 4 9.5 4 16 14 34 14 34s10-18 10-24.5C24 4.5 20 0 14 0z' fill='url(%23g)'/><circle cx='14' cy='10' r='4.5' fill='white' opacity='0.95'/></svg>`;
    const icon = L.icon({
      iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
      iconSize: [28, 40],
      iconAnchor: [14, 40]
    });

    window.marker = L.marker([lat, lng], { icon }).addTo(map);

    map.on('click', (e) => {
      if (window.marker && window.marker.setLatLng) window.marker.setLatLng(e.latlng);
    });

    window.placeMapInstance = map;

     // Try to get current location only if no existing coordinates
     if (!hasCoords && navigator.geolocation) {
       navigator.geolocation.getCurrentPosition(
         (position) => {
           const currentLat = position.coords.latitude;
           const currentLng = position.coords.longitude;
           const pos = { lat: currentLat, lng: currentLng };
           if (window.placeMapInstance && window.placeMapInstance.setCenter) {
             window.placeMapInstance.setCenter(pos);
             window.placeMapInstance.setZoom(13);
           }
           if (window.marker && window.marker.setPosition) window.marker.setPosition(pos);
           // Hide loading and show map
           el('placeMapLoading').style.display = 'none';
           el('placeMap').style.display = 'block';
         },
         (error) => {
           console.log('Geolocation error:', error.message);
           // Hide loading and show map with initial position
           el('placeMapLoading').style.display = 'none';
           el('placeMap').style.display = 'block';
         },
         { enableHighAccuracy: true, timeout: 10000 }
       );
     } else {
       // No geolocation needed, show map immediately
       el('placeMapLoading').style.display = 'none';
       el('placeMap').style.display = 'block';
     }
  }

  function toggleMap() {
    if (el('placeLocationToggle').checked) {
      mapContainer.style.display = 'block';
      el('placeMapLoading').style.display = 'block';
      el('placeMap').style.display = 'none';
      if (!map) {
        const coords = place.coordinates;
        initMap(coords ? coords.lat : 51.505, coords ? coords.lng : -0.09, hasCoords);
      }
    } else {
      mapContainer.style.display = 'none';
    }
  }

  el('placeLocationToggle').addEventListener('change', toggleMap);
  toggleMap();

  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function closePlaceEditor() {
  const modal = el('placeEditorModal');
  modal.classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  // Clean up map instances (Leaflet or Google Maps)
  try {
    if (window.marker) {
      if (typeof window.marker.remove === 'function') {
        window.marker.remove();
      } else if (typeof window.marker.setMap === 'function') {
        window.marker.setMap(null);
      }
      window.marker = null;
    }
    if (window.placeMapInstance) {
      if (typeof window.placeMapInstance.remove === 'function') {
        try { window.placeMapInstance.remove(); } catch (e) {}
      }
      window.placeMapInstance = null;
    }
  } catch (err) {
    console.warn('Error cleaning up map:', err);
  }
   // Reopen places
   showPlaces();
 }

 async function savePlace() {
   const name = el('placeNameInput').value.trim();
   if (!name) return;

   const placeId = el('placeEditorModal').dataset.placeId; // Need to set this
   const hasLocation = el('placeLocationToggle').checked;
  let coordinates = null;
  if (hasLocation && window.marker) {
    try {
      if (typeof window.marker.getLatLng === 'function') {
        // Leaflet marker
        const p = window.marker.getLatLng();
        if (p) coordinates = { lat: p.lat, lng: p.lng };
      } else if (typeof window.marker.getPosition === 'function') {
        // Google Maps marker
        const p = window.marker.getPosition();
        if (p) coordinates = { lat: p.lat(), lng: p.lng() };
      }
    } catch (err) {
      coordinates = null;
    }
  }

   await updatePlace(parseInt(placeId), { name, coordinates: coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null });

   closePlaceEditor();
 }

function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? 'var(--accent)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
    color: white;
    padding: 16px 24px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    z-index: 10000;
    font-weight: 600;
    font-size: 14px;
    white-space: pre-line;
    text-align: center;
    max-width: 90%;
    animation: slideDown 0.3s ease-out;
  `;

  toast.textContent = message;
  document.body.appendChild(toast);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px);} to { opacity:1; transform: translateX(-50%) translateY(0);} }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => {
      document.body.removeChild(toast);
      document.head.removeChild(style);
    }, 300);
  }, 4000);
}
