/* =============================
   Search Functionality
   ============================= */

import { el } from '../utils.js';
import { searchByText } from '../db.js';

export function setupSearch(onSearchResults) {
  const searchInput = el('searchInput');
  const clearBtn = el('clearSearchBtn');

  // Update clear button visibility based on input value
  function updateClearButton() {
    if (searchInput.value.trim().length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }
  }

  searchInput.oninput = async () => {
    updateClearButton();
    const query = searchInput.value.trim();
    const items = await searchByText(query);
    if (onSearchResults) onSearchResults(items);
  };

  // Clear button click handler
  clearBtn.onclick = () => {
    searchInput.value = '';
    updateClearButton();
    // Trigger search to show all items
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  };

  // Initial check on setup
  updateClearButton();
}

export function setSearchValue(value) {
  const searchInput = el('searchInput');
  searchInput.value = value;

  // Update clear button visibility when search value is set programmatically
  const clearBtn = el('clearSearchBtn');
  if (clearBtn) {
    if (value && value.trim().length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }
  }
}

export function getSearchValue() {
  return el('searchInput').value.trim();
}
