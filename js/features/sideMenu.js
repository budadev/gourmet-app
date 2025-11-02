/* =============================
   Side Menu Feature
   ============================= */

import { el, escapeHtml } from '../utils.js';
import { checkUpdateStatus, showUpdateBannerManually } from '../updateManager.js';
import { exportAllData, importData } from '../dataManager.js';
import { openInlinePlaceEditor, openCreatePlaceEditor } from '../components/placeEditor.js';

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

  // Click outside modals to close - All Places and Places Without Coords
  [el('allPlacesModal'), el('placesNoCoordsModal')].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
        }
      });
    }
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
  const createPlaceBtn = el('createPlaceBtn');
  const allPlacesContent = el('allPlacesContent');
  const placesNoCoordsContent = el('placesNoCoordsContent');
  const backAllPlacesBtn = el('backAllPlacesBtn');
  const backPlacesNoCoordsBtn = el('backPlacesNoCoordsBtn');

  // Create Place button handler
  if (createPlaceBtn) createPlaceBtn.addEventListener('click', () => {
    openCreatePlaceEditor();
  });

  // Functions to refresh the lists
  async function refreshAllPlacesList() {
    if (!allPlacesContent) return;
    const allPlacesModal = el('allPlacesModal');
    if (!allPlacesModal || !allPlacesModal.classList.contains('active')) return;

    allPlacesContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';
    const { getAllPlaces } = await import('../models/places.js');
    const places = await getAllPlaces();
    renderPlacesList(places, allPlacesContent);
  }

  async function refreshPlacesNoCoordssList() {
    if (!placesNoCoordsContent) return;
    const placesNoCoordsModal = el('placesNoCoordsModal');
    if (!placesNoCoordsModal || !placesNoCoordsModal.classList.contains('active')) return;

    placesNoCoordsContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';
    const { getAllPlaces } = await import('../models/places.js');
    const places = await getAllPlaces();
    const noCoord = places.filter(p => !p.coordinates || typeof p.coordinates.lat !== 'number' || typeof p.coordinates.lng !== 'number');
    renderPlacesList(noCoord, placesNoCoordsContent);
  }

  // Listen for place updates and refresh the appropriate list
  window.addEventListener('place-updated', async () => {
    await refreshAllPlacesList();
    await refreshPlacesNoCoordssList();
  });

  // Listen for place created and refresh lists
  window.addEventListener('place-created', async () => {
    await refreshAllPlacesList();
    await refreshPlacesNoCoordssList();
  });

  // Listen for place deleted and refresh lists
  window.addEventListener('place-deleted', async () => {
    await refreshAllPlacesList();
    await refreshPlacesNoCoordssList();
  });

  // Shared function to render search and list of places
  function renderPlacesList(places, container) {
    container.innerHTML = '';

    // Sort places alphabetically by name
    const sortedPlaces = [...places].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search places...';
    searchInput.className = 'place-search-input';
    searchInput.style = 'width:100%;margin-bottom:16px;';
    container.appendChild(searchInput);

    const list = document.createElement('div');
    list.className = 'list';
    container.appendChild(list);

    function renderList(filtered) {
      list.innerHTML = '';
      if (!filtered.length) {
        list.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);font-size:15px;">No places found.</div>';
        return;
      }
      filtered.forEach(place => {
        const item = document.createElement('button');
        item.className = 'list-item';
        item.setAttribute('data-place-id', place.id);
        item.type = 'button';

        item.innerHTML = `
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(place.name || '(Unnamed)')}</div>
          </div>
          <div class="list-item-arrow">›</div>
        `;

        // Add click handler to open the place editor
        item.addEventListener('click', () => {
          openInlinePlaceEditor(item, place.id, { showDelete: true });
        });

        list.appendChild(item);
      });
    }

    renderList(sortedPlaces);
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = !q ? sortedPlaces : sortedPlaces.filter(p => (p.name || '').toLowerCase().includes(q));
      renderList(filtered);
    });
  }

  if (allPlacesBtn) allPlacesBtn.addEventListener('click', async () => {
    if (allPlacesContent) {
      // Open the all places modal
      el('allPlacesModal').classList.add('active');
      await refreshAllPlacesList();
    }
  });

  if (placesNoCoordsBtn) placesNoCoordsBtn.addEventListener('click', async () => {
    if (placesNoCoordsContent) {
      // Open the places without coords modal
      el('placesNoCoordsModal').classList.add('active');
      await refreshPlacesNoCoordssList();
    }
  });

  // Back button handlers for places modals
  if (backAllPlacesBtn) backAllPlacesBtn.addEventListener('click', () => {
    el('allPlacesModal').classList.remove('active');
  });

  if (backPlacesNoCoordsBtn) backPlacesNoCoordsBtn.addEventListener('click', () => {
    el('placesNoCoordsModal').classList.remove('active');
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
