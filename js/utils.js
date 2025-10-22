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

// iOS Safari select double-tap + accidental open-on-scroll mitigation
export function enhanceSelectInteractivity(root = document) {
  const ua = navigator.userAgent || '';
  const isiOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if (!isiOS) return;

  root.querySelectorAll('select').forEach(sel => {
    if (sel.__enhanced) return;
    sel.__enhanced = true;

    let startY = 0;
    let moved = false;
    const MOVE_THRESHOLD = 10; // px vertical move considered scroll

    const focusIfNeeded = () => {
      if (document.activeElement !== sel) sel.focus();
    };

    sel.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length) {
        startY = e.touches[0].clientY;
        moved = false;
      }
    }, { passive: true });

    sel.addEventListener('touchmove', e => {
      if (e.touches && e.touches.length) {
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dy > MOVE_THRESHOLD) moved = true;
      }
    }, { passive: true });

    sel.addEventListener('touchend', e => {
      // If user was scrolling, prevent the select from opening.
      if (moved) {
        // Prevent native open caused by tap end on select after scroll
        e.preventDefault();
        // Blur to avoid lingering focus style
        sel.blur();
        return;
      }
      // Treat as intentional tap
      focusIfNeeded();
      // Delay refocus slightly to dodge iOS double-tap quirks
      setTimeout(focusIfNeeded, 30);
    }, { passive: false });

    // Pointer events fallback (non-touch or stylus)
    sel.addEventListener('pointerdown', focusIfNeeded, { passive: true });
  });
}
