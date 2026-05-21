import { db, FIREBASE_ENABLED, markSeedCarDeleted } from "../firebase-service.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const PIN_CODE = "8619";
const PIN_STORAGE_KEY = "adminPinVerified";
const CACHE_KEY = "selfdriveAdminCacheV1";
const LIVE_WINDOW_MS = 5 * 60 * 1000;

const loginForm = document.getElementById("loginForm");
const loginContainer = document.getElementById("login-container");
const adminDashboard = document.getElementById("admin-dashboard");
const logoutBtn = document.getElementById("logoutBtn");
const tabLinks = document.querySelectorAll(".nav-link");
const tabPanes = document.querySelectorAll(".tab-pane");
const tabTitle = document.getElementById("tab-title");
const sidebar = document.getElementById("adminSidebar");
const adminMenuToggle = document.getElementById("adminMenuToggle");
const offlineStatus = document.getElementById("offlineStatus");

let initialized = false;
let state = {
    clicks: {},
    totals: {},
    daily: [],
    visitors: [],
    leads: [],
    cars: [],
    settings: {}
};

const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};
const escapeHTML = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const toMillis = (value) => {
    if (!value) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return null;
};
const formatDate = (value) => {
    const millis = toMillis(value);
    return millis ? new Date(millis).toLocaleString() : "N/A";
};
const compactDate = (value) => {
    const millis = toMillis(value);
    return millis ? new Date(millis).toLocaleDateString() : "N/A";
};

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch {
        return {};
    }
}

function writeCache(patch) {
    state = { ...state, ...patch };
    localStorage.setItem(CACHE_KEY, JSON.stringify({
        ...state,
        cachedAt: Date.now()
    }));
}

function showDashboard() {
    loginContainer.style.display = "none";
    adminDashboard.style.display = "grid";
    initAdmin();
}

function showLogin() {
    loginContainer.style.display = "flex";
    adminDashboard.style.display = "none";
}

function updateOfflineStatus() {
    if (!offlineStatus) return;
    offlineStatus.hidden = navigator.onLine;
}

function showFirebaseStatus(message, isError = false) {
    if (!offlineStatus) return;
    offlineStatus.hidden = false;
    offlineStatus.textContent = message;
    offlineStatus.classList.toggle("error", isError);
}

function showFirebaseError(area, error) {
    const message = error?.message || String(error || "Unknown Firebase error");
    console.error(`${area} Firebase listener failed`, error);
    showFirebaseStatus(`${area}: ${message}`, true);
}

function setupAuth() {
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const pin = document.getElementById("pin").value.trim();
        const errorEl = document.getElementById("login-error");
        if (pin === PIN_CODE) {
            localStorage.setItem(PIN_STORAGE_KEY, "true");
            errorEl.textContent = "";
            showDashboard();
        } else {
            errorEl.textContent = "Invalid PIN. Please try again.";
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem(PIN_STORAGE_KEY);
        showLogin();
    });
}

function setupTabs() {
    tabLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const tabId = link.dataset.tab;

            tabLinks.forEach((item) => item.classList.remove("active"));
            tabPanes.forEach((pane) => pane.classList.remove("active"));

            link.classList.add("active");
            document.getElementById(`tab-${tabId}`).classList.add("active");
            tabTitle.textContent = link.textContent.trim();
            sidebar.classList.remove("open");
        });
    });

    adminMenuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}

function setupActions() {
    document.getElementById("exportLeadsBtn").addEventListener("click", exportLeads);
    document.getElementById("exportAnalyticsBtn").addEventListener("click", exportAnalytics);

    document.getElementById("addNewCarBtn").addEventListener("click", () => {
        openCarModal();
    });

    document.querySelector(".close").addEventListener("click", closeCarModal);
    document.getElementById("carModal").addEventListener("click", (event) => {
        if (event.target.id === "carModal") closeCarModal();
    });

    document.getElementById("carsListAdmin").addEventListener("click", (event) => {
        const editBtn = event.target.closest("[data-edit-car]");
        const deleteBtn = event.target.closest("[data-delete-car]");
        if (editBtn) editCar(editBtn.dataset.editCar);
        if (deleteBtn) deleteCar(deleteBtn.dataset.deleteCar);
    });

    document.getElementById("carForm").addEventListener("submit", saveCar);
    document.getElementById("settingsForm").addEventListener("submit", saveSettings);

    const pricingForm = document.getElementById("pricingForm");
    if (pricingForm) pricingForm.addEventListener("submit", savePricing);
}

