/* =============================
   Photo Management
   ============================= */

import { el } from '../utils.js';
import { savePhoto, getPhoto, deletePhoto, getPhotoThumbnails } from '../db.js';

let currentPhotos = []; // Array of photo IDs (strings), not objects
let currentPhotoIndex = 0;
let allPhotosInViewer = [];
let controlsVisible = true;
let touchStartY = 0;
let touchStartX = 0;
let isDragging = false;

// Convert data URL to Blob
export function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Convert Blob to data URL
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Create thumbnail from data URL
export async function createThumbnail(dataURL, maxWidth = 150, maxHeight = 150) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to data URL with compression
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

async function createThumbnailBlob(dataURL, maxW=150, maxH=150) {
  // Create an Image from the dataURL
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataURL;
  });

  // Calculate target size keeping aspect ratio
  let width = img.width;
  let height = img.height;
  if (width > height) {
    if (width > maxW) {
      height = Math.round((height * maxW) / width);
      width = maxW;
    }
  } else {
    if (height > maxH) {
      width = Math.round((width * maxH) / height);
      height = maxH;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to Blob (JPEG, quality 0.7)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.7));
  return blob;
}

// Generate unique photo ID
export function generatePhotoId() {
  return `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert File to data URL
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Capture photo using camera
export async function capturePhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use back camera on mobile

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const dataURL = await fileToDataURL(file);
          resolve(dataURL);
        } catch (err) {
          reject(err);
        }
      }
    };

    input.click();
  });
}

// Select photo from device
export async function selectPhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const dataURL = await fileToDataURL(file);
          resolve(dataURL);
        } catch (err) {
          reject(err);
        }
      }
    };

    input.click();
  });
}

// Render photo preview grid in editor
export async function renderPhotoPreview() {
  const container = document.getElementById('photoPreviewContainer');
  if (!container) return;

  if (currentPhotos.length === 0) {
    container.innerHTML = '<div class="muted" style="text-align:center;padding:20px">No photos attached</div>';
    return;
  }

  // Load thumbnails from photos table (on-demand)
  const photoData = await getPhotoThumbnails(currentPhotos);

  // photoData.thumbnail may be a Blob (new) or a string (legacy); convert Blobs to dataURLs for rendering
  const prepared = await Promise.all(photoData.map(async (photo) => {
    if (!photo) return null;
    let thumbnail = photo.thumbnail;
    if (thumbnail && typeof thumbnail !== 'string') {
      try {
        thumbnail = await blobToDataURL(thumbnail);
      } catch (err) {
        console.error('Error converting thumbnail blob to dataURL', err);
        thumbnail = '';
      }
    }
    return { id: photo.id, thumbnail };
  }));

  const items = prepared.filter(p => p !== null);

  container.innerHTML = items.map((photo, index) => `
    <div class="photo-preview-item">
      <img src="${photo.thumbnail}" alt="Photo ${index + 1}" />
      <button class="remove-photo" data-photo-id="${photo.id}" type="button">×</button>
    </div>
  `).join('');

  // Bind remove buttons
  container.querySelectorAll('.remove-photo').forEach(btn => {
    btn.onclick = async () => {
      const photoId = btn.getAttribute('data-photo-id');
      const index = currentPhotos.indexOf(photoId);
      if (index > -1) {
        currentPhotos.splice(index, 1);
        await deletePhoto(photoId); // Delete from DB immediately
        renderPhotoPreview();
      }
    };
  });
}

// Update photo viewer to show current photo and update navigation
function updatePhotoViewer() {
  const img = el('photoModalImg');
  const counter = el('photoCounter');
  const prevBtn = el('photoPrevBtn');
  const nextBtn = el('photoNextBtn');

  if (allPhotosInViewer.length > 0 && currentPhotoIndex >= 0 && currentPhotoIndex < allPhotosInViewer.length) {
    img.src = allPhotosInViewer[currentPhotoIndex];

    if (counter) {
      counter.textContent = `${currentPhotoIndex + 1} / ${allPhotosInViewer.length}`;
    }

    // Show/hide navigation buttons
    if (prevBtn) {
      prevBtn.style.display = currentPhotoIndex > 0 ? 'flex' : 'none';
    }
    if (nextBtn) {
      nextBtn.style.display = currentPhotoIndex < allPhotosInViewer.length - 1 ? 'flex' : 'none';
    }
  }
}

// Navigate to previous photo
function showPreviousPhoto() {
  if (currentPhotoIndex > 0) {
    currentPhotoIndex--;
    updatePhotoViewer();
  }
}

// Navigate to next photo
function showNextPhoto() {
  if (currentPhotoIndex < allPhotosInViewer.length - 1) {
    currentPhotoIndex++;
    updatePhotoViewer();
  }
}

// Toggle controls visibility
function toggleControls() {
  controlsVisible = !controlsVisible;
  const modal = el('photoModal');

  if (controlsVisible) {
    modal.classList.add('controls-visible');
  } else {
    modal.classList.remove('controls-visible');
  }
}

// Show photo in full screen modal with all photos
export function showPhotoModal(photoDataURL, allPhotos = null) {
  const modal = el('photoModal');

  // Set up photo array and find current index
  if (allPhotos && allPhotos.length > 0) {
    allPhotosInViewer = allPhotos;
    currentPhotoIndex = allPhotos.indexOf(photoDataURL);
    if (currentPhotoIndex === -1) currentPhotoIndex = 0;
  } else {
    allPhotosInViewer = [photoDataURL];
    currentPhotoIndex = 0;
  }

  controlsVisible = true;
  modal.classList.add('controls-visible');

  updatePhotoViewer();
  modal.classList.add('active');

  // Setup touch gestures
  setupPhotoGestures();
}

// Setup touch gestures for swipe navigation and close
function setupPhotoGestures() {
  const modal = el('photoModal');
  const img = el('photoModalImg');

  // Remove old listeners if any
  const newImg = img.cloneNode(true);
  img.parentNode.replaceChild(newImg, img);

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isSwiping = false;
  let swipeDirection = null; // 'horizontal' or 'vertical'

  newImg.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
    swipeDirection = null;
  }, { passive: true });

  newImg.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;

    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Determine swipe direction on first significant movement
    if (!swipeDirection && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        swipeDirection = 'horizontal';
      } else {
        swipeDirection = 'vertical';
      }
    }

    // Apply visual feedback for vertical swipe (close gesture)
    if (swipeDirection === 'vertical' && Math.abs(deltaY) > 20) {
      const opacity = Math.max(0.3, 1 - Math.abs(deltaY) / 400);
      modal.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.9})`;
      newImg.style.transform = `translateY(${deltaY}px) scale(${Math.max(0.8, 1 - Math.abs(deltaY) / 800)})`;
    }
  }, { passive: true });

  newImg.addEventListener('touchend', (e) => {
    if (!isSwiping) return;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Reset visual state
    modal.style.backgroundColor = '';
    newImg.style.transform = '';

    // Handle swipe gestures
    if (swipeDirection === 'vertical' && Math.abs(deltaY) > 80) {
      // Swipe up or down to close
      closePhotoModal();
    } else if (swipeDirection === 'horizontal') {
      // Swipe left/right to navigate
      if (deltaX > 50 && currentPhotoIndex > 0) {
        showPreviousPhoto();
      } else if (deltaX < -50 && currentPhotoIndex < allPhotosInViewer.length - 1) {
        showNextPhoto();
      }
    } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      // Single tap to toggle controls
      toggleControls();
    }

    isSwiping = false;
    swipeDirection = null;
    startX = 0;
    startY = 0;
    currentX = 0;
    currentY = 0;
  }, { passive: true });

  // Also handle click on desktop
  newImg.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleControls();
  });
}

