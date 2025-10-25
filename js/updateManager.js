/* =============================
   PWA Update Manager
   Handles version checking and update notifications
   ============================= */

const UPDATE_CHECK_KEY = 'gourmetapp_last_update_check';
const SKIPPED_VERSION_KEY = 'gourmetapp_skipped_version';
const CURRENT_VERSION_KEY = 'gourmetapp_current_version';

let serviceWorkerRegistration = null;
let updateBannerShown = false;

/**
 * Initialize the update manager
 */
export async function initUpdateManager() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }

  // Register service worker
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');
    console.log('Service Worker registered:', serviceWorkerRegistration.scope);

    // Check for updates periodically
    checkForUpdates();

    // Listen for service worker updates
    serviceWorkerRegistration.addEventListener('updatefound', () => {
      const newWorker = serviceWorkerRegistration.installing;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker is installed, check version
          checkForUpdates();
        }
      });
    });

    // Check for updates when page becomes visible (user returns to app)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkForUpdates();
      }
    });

    // Check for updates every 30 minutes while app is running
    setInterval(checkForUpdates, 30 * 60 * 1000);

  } catch (err) {
    console.log('Service Worker registration failed:', err);
  }
}

/**
 * Check if a new version is available
 */
async function checkForUpdates() {
  try {
    // Fetch the latest version info with cache busting
    const response = await fetch(`./version.json?t=${Date.now()}`);
    const versionInfo = await response.json();
    const latestVersion = versionInfo.version;

    // Get current version from localStorage
    const currentVersion = localStorage.getItem(CURRENT_VERSION_KEY);
    const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);

    // First time install - just save the version
    if (!currentVersion) {
      localStorage.setItem(CURRENT_VERSION_KEY, latestVersion);
      return;
    }

    // Check if there's a new version
    if (latestVersion !== currentVersion) {
      // Don't show banner if user skipped this version
      if (skippedVersion === latestVersion) {
        console.log(`Update ${latestVersion} skipped by user`);
        return;
      }

      // Don't show banner if already shown
      if (updateBannerShown) {
        return;
      }

      // Show update banner
      showUpdateBanner(latestVersion, currentVersion, versionInfo.changes || []);
    } else {
      // Same version - update service worker if needed
      if (serviceWorkerRegistration) {
        await serviceWorkerRegistration.update();
      }
    }
  } catch (err) {
    console.error('Error checking for updates:', err);
  }
}

/**
 * Show the update banner
 */
