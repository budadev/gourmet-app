/* =============================
   View Selector Feature
   Handles switching between different list views: All, Nearby picks, Memory lane
   ============================= */

let currentView = 'all';
let viewChangeCallback = null;

/**
 * Initialize view selector buttons
 * @param {Function} onViewChange - Callback when view changes (receives view name as parameter)
 */
export function initViewSelector(onViewChange) {
  viewChangeCallback = onViewChange;

  const buttons = document.querySelectorAll('.view-selector-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      setActiveView(view);
    });
  });

  // Set initial view
  setActiveView('all');
}

/**
 * Set the active view
 * @param {string} view - View identifier ('all', 'nearby', 'memory')
 */
function setActiveView(view) {
  if (currentView === view) return;

  currentView = view;

  // Update button states
  const buttons = document.querySelectorAll('.view-selector-btn');
  buttons.forEach(btn => {
    const btnView = btn.getAttribute('data-view');
    if (btnView === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Notify callback
  if (viewChangeCallback) {
    viewChangeCallback(view);
  }
}

/**
 * Get the current active view
 * @returns {string} Current view identifier
 */
export function getCurrentView() {
  return currentView;
}

