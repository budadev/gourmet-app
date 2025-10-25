/* =============================
   Main Application Initialization
   ============================= */

import { loadConfig } from './config.js';
import { el, enhanceSelectInteractivity } from './utils.js';
import { searchByText, findByBarcode, ensureDbReady } from './db.js';
import { setupSearch, setSearchValue } from './features/search.js';
import { renderList } from './features/itemList.js';
import { showItemDetails } from './features/itemDetails.js';
import { openEditor, closeEditor, saveItem, renderPairingsInEditor } from './features/itemEditor.js';
import { startScan, stopScan } from './features/scanner.js';
import { initPhotoModal } from './components/photos.js';
import { closePairingSelector, refreshPairingList, setupPairingListClickHandlers } from './features/pairingSelector.js';
import { lookupByBarcode } from './external/openFoodFacts.js';
import { initUpdateManager } from './updateManager.js';
import { initSideMenu, openSideMenu, closeSideMenu } from './features/sideMenu.js';
import { initFilters, applyFilters, setFilterChangeCallback, openFilterPanel, closeFilterPanel } from './features/filters.js';
import { initSwipeGestures } from './features/swipeGestures.js';

async function refreshList() {
  const query = el('searchInput').value.trim();
  let items = await searchByText(query);

  // Apply filters to the search results
  items = applyFilters(items);

  renderList(items, (id) => {
    showItemDetails(
      id,
      (item) => openEditor(item, refreshList), // onEdit opens editor
      refreshList // onDelete refreshes list
    );
  });
}

async function initApp() {
  // Ensure database is ready before any operations
  await ensureDbReady();

  // Load configuration
  await loadConfig();

  // Setup search (reuse refreshList behavior)
  setupSearch(async () => { await refreshList(); });

  // Initialize filters
  await initFilters();
  setFilterChangeCallback(async () => {
    await refreshList();
  });

  // Barcode scan from header - with improved direct triggering (remove delayed debounce to keep user gesture)
  let isScanning = false;
  const barcodeScanBtn = el('barcodeScanBtn');
  const handleBarcodeScan = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScanning) return; // guard
    isScanning = true;
    barcodeScanBtn.classList.add('scanning');
    barcodeScanBtn.setAttribute('aria-disabled','true');
    try {
      await startScan(async (code) => {
        const items = await findByBarcode(code);
        if (items && items.length === 1) {
          showItemDetails(items[0].id, (item) => {
            openEditor(item, refreshList);
          }, refreshList);
        } else if (items && items.length > 1) {
          setSearchValue(code);
          renderList(items, (id) => {
            showItemDetails(id, (item) => {
              openEditor(item, refreshList);
            }, refreshList);
          });
        } else {
          const fetched = await lookupByBarcode(code);
            if (fetched && confirm(`Barcode not found. Found "${fetched.name}" in Open Food Facts. Add it?`)) {
              openEditor({ ...fetched, barcode: code }, refreshList);
            } else if (!fetched) {
              if (confirm('Barcode not found. Add new item?')) {
                openEditor({ barcode: code }, refreshList);
              }
            }
          await refreshList();
        }
      });
    } finally {
      setTimeout(() => {
        isScanning = false;
        barcodeScanBtn.classList.remove('scanning');
        barcodeScanBtn.removeAttribute('aria-disabled');
      }, 400);
    }
  };
  // Replace previous single click listener with pointerdown + click fallback for faster gesture capture on iOS
  const startHeaderScan = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScanning) return;
    handleBarcodeScan(e);
  };
  barcodeScanBtn.addEventListener('pointerdown', startHeaderScan, { passive: false });
  // Keep click as fallback for keyboards / non-pointer devices
  barcodeScanBtn.addEventListener('click', handleBarcodeScan, { passive: false });
  // Removed touchend listener to avoid double events & lost gesture on iOS

  // Remove legacy listeners referencing deleted buttons
  // (closeScannerBtn, cancelScannerBtn, closeDetailsBtn, closeEditorBtn, cancelEditorBtn, closePairingSelectorBtn, cancelPairingSelectorBtn)
  // New back button handlers:
  el('backScanBtn')?.addEventListener('click', () => {
    stopScan();
    el('scannerModal').classList.remove('active');
  });
  el('backDetailsBtn')?.addEventListener('click', () => {
    el('detailsModal').classList.remove('active');
  });
  el('backEditorBtn')?.addEventListener('click', closeEditor);
  el('backPairingSelectorBtn')?.addEventListener('click', closePairingSelector);

  // Floating add button
  el('fabBtn').onclick = () => openEditor(null, refreshList);

  // Pairing selector search input & barcode scan
  el('pairingSearchInput').oninput = async () => {
    await refreshPairingList();
    setupPairingListClickHandlers(renderPairingsInEditor);
  };

  let isPairingScanning = false;
  const pairingBarcodeScanBtn = el('pairingBarcodeScanBtn');
  const handlePairingBarcodeScan = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPairingScanning) return;
    isPairingScanning = true;
    pairingBarcodeScanBtn.classList.add('scanning');
    pairingBarcodeScanBtn.setAttribute('aria-disabled','true');
    try {
      await startScan(async (code) => {
        const items = await findByBarcode(code);
        if (items && items.length > 0) {
          el('pairingSearchInput').value = code;
          await refreshPairingList();
          setupPairingListClickHandlers(renderPairingsInEditor);
        }
      });
    } finally {
      setTimeout(() => {
        isPairingScanning = false;
        pairingBarcodeScanBtn.classList.remove('scanning');
        pairingBarcodeScanBtn.removeAttribute('aria-disabled');
      }, 400);
    }
  };
  const startPairingScan = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPairingScanning) return;
    handlePairingBarcodeScan(e);
  };
  pairingBarcodeScanBtn.addEventListener('pointerdown', startPairingScan, { passive: false });
  pairingBarcodeScanBtn.addEventListener('click', handlePairingBarcodeScan, { passive: false });
  // Removed touchend listener (same reasoning as above)

  // Click outside modal to close (maintain existing behavior)
  [el('scannerModal'), el('detailsModal'), el('editorModal')].forEach(modal => {
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        if (modal === el('scannerModal')) stopScan();
      }
    };
  });
  el('pairingSelectorModal').onclick = (e) => {
    if (e.target === el('pairingSelectorModal')) {
      closePairingSelector();
    }
  };

  // Initialize photo modal with iOS-style controls and gestures
  initPhotoModal();

  // Initial list render
  await refreshList();

  // Enhance select interactions for iOS
  enhanceSelectInteractivity(document);

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(
        (registration) => console.log('Service Worker registered:', registration.scope),
        (err) => console.log('Service Worker registration failed:', err)
      );
    });
  }

  // Initialize update manager for PWA updates
  initUpdateManager();

  // Initialize side menu
  initSideMenu();

  // Initialize swipe gestures for side menu and filter panel
  initSwipeGestures(openSideMenu, closeSideMenu, openFilterPanel, closeFilterPanel);

  // Listen for data import events to refresh the list
  window.addEventListener('data-imported', async () => {
    await refreshList();
  });

  // Hide loading screen after initialization
  hideLoader();
}

// Hide the loading screen with a smooth fade
function hideLoader() {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.classList.add('hidden');
    // Remove from DOM after transition completes
    setTimeout(() => {
      loader.remove();
    }, 400);
  }
}

// Initialize the app
initApp();
