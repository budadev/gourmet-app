/* =============================
   Side Menu Feature
   ============================= */

import { el } from '../utils.js';
import { listAll, addItem } from '../db.js';

let sideMenuOpen = false;
let aboutDialogOpen = false;

export function initSideMenu() {
  const hamburgerBtn = el('hamburgerBtn');
  const overlay = el('sideMenuOverlay');
  const menu = el('sideMenu');
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

  // About dialog
  closeAboutBtn.addEventListener('click', () => {
    closeAboutDialog();
  });

  aboutDialog.addEventListener('click', (e) => {
    if (e.target === aboutDialog) {
      closeAboutDialog();
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

function openSideMenu() {
  sideMenuOpen = true;
  el('sideMenuOverlay').classList.add('active');
  el('sideMenu').classList.add('active');
  el('hamburgerBtn').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSideMenu() {
  sideMenuOpen = false;
  el('sideMenuOverlay').classList.remove('active');
  el('sideMenu').classList.remove('active');
  el('hamburgerBtn').classList.remove('active');
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
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `gourmetapp-export-${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification(`✓ Exported ${items.length} items successfully!`, 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('✗ Failed to export data', 'error');
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
        // Remove the id field as it's auto-generated
        const { id, ...itemData } = item;

        // Check if item with same barcode already exists
        if (itemData.barcode && existingBarcodes.has(itemData.barcode)) {
          skipped++;
          continue;
        }

        await addItem(itemData);
        imported++;

        // Add to existing barcodes set to avoid duplicates within import
        if (itemData.barcode) {
          existingBarcodes.add(itemData.barcode);
        }
      } catch (err) {
        console.error('Error importing item:', err);
        errors++;
      }
    }

    // Show summary notification
    let message = `✓ Import complete!\n`;
    if (imported > 0) message += `Imported: ${imported} items\n`;
    if (skipped > 0) message += `Skipped (duplicates): ${skipped}\n`;
    if (errors > 0) message += `Errors: ${errors}`;

    showNotification(message, imported > 0 ? 'success' : 'warning');

    // Trigger a refresh if items were imported
    if (imported > 0) {
      // Dispatch custom event that the main app can listen to
      window.dispatchEvent(new CustomEvent('data-imported'));
    }
  } catch (error) {
    console.error('Import error:', error);
    showNotification('✗ Failed to import data. Please check the file format.', 'error');
  }
}

function showAboutDialog() {
  aboutDialogOpen = true;
  const dialog = el('aboutDialog');
  dialog.classList.add('active');

  // Load version info with cache busting to always get the latest
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

  document.body.style.overflow = 'hidden';
}

function closeAboutDialog() {
  aboutDialogOpen = false;
  el('aboutDialog').classList.remove('active');
  document.body.style.overflow = '';
}

function showNotification(message, type = 'info') {
  // Create a simple toast notification
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

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
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
