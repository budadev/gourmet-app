/* =============================
   Memory Lane Feature
   Instagram-style story viewer for highly-rated items with photos
   ============================= */

import { listAll, getPhotosByItemId } from '../db.js';
import { escapeHtml } from '../utils.js';
import { renderStars } from '../components/rating.js';

let memoryLaneContainer = null;
let currentItems = [];
let currentIndex = 0;
let progressInterval = null;
let progressStartTime = 0;
let isPaused = false;
const ITEM_DURATION = 5000; // 5 seconds per item

/**
 * Initialize memory lane feature
 */
export function initMemoryLane() {
  // Create memory lane container if it doesn't exist
  if (!memoryLaneContainer) {
    memoryLaneContainer = document.createElement('div');
    memoryLaneContainer.id = 'memoryLaneContainer';
    memoryLaneContainer.className = 'memory-lane-container';
    document.body.appendChild(memoryLaneContainer);
  }
}

/**
 * Show memory lane view with random items
 */
export async function showMemoryLane() {
  if (!memoryLaneContainer) {
    initMemoryLane();
  }

  // Show loading state
  memoryLaneContainer.innerHTML = `
    <div class="memory-lane-loading">
      <div class="memory-lane-loading-spinner"></div>
      <div class="memory-lane-loading-text">Loading memories...</div>
    </div>
  `;
  memoryLaneContainer.classList.add('active');

  // Fetch items from database
  const allItems = await listAll();

  // Filter items: rating >= 4 and has at least one photo
  const eligibleItems = [];
  for (const item of allItems) {
    const rating = Number(item.rating) || 0;
    if (rating >= 4) {
      const photos = await getPhotosByItemId(item.id);
      if (photos && photos.length > 0) {
        eligibleItems.push({
          ...item,
          photos: photos
        });
      }
    }
  }

  // Check if we have any items
  if (eligibleItems.length === 0) {
    showEmptyState();
    return;
  }

  // Randomly select up to 10 items
  currentItems = shuffleArray(eligibleItems).slice(0, 10);
  currentIndex = 0;

  // Render the UI
  renderMemoryLane();

  // Start showing items
  showItem(0);
}

/**
 * Hide memory lane view and switch to "All" view
 */
export function hideMemoryLane() {
  if (memoryLaneContainer) {
    memoryLaneContainer.classList.remove('active');
    stopProgress();
    currentItems = [];
    currentIndex = 0;

    // Switch to "All" view
    const allViewBtn = document.getElementById('viewAll');
    if (allViewBtn && !allViewBtn.classList.contains('active')) {
      allViewBtn.click();
    }
  }
}

/**
 * Check if memory lane is active
 */
export function isMemoryLaneActive() {
  return memoryLaneContainer && memoryLaneContainer.classList.contains('active');
}

/**
 * Render the memory lane UI
 */
