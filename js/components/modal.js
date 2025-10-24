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

  // Dynamic header alignment: ensure body padding-top equals header height
  adjustModalLayout(modal);

  // Listen for visual viewport resize (keyboard show/hide) to keep alignment stable
  if (window.visualViewport) {
    const resizeHandler = () => adjustModalLayout(modal);
    // Store handler so it can be removed on close if desired later
    modal.__vvHandler = resizeHandler;
    window.visualViewport.addEventListener('resize', resizeHandler);
  }
}

export function closeModal(modalId) {
  const modal = el(modalId);
  modal.classList.remove('active');
  // Clean up resize listener if present
  if (modal.__vvHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', modal.__vvHandler);
    delete modal.__vvHandler;
  }
}

function adjustModalLayout(modal) {
  if (!modal) return;
  const header = modal.querySelector('.modal-header');
  const body = modal.querySelector('.modal-body');
  if (!header || !body) return;
  // Measure header height (including safe-area padding) and apply directly
  const headerHeight = header.getBoundingClientRect().height;
  body.style.paddingTop = headerHeight + 'px';
}

// Ensure alignment if a modal is already active on initial load (edge case)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal.active').forEach(m => adjustModalLayout(m));
});
