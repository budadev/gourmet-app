/* =============================
   Star Rating Component
   ============================= */

import { escapeHtml } from '../utils.js';

export function renderStars(rating, interactive = false) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      stars.push(`<span class="star filled" data-value="${i}">★</span>`);
    } else if (i === fullStars + 1 && hasHalf) {
      stars.push(`<span class="star half" data-value="${i - 0.5}">★</span>`);
    } else {
      stars.push(`<span class="star" data-value="${i}">★</span>`);
    }
  }

  const className = interactive ? 'star-rating' : 'star-rating-display';
  return `<div class="${className}">${stars.join('')}</div>`;
}

export function setupStarRating(container, initialValue = 0) {
  let currentRating = initialValue;
  const stars = container.querySelectorAll('.star');
  let isDragging = false;

  // Helper function to get rating value from position
  function getRatingFromPosition(clientX, clientY) {
    let rating = 0;

    stars.forEach((star, index) => {
      const rect = star.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const starWidth = rect.width;

      // Check if pointer is over this star
      if (clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom) {
        const isLeftHalf = clickX < starWidth / 2;
        rating = isLeftHalf ? index + 0.5 : index + 1;
      }
    });

    return rating;
  }

  // Handle mouse/touch start
  function handleStart(e) {
    isDragging = true;
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const rating = getRatingFromPosition(clientX, clientY);
    if (rating > 0) {
      currentRating = rating;
      updateStars(rating);
    }
  }

  // Handle mouse/touch move
  function handleMove(e) {
    if (!isDragging) {
      // Even if not dragging, show preview on hover (desktop only)
      if (e.type === 'mousemove') {
        const rating = getRatingFromPosition(e.clientX, e.clientY);
        if (rating > 0) {
          updateStars(rating);
        }
      }
      return;
    }

    e.preventDefault(); // Prevent scrolling while dragging
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const rating = getRatingFromPosition(clientX, clientY);
    if (rating > 0) {
      currentRating = rating;
      updateStars(rating);
    }
  }

  // Handle mouse/touch end
  function handleEnd() {
    if (isDragging) {
      isDragging = false;
      updateStars(currentRating);
    }
  }

  // Add event listeners to each star
  stars.forEach((star) => {
    // Mouse events
    star.addEventListener('mousedown', handleStart);
    star.addEventListener('mousemove', handleMove);

    // Touch events
    star.addEventListener('touchstart', handleStart, { passive: false });
    star.addEventListener('touchmove', handleMove, { passive: false });
    star.addEventListener('touchend', handleEnd);
  });

  // Global listeners for drag end
  document.addEventListener('mouseup', handleEnd);
  document.addEventListener('touchend', handleEnd);
  document.addEventListener('touchcancel', handleEnd);

  // Mouse leave container - restore current rating
  container.addEventListener('mouseleave', () => {
    if (!isDragging) {
      updateStars(currentRating);
    }
  });

  function updateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;

    stars.forEach((star, idx) => {
      star.classList.remove('filled', 'half');
      if (idx < fullStars) {
        star.classList.add('filled');
      } else if (idx === fullStars && hasHalf) {
        star.classList.add('half');
      }
    });
  }

  updateStars(currentRating);

  return {
    getValue: () => currentRating,
    setValue: (value) => {
      currentRating = value;
      updateStars(value);
    }
  };
}