function initAdmin() {
    if (initialized) return;
    initialized = true;

    state = { ...state, ...readCache() };
    renderCachedData();
    if (!FIREBASE_ENABLED) {
        if (offlineStatus) {
            offlineStatus.hidden = false;
            offlineStatus.textContent = "Firebase disabled for this page URL";
        }
        return;
    }
    loadStats();
    loadLeads();
    loadCars();
    loadSettings();
    loadLiveVisitors();
    loadPricing();
}

function renderCachedData() {
    if (state.clicks) renderClicks(state.clicks);
    if (state.totals) renderTotals(state.totals);
    if (state.daily) renderDailyTrend(state.daily);
    if (state.visitors) renderVisitors(state.visitors);
    if (state.leads) renderLeads(state.leads);
    if (state.cars) renderCars(state.cars);
    if (state.settings) renderSettings(state.settings);
}

function renderClicks(data = {}) {
    setText("stat-wa-clicks", data.whatsapp || 0);
    setText("stat-call-clicks", data.call || 0);
}

function renderTotals(data = {}) {
    setText("stat-total-visitors", data.totalPageViews || data.total || data.count || 0);
    setText("stat-unique-visitors", data.uniqueVisitors || data.unique || 0);
}

function loadStats() {
    onSnapshot(doc(db, "analytics", "clicks"), (snapshot) => {
        const clicks = snapshot.exists() ? snapshot.data() : {};
        renderClicks(clicks);
        writeCache({ clicks });
    }, (error) => {
        showFirebaseError("Analytics clicks", error);
    });

    onSnapshot(doc(db, "analytics", "total_visitors"), (snapshot) => {
        const totals = snapshot.exists() ? snapshot.data() : {};
        renderTotals(totals);
        writeCache({ totals });
    }, (error) => {
        showFirebaseError("Visitor totals", error);
    });

    const dailyQuery = query(collection(db, "analytics_daily"), orderBy("date", "desc"), limit(14));
    onSnapshot(dailyQuery, (snapshot) => {
        const daily = [];
        snapshot.forEach((dailyDoc) => {
            daily.push({ id: dailyDoc.id, ...dailyDoc.data() });
        });
        daily.reverse();
        renderDailyTrend(daily);
        writeCache({ daily });
    }, (error) => {
        showFirebaseError("Daily analytics", error);
    });

    const visitorsQuery = query(collection(db, "analytics_ips"), orderBy("lastSeen", "desc"), limit(50));
    onSnapshot(visitorsQuery, (snapshot) => {
        const visitors = [];
        snapshot.forEach((visitorDoc) => {
            const data = visitorDoc.data();
            visitors.push({
                id: visitorDoc.id,
                ipHash: data.ipHash || visitorDoc.id,
                countryCode: data.countryCode || "",
                countryName: data.countryName || "",
                visits: data.visits || 0,
                firstSeen: toMillis(data.firstSeen),
                lastSeen: toMillis(data.lastSeen),
                lastPath: data.lastPath || "",
                userAgentSummary: data.userAgentSummary || ""
            });
        });
        renderVisitors(visitors);
        writeCache({ visitors });
    }, (error) => {
        showFirebaseError("Visitor table", error);
    });
}

function loadLiveVisitors() {
    onSnapshot(collection(db, "analytics_live"), (snapshot) => {
        const now = Date.now();
        let count = 0;
        snapshot.forEach((liveDoc) => {
            const millis = toMillis(liveDoc.data().lastSeen);
            if (millis && now - millis < LIVE_WINDOW_MS) count++;
        });
        setText("live-visitors", count);
    }, (error) => {
        showFirebaseError("Live visitors", error);
    });
}

