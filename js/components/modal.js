/* =============================
   Modal Utilities
   ============================= */

import { el } from '../utils.js';

export function openModal(modalId) {
  const modal = el(modalId);
  modal.classList.add('active');
  document.body.classList.add('no-scroll');
  const modalBody = modal.querySelector('.modal-body');
  if (modalBody) modalBody.scrollTop = 0;
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) modalContent.scrollTop = 0;
}

export function closeModal(modalId) {
  const modal = el(modalId);
  modal.classList.remove('active');
  document.body.classList.remove('no-scroll');
}
