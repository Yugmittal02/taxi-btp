/* ===== Balaji Car Rental - Main Script (static fallback + Firebase hydration) ===== */
import {
  db,
  seedInitialCarsIfNeeded,
  trackClick,
  trackVisitor,
  updateLiveStatus
} from "./firebase-service.js";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

(function () {
  "use strict";

  let settings = {
    waNumber: "919079923104",
    callNumber: "919079923104",
    siteName: "Balaji Car Rental",
    startingPrice: "999",
    heroTitle1: "Book Your Self-Drive Car",
    heroTitle2: "in One Tap",
    announceText: "Self-Drive Cars from Rs.999/day"
  };

  let revealObserver = null;
  let currentFilter = "all";
  let firebaseWritesEnabled = true;
  let pendingWhatsAppLead = null;

  const getWaURL = (msg) => `https://wa.me/${settings.waNumber}?text=${encodeURIComponent(msg)}`;
  const escapeHTML = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const normalizeTags = (car) => {
    const tags = Array.isArray(car.tags) ? car.tags : String(car.tags || "").split(",");
    return [...new Set([car.category, ...tags].filter(Boolean).map((tag) => String(tag).trim().toLowerCase()))];
  };
  const formatPrice = (price) => String(price || "999").replace(/[^\d,]/g, "") || "999";

  async function initDynamicSite() {
    setupLazyImages();
    setupMobileNav();
    setupStickyHeader();
    setupRevealObserver();
    setupCounterAnimation();
    setupFilterSystem();
    setupFAQ();
    setupSmoothScrollAndActions();
    setupLeadCaptureForm();
    setupBookingForm();

    let backendReady = false;
    try {
      backendReady = await seedInitialCarsIfNeeded();
    } catch (error) {
      console.error("Initial car seed failed", error);
    }

    if (!backendReady) {
      console.info("Firebase car seed/listen is unavailable; keeping the static vehicle fallback active and still allowing booking writes to try.");
    }

    trackVisitor();
    updateLiveStatus();

    onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        settings = { ...settings, ...docSnap.data() };
        updateDOMWithSettings();
      }
    }, (error) => {
      console.error("Settings listener failed", error);
    });

    onSnapshot(doc(db, "settings", "pricing"), (docSnap) => {
      if (docSnap.exists()) {
        updateDOMWithPricing(docSnap.data());
      }
    }, (error) => {
      console.error("Pricing listener failed", error);
    });

    onSnapshot(collection(db, "cars"), (snapshot) => {
      const cars = [];
      snapshot.forEach((docSnap) => cars.push({ id: docSnap.id, ...docSnap.data() }));
      renderCars(cars);
    }, (error) => {
      console.error("Cars listener failed; keeping static fallback", error);
    });
  }

  function updateDOMWithSettings() {
    document.title = `${settings.siteName || "Balaji Car Rental"} - Book Self-Drive Car`;

    document.querySelectorAll("#siteLogo, .footer-brand .logo").forEach((el) => {
      el.innerHTML = `<span class="logo-icon">&#128663;</span> <span class="logo-text">${escapeHTML(settings.siteName || "Balaji Car Rental")}</span>`;
    });

    const heroTitle = document.getElementById("heroTitle");
    if (heroTitle) {
      heroTitle.innerHTML = `${escapeHTML(settings.heroTitle1 || "Book Your Self-Drive Car")} <span id="heroTitleSpan">${escapeHTML(settings.heroTitle2 || "in One Tap")}</span>`;
    }

    const announceBar = document.getElementById("announceBar");
    if (announceBar) {
      announceBar.innerHTML = `&#127881; ${escapeHTML(settings.announceText || "Self-Drive Cars from Rs.999/day")} &mdash; Book Now on <a href="#" data-wa-generic>WhatsApp</a> &#128242;`;
    }

    const heroPrice = document.getElementById("heroPriceTag");
    if (heroPrice) {
      heroPrice.innerHTML = `Starting @ &#8377;${escapeHTML(settings.startingPrice || "999")} <small>/day</small>`;
    }

    const locGrid = document.getElementById("locationsGrid");
    if (locGrid) {
        const locationsRaw = settings.pickupLocations || "Bharatpur City: Main Branch - 24/7 Available\nRailway Station: Pickup from station gate\nBus Stand: Central bus stand pickup\nAirport Transfers: Jaipur/Agra airport available";
        const lines = locationsRaw.split("\n").map(l => l.trim()).filter(Boolean);
        locGrid.innerHTML = lines.map(line => {
            const parts = line.split(":");
            const title = parts[0] ? parts[0].trim() : "Location";
            const desc = parts.slice(1).join(":").trim() || "Available for pickup";
            return `<div class="location-card"><span class="location-icon">&#128205;</span><h4>${escapeHTML(title)}</h4><p>${escapeHTML(desc)}</p></div>`;
        }).join("");
    }
  }

  function updateDOMWithPricing(pricing) {
      if (!pricing) return;
      const safe = (id, val, fallback) => {
          const el = document.getElementById(id);
          if (el) el.textContent = escapeHTML(val || fallback);
      };
      safe("uiPriceDaily", pricing.priceDaily, "999");
      safe("uiKmDaily", pricing.kmDaily, "200");
      
      safe("uiPriceWeekly", pricing.priceWeekly, "5,999");
      safe("uiKmWeekly", pricing.kmWeekly, "1000");
      safe("uiExtraKm1", pricing.extraKmCharge, "2");
      
      safe("uiPriceMonthly", pricing.priceMonthly, "19,999");
      safe("uiKmMonthly", pricing.kmMonthly, "3000");
      safe("uiExtraKm2", pricing.extraKmCharge, "2");
  }

  function renderCars(cars) {
    const list = document.getElementById("dynamicCarsList");
    if (!list) return;

    list.innerHTML = cars.map(renderCarCard).join("");
    list.style.display = cars.length ? "grid" : "none";
    setupLazyImages(list);
    observeNewReveals(list);
    applyFilter(currentFilter);
  }

  function renderCarCard(car) {
    const tags = normalizeTags(car);
    const badge = car.badge || car.category || "Available";
    const bestFor = car.bestFor || "Clean, well-maintained & ready to drive";
    const specs = Array.isArray(car.specs) ? car.specs : [];
    const seedKey = car.seedKey || car.id || "";

    return `
      <a href="car.html?id=${escapeHTML(car.id || '')}&key=${escapeHTML(seedKey)}" class="vehicle-card reveal visible" data-seed-key="${escapeHTML(seedKey)}" data-tags="${escapeHTML(tags.join(","))}">
        <div class="vehicle-card-img">
          <img src="${escapeHTML(car.image || "assets/car-5seater.png")}" alt="${escapeHTML(car.name || "Self-drive car")}" loading="lazy" width="800" height="450" onerror="this.src='assets/car-5seater.png'">
          <span class="vehicle-badge badge-popular">${escapeHTML(badge)}</span>
        </div>
        <div class="vehicle-card-body">
          <h3>${escapeHTML(car.name || "Self-drive car")}</h3>
          <p class="vehicle-card-best">${escapeHTML(bestFor)}</p>
          <div class="specs-grid">
            ${specs.map((spec) => `<div class="spec-item">${escapeHTML(spec)}</div>`).join("")}
          </div>
          <div class="condition-bar">&#9989; Clean &amp; Well Maintained &#8226; &#128678; Safe Driving</div>
          <div class="vehicle-price-row"><div class="vehicle-price">&#8377;${escapeHTML(formatPrice(car.price))} <small>/day</small></div></div>
          <div class="vehicle-buttons">
            <span class="btn btn-red btn-sm" data-wa-car="${escapeHTML(car.name || "car")}">&#128663; Book Now</span>
            <span class="btn btn-outline btn-sm" data-wa-inquiry="${escapeHTML(car.name || "car")}">&#128172; WhatsApp Inquiry</span>
          </div>
        </div>
      </a>`;
  }

  function setupLazyImages(root = document) {
    root.querySelectorAll("img[loading='lazy']").forEach((img) => {
      if (img.complete) {
        img.classList.add("loaded");
        return;
      }
      img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
      img.addEventListener("error", () => img.classList.add("loaded"), { once: true });
    });
  }

  function setupMobileNav() {
    const hamburger = document.getElementById("hamburger");
    const nav = document.getElementById("mainNav");
    if (!hamburger || !nav) return;

    hamburger.addEventListener("click", () => {
      hamburger.classList.toggle("open");
      nav.classList.toggle("open");
      document.body.style.overflow = nav.classList.contains("open") ? "hidden" : "";
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        hamburger.classList.remove("open");
        nav.classList.remove("open");
        document.body.style.overflow = "";
      });
    });
  }

  function setupStickyHeader() {
    const header = document.getElementById("siteHeader");
    if (!header) return;

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header.classList.toggle("scrolled", window.scrollY > 40);
        ticking = false;
      });
    }, { passive: true });
  }

  function setupRevealObserver() {
    const reveals = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      reveals.forEach((el) => el.classList.add("visible"));
      return;
    }

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const parent = entry.target.parentElement;
        const siblings = parent ? Array.from(parent.querySelectorAll(".reveal")) : [];
        const delay = Math.max(0, siblings.indexOf(entry.target)) * 60;
        setTimeout(() => entry.target.classList.add("visible"), delay);
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

    reveals.forEach((el) => revealObserver.observe(el));
  }

  function observeNewReveals(root) {
    if (!revealObserver) {
      root.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
      return;
    }
    root.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
  }

  function setupCounterAnimation() {
    const statNums = document.querySelectorAll(".stat-card .num");
    if (!statNums.length || !("IntersectionObserver" in window)) return;

    const counterIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach((el) => counterIO.observe(el));
  }

  function animateCounter(el) {
    const text = el.textContent.trim();
    const match = text.match(/(\d[\d,]*)/);
    if (!match) return;
    const target = parseInt(match[1].replace(/,/g, ""), 10);
    if (Number.isNaN(target) || target === 0) return;
    const prefix = text.substring(0, text.indexOf(match[1]));
    const suffix = text.substring(text.indexOf(match[1]) + match[1].length);
    const duration = 1200;
    const start = performance.now();

    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(eased * target).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function setupFilterSystem() {
    document.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        applyFilter(pill.dataset.filter || "all");
      });
    });
  }

  function applyFilter(filter) {
    currentFilter = filter || "all";
    document.querySelectorAll("#dynamicCarsList .vehicle-card").forEach((card) => {
      const tags = (card.dataset.tags || "").split(",").map((tag) => tag.trim());
      const show = currentFilter === "all" || tags.includes(currentFilter);
      card.style.transition = "opacity 0.25s ease, transform 0.25s ease";
      if (show) {
        card.style.display = "";
        requestAnimationFrame(() => {
          card.style.opacity = "1";
          card.style.transform = "translateY(0)";
        });
      } else {
        card.style.opacity = "0";
        card.style.transform = "translateY(12px)";
        setTimeout(() => {
          if (currentFilter !== "all" && !(card.dataset.tags || "").split(",").includes(currentFilter)) {
            card.style.display = "none";
          }
        }, 250);
      }
    });
  }

  function setupFAQ() {
    document.querySelectorAll(".faq-q").forEach((q) => {
      q.addEventListener("click", () => {
        const item = q.parentElement;
        const wasOpen = item.classList.contains("open");
        const answer = item.querySelector(".faq-a");
        document.querySelectorAll(".faq-item").forEach((faq) => {
          faq.classList.remove("open");
          const a = faq.querySelector(".faq-a");
          if (a) a.style.maxHeight = "0";
        });
        if (!wasOpen && answer) {
          item.classList.add("open");
          answer.style.maxHeight = `${answer.scrollHeight}px`;
        }
      });
    });
  }

  function setupSmoothScrollAndActions() {
    document.addEventListener("click", (event) => {
      const waCar = event.target.closest("[data-wa-car]");
      const waInquiry = event.target.closest("[data-wa-inquiry]");
      const waGeneric = event.target.closest("[data-wa-generic]");
      const callLink = event.target.closest("[data-call]");
      const hashLink = event.target.closest("a[href^='#']");

      if (waCar || waInquiry || waGeneric) {
        event.preventDefault();
        const car = waCar?.dataset.waCar || waInquiry?.dataset.waInquiry || "";
        const msg = waCar
          ? `Hi, I want to book a *${car}* self-drive car. Please share availability and price.`
          : waInquiry
            ? `Hi, I'd like to know more about the *${car}*. Please share details, availability, and pricing.`
            : "Hi, I want to book a self-drive car. Please share availability.";
        openLeadModal({
          carType: car || "General",
          source: waCar ? "whatsapp_booking_button" : waInquiry ? "whatsapp_inquiry_button" : "whatsapp_general_button",
          intent: waInquiry ? "inquiry" : "booking",
          message: msg
        });
        return;
      }

      if (callLink) {
        event.preventDefault();
        trackClick("call");
        window.location.href = `tel:+${settings.callNumber}`;
        return;
      }

      if (!hashLink) return;
      const id = hashLink.getAttribute("href");
      if (!id || id === "#") {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const target = document.querySelector(id);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function openLeadModal(details) {
    const modal = document.getElementById("leadModal");
    const form = document.getElementById("leadCaptureForm");
    if (!modal || !form) {
      trackClick("whatsapp");
      window.open(getWaURL(details.message), "_blank");
      return;
    }

    pendingWhatsAppLead = details;
    form.reset();
    document.getElementById("leadCarType").value = details.carType || "General";
    document.getElementById("leadSource").value = details.source || "whatsapp_button";
    document.getElementById("leadIntent").value = details.intent || "booking";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("leadName")?.focus(), 50);
  }

  function closeLeadModal() {
    const modal = document.getElementById("leadModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    pendingWhatsAppLead = null;
  }

  function buildLeadMessage(lead, fallbackMessage) {
    return `${fallbackMessage}\n\nName: ${lead.name}\nPhone: ${lead.phone}${lead.city ? `\nPickup: ${lead.city}` : ""}${lead.license ? `\nDL No: ${lead.license}` : ""}\nCar Type: ${lead.carType || "General"}${lead.date ? `\nDate: ${lead.date}` : ""}${lead.duration ? `\nDuration: ${lead.duration}` : ""}${lead.note ? `\nNote: ${lead.note}` : ""}`;
  }

  async function saveBookingLead(bookingData) {
    if (!firebaseWritesEnabled) return false;

    try {
      await addDoc(collection(db, "bookings"), bookingData);
      return true;
    } catch (error) {
      console.warn("Lead could not be stored in Firebase; continuing with WhatsApp.", error?.message || error);
      return false;
    }
  }

  function setupLeadCaptureForm() {
    const modal = document.getElementById("leadModal");
    const form = document.getElementById("leadCaptureForm");
    const closeBtn = document.getElementById("leadModalClose");
    if (!modal || !form) return;

    closeBtn?.addEventListener("click", closeLeadModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeLeadModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) closeLeadModal();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector("button[type='submit']");
      const originalText = submitBtn?.textContent || "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
      }

      const fd = new FormData(form);
      const leadData = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        license: String(fd.get("license") || "").trim(),
        carType: String(fd.get("carType") || pendingWhatsAppLead?.carType || "General").trim(),
        date: String(fd.get("date") || "").trim(),
        duration: String(fd.get("duration") || "").trim(),
        note: String(fd.get("note") || "").trim(),
        source: String(fd.get("source") || pendingWhatsAppLead?.source || "whatsapp_button").trim(),
        intent: String(fd.get("intent") || pendingWhatsAppLead?.intent || "booking").trim(),
        status: "new",
        timestamp: serverTimestamp()
      };

      await saveBookingLead(leadData);
      trackClick("whatsapp");
      const msg = buildLeadMessage(leadData, pendingWhatsAppLead?.message || "Hi, I want to book a self-drive car.");
      window.open(getWaURL(msg), "_blank");
      
      if (typeof Toastify === "function") {
          Toastify({
              text: "Booking enquiry saved!",
              duration: 3000,
              gravity: "bottom",
              position: "center",
              style: { background: "#10b981", borderRadius: "8px" }
          }).showToast();
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      closeLeadModal();
  });
  }

  function setupBookingForm() {
    const bookingForm = document.getElementById("bookingForm");
    if (!bookingForm) return;

    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      trackClick("form_submit");

      const fd = new FormData(bookingForm);
      const bookingData = {
        name: fd.get("name") || "",
        phone: fd.get("phone") || "",
        city: fd.get("city") || "",
        carType: fd.get("carType") || "",
        date: fd.get("date") || "",
        duration: fd.get("duration") || "",
        note: fd.get("note") || "",
        source: "booking_form",
        intent: "booking",
        status: "new",
        timestamp: serverTimestamp()
      };

      await saveBookingLead(bookingData);

      const msg = `Hi, I want to book a self-drive car.\n\nName: ${bookingData.name}\nPhone: ${bookingData.phone}\nPickup: ${bookingData.city}\nCar Type: ${bookingData.carType}\nDate: ${bookingData.date}\nDuration: ${bookingData.duration}${bookingData.note ? `\nNote: ${bookingData.note}` : ""}\n\nPlease share availability and price.`;
      trackClick("whatsapp");
      window.open(getWaURL(msg), "_blank");
      bookingForm.reset();
    });
  }

  initDynamicSite();
})();