function renderDailyTrend(daily = []) {
    const chart = document.getElementById("dailyTrendChart");
    if (!chart) return;
    if (!daily.length) {
        chart.innerHTML = '<div class="empty-state">No daily analytics yet.</div>';
        return;
    }

    const values = daily.map((item) => Number(item.pageViews || 0));
    const max = Math.max(1, ...values);
    const width = 320;
    const height = 110;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((value, index) => {
        const x = Math.round(index * step);
        const y = Math.round(height - (value / max) * (height - 20) - 10);
        return `${x},${y}`;
    }).join(" ");
    const labels = daily.map((item) => `<span><b>${escapeHTML(item.pageViews || 0)}</b>${escapeHTML(item.date || item.id || "")}</span>`).join("");

    chart.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily page view trend">
            <polyline points="${points}" fill="none" stroke="#6c3ce0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
            ${values.map((value, index) => {
                const [x, y] = points.split(" ")[index].split(",");
                return `<circle cx="${x}" cy="${y}" r="4" fill="#f97316"><title>${escapeHTML(daily[index].date || "")}: ${value}</title></circle>`;
            }).join("")}
        </svg>
        <div class="trend-labels">${labels}</div>
    `;
}

function renderVisitors(visitors = []) {
    const body = $("#visitorTable tbody");
    if (!body) return;
    body.innerHTML = visitors.length ? visitors.map((visitor) => `
        <tr>
            <td><code>${escapeHTML((visitor.ipHash || visitor.id || "").slice(0, 12))}</code></td>
            <td>${escapeHTML(visitor.countryName || visitor.countryCode || "-")}</td>
            <td>${escapeHTML(visitor.visits || 0)}</td>
            <td>${escapeHTML(compactDate(visitor.firstSeen))}</td>
            <td>${escapeHTML(compactDate(visitor.lastSeen))}</td>
        </tr>
    `).join("") : '<tr><td colspan="5">No visitor records yet.</td></tr>';
}

function loadLeads() {
    const leadsQuery = query(collection(db, "bookings"), orderBy("timestamp", "desc"));
    onSnapshot(leadsQuery, (snapshot) => {
        const leads = [];
        snapshot.forEach((leadDoc) => {
            const data = leadDoc.data();
            leads.push({
                id: leadDoc.id,
                name: data.name || "",
                phone: data.phone || "",
                city: data.city || "",
                carType: data.carType || "",
                date: data.date || "",
                duration: data.duration || "",
                note: data.note || "",
                source: data.source || "booking_form",
                intent: data.intent || "booking",
                status: data.status || "new",
                timestamp: toMillis(data.timestamp)
            });
        });
        renderLeads(leads);
        writeCache({ leads });
    }, (error) => {
        showFirebaseError("Booking leads", error);
    });
}

function renderLeads(leads = []) {
    setText("stat-bookings", leads.length);

    const recentBody = $("#recentLeadsTable tbody");
    if (recentBody) {
        recentBody.innerHTML = leads.slice(0, 5).map((lead) => `
            <tr>
                <td>${escapeHTML(compactDate(lead.timestamp))}</td>
                <td>${escapeHTML(lead.name || "-")}</td>
                <td>${escapeHTML(lead.phone || "-")}</td>
                <td>${escapeHTML(lead.carType || "-")}</td>
                <td>${escapeHTML(formatSource(lead.source))}</td>
                <td><a href="tel:${escapeHTML(lead.phone || "")}" class="btn-edit">Call</a></td>
            </tr>
        `).join("") || '<tr><td colspan="6">No recent leads yet.</td></tr>';
    }

    const allBody = $("#allLeadsTable tbody");
    if (allBody) {
        allBody.innerHTML = leads.map((lead) => `
            <tr>
                <td>${escapeHTML(formatDate(lead.timestamp))}</td>
                <td>${escapeHTML(lead.name || "-")}</td>
                <td>${escapeHTML(lead.phone || "-")}</td>
                <td>${escapeHTML(lead.city || "-")}</td>
                <td>${escapeHTML(lead.carType || "-")}</td>
                <td>${escapeHTML(lead.duration || "-")}</td>
                <td>${escapeHTML(formatSource(lead.source))}</td>
                <td><select class="status-select" data-lead-id="${escapeHTML(lead.id)}" onchange="window._updateLeadStatus(this)">
                    <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
                    <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                    <option value="confirmed" ${lead.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="active" ${lead.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="completed" ${lead.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${lead.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select></td>
                <td><a href="tel:${escapeHTML(lead.phone || '')}" class="btn-edit" style="padding:6px 12px;font-size:0.8rem">Call</a></td>
            </tr>
        `).join("") || '<tr><td colspan="9">No booking enquiries yet.</td></tr>';
    }
}

window._updateLeadStatus = async function(select) {
    const leadId = select.dataset.leadId;
    const newStatus = select.value;
    try {
        await updateDoc(doc(db, "bookings", leadId), { status: newStatus });
        if (typeof Toastify === "function") {
            Toastify({ text: "Status updated", duration: 2000, style: { background: "#10b981", borderRadius: "8px" } }).showToast();
        }
    } catch (err) {
        console.error("Failed to update lead status", err);
        if (typeof Toastify === "function") {
            Toastify({ text: "Failed to update status", duration: 3000, style: { background: "#dc2626", borderRadius: "8px" } }).showToast();
        } else {
            alert("Failed to update status.");
        }
    }
};

function formatSource(source = "") {
    return String(source || "")
        .replace(/^whatsapp_/, "WA ")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";
}

function loadCars() {
    onSnapshot(collection(db, "cars"), (snapshot) => {
        const cars = [];
        snapshot.forEach((carDoc) => {
            const data = carDoc.data();
            cars.push({
                id: carDoc.id,
                name: data.name || "",
                category: data.category || "",
                price: data.price || "",
                image: data.image || "assets/car-5seater.png",
                bestFor: data.bestFor || "",
                specs: Array.isArray(data.specs) ? data.specs : [],
                tags: Array.isArray(data.tags) ? data.tags : [],
                seedKey: data.seedKey || "",
                seeded: Boolean(data.seeded)
            });
        });
        renderCars(cars);
        writeCache({ cars });
    }, (error) => {
        showFirebaseError("Cars", error);
    });
}

function renderCars(cars = []) {
    const carsList = document.getElementById("carsListAdmin");
    if (!carsList) return;
    carsList.innerHTML = cars.length ? cars.map((car) => `
        <article class="admin-car-card">
            <img src="../${escapeHTML(car.image)}" alt="${escapeHTML(car.name || "Car")}" loading="lazy" onerror="this.src='../assets/car-5seater.png'">
            <div class="admin-car-info">
                <h3>${escapeHTML(car.name || "Untitled car")}</h3>
                <p>${escapeHTML(car.category || "-")} | &#8377;${escapeHTML(car.price || "-")}/day</p>
                ${car.seedKey ? `<small>Seed: ${escapeHTML(car.seedKey)}</small>` : ""}
            </div>
            <div class="admin-car-actions">
                <button class="btn-edit" type="button" data-edit-car="${escapeHTML(car.id)}">Edit</button>
                <button class="btn-delete" type="button" data-delete-car="${escapeHTML(car.id)}">Delete</button>
            </div>
        </article>
    `).join("") : '<div class="empty-state">No cars in Firestore yet.</div>';
}

function openCarModal(car = null) {
    const form = document.getElementById("carForm");
    form.reset();
    document.getElementById("carId").value = car?.id || "";
    document.getElementById("carSeedKey").value = car?.seedKey || "";
    document.getElementById("carSeeded").value = car?.seeded ? "true" : "";
    document.getElementById("modalTitle").textContent = car ? "Edit Car" : "Add New Car";
    document.getElementById("carName").value = car?.name || "";
    document.getElementById("carCategory").value = car?.category || "";
    document.getElementById("carPrice").value = car?.price || "";
    document.getElementById("carImage").value = car?.image || "";
    document.getElementById("carBestFor").value = car?.bestFor || "";
    document.getElementById("carSpecs").value = car?.specs?.join(", ") || "";
    document.getElementById("carTags").value = car?.tags?.join(", ") || "";
    document.getElementById("carModal").style.display = "flex";
}

function closeCarModal() {
    document.getElementById("carModal").style.display = "none";
}

async function editCar(id) {
    if (!FIREBASE_ENABLED) {
        alert("Firebase is disabled only because this page was opened with ?firebase=0. Remove that from the URL and reload.");
        return;
    }
    const car = state.cars.find((item) => item.id === id);
    if (car) {
        openCarModal(car);
        return;
    }

    const carSnap = await getDoc(doc(db, "cars", id));
    if (carSnap.exists()) openCarModal({ id, ...carSnap.data() });
}

async function saveCar(event) {
    event.preventDefault();
    if (!FIREBASE_ENABLED) {
        alert("Firebase is disabled only because this page was opened with ?firebase=0. Remove that from the URL and reload.");
        return;
    }
    const id = document.getElementById("carId").value;
    const seedKey = document.getElementById("carSeedKey").value;
    const seeded = document.getElementById("carSeeded").value === "true";
    const specs = document.getElementById("carSpecs").value.split(",").map((item) => item.trim()).filter(Boolean);
    const tags = document.getElementById("carTags").value.split(",").map((item) => item.trim()).filter(Boolean);
    const carData = {
        name: document.getElementById("carName").value.trim(),
        category: document.getElementById("carCategory").value.trim(),
        price: document.getElementById("carPrice").value.trim(),
        image: document.getElementById("carImage").value.trim() || "assets/car-5seater.png",
        bestFor: document.getElementById("carBestFor").value.trim(),
        specs,
        tags,
        updatedAt: serverTimestamp()
    };
    if (seedKey) carData.seedKey = seedKey;
    if (seeded) carData.seeded = true;

    try {
        if (id) {
            await setDoc(doc(db, "cars", id), carData, { merge: true });
        } else {
            await addDoc(collection(db, "cars"), {
                ...carData,
                createdAt: serverTimestamp()
            });
        }
        closeCarModal();
        if (typeof Toastify === "function") {
            Toastify({ text: "Car saved successfully", duration: 3000, style: { background: "#10b981", borderRadius: "8px" } }).showToast();
        }
    } catch (error) {
        console.error("Failed to save car", error);
        if (typeof Toastify === "function") {
            Toastify({ text: "Failed to save car", duration: 3000, style: { background: "#dc2626", borderRadius: "8px" } }).showToast();
        } else {
            alert(`Error saving car: ${error.message}`);
        }
    }
}

async function deleteCar(id) {
    if (!FIREBASE_ENABLED) {
        alert("Firebase is disabled only because this page was opened with ?firebase=0. Remove that from the URL and reload.");
        return;
    }
    const car = state.cars.find((item) => item.id === id);
    const name = car?.name || id;
    const typed = prompt(`Type DELETE to permanently remove "${name}".`);
    if (typed !== "DELETE") return;

    try {
        if (car?.seedKey) await markSeedCarDeleted(car.seedKey);
        await deleteDoc(doc(db, "cars", id));
        if (typeof Toastify === "function") {
            Toastify({ text: "Car deleted", duration: 3000, style: { background: "#10b981", borderRadius: "8px" } }).showToast();
        }
    } catch (error) {
        console.error("Failed to delete car", error);
        if (typeof Toastify === "function") {
            Toastify({ text: "Failed to delete car", duration: 3000, style: { background: "#dc2626", borderRadius: "8px" } }).showToast();
        } else {
            alert(`Error deleting car: ${error.message}`);
        }
    }
}

async function loadSettings() {
    if (!FIREBASE_ENABLED) {
        renderSettings(state.settings || {});
        return;
    }
    try {
        const settingsSnap = await getDoc(doc(db, "settings", "general"));
        if (settingsSnap.exists()) {
            state.settings = settingsSnap.data();
            writeCache({ settings: state.settings });
        }
    } catch (error) {
        console.warn("Settings loaded from offline cache", error);
    }
    renderSettings(state.settings || {});
}

function renderSettings(settings = {}) {
    document.getElementById("siteName").value = settings.siteName || "";
    document.getElementById("heroTitle1").value = settings.heroTitle1 || "";
    document.getElementById("heroTitle2").value = settings.heroTitle2 || "";
    document.getElementById("waNumber").value = settings.waNumber || "";
    document.getElementById("callNumber").value = settings.callNumber || "";
    document.getElementById("announceText").value = settings.announceText || "";
    document.getElementById("startingPrice").value = settings.startingPrice || "";
    document.getElementById("pickupLocations").value = settings.pickupLocations || "Bharatpur City: Main Branch - 24/7 Available\nRailway Station: Pickup from station gate";
}

async function saveSettings(event) {
    event.preventDefault();
    if (!FIREBASE_ENABLED) {
        alert("Firebase is disabled only because this page was opened with ?firebase=0. Remove that from the URL and reload.");
        return;
    }
    const data = {
        siteName: document.getElementById("siteName").value.trim(),
        heroTitle1: document.getElementById("heroTitle1").value.trim(),
        heroTitle2: document.getElementById("heroTitle2").value.trim(),
        waNumber: document.getElementById("waNumber").value.trim(),
        callNumber: document.getElementById("callNumber").value.trim(),
        announceText: document.getElementById("announceText").value.trim(),
        startingPrice: document.getElementById("startingPrice").value.trim(),
        pickupLocations: document.getElementById("pickupLocations").value.trim(),
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "settings", "general"), data, { merge: true });
        writeCache({ settings: { ...data, updatedAt: Date.now() } });
        if (typeof Toastify === "function") {
            Toastify({ text: "Settings saved successfully", duration: 3000, style: { background: "#10b981", borderRadius: "8px" } }).showToast();
        } else {
            alert("Settings saved successfully.");
        }
    } catch (error) {
        console.error("Failed to save settings", error);
        if (typeof Toastify === "function") {
            Toastify({ text: "Failed to save settings", duration: 3000, style: { background: "#dc2626", borderRadius: "8px" } }).showToast();
        } else {
            alert(`Settings could not be saved while offline or blocked: ${error.message}`);
        }
    }
}

function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCSV(filename, rows, columns) {
    const header = columns.map((column) => csvCell(column.label)).join(",");
    const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function exportLeads() {
    downloadCSV("shriram-leads.csv", state.leads || [], [
        { label: "Date", value: (row) => formatDate(row.timestamp) },
        { label: "Name", value: (row) => row.name },
        { label: "Phone", value: (row) => row.phone },
        { label: "City", value: (row) => row.city },
        { label: "Car", value: (row) => row.carType },
        { label: "Duration", value: (row) => row.duration },
        { label: "Source", value: (row) => row.source },
        { label: "Intent", value: (row) => row.intent },
        { label: "Status", value: (row) => row.status },
        { label: "Note", value: (row) => row.note }
    ]);
}

function exportAnalytics() {
    const dailyRows = (state.daily || []).map((row) => ({ type: "daily", ...row }));
    const visitorRows = (state.visitors || []).map((row) => ({ type: "visitor", ...row }));
    downloadCSV("shriram-analytics.csv", [...dailyRows, ...visitorRows], [
        { label: "Type", value: (row) => row.type },
        { label: "Date", value: (row) => row.date || "" },
        { label: "Page Views", value: (row) => row.pageViews || "" },
        { label: "Unique Visitors", value: (row) => row.uniqueVisitors || "" },
        { label: "IP Hash Prefix", value: (row) => row.ipHash ? row.ipHash.slice(0, 12) : "" },
        { label: "Country", value: (row) => row.countryName || row.countryCode || "" },
        { label: "Visits", value: (row) => row.visits || "" },
        { label: "First Seen", value: (row) => row.firstSeen ? formatDate(row.firstSeen) : "" },
        { label: "Last Seen", value: (row) => row.lastSeen ? formatDate(row.lastSeen) : "" }
    ]);
}

setupAuth();
setupTabs();
setupActions();
updateOfflineStatus();
window.addEventListener("online", updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/admin/sw.js").catch(() => {});
}

let deferredPrompt;
const installAppBtn = document.getElementById("installAppBtn");

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installAppBtn) installAppBtn.style.display = 'block';
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installAppBtn.style.display = 'none';
            }
            deferredPrompt = null;
        }
    });
}

async function loadPricing() {
    try {
        const snap = await getDoc(doc(db, "settings", "pricing"));
        if (snap.exists()) {
            const d = snap.data();
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
            setVal("priceDaily", d.priceDaily);
            setVal("kmDaily", d.kmDaily);
            setVal("priceWeekly", d.priceWeekly);
            setVal("kmWeekly", d.kmWeekly);
            setVal("priceMonthly", d.priceMonthly);
            setVal("kmMonthly", d.kmMonthly);
            setVal("extraKmCharge", d.extraKmCharge);
        }
    } catch (err) { console.warn("Pricing load failed", err); }
}

async function savePricing(event) {
    event.preventDefault();
    const btn = event.target.querySelector("button[type='submit']");
    const origText = btn?.textContent || "";
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    try {
        await setDoc(doc(db, "settings", "pricing"), {
            priceDaily: document.getElementById("priceDaily")?.value || "",
            kmDaily: document.getElementById("kmDaily")?.value || "",
            priceWeekly: document.getElementById("priceWeekly")?.value || "",
            kmWeekly: document.getElementById("kmWeekly")?.value || "",
            priceMonthly: document.getElementById("priceMonthly")?.value || "",
            kmMonthly: document.getElementById("kmMonthly")?.value || "",
            extraKmCharge: document.getElementById("extraKmCharge")?.value || "",
            updatedAt: serverTimestamp()
        }, { merge: true });
        if (typeof Toastify === "function") {
            Toastify({ text: "Pricing saved successfully", duration: 3000, style: { background: "#10b981", borderRadius: "8px" } }).showToast();
        } else {
            alert("Pricing saved successfully!");
        }
    } catch (err) {
        console.error("Save pricing failed", err);
        if (typeof Toastify === "function") {
            Toastify({ text: "Failed to save pricing", duration: 3000, style: { background: "#dc2626", borderRadius: "8px" } }).showToast();
        } else {
            alert("Failed to save pricing. Check console.");
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = origText; }
}

setupAuth();

if (localStorage.getItem(PIN_STORAGE_KEY) === "true") {
    showDashboard();
} else {
    showLogin();
}
