/* =============================
   Data Import/Export Manager
   ============================= */

import { listAll, addItem, savePhoto, getPhoto, getAllStoreNames, getAllFromStore, bulkAddToStore } from './db.js';
import { dataURLToBlob, createThumbnail, generatePhotoId, blobToDataURL } from './components/photos.js';

/**
 * Export all data from IndexedDB to a JSON file (dynamic, all tables)
 */
export async function exportAllData() {
  try {
    // Get all store names
    const storeNames = await getAllStoreNames();
    const exportData = {
      version: '3.0', // New dynamic export version
      exportDate: new Date().toISOString(),
      stores: {}
    };
    // Fetch all data from each store
    for (const storeName of storeNames) {
      exportData.stores[storeName] = await getAllFromStore(storeName);
    }
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
    console.log(`Exported all tables to ${filename}`);
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error('Failed to export data');
  }
}

/**
 * Import data from a JSON file into IndexedDB (dynamic, all tables)
 * Accepts file content (string) or a File object. If not provided, opens file dialog (for backward compatibility).
 * Merges with existing data (doesn't overwrite)
 */
export async function importData(fileOrContent) {
  // If no argument, open file dialog (legacy usage)
  if (!fileOrContent) {
    return new Promise((resolve, reject) => {
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
          const text = await file.text();
          await importData(text);
          resolve({ imported: true });
        } catch (err) {
          reject(err);
        }
      };
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });
  }
  // If argument is a File, read as text
  if (fileOrContent instanceof File) {
    const text = await fileOrContent.text();
    return importData(text);
  }
  // Otherwise, treat as string content
  try {
    const importDataObj = JSON.parse(fileOrContent);
    if (!importDataObj.stores || typeof importDataObj.stores !== 'object') {
      throw new Error('Invalid import file format');
    }
    let totalImported = 0;
    // For each store in the import, bulk add records
    for (const [storeName, records] of Object.entries(importDataObj.stores)) {
      if (Array.isArray(records) && records.length > 0) {
        try {
          const count = await bulkAddToStore(storeName, records);
          totalImported += count || 0;
        } catch (err) {
          console.warn(`Could not import to store ${storeName}:`, err);
        }
      }
    }
    console.log(`Imported data for all tables. Total records imported: ${totalImported}`);
    return { imported: totalImported };
  } catch (err) {
    console.error('Import failed:', err);
    throw new Error('Failed to import data');
  }
}
