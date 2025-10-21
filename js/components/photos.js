/* =============================
   Photo Management
   ============================= */

import { el } from '../utils.js';

let currentPhotos = [];

// Convert file to base64 data URL
async function fileToDataURL(file) {
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
export function renderPhotoPreview() {
  const container = document.getElementById('photoPreviewContainer');
  if (!container) return;

  if (currentPhotos.length === 0) {
    container.innerHTML = '<div class="muted" style="text-align:center;padding:20px">No photos attached</div>';
    return;
  }

  container.innerHTML = currentPhotos.map((photo, index) => `
    <div class="photo-preview-item">
      <img src="${photo}" alt="Photo ${index + 1}" />
      <button class="remove-photo" data-index="${index}" type="button">×</button>
    </div>
  `).join('');

  // Bind remove buttons
  container.querySelectorAll('.remove-photo').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.getAttribute('data-index'));
      currentPhotos.splice(index, 1);
      renderPhotoPreview();
    };
  });
}

// Show photo in full screen modal
export function showPhotoModal(photoDataURL) {
  const modal = el('photoModal');
  const img = el('photoModalImg');
  img.src = photoDataURL;
  modal.classList.add('active');
}

export function closePhotoModal() {
  el('photoModal').classList.remove('active');
}

// Photo state management
export function getPhotos() {
  return currentPhotos;
}

export function setPhotos(photos) {
  currentPhotos = Array.isArray(photos) ? [...photos] : [];
}

export function addPhoto(photoDataURL) {
  currentPhotos.push(photoDataURL);
}

export function clearPhotos() {
  currentPhotos = [];
}

