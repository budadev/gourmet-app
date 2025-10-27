/* =============================
   Data Import/Export Manager
   ============================= */

import { listAll, addItem, savePhoto, getPhoto } from './db.js';
import { dataURLToBlob, createThumbnail, generatePhotoId, blobToDataURL } from './components/photos.js';

/**
 * Export all data from IndexedDB to a JSON file
 */
export async function exportAllData() {
  try {
    // Get all items from the database
    const items = await listAll();

    // For each item with photos, load the full photo data from the photos store
    const itemsWithFullPhotos = await Promise.all(
      items.map(async (item) => {
        if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
          const fullPhotos = await Promise.all(
            item.photos.map(async (photoMeta) => {
              try {
                const photoBlob = await getPhoto(photoMeta.id);
                if (photoBlob) {
                  return await blobToDataURL(photoBlob);
                }
                return null;
              } catch (err) {
                console.error(`Error loading photo ${photoMeta.id}:`, err);
                return null;
              }
            })
          );

          // Filter out null values and return item with full photos
          return {
            ...item,
            photos: fullPhotos.filter(p => p !== null)
          };
        }
        return item;
      })
    );

    // Create export data structure
    const exportData = {
      version: '2.0', // Update version to indicate new photo format support
      exportDate: new Date().toISOString(),
      itemCount: itemsWithFullPhotos.length,
      items: itemsWithFullPhotos
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

    console.log(`Exported ${itemsWithFullPhotos.length} items to ${filename}`);
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

            // Process photos if they exist
            if (itemWithoutId.photos && Array.isArray(itemWithoutId.photos) && itemWithoutId.photos.length > 0) {
              const photoMetadata = [];

              for (const photo of itemWithoutId.photos) {
                // Only handle new format: object with id and thumbnail
                if (photo.id && photo.thumbnail) {
                  photoMetadata.push(photo);
                }
              }

              itemWithoutId.photos = photoMetadata.map(p => ({ id: p.id, thumbnail: p.thumbnail }));

              // Add item to database first to get new ID
              const newItemId = await addItem(itemWithoutId);

              // Save photo blobs to photos store (if needed, only for new format)
              // (Assume photo data is already stored, or handle as needed for new format)
            } else {
              // No photos, just add the item
              await addItem(itemWithoutId);
              itemsImported++;
            }

            // Add to set if it has a barcode
            if (item.barcode) {
              existingBarcodes.add(item.barcode);
            }

            itemsImported++;
          } catch (err) {
            console.error('Error importing item:', err);
          }
        }

        console.log(`Imported ${itemsImported} items, skipped ${itemsSkipped} duplicates`);
        resolve({ imported: itemsImported, skipped: itemsSkipped });
      } catch (err) {
        console.error('Import failed:', err);
        reject(new Error('Failed to import data'));
      }
    };

    // Trigger file selection dialog
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}

