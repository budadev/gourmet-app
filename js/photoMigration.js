/* =============================
   Photo Migration Utility
   Migrates photos from item records to separate photos store
   ============================= */

import { listAll, updateItem, savePhoto } from './db.js';
import { dataURLToBlob, createThumbnail, generatePhotoId } from './components/photos.js';

/**
 * Check if migration is needed
 * Returns true if any items have old-style base64 photo arrays
 */
export async function needsPhotoMigration() {
  try {
    const items = await listAll();

    // Check if any item has photos as base64 strings (old format)
    for (const item of items) {
      if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
        // Old format: photos are strings (base64 data URLs)
        // New format: photos are objects with { id, thumbnail }
        if (typeof item.photos[0] === 'string') {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error('Error checking migration status:', err);
    return false;
  }
}

/**
 * Migrate all items with old-style photos to new structure
 */
export async function migratePhotos(onProgress) {
  try {
    const items = await listAll();
    let migratedCount = 0;
    let photoCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.photos && Array.isArray(item.photos) && item.photos.length > 0) {
        // Check if this item needs migration
        if (typeof item.photos[0] === 'string') {
          const newPhotos = [];

          // Process each photo
          for (const photoDataURL of item.photos) {
            const photoId = generatePhotoId();
            const thumbnail = await createThumbnail(photoDataURL);
            const blob = dataURLToBlob(photoDataURL);

            // Save photo blob to photos store
            await savePhoto(photoId, blob, item.id);

            // Add metadata to new photos array
            newPhotos.push({
              id: photoId,
              thumbnail: thumbnail
            });

            photoCount++;
          }

          // Update item with new photo metadata
          await updateItem(item.id, { photos: newPhotos });
          migratedCount++;

          if (onProgress) {
            onProgress({
              current: i + 1,
              total: items.length,
              itemsMigrated: migratedCount,
              photosMigrated: photoCount
            });
          }
        }
      }
    }

    console.log(`Photo migration complete: ${migratedCount} items, ${photoCount} photos`);
    return { itemsMigrated: migratedCount, photosMigrated: photoCount };
  } catch (err) {
    console.error('Error during photo migration:', err);
    throw err;
  }
}

/**
 * Show migration UI and perform migration
 */
export async function showMigrationUI() {
  // Create migration modal
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.zIndex = '10000';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2>Database Update Required</h2>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 20px;">
          Your app needs to be updated to improve performance.
          Photos will be reorganized to load faster.
        </p>
        <div id="migrationProgress" style="display: none;">
          <div style="margin-bottom: 10px;">
            <div style="background: var(--bg-light); height: 8px; border-radius: 4px; overflow: hidden;">
              <div id="migrationProgressBar" style="background: var(--primary); height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
          </div>
          <p id="migrationStatus" style="text-align: center; color: var(--text-muted); font-size: 14px;"></p>
        </div>
        <div id="migrationButtons">
          <button class="btn primary" id="startMigrationBtn" style="width: 100%;">Update Now</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  return new Promise((resolve) => {
    const startBtn = document.getElementById('startMigrationBtn');
    const progressDiv = document.getElementById('migrationProgress');
    const buttonsDiv = document.getElementById('migrationButtons');
    const progressBar = document.getElementById('migrationProgressBar');
    const statusText = document.getElementById('migrationStatus');

    startBtn.onclick = async () => {
      buttonsDiv.style.display = 'none';
      progressDiv.style.display = 'block';

      try {
        await migratePhotos((progress) => {
          const percent = Math.round((progress.current / progress.total) * 100);
          progressBar.style.width = `${percent}%`;
          statusText.textContent = `Migrating photos... ${progress.photosMigrated} photos processed`;
        });

        statusText.textContent = '✓ Migration complete!';

        setTimeout(() => {
          document.body.removeChild(modal);
          resolve(true);
        }, 1500);
      } catch (err) {
        statusText.textContent = '✗ Migration failed. Please try again.';
        statusText.style.color = 'var(--error)';

        setTimeout(() => {
          buttonsDiv.style.display = 'block';
          progressDiv.style.display = 'none';
        }, 2000);
      }
    };
  });
}