export function closePhotoModal() {
  const modal = el('photoModal');
  modal.classList.remove('active');
  modal.classList.remove('controls-visible');
  allPhotosInViewer = [];
  currentPhotoIndex = 0;
}

// Initialize photo modal navigation
export function initPhotoModal() {
  const closeBtn = el('closePhotoBtn');
  const prevBtn = el('photoPrevBtn');
  const nextBtn = el('photoNextBtn');
  const modal = el('photoModal');

  if (closeBtn) {
    closeBtn.onclick = closePhotoModal;
  }

  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      showPreviousPhoto();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      showNextPhoto();
    };
  }

  // Click on background to close
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        closePhotoModal();
      }
    };
  }
}

// Photo state management
// currentPhotos now stores photo IDs (strings), not objects
export function getPhotos() {
  return [...currentPhotos];
}

export function setPhotos(photoIds) {
  currentPhotos = Array.isArray(photoIds) ? [...photoIds] : [];
}

export function addPhoto(photoId) {
  currentPhotos.push(photoId);
}

export function clearPhotos() {
  currentPhotos = [];
}

/**
 * Downscale a photo to reduce storage size
 * @param {string} dataURL - Original photo data URL
 * @param {number} scale - Scale factor (e.g., 0.7 for 70% of original size)
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<Blob>} Downscaled photo as Blob
 */
async function downscalePhoto(dataURL, scale = 0.7, quality = 0.7) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataURL;
  });

  // Calculate target dimensions
  const targetWidth = Math.round(img.width * scale);
  const targetHeight = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Convert to Blob with JPEG compression
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return blob;
}

/**
 * Process a photo data URL and save to photos table immediately
 * Returns photo ID for referencing
 * @param {string} dataURL - Photo data URL
 * @param {number|null} itemId - Item ID (can be null for new items)
 * @returns {Promise<string>} Photo ID
 */
export async function processPhotoForEditing(dataURL, itemId = null) {
  const id = generatePhotoId();

  // Downscale the actual photo to 70% size with JPEG quality 0.7
  const blob = await downscalePhoto(dataURL, 0.7, 0.7);

  // Create thumbnail as Blob (smaller, for gallery view)
  const thumbnailBlob = await createThumbnailBlob(dataURL);

  // Save to photos table immediately (itemId will be updated on item save)
  await savePhoto(id, blob, thumbnailBlob, itemId);

  return id; // Just return the ID
}
