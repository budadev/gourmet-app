/* =============================
   Search Functionality
   ============================= */

import { el } from '../utils.js';
import { searchByText } from '../db.js';

export function setupSearch(onSearchResults) {
  const searchInput = el('searchInput');

  searchInput.oninput = async () => {
    const query = searchInput.value.trim();
    const items = await searchByText(query);
    if (onSearchResults) onSearchResults(items);
  };
}

export function setSearchValue(value) {
  el('searchInput').value = value;
}

export function getSearchValue() {
  return el('searchInput').value.trim();
}

