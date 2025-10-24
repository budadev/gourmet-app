/* =============================
   Modal Utilities
   ============================= */

import { el } from '../utils.js';

export function openModal(modalId) {
  const modal = el(modalId);
  modal.classList.add('active');
  document.body.classList.add('no-scroll');
  const content = modal.querySelector('.modal-content');
  if (content) content.scrollTop = 0;
}

export function closeModal(modalId) {
  const modal = el(modalId);
  modal.classList.remove('active');
  document.body.classList.remove('no-scroll');
}
