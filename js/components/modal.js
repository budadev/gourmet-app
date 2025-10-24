/* =============================
   Modal Utilities
   ============================= */

import { el } from '../utils.js';

export function openModal(modalId) {
  const modal = el(modalId);
  modal.classList.add('active');
  document.body.classList.add('no-scroll');
  adjustLayout(modal);
  setupViewportListeners(modal);
}

export function closeModal(modalId) {
  const modal = el(modalId);
  modal.classList.remove('active');
  document.body.classList.remove('no-scroll');
  teardownViewportListeners(modal);
}

function adjustLayout(modal){
  if (!modal) return;
  const header = modal.querySelector('.modal-header');
  const body = modal.querySelector('.modal-body');
  const footer = modal.querySelector('.modal-footer');
  if (!body || !header || !footer) return;
  const headerH = header.getBoundingClientRect().height;
  const footerH = footer.getBoundingClientRect().height;

  const vv = window.visualViewport;
  const viewportHeight = vv ? vv.height : window.innerHeight;

  // Detect keyboard (heuristic: visualViewport height significantly smaller than innerHeight)
  const keyboardOpen = vv ? (window.innerHeight - vv.height) > 150 : false;
  if (keyboardOpen){
    footer.classList.add('footer-hidden');
  } else {
    footer.classList.remove('footer-hidden');
  }

  // Set body explicit height so scroll calculations are stable
  const safeTop = getSafeInset('top');
  const safeBottom = getSafeInset('bottom');
  const available = viewportHeight - headerH - (keyboardOpen ? 0 : footerH) - safeTop - safeBottom;
  if (available > 120){ // avoid collapsing too small
    body.style.height = available + 'px';
  } else {
    body.style.height = 'auto';
  }
}

function setupViewportListeners(modal){
  if (!window.visualViewport) return;
  const handler = () => adjustLayout(modal);
  window.visualViewport.addEventListener('resize', handler);
  window.visualViewport.addEventListener('scroll', handler); // some iOS versions fire scroll on keyboard
  modal.__vvHandler = handler;
}
function teardownViewportListeners(modal){
  if (!modal || !modal.__vvHandler || !window.visualViewport) return;
  window.visualViewport.removeEventListener('resize', modal.__vvHandler);
  window.visualViewport.removeEventListener('scroll', modal.__vvHandler);
  delete modal.__vvHandler;
}

function getSafeInset(side){
  // Fallback to 0 if env variables unsupported
  try {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue(`env(safe-area-inset-${side})`)) || 0;
  } catch(e){return 0;}
}
