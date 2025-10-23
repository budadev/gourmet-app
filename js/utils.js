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
    let startTime = 0;
    let moved = false;
    const MOVE_THRESHOLD = 5; // px vertical move considered scroll (reduced for better detection)
    const TIME_THRESHOLD = 300; // ms - if touch is longer than this, likely scrolling

    sel.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length) {
        startY = e.touches[0].clientY;
        startTime = Date.now();
        moved = false;
      }
    }, { passive: true });

    sel.addEventListener('touchmove', e => {
      if (e.touches && e.touches.length) {
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dy > MOVE_THRESHOLD) {
          moved = true;
        }
      }
    }, { passive: true });

    sel.addEventListener('touchend', e => {
      const touchDuration = Date.now() - startTime;

      // If user was scrolling or touch was too long, prevent the select from opening
      if (moved || touchDuration > TIME_THRESHOLD) {
        e.preventDefault();
        e.stopPropagation();
        // Blur to avoid lingering focus style
        sel.blur();
        return;
      }

      // Treat as intentional tap - ensure the select gets focus
      if (document.activeElement !== sel) {
        sel.focus();
      }
    }, { passive: false });

    // Click event handler as additional safeguard
    sel.addEventListener('click', e => {
      // If we detected movement during the last touch, prevent click too
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }, { passive: false });

    // Pointer events fallback (non-touch or stylus)
    sel.addEventListener('pointerdown', e => {
      // Only handle non-touch pointer events
      if (e.pointerType !== 'touch' && document.activeElement !== sel) {
        sel.focus();
      }
    }, { passive: true });
  });
}
