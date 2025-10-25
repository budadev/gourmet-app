/* =============================
   Main Application Initialization
   ============================= */

import { loadConfig } from './config.js';
import { el, enhanceSelectInteractivity } from './utils.js';
import { searchByText, findByBarcode } from './db.js';
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

// Lock screen orientation to portrait
function lockOrientation() {
  // Try to lock using Screen Orientation API
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(err => {
      console.log('Screen orientation lock not supported:', err);
    });
  }

  // Prevent orientation change events from affecting layout
  window.addEventListener('orientationchange', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Force scroll to top to prevent layout shifts
    window.scrollTo(0, 0);
  }, { capture: true });

  // Prevent resize events during orientation changes from causing issues
  let resizeTimeout;
  const originalHeight = window.innerHeight;
  window.addEventListener('resize', (e) => {
    // Debounce resize events during orientation changes
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // If height changed significantly (orientation change), restore scroll
      if (Math.abs(window.innerHeight - originalHeight) > 100) {
        window.scrollTo(0, 0);
      }
    }, 100);
  }, { passive: true });
}

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
  // Lock orientation to portrait as early as possible
  lockOrientation();

  // Load configuration
  await loadConfig();

  // Setup search (reuse refreshList behavior)
  setupSearch(async () => { await refreshList(); });

  // Initialize filters
  await initFilters();
  setFilterChangeCallback(async () => {
    await refreshList();
  });

  // Barcode scan from header - with debouncing to prevent double-trigger
  let isScanning = false;
  let scanTimeout = null;
  const handleBarcodeScan = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent multiple rapid triggers
    if (isScanning) return;

    // Clear any pending scan
    if (scanTimeout) {
      clearTimeout(scanTimeout);
    }

    // Debounce to prevent both click and touchend from firing
    scanTimeout = setTimeout(() => {
      if (isScanning) return;
      isScanning = true;

      // Run the async scan operation
      (async () => {
        try {
          await startScan(async (code) => {
            const items = await findByBarcode(code);

            if (items && items.length === 1) {
              // Single item found: navigate directly to item details without updating search
              showItemDetails(items[0].id, (item) => {
                openEditor(item, refreshList);
              }, refreshList);
            } else if (items && items.length > 1) {
              // Multiple items found: show search results with barcode in search box
              setSearchValue(code);
              renderList(items, (id) => {
                showItemDetails(id, (item) => {
                  openEditor(item, refreshList);
                }, refreshList);
              });
            } else {
              // No items found: offer to add new item
              const fetched = await lookupByBarcode(code);
              if (fetched && confirm(`Barcode not found. Found "${fetched.name}" in Open Food Facts. Add it?`)) {
                openEditor({ ...fetched, barcode: code }, refreshList);
              } else if (!fetched) {
                if (confirm('Barcode not found. Add new item?')) {
                  openEditor({ barcode: code }, refreshList);
                }
              }
              // If user declined to add, restore the current list view
              // This maintains the existing search state instead of showing empty results
              await refreshList();
            }
          });
        } finally {
          // Reset scanning flag after a short delay
          setTimeout(() => { isScanning = false; }, 300);
        }
      })();
    }, 10); // 10ms debounce to catch both events but only fire once
  };

  const barcodeScanBtn = el('barcodeScanBtn');
  barcodeScanBtn.addEventListener('click', handleBarcodeScan, { passive: false });
  // Also listen for touchend to catch cases where click doesn't fire
  barcodeScanBtn.addEventListener('touchend', handleBarcodeScan, { passive: false });

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
  let pairingScanTimeout = null;
  const handlePairingBarcodeScan = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent multiple rapid triggers
    if (isPairingScanning) return;

    // Clear any pending scan
    if (pairingScanTimeout) {
      clearTimeout(pairingScanTimeout);
    }

    // Debounce to prevent both click and touchend from firing
    pairingScanTimeout = setTimeout(() => {
      if (isPairingScanning) return;
      isPairingScanning = true;

      // Run the async scan operation
      (async () => {
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
          // Reset scanning flag after a short delay
          setTimeout(() => { isPairingScanning = false; }, 300);
        }
      })();
    }, 10); // 10ms debounce to catch both events but only fire once
  };

  const pairingBarcodeScanBtn = el('pairingBarcodeScanBtn');
  pairingBarcodeScanBtn.addEventListener('click', handlePairingBarcodeScan, { passive: false });
  pairingBarcodeScanBtn.addEventListener('touchend', handlePairingBarcodeScan, { passive: false });

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
