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

  stars.forEach((star, index) => {
    // Click on left half = half star, click on right half = full star
    star.addEventListener('click', (e) => {
      const rect = star.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const starWidth = rect.width;
      const isLeftHalf = clickX < starWidth / 2;

      let value;
      if (isLeftHalf) {
        value = index + 0.5;
      } else {
        value = index + 1;
      }

      currentRating = value;
      updateStars(value);
    });

    star.addEventListener('mousemove', (e) => {
      const rect = star.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const starWidth = rect.width;
      const isLeftHalf = clickX < starWidth / 2;

      let value;
      if (isLeftHalf) {
        value = index + 0.5;
      } else {
        value = index + 1;
      }
      updateStars(value);
    });
  });

  container.addEventListener('mouseleave', () => {
    updateStars(currentRating);
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

