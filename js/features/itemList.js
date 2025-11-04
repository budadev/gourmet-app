/* =============================
   Item List Rendering
   ============================= */

import { escapeHtml, el } from '../utils.js';
import { renderStars } from '../components/rating.js';
import { getTypeInfo } from '../config.js';

export function sortByRating(items) {
  return items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
}

export function renderList(items, onItemClick) {
  const resultsEl = el('results');
  const sorted = sortByRating([...items]);
  const BATCH_SIZE = 50;
  let renderedCount = 0;

  if (sorted.length === 0) {
    resultsEl.innerHTML = '<div class="empty-state">No items found. Tap the + button to add your first item!</div>';
    return;
  }

  resultsEl.innerHTML = '';

  function renderBatch() {
    const nextItems = sorted.slice(renderedCount, renderedCount + BATCH_SIZE);
    const html = nextItems.map(it => {
      const typeInfo = getTypeInfo(it.type);
      return `
      <div class="item" data-id="${it.id}">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div style="flex:1">
            <div style="font-weight:700;font-size:16px">${typeInfo.icon} ${escapeHtml(it.name || 'Unnamed')}</div>
            <div class="muted" style="font-size:12px;margin-top:4px">${typeInfo.label}</div>
          </div>
          <div>${renderStars(Number(it.rating) || 0, false)}</div>
        </div>
      </div>`;
    }).join('');
    resultsEl.insertAdjacentHTML('beforeend', html);
    // Bind click events for new items
    resultsEl.querySelectorAll('.item').forEach(itemEl => {
      if (!itemEl._bound) {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;

        // Handle touch start
        itemEl.addEventListener('touchstart', (e) => {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }, { passive: true });

        // Handle touch end - trigger click if it's a tap (not a swipe/scroll)
        itemEl.addEventListener('touchend', (e) => {
          if (!touchStartX) return;

          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const touchDuration = Date.now() - touchStartTime;

          const deltaX = Math.abs(touchEndX - touchStartX);
          const deltaY = Math.abs(touchEndY - touchStartY);

          // If movement is small (< 10px) and duration is short (< 500ms), treat as tap
          if (deltaX < 10 && deltaY < 10 && touchDuration < 500) {
            e.preventDefault(); // Prevent ghost click
            const id = Number(itemEl.getAttribute('data-id'));
            if (onItemClick) onItemClick(id);
          }

          touchStartX = 0;
          touchStartY = 0;
          touchStartTime = 0;
        }, { passive: false });

        // Fallback for non-touch devices (desktop)
        itemEl.addEventListener('click', (e) => {
          // Only handle click if it's not from a touch device
          if (e.detail === 0 || !('ontouchstart' in window)) {
            const id = Number(itemEl.getAttribute('data-id'));
            if (onItemClick) onItemClick(id);
          }
        });

        itemEl._bound = true;
      }
    });
    renderedCount += nextItems.length;
  }

  // Initial batch
  renderBatch();

  function onScroll() {
    // If near the bottom, render next batch
    if (resultsEl.scrollHeight - resultsEl.scrollTop - resultsEl.clientHeight < 200) {
      if (renderedCount < sorted.length) {
        renderBatch();
      }
    }
  }

  // Remove previous scroll listener if any
  if (resultsEl._virtualScrollHandler) {
    resultsEl.removeEventListener('scroll', resultsEl._virtualScrollHandler);
  }
  resultsEl._virtualScrollHandler = onScroll;
  resultsEl.addEventListener('scroll', onScroll);

  // For non-scrollable containers (e.g., body scroll), also listen to window
  if (resultsEl.scrollHeight <= resultsEl.clientHeight) {
    function onWindowScroll() {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
        if (renderedCount < sorted.length) {
          renderBatch();
        }
      }
    }
    if (resultsEl._windowScrollHandler) {
      window.removeEventListener('scroll', resultsEl._windowScrollHandler);
    }
    resultsEl._windowScrollHandler = onWindowScroll;
    window.addEventListener('scroll', onWindowScroll);
  }
}
