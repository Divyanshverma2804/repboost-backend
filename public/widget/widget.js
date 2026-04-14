(function() {
  const scriptTag = document.currentScript;
  const businessSlug = scriptTag.getAttribute('data-business');
  const apiUrl = scriptTag.getAttribute('data-api-url') || 'http://localhost:5000/api';
  
  if (!businessSlug) {
    console.error('Rewple Widget: data-business attribute is missing.');
    return;
  }

  const containerId = 'Rewple-widget-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    scriptTag.parentNode.insertBefore(container, scriptTag);
  }

  // Inject Styles
  const style = document.createElement('style');
  style.textContent = `
    #Rewple-widget-container {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 100%;
      margin: 20px 0;
      overflow: hidden;
      background: #f9fafb;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .rb-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .rb-title {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .rb-carousel {
      display: flex;
      transition: transform 0.5s ease-in-out;
      gap: 16px;
    }
    .rb-card {
      min-width: 300px;
      background: white;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    .rb-rating {
      color: #fbbf24;
      margin-bottom: 8px;
    }
    .rb-feedback {
      font-size: 14px;
      color: #4b5563;
      line-height: 1.5;
      margin-bottom: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .rb-footer {
      display: flex;
      align-items: center;
      font-size: 13px;
    }
    .rb-avatar {
      width: 24px;
      height: 24px;
      background: #3b82f6;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      margin-right: 8px;
      font-size: 11px;
    }
    .rb-name {
      font-weight: 600;
      color: #374151;
    }
    .rb-controls {
      display: flex;
      gap: 8px;
    }
    .rb-btn {
      cursor: pointer;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .rb-btn:hover {
      background: #f3f4f6;
    }
    .rb-powered {
      text-align: center;
      font-size: 10px;
      color: #9ca3af;
      margin-top: 16px;
    }
  `;
  document.head.appendChild(style);

  // Fetch Data
  fetch(`${apiUrl}/public/widget/${businessSlug}`)
    .then(res => res.json())
    .then(data => {
      renderWidget(data);
    })
    .catch(err => console.error('Rewple Widget Error:', err));

  function renderWidget(data) {
    const { business, reviews } = data;
    if (!reviews || reviews.length === 0) return;

    let currentIndex = 0;
    
    container.innerHTML = `
      <div class="rb-header">
        <div class="rb-title">What our customers say about ${business.name}</div>
        <div class="rb-controls">
          <button class="rb-btn" id="rb-prev">←</button>
          <button class="rb-btn" id="rb-next">→</button>
        </div>
      </div>
      <div style="overflow: hidden;">
        <div class="rb-carousel" id="rb-carousel">
          ${reviews.map(review => `
            <div class="rb-card">
              <div class="rb-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div>
              <div class="rb-feedback">"${review.feedback}"</div>
              <div class="rb-footer">
                <div class="rb-avatar" style="background: ${business.primaryColor || '#3b82f6'}">
                  ${review.name.charAt(0).toUpperCase()}
                </div>
                <div class="rb-name">${review.name}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="rb-powered">Powered by Rewple</div>
    `;

    const carousel = document.getElementById('rb-carousel');
    const nextBtn = document.getElementById('rb-next');
    const prevBtn = document.getElementById('rb-prev');

    nextBtn.onclick = () => {
      if (currentIndex < reviews.length - 1) {
        currentIndex++;
        updateCarousel();
      }
    };

    prevBtn.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        updateCarousel();
      }
    };

    function updateCarousel() {
      const offset = currentIndex * (300 + 16); // card width + gap
      carousel.style.transform = `translateX(-${offset}px)`;
    }
  }
})();
