/* ===== Car Detail Page Script ===== */
import {
  db,
  trackClick,
  trackVisitor,
  updateLiveStatus
} from "./firebase-service.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

(function () {
  "use strict";

  let settings = {
    waNumber: "919079923104",
    callNumber: "919079923104",
    siteName: "Balaji Car Rental"
  };

  const params = new URLSearchParams(window.location.search);
  const carId = params.get("id");
  const carSeedKey = params.get("key");

  const getWaURL = (msg) => `https://wa.me/${settings.waNumber}?text=${encodeURIComponent(msg)}`;
  const escapeHTML = (v = "") => String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  async function init() {
    setupNav();
    trackVisitor();
    updateLiveStatus();

    // Load settings
    try {
      const settingsSnap = await getDoc(doc(db, "settings", "general"));
      if (settingsSnap.exists()) {
        settings = { ...settings, ...settingsSnap.data() };
      }
    } catch (e) { console.warn("Settings load failed", e); }

    // Load the car
    let car = null;
    if (carId) {
      try {
        const carSnap = await getDoc(doc(db, "cars", carId));
        if (carSnap.exists()) {
          car = { id: carSnap.id, ...carSnap.data() };
        }
      } catch (e) { console.warn("Car load by ID failed", e); }
    }

    if (!car && carSeedKey) {
      try {
        const carsSnap = await getDocs(collection(db, "cars"));
        carsSnap.forEach((d) => {
          const data = d.data();
          if (data.seedKey === carSeedKey) {
            car = { id: d.id, ...data };
          }
        });
      } catch (e) { console.warn("Car load by seedKey failed", e); }
    }

    if (!car) {
      // Fallback from static seed data
      car = getStaticFallback(carSeedKey || carId);
    }

    if (car) {
      renderCarDetail(car);
      loadSimilarCars(car);
    } else {
      document.getElementById("carDetailName").textContent = "Car Not Found";
      document.getElementById("carDetailBest").textContent = "This car might have been removed.";
    }

    setupBookingForm(car);
    setupActions(car);
  }

  function getStaticFallback(key) {
    const staticCars = {
      "5-seater-hatchback": { name: "5 Seater Hatchback", category: "5seater", price: "999", image: "assets/car-5seater.png", bestFor: "Best for city travel & couples/family", specs: ["Petrol/Diesel", "Manual", "5 Seats", "AC", "2 Bags", "15+ km/l"], tags: ["5seater","hatchback","selfdrive","popular"], badge: "Popular" },
      "7-seater-mpv": { name: "7 Seater MPV", category: "7seater", price: "1,499", image: "assets/car-7seater.png", bestFor: "Best for family trips & group travel", specs: ["Diesel", "Manual/Auto", "7 Seats", "AC", "4 Bags", "12+ km/l"], tags: ["7seater","selfdrive","family"], badge: "Family" },
      "suv": { name: "SUV", category: "suv", price: "1,999", image: "assets/car-suv.png", bestFor: "Best for long routes & road trips", specs: ["Diesel", "Manual/Auto", "5-7 Seats", "AC", "4 Bags", "10+ km/l"], tags: ["suv","selfdrive","premium"], badge: "Premium" },
      "sedan": { name: "Sedan", category: "sedan", price: "1,299", image: "assets/car-sedan.png", bestFor: "Best for comfort & professional travel", specs: ["Petrol/Diesel", "Manual/Auto", "5 Seats", "AC", "3 Bags", "14+ km/l"], tags: ["sedan","selfdrive","comfort"], badge: "Comfort" },
      "hatchback": { name: "Hatchback", category: "hatchback", price: "999", image: "assets/car-hatchback.png", bestFor: "Best for daily commute & city driving", specs: ["Petrol", "Manual", "5 Seats", "AC", "2 Bags", "18+ km/l"], tags: ["hatchback","5seater","selfdrive","budget"], badge: "Budget" },
      "luxury-sedan": { name: "Luxury Sedan", category: "luxury", price: "2,999", image: "assets/car-luxury.png", bestFor: "Best for VIP travel & special occasions", specs: ["Petrol/Diesel", "Automatic", "5 Seats", "Climate Control", "3 Bags", "12+ km/l"], tags: ["luxury","sedan","selfdrive","premium"], badge: "Luxury" }
    };
    return staticCars[key] || null;
  }

  function renderCarDetail(car) {
    document.title = `${car.name} - Balaji Car Rental`;
    
    const img = document.getElementById("carDetailImage");
    if (img) { img.src = car.image || "assets/car-5seater.png"; img.alt = car.name; }

    const badge = document.getElementById("carDetailBadge");
    if (badge) badge.textContent = car.badge || car.category || "Available";

    document.getElementById("carDetailName").textContent = car.name || "Self-Drive Car";
    document.getElementById("carDetailBest").textContent = car.bestFor || "Clean, well-maintained & ready to drive";

    const priceEl = document.getElementById("carDetailPrice");
    if (priceEl) priceEl.innerHTML = `&#8377;${escapeHTML(String(car.price || "999"))} <small>/day</small>`;

    const specsGrid = document.getElementById("carSpecsGrid");
    const specs = Array.isArray(car.specs) ? car.specs : [];
    const specIcons = ["⛽", "⚙", "💺", "❄", "💼", "📏", "🔧", "🛡"];
    if (specsGrid) {
      specsGrid.innerHTML = specs.map((spec, i) => `
        <div class="car-detail-spec">
          <span class="spec-icon">${specIcons[i] || "✔"}</span>
          <span>${escapeHTML(spec)}</span>
        </div>
      `).join("");
    }

    const bookingCarType = document.getElementById("bookingCarType");
    if (bookingCarType) bookingCarType.value = car.name || "";
  }

  async function loadSimilarCars(currentCar) {
    try {
      const carsSnap = await getDocs(collection(db, "cars"));
      const similar = [];
      carsSnap.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        if (data.id !== currentCar.id && data.seedKey !== (currentCar.seedKey || "__none__")) {
          similar.push(data);
        }
      });

      if (similar.length > 0) {
        const section = document.getElementById("similarCarsSection");
        const grid = document.getElementById("similarCarsGrid");
        if (section && grid) {
          section.style.display = "block";
          grid.innerHTML = similar.slice(0, 3).map((car) => {
            const tags = Array.isArray(car.tags) ? car.tags : [];
            const detailUrl = `car.html?id=${encodeURIComponent(car.id)}`;
            return `
              <a href="${detailUrl}" class="vehicle-card" data-tags="${escapeHTML(tags.join(","))}">
                <div class="vehicle-card-img">
                  <img src="${escapeHTML(car.image || "assets/car-5seater.png")}" alt="${escapeHTML(car.name)}" loading="lazy">
                  <span class="vehicle-badge badge-popular">${escapeHTML(car.badge || car.category || "Available")}</span>
                </div>
                <div class="vehicle-card-body">
                  <h3>${escapeHTML(car.name)}</h3>
                  <p class="vehicle-card-best">${escapeHTML(car.bestFor || "")}</p>
                  <div class="vehicle-price-row"><div class="vehicle-price">&#8377;${escapeHTML(String(car.price || "999"))} <small>/day</small></div></div>
                  <div class="vehicle-buttons">
                    <span class="btn btn-red btn-sm">View Details &#8594;</span>
                  </div>
                </div>
              </a>`;
          }).join("");
        }
      }
    } catch (e) { console.warn("Similar cars load failed", e); }
  }

  function setupBookingForm(car) {
    const form = document.getElementById("carDetailBookingForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      const origText = btn?.innerHTML || "";
      if (btn) { btn.disabled = true; btn.innerHTML = "Saving..."; }

      const fd = new FormData(form);
      const bookingData = {
        name: fd.get("name") || "",
        phone: fd.get("phone") || "",
        city: fd.get("city") || "",
        carType: fd.get("carType") || car?.name || "General",
        date: fd.get("date") || "",
        duration: fd.get("duration") || "",
        license: fd.get("license") || "",
        note: fd.get("note") || "",
        source: "car_detail_page",
        intent: "booking",
        status: "new",
        timestamp: serverTimestamp()
      };

      // Save to Firebase
      try {
        await addDoc(collection(db, "bookings"), bookingData);
      } catch (err) { console.warn("Booking save failed", err); }

      trackClick("whatsapp");

      // Build message and open WhatsApp
      const msg = `Hi, I want to book *${bookingData.carType}* self-drive car.\n\nName: ${bookingData.name}\nPhone: ${bookingData.phone}${bookingData.city ? `\nPickup: ${bookingData.city}` : ""}${bookingData.date ? `\nDate: ${bookingData.date}` : ""}${bookingData.duration ? `\nDuration: ${bookingData.duration}` : ""}${bookingData.license ? `\nDL No: ${bookingData.license}` : ""}${bookingData.note ? `\nNote: ${bookingData.note}` : ""}\n\nPlease confirm availability and price.`;
      
      window.open(getWaURL(msg), "_blank");

      if (typeof Toastify === "function") {
          Toastify({
              text: "Booking enquiry sent!",
              duration: 3000,
              gravity: "bottom",
              position: "center",
              style: { background: "#10b981", borderRadius: "8px" }
          }).showToast();
      }

      form.reset();
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    });
  }

  function setupActions(car) {
    const waBtn = document.getElementById("carBookWhatsApp");
    const callBtn = document.getElementById("carBookCall");
    const headerBookBtn = document.getElementById("headerBookBtn");
    const floatWA = document.getElementById("floatWhatsApp");
    const footerWA = document.getElementById("footerWA");
    const footerCall = document.getElementById("footerCall");

    const carName = car?.name || "self-drive car";

    [waBtn, headerBookBtn, floatWA, footerWA].forEach((btn) => {
      if (btn) btn.addEventListener("click", (e) => {
        e.preventDefault();
        trackClick("whatsapp");
        // Scroll to booking form
        document.getElementById("carBookingSection")?.scrollIntoView({ behavior: "smooth" });
      });
    });

    [callBtn, footerCall].forEach((btn) => {
      if (btn) btn.addEventListener("click", (e) => {
        e.preventDefault();
        trackClick("call");
        window.location.href = `tel:+${settings.callNumber}`;
      });
    });
  }

  function setupNav() {
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

    // Sticky header
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        document.getElementById("siteHeader")?.classList.toggle("scrolled", window.scrollY > 40);
        ticking = false;
      });
    }, { passive: true });
  }

  init();
})();
