/* =============================
   View Selector Feature
   Handles switching between different list views: All, Nearby picks, Memory lane
   ============================= */

let currentView = 'all';
let viewChangeCallback = null;
let userLocation = null;

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
async function setActiveView(view) {
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

  // If switching to nearby view, show loading immediately and then get user location
  if (view === 'nearby') {
    // Show loading state immediately
    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Getting your location...</p></div>';
    }

    // Fetch user location
    userLocation = await getUserLocation();
  }

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

/**
 * Get user's current location
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function getUserLocation() {
  if (!navigator || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let handled = false;
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!handled) {
            handled = true;
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          }
        },
        (error) => {
          if (!handled) {
            handled = true;
            resolve(null);
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch (e) {
      if (!handled) {
        handled = true;
        resolve(null);
      }
    }

    // Fallback timeout
    setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve(null);
      }
    }, 10200);
  });
}

/**
 * Get current user location (cached if recently fetched for nearby view)
 * @returns {{lat: number, lng: number}|null}
 */
export function getCachedUserLocation() {
  return userLocation;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

