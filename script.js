/* ===== SelfDrive Cars — Main Script ===== */
(function () {
  'use strict';

  const WA_NUMBER = '918690873865';
  const waURL = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

  /* ---- Lazy Image Load Transition ---- */
  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    if (img.complete) { img.classList.add('loaded'); return; }
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.add('loaded'));
  });

  /* ---- Mobile Nav (smooth) ---- */
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('mainNav');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      nav.classList.toggle('open');
      document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      nav.classList.remove('open');
      document.body.style.overflow = '';
    }));
  }

  /* ---- Sticky Header ---- */
  const header = document.getElementById('siteHeader');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    if (!header) return;
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 40);
    lastScroll = y;
  }, { passive: true });

  /* ---- Scroll Reveal (staggered) ---- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          // Stagger siblings in the same parent
          const parent = e.target.parentElement;
          const siblings = parent ? Array.from(parent.querySelectorAll('.reveal')) : [];
          const idx = siblings.indexOf(e.target);
          const delay = idx >= 0 ? idx * 80 : 0;
          setTimeout(() => e.target.classList.add('visible'), delay);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('visible'));
  }

  /* ---- Counter Animation for Stats ---- */
  const statNums = document.querySelectorAll('.stat-card .num');
  if (statNums.length && 'IntersectionObserver' in window) {
    const counterIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          counterIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => counterIO.observe(el));
  }

  function animateCounter(el) {
    const text = el.textContent.trim();
    const match = text.match(/(\d[\d,]*)/);
    if (!match) return;
    const target = parseInt(match[1].replace(/,/g, ''));
    if (isNaN(target) || target === 0) return;
    const prefix = text.substring(0, text.indexOf(match[1]));
    const suffix = text.substring(text.indexOf(match[1]) + match[1].length);
    const duration = 1200;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const val = Math.round(ease * target);
      el.textContent = prefix + val.toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- Booking Form ---- */
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(bookingForm);
      const name = fd.get('name') || '';
      const phone = fd.get('phone') || '';
      const city = fd.get('city') || '';
      const carType = fd.get('carType') || '';
      const date = fd.get('date') || '';
      const duration = fd.get('duration') || '';
      const note = fd.get('note') || '';
      const msg = `Hi, I want to book a self-drive car.\n\n` +
        `Name: ${name}\nPhone: ${phone}\nPickup: ${city}\n` +
        `Car Type: ${carType}\nDate: ${date}\nDuration: ${duration}\n` +
        (note ? `Note: ${note}\n` : '') +
        `\nPlease share availability and price.`;
      window.open(waURL(msg), '_blank');
    });
  }

  /* ---- WhatsApp Car Buttons ---- */
  document.querySelectorAll('[data-wa-car]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const car = btn.dataset.waCar || 'car';
      const msg = `Hi, I want to book a *${car}* self-drive car. Please share availability and price.`;
      window.open(waURL(msg), '_blank');
    });
  });
  document.querySelectorAll('[data-wa-inquiry]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const car = btn.dataset.waInquiry || 'car';
      const msg = `Hi, I'd like to know more about the *${car}*. Please share details, availability, and pricing.`;
      window.open(waURL(msg), '_blank');
    });
  });

  /* ---- Filter System (smooth) ---- */
  const filterPills = document.querySelectorAll('.filter-pill');
  const vehicleCards = document.querySelectorAll('.vehicle-card');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter;
      vehicleCards.forEach((card, i) => {
        const show = filter === 'all' || (card.dataset.tags || '').split(',').includes(filter);
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        if (show) {
          card.style.display = '';
          requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          });
        } else {
          card.style.opacity = '0';
          card.style.transform = 'translateY(12px)';
          setTimeout(() => { card.style.display = 'none'; }, 300);
        }
      });
    });
  });

  /* ---- FAQ Accordion (smooth) ---- */
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const wasOpen = item.classList.contains('open');
      const answer = item.querySelector('.faq-a');
      // Close all
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('open');
        const a = i.querySelector('.faq-a');
        if (a) a.style.maxHeight = '0';
      });
      // Toggle current
      if (!wasOpen && answer) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  /* ---- Smooth scroll for anchor links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
