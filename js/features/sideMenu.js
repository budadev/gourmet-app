/* =============================
   Side Menu Feature
   ============================= */

import { el } from '../utils.js';
import { listAll, addItem, updatePlace, getPlace } from '../db.js';
import { checkUpdateStatus, showUpdateBannerManually } from '../updateManager.js';
import { getAllPlaces, getPlacesUsageMap } from '../models/places.js';
import { exportAllData, importData } from '../dataManager.js';

let sideMenuOpen = false;
let aboutDialogOpen = false;

export function initSideMenu() {
  const hamburgerBtn = el('hamburgerBtn');
  const overlay = el('sideMenuOverlay');
  const aboutDialog = el('aboutDialog');
  const closeAboutBtn = el('closeAboutBtn');

  // Toggle menu
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => {
    toggleSideMenu();
  });

  // Close on overlay click
  if (overlay) overlay.addEventListener('click', () => {
    closeSideMenu();
  });

  // Menu item actions
  if (el('exportDataBtn')) el('exportDataBtn').addEventListener('click', () => {
    exportData();
    closeSideMenu();
  });

  if (el('importDataBtn')) el('importDataBtn').addEventListener('click', () => {
    el('importFileInput') && el('importFileInput').click();
  });

  if (el('importFileInput')) el('importFileInput').addEventListener('change', (e) => {
    handleImportFile(e);
    closeSideMenu();
  });

  if (el('aboutBtn')) el('aboutBtn').addEventListener('click', () => {
    showAboutDialog();
    closeSideMenu();
  });

  if (el('placesBtn')) el('placesBtn').addEventListener('click', () => {
    closeSideMenu();
    showPlaces();
  });

  // About dialog
  if (closeAboutBtn) closeAboutBtn.addEventListener('click', () => {
    closeAboutDialog();
  });

  if (aboutDialog) aboutDialog.addEventListener('click', (e) => {
    if (e.target === aboutDialog) {
      closeAboutDialog();
    }
  });

  // Click outside modal to close
  if (el('placesModal')) [el('placesModal')].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    });
  });

  // Places modal: toggle and navigation buttons
  const placesDefaultLocationToggle = el('placesDefaultLocationToggle');
  if (placesDefaultLocationToggle) {
    // Load saved setting
    const saved = localStorage.getItem('placesDefaultLocation') === 'true';
    placesDefaultLocationToggle.checked = saved;
    placesDefaultLocationToggle.addEventListener('change', () => {
      localStorage.setItem('placesDefaultLocation', placesDefaultLocationToggle.checked ? 'true' : 'false');
    });
  }

  const allPlacesBtn = el('allPlacesBtn');
  const placesNoCoordsBtn = el('placesNoCoordsBtn');
  const placesContent = el('placesContent');

  // Shared function to render search and list of places
  function renderPlacesList(places, container) {
    container.innerHTML = '';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search places...';
    searchInput.style = 'width:100%;padding:8px 12px;margin-bottom:12px;font-size:16px;box-sizing:border-box;border-radius:6px;border:1px solid #ccc;';
    container.appendChild(searchInput);

    const list = document.createElement('div');
    container.appendChild(list);

    function renderList(filtered) {
      list.innerHTML = '';
      if (!filtered.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">No places found.</div>';
        return;
      }
      filtered.forEach(place => {
        const item = document.createElement('div');
        item.textContent = place.name || '(Unnamed)';
        item.style = 'padding:10px 0;border-bottom:1px solid #eee;font-size:17px;';
        list.appendChild(item);
      });
    }

    renderList(places);
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      renderList(
        !q ? places : places.filter(p => (p.name || '').toLowerCase().includes(q))
      );
    });
  }

  if (allPlacesBtn) allPlacesBtn.addEventListener('click', async () => {
    if (placesContent) {
      placesContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';
      const { getAllPlaces } = await import('../models/places.js');
      const places = await getAllPlaces();
      renderPlacesList(places, placesContent);
    }
  });

  if (placesNoCoordsBtn) placesNoCoordsBtn.addEventListener('click', async () => {
    if (placesContent) {
      placesContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';
      const { getAllPlaces } = await import('../models/places.js');
      const places = await getAllPlaces();
      const noCoord = places.filter(p => !p.coordinates || typeof p.coordinates.lat !== 'number' || typeof p.coordinates.lng !== 'number');
      renderPlacesList(noCoord, placesContent);
    }
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
    // Use the new dynamic exportAllData
    await exportAllData();
    // The exportAllData function handles download/share and logging
  } catch (err) {
    showNotification('\u2717 Failed to export data', 'error');
    console.error('Export failed:', err);
  }
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset the input so the same file can be imported again if needed
  event.target.value = '';

  try {
    await importData(file); // Pass File directly for ZIP/JSON support
    showNotification('\u2713 Import complete! All tables and photos imported (ZIP/JSON).', 'success');
    window.dispatchEvent(new CustomEvent('data-imported'));
  } catch (error) {
    console.error('Import error:', error);
    showNotification('\u2717 Failed to import data. Please check the ZIP or JSON file format.', 'error');
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


async function showPlaces() {
  // Only open the modal; do not try to render the list directly
  const modal = el('placesModal');
  if (modal) {
    modal.classList.add('active');
  }
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
}

// === Merge Places Modal Logic ===
// Removed all merge modal logic
// =============================


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

    // Load MAPTILER_API_KEY from config module
    let apiKey = '';
    try {
      const cfg = await import('../config.js');
      apiKey = cfg.MAPTILER_API_KEY || '';
    } catch (err) {
      apiKey = '';
    }

    // Only MapTiler is supported now
    if (!apiKey || apiKey.length <= 8) {
      el('placeMapLoading').textContent = 'MapTiler API key not configured. Add MAPTILER_API_KEY in js/config.js.';
      el('placeMapLoading').style.display = 'block';
      el('placeMap').style.display = 'none';
      return;
    }

    const tileUrl = `https://api.maptiler.com/maps/bright/{z}/{x}/{y}.png?key=${apiKey}`;
    const attribution = '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; OpenStreetMap contributors';

    // Provide a friendly error tile (small SVG) so tiles that fail are visually consistent instead of large grey blocks.
    const errorTile = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='#f3f4f6'/><text x='50%' y='50%' font-size='13' fill='#9ca3af' text-anchor='middle' dominant-baseline='central'>Tile unavailable</text></svg>`);

    // Create tile layer with conservative options to reduce retina/extra tile requests
    const tileLayer = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
      tileSize: 256,
      detectRetina: false,
      errorTileUrl: errorTile,
      updateWhenIdle: true,
      updateWhenZooming: false,
      reuseTiles: true,
      keepBuffer: 1,
      crossOrigin: true
    });

    // When tiles finish loading, show the map area and ensure correct sizing inside modal
    tileLayer.on('load', () => {
      try { map.invalidateSize(); } catch (e) {}
      el('placeMapLoading').style.display = 'none';
      el('placeMap').style.display = 'block';
    });

    tileLayer.addTo(map);

    // SVG marker for Leaflet (solid pin, transparent head dot using mask)
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns='http://www.w3.org/2000/svg' width='32' height='44' viewBox='0 0 32 44'>
      <defs>
        <linearGradient id='pinGradient' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0%' stop-color='#ff3b30'/>
          <stop offset='100%' stop-color='#c80000'/>
        </linearGradient>
        <mask id='dotMask'>
          <rect width='32' height='44' fill='white'/>
          <circle cx='16' cy='14' r='6' fill='black'/>
        </mask>
      </defs>
      <path d='M16 2C9 2 4 7 4 14c0 9 12 28 12 28s12-19 12-28c0-7-5-12-12-12z' fill='url(%23pinGradient)' stroke='#222' stroke-width='2' mask='url(%23dotMask)'/>
      <circle cx='16' cy='14' r='6' fill='none' stroke='#222' stroke-width='2'/>
    </svg>`;
    const icon = L.icon({
      iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
      iconSize: [32, 44],
      iconAnchor: [16, 44]
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
