/* =============================
   Utility Functions
   ============================= */

export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

export function formatDate(timestamp) {
  return new Date(timestamp || Date.now()).toLocaleString();
}

export function el(id) {
  return document.getElementById(id);
}

// iOS Safari select double-tap mitigation
export function enhanceSelectInteractivity(root = document) {
  const ua = navigator.userAgent || '';
  const isiOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if (!isiOS) return;

  root.querySelectorAll('select').forEach(sel => {
    if (sel.__enhanced) return;
    sel.__enhanced = true;
    const focusIfNeeded = () => {
      if (document.activeElement !== sel) {
        sel.focus();
      }
    };
    sel.addEventListener('touchstart', focusIfNeeded, { passive: true });
    sel.addEventListener('pointerdown', focusIfNeeded, { passive: true });
    sel.addEventListener('touchend', () => {
      setTimeout(focusIfNeeded, 30);
    }, { passive: true });
  });
}

