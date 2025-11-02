/* =============================
   Side Menu Feature
   ============================= */

import { el, escapeHtml } from '../utils.js';
import { checkUpdateStatus, showUpdateBannerManually } from '../updateManager.js';
import { exportAllData, importData } from '../dataManager.js';
import { openInlinePlaceEditor, openCreatePlaceEditor } from '../components/placeEditor.js';
import { openItemTypeEditor, openCreateItemTypeEditor } from '../components/itemTypeEditor.js';

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

  if (el('itemTypesBtn')) el('itemTypesBtn').addEventListener('click', () => {
    closeSideMenu();
    showItemTypes();
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

  // Click outside modals to close - Item Types modals
  [el('itemTypesModal'), el('itemTypesEditorModal')].forEach(modal => {
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

  // Back button handlers for item types modals
  const backItemTypesBtn = el('backItemTypesBtn');
  const backItemTypeEditorBtn = el('backItemTypeEditorBtn');

  if (backItemTypesBtn) backItemTypesBtn.addEventListener('click', () => {
    el('itemTypesModal').classList.remove('active');
  });

  if (backItemTypeEditorBtn) backItemTypeEditorBtn.addEventListener('click', () => {
    el('itemTypesEditorModal').classList.remove('active');
  });

  // Create item type button handler
  const createItemTypeBtn = el('createItemTypeBtn');
  if (createItemTypeBtn) createItemTypeBtn.addEventListener('click', () => {
    openCreateItemTypeEditor();
  });

  // Listen for item type updates and refresh the list
  window.addEventListener('itemtype-updated', async () => {
    await refreshItemTypesList();
  });

  window.addEventListener('itemtype-created', async () => {
    await refreshItemTypesList();
  });

  window.addEventListener('itemtype-deleted', async () => {
    await refreshItemTypesList();
  });

  // Function to refresh item types list
  async function refreshItemTypesList() {
    const itemTypesContent = el('itemTypesContent');
    const itemTypesModal = el('itemTypesModal');
    if (!itemTypesContent || !itemTypesModal || !itemTypesModal.classList.contains('active')) return;

    itemTypesContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';
    const { getAllItemTypes } = await import('../models/itemTypes.js');
    const itemTypes = await getAllItemTypes();
    renderItemTypesList(itemTypes, itemTypesContent);
  }

  // Function to render item types list
  function renderItemTypesList(itemTypes, container) {
    container.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'list';
    container.appendChild(list);

    const entries = Object.entries(itemTypes);

    // Sort by rank
    entries.sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999));

    if (!entries.length) {
      list.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);font-size:15px;">No item types found.</div>';
      return;
    }

    let draggedElement = null;

    entries.forEach(([key, config]) => {
      const item = document.createElement('div');
      item.className = 'list-item draggable-item';
      item.setAttribute('data-type-key', key);

      // Drag handle
      const dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="2"/>
          <circle cx="9" cy="12" r="2"/>
          <circle cx="9" cy="19" r="2"/>
          <circle cx="15" cy="5" r="2"/>
          <circle cx="15" cy="12" r="2"/>
          <circle cx="15" cy="19" r="2"/>
        </svg>
      `;
      dragHandle.setAttribute('draggable', 'true');

      // Content area (clickable)
      const contentBtn = document.createElement('button');
      contentBtn.className = 'list-item-clickable';
      contentBtn.type = 'button';
      contentBtn.innerHTML = `
        <div class="list-item-content">
          <div class="list-item-title">${escapeHtml(config.icon || '📦')} ${escapeHtml(config.label || key)}</div>
        </div>
        <div class="list-item-arrow">›</div>
      `;

      // Drag and drop handlers
      dragHandle.addEventListener('dragstart', (e) => {
        console.log('Drag started');
        draggedElement = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (item !== draggedElement && draggedElement) {
          const rect = item.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;

          if (e.clientY < midpoint) {
            item.parentNode.insertBefore(draggedElement, item);
          } else {
            item.parentNode.insertBefore(draggedElement, item.nextSibling);
          }
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      item.addEventListener('dragend', async () => {
        console.log('Drag ended');
        item.classList.remove('dragging');

        if (!draggedElement) return;

        // Get new order
        const listItems = Array.from(list.querySelectorAll('.draggable-item'));
        const newOrder = listItems.map(li => li.getAttribute('data-type-key'));
        console.log('New order:', newOrder);

        // Update ranks in database
        const { updateItemTypeRanks } = await import('../models/itemTypes.js');
        await updateItemTypeRanks(newOrder);

        // Reload config
        await import('../config.js').then(m => m.reloadConfig());

        draggedElement = null;
      });

      // Add touch support for mobile
      let touchStartY = 0;
      let touchItem = null;

      dragHandle.addEventListener('touchstart', (e) => {
        console.log('Touch started');
        touchStartY = e.touches[0].clientY;
        touchItem = item;
        item.classList.add('dragging');
        e.preventDefault();
      }, { passive: false });

      dragHandle.addEventListener('touchmove', (e) => {
        if (!touchItem) return;

        const touchY = e.touches[0].clientY;
        const delta = touchY - touchStartY;

        // Find which item we're over
        const allItems = Array.from(list.querySelectorAll('.draggable-item'));
        const hoveredItem = allItems.find(li => {
          if (li === touchItem) return false;
          const rect = li.getBoundingClientRect();
          return touchY >= rect.top && touchY <= rect.bottom;
        });

        if (hoveredItem) {
          const rect = hoveredItem.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;

          if (touchY < midpoint) {
            hoveredItem.parentNode.insertBefore(touchItem, hoveredItem);
          } else {
            hoveredItem.parentNode.insertBefore(touchItem, hoveredItem.nextSibling);
          }
        }

        e.preventDefault();
      }, { passive: false });

      dragHandle.addEventListener('touchend', async () => {
        console.log('Touch ended');
        if (!touchItem) return;

        touchItem.classList.remove('dragging');

        // Get new order
        const listItems = Array.from(list.querySelectorAll('.draggable-item'));
        const newOrder = listItems.map(li => li.getAttribute('data-type-key'));
        console.log('New order:', newOrder);

        // Update ranks in database
        const { updateItemTypeRanks } = await import('../models/itemTypes.js');
        await updateItemTypeRanks(newOrder);

        // Reload config
        await import('../config.js').then(m => m.reloadConfig());

        touchItem = null;
        touchStartY = 0;
      });

      // Prevent dragging from the content button
      contentBtn.addEventListener('dragstart', (e) => e.preventDefault());

      contentBtn.addEventListener('click', () => {
        openItemTypeEditor(contentBtn, key);
      });

      item.appendChild(dragHandle);
      item.appendChild(contentBtn);
      list.appendChild(item);
    });
  }
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

async function showItemTypes() {
  const modal = el('itemTypesModal');
  if (!modal) return;

  modal.classList.add('active');

  // Load and render item types
  const itemTypesContent = el('itemTypesContent');
  if (itemTypesContent) {
    itemTypesContent.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Loading...</div>';

    const { getAllItemTypes } = await import('../models/itemTypes.js');
    const itemTypes = await getAllItemTypes();

    // Create a helper function to render the list
    const renderList = (types, container) => {
      container.innerHTML = '';

      const list = document.createElement('div');
      list.className = 'list';
      container.appendChild(list);

      const entries = Object.entries(types);

      // Sort by rank
      entries.sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999));

      if (!entries.length) {
        list.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);font-size:15px;">No item types found.</div>';
        return;
      }

      let draggedElement = null;

      entries.forEach(([key, config]) => {
        const item = document.createElement('div');
        item.className = 'list-item draggable-item';
        item.setAttribute('data-type-key', key);

        // Drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="2"/>
            <circle cx="9" cy="12" r="2"/>
            <circle cx="9" cy="19" r="2"/>
            <circle cx="15" cy="5" r="2"/>
            <circle cx="15" cy="12" r="2"/>
            <circle cx="15" cy="19" r="2"/>
          </svg>
        `;
        dragHandle.setAttribute('draggable', 'true');

        // Content area (clickable)
        const contentBtn = document.createElement('button');
        contentBtn.className = 'list-item-clickable';
        contentBtn.type = 'button';
        contentBtn.innerHTML = `
          <div class="list-item-content">
            <div class="list-item-title">${escapeHtml(config.icon || '📦')} ${escapeHtml(config.label || key)}</div>
          </div>
          <div class="list-item-arrow">›</div>
        `;

        // Drag and drop handlers
        dragHandle.addEventListener('dragstart', (e) => {
          console.log('Drag started (showItemTypes)');
          draggedElement = item;
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', key);
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          if (item !== draggedElement && draggedElement) {
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
              item.parentNode.insertBefore(draggedElement, item);
            } else {
              item.parentNode.insertBefore(draggedElement, item.nextSibling);
            }
          }
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        item.addEventListener('dragend', async () => {
          console.log('Drag ended (showItemTypes)');
          item.classList.remove('dragging');

          if (!draggedElement) return;

          // Get new order
          const listItems = Array.from(list.querySelectorAll('.draggable-item'));
          const newOrder = listItems.map(li => li.getAttribute('data-type-key'));
          console.log('New order:', newOrder);

          // Update ranks in database
          const { updateItemTypeRanks } = await import('../models/itemTypes.js');
          await updateItemTypeRanks(newOrder);

          // Reload config
          await import('../config.js').then(m => m.reloadConfig());

          draggedElement = null;
        });

        // Add touch support for mobile
        let touchStartY = 0;
        let touchItem = null;

        dragHandle.addEventListener('touchstart', (e) => {
          console.log('Touch started (showItemTypes)');
          touchStartY = e.touches[0].clientY;
          touchItem = item;
          item.classList.add('dragging');
          e.preventDefault();
        }, { passive: false });

        dragHandle.addEventListener('touchmove', (e) => {
          if (!touchItem) return;

          const touchY = e.touches[0].clientY;

          // Find which item we're over
          const allItems = Array.from(list.querySelectorAll('.draggable-item'));
          const hoveredItem = allItems.find(li => {
            if (li === touchItem) return false;
            const rect = li.getBoundingClientRect();
            return touchY >= rect.top && touchY <= rect.bottom;
          });

          if (hoveredItem) {
            const rect = hoveredItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (touchY < midpoint) {
              hoveredItem.parentNode.insertBefore(touchItem, hoveredItem);
            } else {
              hoveredItem.parentNode.insertBefore(touchItem, hoveredItem.nextSibling);
            }
          }

          e.preventDefault();
        }, { passive: false });

        dragHandle.addEventListener('touchend', async () => {
          console.log('Touch ended (showItemTypes)');
          if (!touchItem) return;

          touchItem.classList.remove('dragging');

          // Get new order
          const listItems = Array.from(list.querySelectorAll('.draggable-item'));
          const newOrder = listItems.map(li => li.getAttribute('data-type-key'));
          console.log('New order:', newOrder);

          // Update ranks in database
          const { updateItemTypeRanks } = await import('../models/itemTypes.js');
          await updateItemTypeRanks(newOrder);

          // Reload config
          await import('../config.js').then(m => m.reloadConfig());

          touchItem = null;
          touchStartY = 0;
        });

        // Prevent dragging from the content button
        contentBtn.addEventListener('dragstart', (e) => e.preventDefault());

        contentBtn.addEventListener('click', () => {
          openItemTypeEditor(contentBtn, key);
        });

        item.appendChild(dragHandle);
        item.appendChild(contentBtn);
        list.appendChild(item);
      });
    };

    renderList(itemTypes, itemTypesContent);
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
