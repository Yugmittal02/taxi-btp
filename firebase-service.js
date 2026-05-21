// Firebase configuration and shared data helpers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC-nreyuj5Qj1sdOMBh1D5Q8n1t090Yo04",
  authDomain: "smartkabadi-945b9.firebaseapp.com",
  projectId: "smartkabadi-945b9",
  storageBucket: "smartkabadi-945b9.firebasestorage.app",
  messagingSenderId: "92850793972",
  appId: "1:92850793972:web:50f1cfce0e8d74c2f1dda1",
  measurementId: "G-K8X0E3MGBB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let analytics = null;
const firebaseParam = new URLSearchParams(window.location.search).get("firebase");

export const FIREBASE_ENABLED = firebaseParam !== "0";

if (FIREBASE_ENABLED) {
  isSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch((error) => {
      console.warn("Firebase Analytics is not available", error);
    });
}

export { db, analytics };

export const INITIAL_CARS = [
  {
    seedKey: "5-seater-hatchback",
    name: "5 Seater Hatchback",
    category: "5seater",
    badge: "Popular",
    price: "999",
    image: "assets/car-5seater.png",
    bestFor: "Best for city travel & couples/family",
    specs: ["Petrol/Diesel", "Manual", "5 Seats", "AC", "2 Bags", "15+ km/l"],
    tags: ["5seater", "hatchback", "selfdrive", "popular"]
  },
  {
    seedKey: "7-seater-mpv",
    name: "7 Seater MPV",
    category: "7seater",
    badge: "Family",
    price: "1499",
    image: "assets/car-7seater.png",
    bestFor: "Best for family trips & group travel",
    specs: ["Diesel", "Manual/Auto", "7 Seats", "AC", "4 Bags", "12+ km/l"],
    tags: ["7seater", "selfdrive", "family"]
  },
  {
    seedKey: "suv",
    name: "SUV",
    category: "suv",
    badge: "Premium",
    price: "1999",
    image: "assets/car-suv.png",
    bestFor: "Best for long routes & road trips",
    specs: ["Diesel", "Manual/Auto", "5-7 Seats", "AC", "4 Bags", "10+ km/l"],
    tags: ["suv", "selfdrive", "premium"]
  },
  {
    seedKey: "sedan",
    name: "Sedan",
    category: "sedan",
    badge: "Comfort",
    price: "1299",
    image: "assets/car-sedan.png",
    bestFor: "Best for comfort & professional travel",
    specs: ["Petrol/Diesel", "Manual/Auto", "5 Seats", "AC", "3 Bags", "14+ km/l"],
    tags: ["sedan", "selfdrive", "comfort"]
  },
  {
    seedKey: "hatchback",
    name: "Hatchback",
    category: "hatchback",
    badge: "Budget",
    price: "999",
    image: "assets/car-hatchback.png",
    bestFor: "Best for daily commute & city driving",
    specs: ["Petrol", "Manual", "5 Seats", "AC", "2 Bags", "18+ km/l"],
    tags: ["hatchback", "5seater", "selfdrive", "budget"]
  },
  {
    seedKey: "luxury-sedan",
    name: "Luxury Sedan",
    category: "luxury",
    badge: "Luxury",
    price: "2999",
    image: "assets/car-luxury.png",
    bestFor: "Best for VIP travel & special occasions",
    specs: ["Petrol/Diesel", "Automatic", "5 Seats", "Climate", "3 Bags", "12+ km/l"],
    tags: ["luxury", "sedan", "selfdrive", "premium"]
  }
];

const RETENTION_DAYS = 30;
const HASH_SALT = "selfdrive-client-analytics-v1";
const LIVE_HEARTBEAT_MS = 60000;
let firestoreAvailable = FIREBASE_ENABLED;

const todayKey = () => new Date().toISOString().slice(0, 10);
const retentionDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + RETENTION_DAYS);
  return date;
};

const cleanId = (value) => String(value || "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const markFirestoreUnavailable = (error) => {
  console.warn(
    "Firebase backend is unavailable. Static content will continue to work; enable Cloud Firestore for dynamic cars, admin data, and analytics.",
    error?.message || error
  );
};

const summarizeUserAgent = () => {
  const ua = navigator.userAgent || "unknown";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return "Safari";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  return ua.slice(0, 80);
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

async function sha256(value) {
  if (!window.crypto?.subtle) {
    throw new Error("Web Crypto is not available");
  }
  const encoded = new TextEncoder().encode(`${HASH_SALT}:${value}`);
  return toHex(await window.crypto.subtle.digest("SHA-256", encoded));
}

async function resolveVisitorIp() {
  try {
    const geoRes = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo?.ip) {
        return {
          ip: geo.ip,
          countryCode: geo.country_code || null,
          countryName: geo.country_name || null
        };
      }
    }
  } catch (error) {
    console.warn("Country lookup failed", error);
  }

  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (ipRes.ok) {
      const data = await ipRes.json();
      if (data?.ip) {
        return { ip: data.ip };
      }
    }
  } catch (error) {
    console.warn("IP lookup failed", error);
  }

  return null;
}

