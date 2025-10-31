/* =============================
   Swipe Gesture Handler
   ============================= */

/**
 * Swipe gesture handler for opening/closing side menu and filter panel
 */
let swipeGesturesEnabled = false;
let touchStartHandler, touchMoveHandler, touchEndHandler;

export function initSwipeGestures(openSideMenuFn, closeSideMenuFn, openFilterPanelFn, closeFilterPanelFn) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;

  const SWIPE_THRESHOLD = 50; // Minimum distance for a swipe
  const EDGE_THRESHOLD = 50; // Distance from edge to trigger swipe
  const VERTICAL_THRESHOLD = 50; // Maximum vertical movement allowed

  // Helper: disable gestures when any modal is active (user not on home screen)
  function gesturesDisabled() {
    return !!document.querySelector('.modal.active');
  }

  // Helper: check if event target is inside map popup or backdrop
  function isEventFromMapPopup(e) {
    const popup = document.querySelector('.inline-place-editor');
    const backdrop = document.querySelector('.inline-place-backdrop');
    return (popup && popup.contains(e.target)) || (backdrop && backdrop.contains(e.target));
  }

  function resetTracking() {
    touchStartX = 0;
    touchStartY = 0;
    touchEndX = 0;
    touchEndY = 0;
    isSwiping = false;
  }

  function handleTouchStart(e) {
    if (gesturesDisabled() || isEventFromMapPopup(e)) return; // Ignore while modal or popup open
    // Only capture single touch
    if (e.touches.length !== 1) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
  }

  function handleTouchMove(e) {
    if (gesturesDisabled() || isEventFromMapPopup(e)) { resetTracking(); return; }
    if (!touchStartX) return;

    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = Math.abs(touchEndY - touchStartY);

    // Mark as swiping if horizontal movement is significant
    if (Math.abs(deltaX) > 10 && deltaY < VERTICAL_THRESHOLD) {
      isSwiping = true;
    }
  }

  function handleTouchEnd(e) {
    if (gesturesDisabled() || isEventFromMapPopup(e)) { resetTracking(); return; }
    if (!isSwiping) { resetTracking(); return; }

    const deltaX = touchEndX - touchStartX;
    const deltaY = Math.abs(touchEndY - touchStartY);

    const startX = touchStartX;
    resetTracking();

    // Ignore if too much vertical movement
    if (deltaY > VERTICAL_THRESHOLD) return;

    const screenWidth = window.innerWidth;
    const sideMenu = document.getElementById('sideMenu');
    const filterPanel = document.getElementById('filterPanel');
    const isSideMenuOpen = sideMenu && sideMenu.classList.contains('active');
    const isFilterPanelOpen = filterPanel && filterPanel.classList.contains('active');

    // PRIORITY 1: Close menus if they are open (prevents opening one on top of another)
    if (isSideMenuOpen && deltaX < -SWIPE_THRESHOLD) {
      // Swipe left to close side menu
      closeSideMenuFn();
      return;
    }

    if (isFilterPanelOpen && deltaX > SWIPE_THRESHOLD) {
      // Swipe right to close filter panel
      closeFilterPanelFn();
      return;
    }

    // PRIORITY 2: Open menus only if no menu is currently open
    if (!isSideMenuOpen && !isFilterPanelOpen) {
      // Swipe from left edge to open side menu
      if (startX <= EDGE_THRESHOLD && deltaX > SWIPE_THRESHOLD) {
        openSideMenuFn();
        return;
      }

      // Swipe from right edge to open filter panel
      if (startX >= screenWidth - EDGE_THRESHOLD && deltaX < -SWIPE_THRESHOLD) {
        openFilterPanelFn();
        return;
      }
    }
  }

  touchStartHandler = handleTouchStart;
  touchMoveHandler = handleTouchMove;
  touchEndHandler = handleTouchEnd;

  enableSwipeGestures();

  // Expose enable/disable globally for popup logic
  window.enableSwipeGestures = enableSwipeGestures;
  window.disableSwipeGestures = disableSwipeGestures;

  function enableSwipeGestures() {
    if (swipeGesturesEnabled) return;
    document.body.addEventListener('touchstart', touchStartHandler, { passive: true });
    document.body.addEventListener('touchmove', touchMoveHandler, { passive: true });
    document.body.addEventListener('touchend', touchEndHandler, { passive: true });
    swipeGesturesEnabled = true;
  }

  function disableSwipeGestures() {
    if (!swipeGesturesEnabled) return;
    document.body.removeEventListener('touchstart', touchStartHandler, { passive: true });
    document.body.removeEventListener('touchmove', touchMoveHandler, { passive: true });
    document.body.removeEventListener('touchend', touchEndHandler, { passive: true });
    swipeGesturesEnabled = false;
  }
}
