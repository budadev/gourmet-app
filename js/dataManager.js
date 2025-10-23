/* =============================
   Data Import/Export Manager
   ============================= */

import { listAll, addItem } from './db.js';

/**
 * Export all data from IndexedDB to a JSON file
 */
export async function exportAllData() {
  try {
    // Get all items from the database
    const items = await listAll();

    // Create export data structure
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      itemCount: items.length,
      items: items
    };

    // Convert to JSON
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `gourmetapp-export-${timestamp}.json`;

    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);

    console.log(`Exported ${items.length} items to ${filename}`);
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error('Failed to export data');
  }
}

/**
 * Import data from a JSON file into IndexedDB
 * Merges with existing data (doesn't overwrite)
 */
export async function importData() {
  return new Promise((resolve, reject) => {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) {
          resolve(null);
          return;
        }

        // Read file
        const text = await file.text();
        const importData = JSON.parse(text);

        // Validate data structure
        if (!importData.items || !Array.isArray(importData.items)) {
          throw new Error('Invalid import file format');
        }

        // Get existing items to check for duplicates
        const existingItems = await listAll();
        const existingBarcodes = new Set(
          existingItems
            .filter(item => item.barcode)
            .map(item => item.barcode)
        );

        let itemsImported = 0;
        let itemsSkipped = 0;

        // Import items
        for (const item of importData.items) {
          try {
            // Create a clean item without the old ID (will get new auto-increment ID)
            const { id, ...itemWithoutId } = item;

            // Check for duplicate by barcode
            if (item.barcode && existingBarcodes.has(item.barcode)) {
              // Skip duplicates based on barcode
              itemsSkipped++;
              console.log(`Skipped duplicate item with barcode: ${item.barcode}`);
              continue;
            }

            // Add item to database
            await addItem(itemWithoutId);
            itemsImported++;

            // Add to set if it has a barcode
            if (item.barcode) {
              existingBarcodes.add(item.barcode);
            }
          } catch (err) {
            console.error('Error importing item:', err);
            itemsSkipped++;
          }
        }

        console.log(`Import complete: ${itemsImported} items imported, ${itemsSkipped} skipped`);

        resolve({
          itemsImported,
          itemsSkipped,
          totalInFile: importData.items.length
        });
      } catch (err) {
        console.error('Import error:', err);
        reject(new Error('Failed to import data: ' + err.message));
      }
    };

    input.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    // Trigger file picker
    input.click();
  });
}