function showUpdateBanner(newVersion, oldVersion, changes) {
  updateBannerShown = true;

  // Create banner HTML
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="update-banner-content">
      <div class="update-banner-header">
        <div class="update-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div class="update-title">
          <strong>Update Available</strong>
          <span class="update-version">Version ${newVersion}</span>
        </div>
      </div>
      ${changes.length > 0 ? `
        <div class="update-changes">
          <strong>What's new:</strong>
          <ul>
            ${changes.slice(0, 3).map(change => `<li>${change}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="update-actions">
        <button class="btn ghost btn-sm" id="skipVersionBtn">Skip this version</button>
        <button class="btn ghost btn-sm" id="dismissUpdateBtn">Not now</button>
        <button class="btn primary btn-sm" id="updateNowBtn">Update</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Animate in
  setTimeout(() => banner.classList.add('active'), 10);

  // Setup button handlers
  document.getElementById('updateNowBtn').addEventListener('click', () => {
    applyUpdate(newVersion);
  });

  document.getElementById('dismissUpdateBtn').addEventListener('click', () => {
    dismissBanner(banner);
  });

  document.getElementById('skipVersionBtn').addEventListener('click', () => {
    skipVersion(newVersion, banner);
  });
}

/**
 * Apply the update
 */
async function applyUpdate(newVersion) {
  const banner = document.getElementById('updateBanner');

  // Show loading state
  banner.innerHTML = `
    <div class="update-banner-content">
      <div class="update-banner-header">
        <div class="update-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: rotate 1s linear infinite;">
            <circle cx="12" cy="12" r="10" opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
        </div>
        <div class="update-title">
          <strong>Updating...</strong>
          <span class="update-version">Please wait</span>
        </div>
      </div>
    </div>
  `;

  try {
    // Step 1: Unregister ALL service workers first
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }
      console.log('All service workers unregistered');
    }

    // Step 2: Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('All caches cleared');
    }

    // Step 3: Update version BEFORE reload (this is critical!)
    // This way, when the app reloads, it knows it should be on the new version
    localStorage.setItem(CURRENT_VERSION_KEY, newVersion);
    localStorage.removeItem(SKIPPED_VERSION_KEY);

    // Step 4: Set a flag that we're in the middle of an update
    sessionStorage.setItem('gourmetapp_updating', 'true');

    // Show success message
    banner.innerHTML = `
      <div class="update-banner-content">
        <div class="update-banner-header">
          <div class="update-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div class="update-title">
            <strong>Update Complete!</strong>
            <span class="update-version">Reloading app...</span>
          </div>
        </div>
      </div>
    `;

    // Step 5: Force a hard reload
    setTimeout(() => {
      // Simply use location.reload(true) for a hard refresh
      // This works on both web and iOS PWA without leaving artifacts
      window.location.reload(true);
    }, 1000);

  } catch (err) {
    console.error('Error applying update:', err);

    // Show error message
    banner.innerHTML = `
      <div class="update-banner-content">
        <div class="update-banner-header">
          <div class="update-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div class="update-title">
            <strong>Update Failed</strong>
            <span class="update-version">Please try again</span>
          </div>
        </div>
        <div class="update-actions">
          <button class="btn ghost btn-sm" id="closeBannerBtn">Close</button>
          <button class="btn primary btn-sm" id="retryUpdateBtn">Retry</button>
        </div>
      </div>
    `;

    document.getElementById('closeBannerBtn').addEventListener('click', () => {
      dismissBanner(banner);
    });

    document.getElementById('retryUpdateBtn').addEventListener('click', () => {
      applyUpdate(newVersion);
    });
  }
}

/**
 * Dismiss the banner (not now)
 */
function dismissBanner(banner) {
  banner.classList.remove('active');
  setTimeout(() => {
    banner.remove();
    updateBannerShown = false;
  }, 300);
}

/**
 * Skip this version
 */
function skipVersion(version, banner) {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
  dismissBanner(banner);
}

/**
 * Force check for updates (can be called manually)
 */
export async function forceUpdateCheck() {
  updateBannerShown = false;
  await checkForUpdates();
}

/**
 * Check for updates and return version info (for About dialog)
 * @returns {Promise<{hasUpdate: boolean, currentVersion: string, latestVersion: string, changes: Array}>}
 */
export async function checkUpdateStatus() {
  try {
    // Fetch the latest version info with cache busting
    const response = await fetch(`./version.json?t=${Date.now()}`);
    const versionInfo = await response.json();
    const latestVersion = versionInfo.version;

    // Get current version from localStorage
    const currentVersion = localStorage.getItem(CURRENT_VERSION_KEY) || latestVersion;

    // Check if there's a new version
    const hasUpdate = latestVersion !== currentVersion;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      changes: versionInfo.changes || []
    };
  } catch (err) {
    console.error('Error checking update status:', err);
    const currentVersion = localStorage.getItem(CURRENT_VERSION_KEY) || 'Unknown';
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      changes: []
    };
  }
}

/**
 * Show update banner from external trigger (e.g., About dialog)
 */
export async function showUpdateBannerManually() {
  const status = await checkUpdateStatus();
  if (status.hasUpdate) {
    // Remove any existing banner first
    const existingBanner = document.getElementById('updateBanner');
    if (existingBanner) {
      existingBanner.remove();
    }
    updateBannerShown = false;
    showUpdateBanner(status.latestVersion, status.currentVersion, status.changes);
  }
}

