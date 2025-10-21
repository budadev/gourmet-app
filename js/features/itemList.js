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

  if (sorted.length === 0) {
    resultsEl.innerHTML = '<div class="empty-state">No items found. Tap the + button to add your first item!</div>';
    return;
  }

  resultsEl.innerHTML = sorted.map(it => {
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

  // Bind click events to show details
  resultsEl.querySelectorAll('.item').forEach(itemEl => {
    itemEl.onclick = () => {
      const id = Number(itemEl.getAttribute('data-id'));
      if (onItemClick) onItemClick(id);
    };
  });
}