function renderMemoryLane() {
  const progressBars = currentItems.map((_, index) => `
    <div class="memory-lane-progress-bar" data-index="${index}">
      <div class="memory-lane-progress-fill"></div>
    </div>
  `).join('');

  const itemsHtml = currentItems.map((item, index) => {
    // Pick a random photo
    const photo = item.photos[Math.floor(Math.random() * item.photos.length)];
    const photoUrl = photo ? URL.createObjectURL(photo.blob) : null;

    // Check if notes exist (field is 'notes' not 'note')
    const hasNote = item.notes && typeof item.notes === 'string' && item.notes.trim().length > 0;

    return `
      <div class="memory-lane-item" data-index="${index}">
        <div class="memory-lane-header">
          <div class="memory-lane-item-name">${escapeHtml(item.name || 'Unnamed')}</div>
          <div class="memory-lane-rating">${renderStars(Number(item.rating) || 0, false)}</div>
        </div>
        <div class="memory-lane-photo-container">
          ${photoUrl
            ? `<img src="${photoUrl}" alt="${escapeHtml(item.name || 'Item photo')}" class="memory-lane-photo" />`
            : `<div class="memory-lane-no-photo">📷</div>`
          }
          ${hasNote ? `
            <div class="memory-lane-note">
              <div class="memory-lane-note-text">${escapeHtml(item.notes.trim())}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  memoryLaneContainer.innerHTML = `
    <div class="memory-lane-progress">
      ${progressBars}
    </div>
    <button class="memory-lane-close" aria-label="Close memory lane">×</button>
    <div class="memory-lane-content">
      ${itemsHtml}
    </div>
    <div class="memory-lane-touch-zone left"></div>
    <div class="memory-lane-touch-zone right"></div>
  `;

  // Attach event listeners
  attachEventListeners();
}

/**
 * Show empty state when no items available
 */
function showEmptyState() {
  memoryLaneContainer.innerHTML = `
    <button class="memory-lane-close" aria-label="Close memory lane">×</button>
    <div class="memory-lane-empty active">
      <div class="memory-lane-empty-icon">✨</div>
      <div class="memory-lane-empty-title">No memories yet</div>
      <div class="memory-lane-empty-text">
        Add photos and ratings (4+) to your items to see them here!
      </div>
    </div>
  `;

  // Attach close button listener
  const closeBtn = memoryLaneContainer.querySelector('.memory-lane-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideMemoryLane);
  }
}

/**
 * Show end screen with replay and new story options
 */
function showEndScreen() {
  stopProgress();

  memoryLaneContainer.innerHTML = `
    <button class="memory-lane-close" aria-label="Close memory lane">×</button>
    <div class="memory-lane-end active">
      <div class="memory-lane-end-icon">🎬</div>
      <div class="memory-lane-end-title">Memory lane complete!</div>
      <div class="memory-lane-end-text">
        You've seen all ${currentItems.length} memories
      </div>
      <div class="memory-lane-end-actions">
        <button class="memory-lane-end-btn primary" id="replayMemoryBtn">
          <span>🔄</span>
          <span>Rewatch</span>
        </button>
        <button class="memory-lane-end-btn secondary" id="newMemoryBtn">
          <span>✨</span>
          <span>New Memory Lane</span>
        </button>
      </div>
    </div>
  `;

  // Attach event listeners
  const closeBtn = memoryLaneContainer.querySelector('.memory-lane-close');
  const replayBtn = memoryLaneContainer.querySelector('#replayMemoryBtn');
  const newMemoryBtn = memoryLaneContainer.querySelector('#newMemoryBtn');

  if (closeBtn) {
    closeBtn.addEventListener('click', hideMemoryLane);
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      // Stop any running timers
      stopProgress();
      // Reset index
      currentIndex = 0;
      // Re-render with same items
      renderMemoryLane();
      // Start from first item
      showItem(0);
    });
  }

  if (newMemoryBtn) {
    newMemoryBtn.addEventListener('click', async () => {
      // Stop any running timers
      stopProgress();
      // Reset state
      currentItems = [];
      currentIndex = 0;
      // Generate new memory lane with different items
      await showMemoryLane();
    });
  }
}

/**
 * Attach event listeners to the memory lane UI
 */
function attachEventListeners() {
  // Remove any existing event listeners first
  cleanupEventListeners();

  // Close button
  const closeBtn = memoryLaneContainer.querySelector('.memory-lane-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideMemoryLane);
  }

  // Touch zones for navigation
  const leftZone = memoryLaneContainer.querySelector('.memory-lane-touch-zone.left');
  const rightZone = memoryLaneContainer.querySelector('.memory-lane-touch-zone.right');

  if (leftZone) {
    leftZone.addEventListener('click', () => previousItem());
  }

  if (rightZone) {
    rightZone.addEventListener('click', () => nextItem());
  }

  // Swipe gestures - store handlers so we can remove them later
  let touchStartX = 0;
  let touchStartY = 0;

  const touchStartHandler = (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  };

  const touchEndHandler = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = Math.abs(touchEndY - touchStartY);

    // Only handle horizontal swipes (vertical < 50px threshold)
    if (deltaY < 50 && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // Swipe right - previous item
        previousItem();
      } else {
        // Swipe left - next item
        nextItem();
      }
    }
  };

  memoryLaneContainer.addEventListener('touchstart', touchStartHandler, { passive: true });
  memoryLaneContainer.addEventListener('touchend', touchEndHandler, { passive: true });

  // Store references for cleanup
  memoryLaneContainer._touchStartHandler = touchStartHandler;
  memoryLaneContainer._touchEndHandler = touchEndHandler;

  // Keyboard navigation
  const handleKeyboard = (e) => {
    if (!isMemoryLaneActive()) return;

    if (e.key === 'ArrowLeft') {
      previousItem();
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      nextItem();
    } else if (e.key === 'Escape') {
      hideMemoryLane();
    }
  };

  document.addEventListener('keydown', handleKeyboard);

  // Store reference to cleanup later
  memoryLaneContainer._keyboardHandler = handleKeyboard;
}

