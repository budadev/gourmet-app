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

async function refreshList() {
  const query = el('searchInput').value.trim();
  const items = await searchByText(query);
  renderList(items, (id) => {
    showItemDetails(
      id,
      (item) => openEditor(item, refreshList), // onEdit opens editor
      refreshList // onDelete refreshes list
    );
  });
}

async function initApp() {
  // Load configuration
  await loadConfig();

  // Setup search (reuse refreshList behavior)
  setupSearch(async () => { await refreshList(); });

  // Barcode scan from header
  el('barcodeScanBtn').onclick = async () => {
    await startScan(async (code) => {
      const items = await findByBarcode(code);
      if (items && items.length) {
        setSearchValue(code);
        renderList(items, (id) => {
          showItemDetails(id, (item) => {
            openEditor(item, refreshList);
          }, refreshList);
        });
      } else {
        setSearchValue(code);
        renderList([]);
        const fetched = await lookupByBarcode(code);
        if (fetched && confirm(`Barcode not found. Found "${fetched.name}" in Open Food Facts. Add it?`)) {
          openEditor({ ...fetched, barcode: code }, refreshList);
        } else if (!fetched) {
          if (confirm('Barcode not found. Add new item?')) {
            openEditor({ barcode: code }, refreshList);
          }
        }
      }
    });
  };

  // Remove legacy listeners referencing deleted buttons
  // (closeScannerBtn, cancelScannerBtn, closeDetailsBtn, closeEditorBtn, cancelEditorBtn, closePairingSelectorBtn, cancelPairingSelectorBtn)
  // New back button handlers:
  el('backScannerBtn')?.addEventListener('click', () => {
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
  el('pairingBarcodeScanBtn').onclick = async () => {
    await startScan(async (code) => {
      const items = await findByBarcode(code);
      if (items && items.length > 0) {
        el('pairingSearchInput').value = code;
        await refreshPairingList();
        setupPairingListClickHandlers(renderPairingsInEditor);
      }
    });
  };

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
}

// Initialize the app
initApp();
