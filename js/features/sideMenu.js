/* =============================
   Side Menu Feature
   ============================= */

import { el } from '../utils.js';
import { listAll, addItem } from '../db.js';
import { checkUpdateStatus, showUpdateBannerManually } from '../updateManager.js';

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

export function openSideMenu() {
  sideMenuOpen = true;
  el('sideMenuOverlay').classList.add('active');
  el('sideMenu').classList.add('active');
  el('hamburgerBtn').classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closeSideMenu() {
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

  document.body.style.overflow = 'hidden';
}

function closeAboutDialog() {
  aboutDialogOpen = false;
  el('aboutDialog').classList.remove('active');
  document.body.style.overflow = '';
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