/**
 * Clean up event listeners to prevent duplicates
 */
function cleanupEventListeners() {
  if (memoryLaneContainer) {
    // Remove keyboard handler
    if (memoryLaneContainer._keyboardHandler) {
      document.removeEventListener('keydown', memoryLaneContainer._keyboardHandler);
      delete memoryLaneContainer._keyboardHandler;
    }

    // Remove touch handlers
    if (memoryLaneContainer._touchStartHandler) {
      memoryLaneContainer.removeEventListener('touchstart', memoryLaneContainer._touchStartHandler);
      delete memoryLaneContainer._touchStartHandler;
    }

    if (memoryLaneContainer._touchEndHandler) {
      memoryLaneContainer.removeEventListener('touchend', memoryLaneContainer._touchEndHandler);
      delete memoryLaneContainer._touchEndHandler;
    }
  }
}

/**
 * Show a specific item by index
 */
function showItem(index) {
  // Validate we have items
  if (!currentItems || currentItems.length === 0) {
    hideMemoryLane();
    return;
  }

  if (index < 0) {
    // Don't go before first item
    return;
  }

  if (index >= currentItems.length) {
    // End of memory lane - show end screen
    showEndScreen();
    return;
  }

  currentIndex = index;

  // Update item visibility
  const items = memoryLaneContainer?.querySelectorAll('.memory-lane-item');
  if (!items || items.length === 0) {
    console.warn('No items found in DOM');
    return;
  }

  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update progress bars
  const progressBars = memoryLaneContainer?.querySelectorAll('.memory-lane-progress-bar');
  if (progressBars) {
    progressBars.forEach((bar, i) => {
      bar.classList.remove('active', 'completed');
      const fill = bar.querySelector('.memory-lane-progress-fill');
      if (fill) {
        fill.style.width = '0%';
      }

      if (i < index) {
        bar.classList.add('completed');
      } else if (i === index) {
        bar.classList.add('active');
      }
    });
  }

  // Start progress animation
  startProgress();
}

/**
 * Start progress animation for current item
 */
function startProgress() {
  // Always stop any existing progress first
  stopProgress();

  isPaused = false;
  progressStartTime = Date.now();

  progressInterval = setInterval(() => {
    if (isPaused) return;

    const elapsed = Date.now() - progressStartTime;
    const progress = (elapsed / ITEM_DURATION) * 100;

    const activeBar = memoryLaneContainer?.querySelector('.memory-lane-progress-bar.active .memory-lane-progress-fill');
    if (activeBar) {
      activeBar.style.width = `${Math.min(progress, 100)}%`;
    }

    if (elapsed >= ITEM_DURATION) {
      nextItem();
    }
  }, 100);
}

/**
 * Stop progress animation
 */
function stopProgress() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  progressStartTime = 0;
  isPaused = false;
}

/**
 * Go to next item
 */
function nextItem() {
  stopProgress();
  showItem(currentIndex + 1);
}

/**
 * Go to previous item
 */
function previousItem() {
  stopProgress();
  showItem(Math.max(0, currentIndex - 1));
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Cleanup memory lane resources
 */
export function cleanupMemoryLane() {
  hideMemoryLane();
  cleanupEventListeners();

  // Revoke any object URLs to prevent memory leaks
  const photos = memoryLaneContainer?.querySelectorAll('.memory-lane-photo');
  if (photos) {
    photos.forEach(photo => {
      if (photo.src && photo.src.startsWith('blob:')) {
        URL.revokeObjectURL(photo.src);
      }
    });
  }
}