export const seedInitialCarsIfNeeded = async () => {
  if (!firestoreAvailable) return false;
  try {
    const deletedRef = doc(db, "metadata", "deletedSeedCars");
    const deletedSnap = await getDoc(deletedRef);
    const deletedSeeds = deletedSnap.exists() ? deletedSnap.data() : {};
    const carsRef = collection(db, "cars");
    const existingSnap = await getDocs(carsRef);
    const existingSeedKeys = new Set();
    const existingBySeedOrName = new Map();

    existingSnap.forEach((carDoc) => {
      const data = carDoc.data();
      if (data.seedKey) existingSeedKeys.add(data.seedKey);
      if (data.seedKey) existingBySeedOrName.set(cleanId(data.seedKey), { id: carDoc.id, data });
      if (data.name) existingBySeedOrName.set(cleanId(data.name), { id: carDoc.id, data });
    });

    await Promise.all(INITIAL_CARS.map(async (car) => {
      if (deletedSeeds[car.seedKey] || existingSeedKeys.has(car.seedKey)) return;
      const matchingExisting = existingBySeedOrName.get(cleanId(car.seedKey)) ||
        existingBySeedOrName.get(cleanId(car.name));
      if (matchingExisting) {
        const existingTags = Array.isArray(matchingExisting.data.tags) ? matchingExisting.data.tags : [];
        await setDoc(doc(db, "cars", matchingExisting.id), {
          seedKey: car.seedKey,
          seeded: true,
          badge: matchingExisting.data.badge || car.badge,
          bestFor: matchingExisting.data.bestFor || car.bestFor,
          tags: [...new Set([...existingTags, ...car.tags])],
          updatedAt: serverTimestamp()
        }, { merge: true });
        return;
      }
      await setDoc(doc(db, "cars", cleanId(car.seedKey)), {
        ...car,
        seeded: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }));
    return true;
  } catch (error) {
    markFirestoreUnavailable(error);
    return false;
  }
};

export const trackClick = async (type) => {
  if (!firestoreAvailable) return;
  try {
    const statsRef = doc(db, "analytics", "clicks");
    await setDoc(statsRef, {
      [type]: increment(1),
      total: increment(1),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    markFirestoreUnavailable(error);
  }
};

export const trackVisitor = async () => {
  if (!firestoreAvailable) return;
  try {
    const totalRef = doc(db, "analytics", "total_visitors");
    const dailyRef = doc(db, "analytics_daily", todayKey());
    const visitor = await resolveVisitorIp();
    const expiresAt = Timestamp.fromDate(retentionDate());
    const path = window.location.pathname || "/";
    const userAgentSummary = summarizeUserAgent();

    if (!visitor?.ip) {
      await runTransaction(db, async (transaction) => {
        transaction.set(totalRef, {
          totalPageViews: increment(1),
          total: increment(1),
          lastUpdated: serverTimestamp()
        }, { merge: true });
        transaction.set(dailyRef, {
          date: todayKey(),
          pageViews: increment(1),
          lastUpdated: serverTimestamp()
        }, { merge: true });
      });
      return;
    }

    const dateKey = todayKey();
    const ipHash = await sha256(visitor.ip);
    const ipRef = doc(db, "analytics_ips", ipHash);

    await runTransaction(db, async (transaction) => {
      const ipSnap = await transaction.get(ipRef);
      const ipData = ipSnap.exists() ? ipSnap.data() : {};
      const isUnique = !ipSnap.exists();
      const isDailyUnique = isUnique || ipData.lastVisitDate !== dateKey;

      transaction.set(ipRef, {
        ipHash,
        firstSeen: isUnique || !ipData.firstSeen ? serverTimestamp() : ipData.firstSeen,
        lastSeen: serverTimestamp(),
        lastVisitDate: dateKey,
        visits: increment(1),
        countryCode: visitor.countryCode || null,
        countryName: visitor.countryName || null,
        lastPath: path,
        userAgentSummary,
        expiresAt
      }, { merge: true });

      transaction.set(totalRef, {
        totalPageViews: increment(1),
        uniqueVisitors: isUnique ? increment(1) : increment(0),
        total: increment(1),
        unique: isUnique ? increment(1) : increment(0),
        lastUpdated: serverTimestamp()
      }, { merge: true });

      transaction.set(dailyRef, {
        date: dateKey,
        pageViews: increment(1),
        uniqueVisitors: isDailyUnique ? increment(1) : increment(0),
        lastUpdated: serverTimestamp()
      }, { merge: true });
    });
  } catch (error) {
    markFirestoreUnavailable(error);
  }
};

export const updateLiveStatus = async () => {
  if (!firestoreAvailable) return;
  const sessionId = sessionStorage.getItem("analyticsSessionId") ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem("analyticsSessionId", sessionId);

  const liveRef = doc(db, "analytics_live", sessionId);
  const writeHeartbeat = () => setDoc(liveRef, {
    sessionId,
    lastSeen: serverTimestamp(),
    path: window.location.pathname || "/",
    expiresAt: Timestamp.fromDate(retentionDate())
  }, { merge: true }).catch((error) => {
    markFirestoreUnavailable(error);
  });

  await writeHeartbeat();
  const interval = window.setInterval(writeHeartbeat, LIVE_HEARTBEAT_MS);

  window.addEventListener("beforeunload", () => {
    window.clearInterval(interval);
    updateDoc(liveRef, {
      lastSeen: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000))
    }).catch(() => {});
  });
};

export const markSeedCarDeleted = async (seedKey) => {
  if (!seedKey || !firestoreAvailable) return;
  await setDoc(doc(db, "metadata", "deletedSeedCars"), {
    [seedKey]: serverTimestamp()
  }, { merge: true });
};

export const restoreSeedCar = async (seedKey) => {
  if (!seedKey || !firestoreAvailable) return;
  await updateDoc(doc(db, "metadata", "deletedSeedCars"), {
    [seedKey]: deleteField()
  });
};
