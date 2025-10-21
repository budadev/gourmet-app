/* =============================
   Modal Utilities
   ============================= */

import { el } from '../utils.js';

export function openModal(modalId) {
  const modal = el(modalId);
  modal.classList.add('active');

  // Reset scroll position for modal body
  const modalBody = modal.querySelector('.modal-body');
  if (modalBody) {
    modalBody.scrollTop = 0;
  }

  // Also reset the modal content scroll if it exists
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.scrollTop = 0;
  }
}

export function closeModal(modalId) {
  const modal = el(modalId);
  modal.classList.remove('active');
}

