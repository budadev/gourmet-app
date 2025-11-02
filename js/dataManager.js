/* =============================
   Data Import/Export Manager
   ============================= */

const JSZip = window.JSZip;

import { listAll, addItem, savePhoto, getPhoto, getAllStoreNames, getAllFromStore, bulkAddToStore } from './db.js';
import { dataURLToBlob, createThumbnail, generatePhotoId, blobToDataURL } from './components/photos.js';

/**
 * Export all data from IndexedDB to a ZIP file (JSON + photos)
 */
export async function exportAllData() {
  try {
    // Get all store names
    const storeNames = await getAllStoreNames();
    const exportData = {
      version: '3.1', // New export version with ZIP/photos
      exportDate: new Date().toISOString(),
      stores: {}
    };
    // Fetch all data from each store
    for (const storeName of storeNames) {
      exportData.stores[storeName] = await getAllFromStore(storeName);
    }
    // Prepare ZIP
    const zip = new JSZip();
    // Add JSON data
    const jsonString = JSON.stringify(exportData, null, 2);
    zip.file('data.json', jsonString);
    // Add photos (if any)
    if (exportData.stores.photos && Array.isArray(exportData.stores.photos)) {
      for (const photo of exportData.stores.photos) {
        if (photo && photo.id) {
          try {
            const blob = await getPhoto(photo.id);
            if (blob) {
              zip.file(`photos/${photo.id}`, blob);
            }
          } catch (err) {
            console.warn('Could not export photo', photo.id, err);
          }
        }
      }
    }
    // Generate ZIP and trigger download
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `gourmetapp-export-${timestamp}.zip`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    console.log(`Exported all tables and photos to ${filename}`);
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error('Failed to export data');
  }
}

/**
 * Import data from a ZIP file (JSON + photos) into IndexedDB
 * Accepts File/Blob (ZIP) or string (legacy JSON)
 */
export async function importData(fileOrContent) {
  // If no argument, open file dialog (legacy usage)
  if (!fileOrContent) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip,application/json,.json';
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          await importData(file);
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
  // If argument is a File or Blob, check if ZIP or JSON
  if (fileOrContent instanceof File || fileOrContent instanceof Blob) {
    const isZip = fileOrContent.type === 'application/zip' || fileOrContent.name?.endsWith('.zip');
    if (isZip) {
      // ZIP import
      const zip = await JSZip.loadAsync(fileOrContent);
      // Find data.json
      const jsonFile = zip.file('data.json');
      if (!jsonFile) throw new Error('ZIP missing data.json');
      const jsonString = await jsonFile.async('string');
      const importDataObj = JSON.parse(jsonString);
      // Import JSON data
      let totalImported = 0;
      for (const [storeName, records] of Object.entries(importDataObj.stores)) {
        if (storeName === 'photos') continue; // Handle photos separately
        if (Array.isArray(records) && records.length > 0) {
          try {
            const count = await bulkAddToStore(storeName, records);
            totalImported += count || 0;
          } catch (err) {
            console.warn(`Could not import to store ${storeName}:`, err);
          }
        }
      }
      // Import photos
      if (importDataObj.stores.photos && Array.isArray(importDataObj.stores.photos)) {
        for (const photo of importDataObj.stores.photos) {
          if (photo && photo.id) {
            const photoFile = zip.file(`photos/${photo.id}`);
            if (photoFile) {
              const blob = await photoFile.async('blob');
              try {
                // Save photo with thumbnail and itemId from metadata
                await savePhoto(photo.id, blob, photo.thumbnail || '', photo.itemId || null);
              } catch (err) {
                console.warn('Could not import photo', photo.id, err);
              }
            }
          }
        }
      }
      console.log(`Imported data and photos from ZIP. Total records imported: ${totalImported}`);
      return { imported: totalImported };
    } else {
      // JSON import (legacy)
      const text = await fileOrContent.text();
      return importData(text);
    }
  }
  // Otherwise, treat as string content (legacy JSON)
  try {
    const importDataObj = JSON.parse(fileOrContent);
    if (!importDataObj.stores || typeof importDataObj.stores !== 'object') {
      throw new Error('Invalid import file format');
    }
    let totalImported = 0;
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
