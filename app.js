// =========================================
// GoEV APPLICATION LOGIC — TEAM EVENTURE
// Real-Time GPS Map + Fixed Vehicle Save + 6-Digit OTP Auth
// =========================================

let isSignupMode = false;
let pendingAuthPayload = null;
let generatedOtpCode = null;

let goevRealtimeMap = null;
let goevHomePreviewMap = null;
let realtimeMarkersLayer = null;
let previewMarkersLayer = null;

let selectedStationId = null;
let previousScreenId = "screen-home";
let vehiclePreviousScreenId = "screen-home";
let filtersPreviousScreenId = "screen-live-map";
let bookingPreviousScreenId = "screen-station-details";
let selectedBookingPortId = null;
let selectedBookingSlot = "10:30 AM - 11:30 AM";

// Live GPS state with Pimpri-Chinchwad fallback
const FALLBACK_COORDS = { lat: 18.6298, lng: 73.7997 };
let liveCoords = { ...FALLBACK_COORDS, accuracy: null, isLiveGps: false };
let gpsWatchId = null;
let telemetryTimerId = null;

const DEFAULT_GOEV_VEHICLE = {
  name: "Tata Nexon EV",
  capacity: 40,
  currentSoc: 30,
  targetSoc: 80,
  connector: "CCS2"
};

const DEFAULT_FILTER_STATE = {
  maxDistance: 50,
  connector: "ALL",
  availableOnly: false,
  speed: "ALL",
  maxPrice: 30
};

const SAMPLE_TIME_SLOTS = [
  "09:00 AM - 10:00 AM",
  "10:30 AM - 11:30 AM",
  "12:00 PM - 01:00 PM",
  "02:30 PM - 03:30 PM",
  "04:00 PM - 05:00 PM",
  "06:30 PM - 07:30 PM"
];

let activeStationFilters = { ...DEFAULT_FILTER_STATE };

// =========================================
// SHARED HELPERS & STORAGE ACCESSORS
// =========================================
function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function setActiveNav(screenId) {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.target === screenId);
  });
}

function getStations() {
  try {
    const raw = localStorage.getItem("goev_stations");
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (err) {
    console.error("Failed to read goev_stations:", err);
  }
  return typeof INITIAL_STATIONS !== "undefined" ? INITIAL_STATIONS : [];
}

function saveStationsToStorage(stationsArr) {
  try {
    localStorage.setItem("goev_stations", JSON.stringify(stationsArr));
    return true;
  } catch (err) {
    console.error("Failed to save goev_stations:", err);
    return false;
  }
}

function getBookingsFromStorage() {
  try {
    const raw = localStorage.getItem("goev_bookings");
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read goev_bookings:", err);
    return [];
  }
}

function saveBookingsArrayToStorage(bookingsArr) {
  try {
    localStorage.setItem("goev_bookings", JSON.stringify(bookingsArr));
    return true;
  } catch (err) {
    console.error("Failed to save goev_bookings:", err);
    return false;
  }
}

function saveBookingToStorage(bookingObj) {
  const existing = getBookingsFromStorage();
  existing.unshift(bookingObj);
  return saveBookingsArrayToStorage(existing);
}

function getVehicle() {
  const fallback =
    typeof DEFAULT_VEHICLE !== "undefined"
      ? DEFAULT_VEHICLE
      : DEFAULT_GOEV_VEHICLE;
  try {
    const raw = localStorage.getItem("goev_vehicle");
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch (err) {
    console.error("Failed to read goev_vehicle:", err);
    return { ...fallback };
  }
}

function saveVehicleToStorage(vehicleObj) {
  try {
    localStorage.setItem("goev_vehicle", JSON.stringify(vehicleObj));
    return true;
  } catch (err) {
    console.error("Failed to save goev_vehicle:", err);
    return false;
  }
}

// =========================================
// REAL-TIME GPS & HAVERSINE DISTANCE ENGINE
// =========================================
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(Number(lat1))) *
      Math.cos(toRad(Number(lat2))) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

function getStationDistanceKm(station) {
  if (typeof station.lat === "number" && typeof station.lng === "number") {
    return haversineDistanceKm(liveCoords.lat, liveCoords.lng, station.lat, station.lng);
  }
  return Number(station.distanceKm ?? station.distance ?? 5);
}

function updateGpsStatusBadges(statusText, isLive) {
  const ids = ["home-gps-label", "explore-gps-subtitle", "livemap-gps-subtitle"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "explore-gps-subtitle") {
      el.textContent = isLive ? `${statusText} • Live distance` : `${statusText} • Reference`;
    } else {
      el.textContent = statusText;
    }
  });
}

function requestLiveGpsLocation(centerMapOnFix = false) {
  if (!navigator.geolocation) {
    liveCoords = { ...FALLBACK_COORDS, accuracy: null, isLiveGps: false };
    updateGpsStatusBadges("GPS unavailable • Pimpri-Chinchwad", false);
    refreshActiveViews();
    return;
  }

  updateGpsStatusBadges("Acquiring live GPS...", false);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      liveCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
        isLiveGps: true
      };
      updateGpsStatusBadges(
        `GPS ${liveCoords.lat.toFixed(4)}, ${liveCoords.lng.toFixed(4)} (±${liveCoords.accuracy}m)`,
        true
      );
      if (goevRealtimeMap && centerMapOnFix) {
        goevRealtimeMap.setView([liveCoords.lat, liveCoords.lng], 13);
      }
      if (goevHomePreviewMap && centerMapOnFix) {
        goevHomePreviewMap.setView([liveCoords.lat, liveCoords.lng], 12);
      }
      refreshActiveViews();
    },
    () => {
      liveCoords = { ...FALLBACK_COORDS, accuracy: null, isLiveGps: false };
      updateGpsStatusBadges("GPS off • Pimpri-Chinchwad", false);
      refreshActiveViews();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
  );

  if (gpsWatchId === null && navigator.geolocation.watchPosition) {
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        liveCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
          isLiveGps: true
        };
        updateGpsStatusBadges(
          `GPS ${liveCoords.lat.toFixed(4)}, ${liveCoords.lng.toFixed(4)} (±${liveCoords.accuracy}m)`,
          true
        );
        refreshActiveViews();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }
}

function refreshActiveViews() {
  const activeScreen = document.querySelector(".screen.active");
  if (!activeScreen) return;
  if (activeScreen.id === "screen-home") renderHomeDashboard();
  else if (activeScreen.id === "screen-live-map") renderRealtimeMapScreen();
  else if (activeScreen.id === "screen-explore") renderExploreScreen();
  else if (activeScreen.id === "screen-bookings") renderBookingsScreen();
}

function normalizePortStatus(status) {
  const clean = String(status || "Unavailable").toLowerCase();
  if (clean === "available") return "Available";
  if (clean === "occupied") return "Occupied";
  if (clean === "reserved") return "Reserved";
  return "Unavailable";
}

function getAvailablePortCount(station) {
  if (!Array.isArray(station.ports)) return 0;
  return station.ports.filter((p) => normalizePortStatus(p.status) === "Available").length;
}

function getStationAggregateStatus(station) {
  const ports = Array.isArray(station.ports) ? station.ports : [];
  if (ports.some((p) => normalizePortStatus(p.status) === "Available")) {
    return { label: "Available", cssClass: "status-pill--available" };
  }
  if (ports.some((p) => normalizePortStatus(p.status) === "Reserved")) {
    return { label: "Reserved", cssClass: "status-pill--reserved" };
  }
  if (ports.some((p) => normalizePortStatus(p.status) === "Occupied")) {
    return { label: "Occupied", cssClass: "status-pill--occupied" };
  }
  const fallbackLabel = normalizePortStatus(station.status);
  return {
    label: fallbackLabel,
    cssClass: `status-pill--${fallbackLabel.toLowerCase()}`
  };
}

function refreshStationAggregateStatus(station) {
  if (!Array.isArray(station.ports) || station.ports.length === 0) return;
  if (station.ports.some((p) => normalizePortStatus(p.status) === "Available")) {
    station.status = "Available";
  } else if (station.ports.some((p) => normalizePortStatus(p.status) === "Reserved")) {
    station.status = "Reserved";
  } else if (station.ports.some((p) => normalizePortStatus(p.status) === "Occupied")) {
    station.status = "Occupied";
  } else {
    station.status = "Unavailable";
  }
}

function releaseReservedPort(stationId, portId) {
  if (!stationId || !portId) return;
  const stations = getStations();
  const sIdx = stations.findIndex((s) => String(s.id) === String(stationId));
  if (sIdx === -1) return;

  const station = stations[sIdx];
  if (!Array.isArray(station.ports)) return;

  const pIdx = station.ports.findIndex(
    (p, idx) => String(p.id || `Port-${idx + 1}`) === String(portId)
  );
  if (pIdx !== -1 && normalizePortStatus(station.ports[pIdx].status) === "Reserved") {
    station.ports[pIdx].status = "Available";
    refreshStationAggregateStatus(station);
    stations[sIdx] = station;
    saveStationsToStorage(stations);
  }
}

function getMarkerColor(status) {
  const normalized = normalizePortStatus(status).toLowerCase();
  if (normalized === "available") return "#16C784";
  if (normalized === "occupied") return "#E45B64";
  if (normalized === "reserved") return "#F4A340";
  return "#82919B";
}

function getStationConnectorsList(station) {
  if (Array.isArray(station.connectors) && station.connectors.length > 0) {
    return station.connectors.map((c) => String(c).trim());
  }
  if (Array.isArray(station.ports) && station.ports.length > 0) {
    const fromPorts = station.ports.map((p) => p.connector || p.type).filter(Boolean);
    if (fromPorts.length > 0) return [...new Set(fromPorts)];
  }
  return station.connector ? [String(station.connector).trim()] : ["CCS2"];
}

// =========================================
// LIVE CHARGE & COST CALCULATOR POPUP MODAL
// =========================================
function calculateChargingEstimate({
  capacityKwh,
  currentSoc,
  targetSoc,
  chargerPowerKw,
  pricePerKwh
}) {
  const cap = Number(capacityKwh);
  const cur = Number(currentSoc);
  const tgt = Number(targetSoc);
  const power = Number(chargerPowerKw);
  const rate = Number(pricePerKwh);

  if (!Number.isFinite(cap) || cap <= 0) {
    return { valid: false, error: "Battery capacity must be greater than 0 kWh." };
  }
  if (!Number.isFinite(cur) || cur < 0 || cur > 99) {
    return { valid: false, error: "Current charge must be between 0% and 99%." };
  }
  if (!Number.isFinite(tgt) || tgt < 1 || tgt > 100) {
    return { valid: false, error: "Target charge must be between 1% and 100%." };
  }
  if (tgt <= cur) {
    return { valid: false, error: "Target charge (%) must be greater than Current charge (%)." };
  }
  if (!Number.isFinite(power) || power <= 0) {
    return { valid: false, error: "Charger power must be greater than 0 kW." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { valid: false, error: "Tariff per kWh cannot be negative." };
  }

  const energyRequiredKwh = (cap * (tgt - cur)) / 100;
  const estimatedHours = energyRequiredKwh / power;
  const estimatedCost = energyRequiredKwh * rate;

  const totalMinutes = Math.round(estimatedHours * 60);
  const hrsPart = Math.floor(totalMinutes / 60);
  const minsPart = totalMinutes % 60;

  return {
    valid: true,
    energyRequiredKwh: Number(energyRequiredKwh.toFixed(2)),
    estimatedHours: Number(estimatedHours.toFixed(2)),
    formattedDuration: hrsPart > 0 ? `${hrsPart}h ${minsPart}m` : `${minsPart}m`,
    estimatedCost: Number(estimatedCost.toFixed(2)),
    roundedCost: Math.round(estimatedCost)
  };
}

function computeStationEstimate(station, vehicle) {
  const powerKw = Number(station.powerKw || station.power || 30);
  const pricePerKwh = Number(station.pricePerKwh || station.price || 15);
  const calc = calculateChargingEstimate({
    capacityKwh: vehicle.capacity,
    currentSoc: vehicle.currentSoc,
    targetSoc: vehicle.targetSoc,
    chargerPowerKw: powerKw,
    pricePerKwh
  });

  if (!calc.valid) {
    return { energyKwh: 0, estimatedHours: 0, estimatedCost: 0, powerKw, pricePerKwh };
  }

  return {
    energyKwh: calc.energyRequiredKwh,
    estimatedHours: calc.estimatedHours,
    estimatedCost: calc.roundedCost,
    powerKw,
    pricePerKwh
  };
}

function populateCalculatorStationDropdown(preferredStationId = null) {
  const selectEl = document.getElementById("calc-station-select");
  const stations = getStations();
  if (!selectEl) return;

  selectEl.innerHTML = stations
    .map((s) => {
      const dist = getStationDistanceKm(s);
      const pwr = s.powerKw || s.power || 30;
      const rate = s.pricePerKwh || s.price || 15;
      return `<option value="${s.id}">${s.name} (${dist} km • ${pwr} kW • ₹${rate}/kWh)</option>`;
    })
    .join("");

  const activeId = preferredStationId || selectedStationId || (stations[0] && stations[0].id);
  if (activeId) selectEl.value = String(activeId);
}

function syncCalculatorWithStation(stationId) {
  const stations = getStations();
  const station = stations.find((s) => String(s.id) === String(stationId));
  if (!station) return;

  const powerEl = document.getElementById("calc-power");
  const priceEl = document.getElementById("calc-price");
  if (powerEl) powerEl.value = station.powerKw || station.power || 30;
  if (priceEl) priceEl.value = station.pricePerKwh || station.price || 15;
}

function fillCalculatorFromVehicleAndStation(stationId = null) {
  const vehicle = getVehicle();
  populateCalculatorStationDropdown(stationId);
  const selectEl = document.getElementById("calc-station-select");
  const chosenStationId = selectEl ? selectEl.value : stationId;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal("calc-capacity", vehicle.capacity);
  setVal("calc-current-soc", vehicle.currentSoc);
  setVal("calc-target-soc", vehicle.targetSoc);
  syncCalculatorWithStation(chosenStationId);
}

function runAndRenderCalculator() {
  const cap = document.getElementById("calc-capacity")?.value;
  const cur = document.getElementById("calc-current-soc")?.value;
  const tgt = document.getElementById("calc-target-soc")?.value;
  const power = document.getElementById("calc-power")?.value;
  const price = document.getElementById("calc-price")?.value;

  const result = calculateChargingEstimate({
    capacityKwh: cap,
    currentSoc: cur,
    targetSoc: tgt,
    chargerPowerKw: power,
    pricePerKwh: price
  });

  const errEl = document.getElementById("calc-error-msg");
  const energyOut = document.getElementById("calc-energy-out");
  const timeOut = document.getElementById("calc-time-out");
  const costOut = document.getElementById("calc-cost-out");
  const liveClockOut = document.getElementById("calc-live-clock-out");

  if (liveClockOut) {
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const perMinCost = (((Number(power) || 0) * (Number(price) || 0)) / 60).toFixed(2);
    liveClockOut.textContent = `Live ${nowTime} • ₹${perMinCost}/min`;
  }

  if (!result.valid) {
    if (errEl) errEl.textContent = result.error;
    if (energyOut) energyOut.textContent = "-- kWh";
    if (timeOut) timeOut.textContent = "-- hrs";
    if (costOut) costOut.textContent = "₹--";
    return result;
  }

  if (errEl) errEl.textContent = "";
  if (energyOut) energyOut.textContent = `${result.energyRequiredKwh} kWh`;
  if (timeOut) timeOut.textContent = `${result.estimatedHours} hrs (${result.formattedDuration})`;
  if (costOut) costOut.textContent = `₹${result.roundedCost}`;
  return result;
}

function openCalculatorModal(stationId = null) {
  const modal = document.getElementById("calculator-modal");
  if (!modal) return;
  fillCalculatorFromVehicleAndStation(stationId);
  runAndRenderCalculator();
  modal.classList.remove("hidden");
  renderIcons();
}

function closeCalculatorModal() {
  const modal = document.getElementById("calculator-modal");
  if (modal) modal.classList.add("hidden");
}

// =========================================
// RULE-BASED RECOMMENDATION
// =========================================
function scoreStationRuleBased(station, vehicle) {
  let score = 0;
  const reasons = [];

  const vehicleConnector = String(vehicle?.connector || "CCS2").toLowerCase();
  const stationConnectors = getStationConnectorsList(station).map((c) => c.toLowerCase());

  if (stationConnectors.includes(vehicleConnector)) {
    score += 30;
    reasons.push(`Matches your ${vehicle?.connector || "CCS2"} connector`);
  } else {
    score += 5;
    reasons.push(`Requires adapter for ${vehicle?.connector || "CCS2"}`);
  }

  const availablePortsCount = getAvailablePortCount(station);
  if (availablePortsCount > 0) {
    score += Math.min(25, 15 + availablePortsCount * 5);
    reasons.push(`${availablePortsCount} open port${availablePortsCount > 1 ? "s" : ""} ready`);
  } else {
    reasons.push("No open ports currently available");
  }

  const distKm = getStationDistanceKm(station);
  score += Math.round(((25 - Math.max(0, Math.min(25, distKm))) / 25) * 20);
  reasons.push(`${distKm} km away (${liveCoords.isLiveGps ? "live GPS" : "reference"})`);

  const powerKw = Number(station.powerKw ?? station.power ?? 22);
  score += Math.round((Math.max(0, Math.min(120, powerKw)) / 120) * 15);
  reasons.push(`${powerKw} kW charging output`);

  const pricePerKwh = Number(station.pricePerKwh ?? station.price ?? 16);
  score += Math.round(((30 - Math.max(5, Math.min(30, pricePerKwh))) / 25) * 10);
  reasons.push(`₹${pricePerKwh}/kWh rate`);

  return { station, score, availablePortsCount, distKm, reasons };
}

function getRecommendedStationRuleBased(stationsList = null) {
  const stations = Array.isArray(stationsList) ? stationsList : getStations();
  if (!stations || stations.length === 0) return null;

  const vehicle = getVehicle();
  const ranked = stations
    .map((station) => scoreStationRuleBased(station, vehicle))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.availablePortsCount !== a.availablePortsCount) {
        return b.availablePortsCount - a.availablePortsCount;
      }
      return a.distKm - b.distKm;
    });

  return ranked[0];
}

// =========================================
// STATION DETAILS & PORT VIEW
// =========================================
function renderStationPorts(station, vehicleConnector) {
  const portsContainer = document.getElementById("detail-ports-list");
  const portsCountEl = document.getElementById("detail-ports-count");
  if (!portsContainer) return;

  const ports = Array.isArray(station.ports) ? station.ports : [];
  if (portsCountEl) {
    portsCountEl.textContent = `${getAvailablePortCount(station)} of ${ports.length} available`;
  }

  if (ports.length === 0) {
    portsContainer.innerHTML = `<p class="card-subtitle">No port breakdown listed for this station.</p>`;
    return;
  }

  portsContainer.innerHTML = ports
    .map((port, idx) => {
      const portId = port.id || `Port ${idx + 1}`;
      const connector = port.connector || port.type || station.connector || "CCS2";
      const power = port.powerKw || port.power || station.powerKw || station.power || "--";
      const status = normalizePortStatus(port.status);
      const isCompatible =
        !vehicleConnector ||
        String(connector).toLowerCase() === String(vehicleConnector).toLowerCase();

      return `
        <div class="port-item-card">
          <div>
            <p class="port-item-title">${portId} • ${connector}</p>
            <p class="port-item-sub">${power} kW • ${isCompatible ? "Compatible with your EV" : "Verify adapter"}</p>
          </div>
          <span class="status-pill status-pill--${status.toLowerCase()}">${status}</span>
        </div>
      `;
    })
    .join("");
}

function openStationDetails(stationId) {
  const stations = getStations();
  const station = stations.find((s) => String(s.id) === String(stationId));
  if (!station) return;

  selectedStationId = station.id;

  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-station-details") {
    previousScreenId = activeScreen.id;
  }

  const vehicle = getVehicle();
  const estimate = computeStationEstimate(station, vehicle);
  const aggStatus = getStationAggregateStatus(station);
  const distVal = getStationDistanceKm(station);

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("detail-station-name", station.name || "Charging Station");
  setText("detail-station-address", station.address || station.area || "City Charging Hub");

  const badgeEl = document.getElementById("detail-station-status-badge");
  if (badgeEl) {
    badgeEl.textContent = aggStatus.label;
    badgeEl.className = `status-pill ${aggStatus.cssClass}`;
  }

  setText("detail-station-distance", `${distVal} km`);
  setText("detail-station-type", station.chargerType || station.type || "DC Fast");
  setText("detail-station-power", `${estimate.powerKw} kW`);
  setText("detail-station-price", `₹${estimate.pricePerKwh} / kWh`);
  setText("detail-station-connectors", `Connectors: ${getStationConnectorsList(station).join(", ")}`);

  setText("detail-vehicle-label", `${vehicle.name} (${vehicle.currentSoc}% → ${vehicle.targetSoc}%)`);
  setText("detail-est-energy", `${estimate.energyKwh} kWh`);
  setText("detail-est-time", `${estimate.estimatedHours} hrs`);
  setText("detail-est-cost", `₹${estimate.estimatedCost}`);

  renderStationPorts(station, vehicle.connector);

  const bookBtn = document.getElementById("btn-detail-book-now");
  const hasAvailablePort = getAvailablePortCount(station) > 0;
  if (bookBtn) {
    bookBtn.disabled = !hasAvailablePort;
    const span = bookBtn.querySelector("span");
    if (span) span.textContent = hasAvailablePort ? "Book Charging Slot" : "No Ports Available";
  }

  showScreen("screen-station-details");
}

// =========================================
// SLOT BOOKING, 20% ADVANCE & CONFIRMATION
// =========================================
function getTodayDateString() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().split("T")[0];
}

function updatePaymentSimulationBreakdown(estimatedCost) {
  const totalCost = Math.max(0, Number(estimatedCost) || 0);
  const advanceAmount = Math.round((totalCost * 20) / 100);
  const remainingAmount = Math.max(0, totalCost - advanceAmount);

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("booking-est-cost-val", `₹${totalCost}`);
  setText("booking-advance-val", `₹${advanceAmount}`);
  setText("booking-remaining-val", `₹${remainingAmount}`);

  return { totalCost, advanceAmount, remainingAmount };
}

function renderBookingPortSelector(station, vehicleConnector) {
  const portSelect = document.getElementById("booking-port-select");
  const portNoteEl = document.getElementById("booking-port-status-note");
  const ports = Array.isArray(station.ports) ? station.ports : [];

  selectedBookingPortId = null;
  if (!portSelect) return;

  if (ports.length === 0) {
    portSelect.innerHTML = `<option value="">No ports available</option>`;
    portSelect.disabled = true;
    if (portNoteEl) portNoteEl.textContent = "No charging ports configured for this station.";
    return;
  }

  portSelect.disabled = false;
  portSelect.innerHTML = ports
    .map((port, idx) => {
      const portId = String(port.id || `Port-${idx + 1}`);
      const connector = port.connector || port.type || station.connector || "CCS2";
      const power = port.powerKw || port.power || station.powerKw || station.power || "--";
      const status = normalizePortStatus(port.status);
      const isOpen = status === "Available";
      const isCompatible =
        !vehicleConnector ||
        String(connector).toLowerCase() === String(vehicleConnector).toLowerCase();

      if (!selectedBookingPortId && isOpen && isCompatible) {
        selectedBookingPortId = portId;
      }

      const suffix = !isOpen
        ? `(${status})`
        : isCompatible
        ? `(Available • Matches EV)`
        : `(Available)`;

      return `<option value="${portId}" ${!isOpen ? "disabled" : ""}>${portId} • ${connector} • ${power} kW ${suffix}</option>`;
    })
    .join("");

  if (!selectedBookingPortId) {
    const firstOpen = ports.find((p) => normalizePortStatus(p.status) === "Available");
    if (firstOpen) selectedBookingPortId = String(firstOpen.id || "Port-1");
  }

  if (selectedBookingPortId) {
    portSelect.value = selectedBookingPortId;
  } else {
    portSelect.value = "";
    portSelect.disabled = true;
  }

  if (portNoteEl) {
    portNoteEl.textContent = selectedBookingPortId
      ? "Occupied and Reserved ports are locked from selection."
      : "No Available ports right now.";
  }
}

function renderBookingTimeSlots() {
  const slotsContainer = document.getElementById("booking-slots-list");
  if (!slotsContainer) return;

  if (!SAMPLE_TIME_SLOTS.includes(selectedBookingSlot)) {
    selectedBookingSlot = SAMPLE_TIME_SLOTS[0];
  }

  slotsContainer.innerHTML = SAMPLE_TIME_SLOTS
    .map((slot) => {
      const active = slot === selectedBookingSlot;
      return `
        <button
          type="button"
          class="slot-pill-btn ${active ? "active" : ""}"
          aria-pressed="${active ? "true" : "false"}"
          data-slot="${slot}"
        >
          ${slot}
        </button>
      `;
    })
    .join("");

  slotsContainer.querySelectorAll(".slot-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedBookingSlot = btn.dataset.slot;
      renderBookingTimeSlots();
    });
  });
}

function openSlotBooking(stationId = null) {
  const targetId = stationId || selectedStationId;
  const stations = getStations();
  const station = stations.find((s) => String(s.id) === String(targetId));
  if (!station) return;

  selectedStationId = station.id;

  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-booking") {
    bookingPreviousScreenId = activeScreen.id;
  }

  const vehicle = getVehicle();
  const estimate = computeStationEstimate(station, vehicle);

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("booking-station-name", station.name);
  setText(
    "booking-station-meta",
    `${station.address || "City Hub"} • ${estimate.powerKw} kW • ₹${estimate.pricePerKwh}/kWh`
  );
  setText(
    "booking-vehicle-summary",
    `${vehicle.name} (${vehicle.connector}, ${vehicle.currentSoc}% → ${vehicle.targetSoc}%)`
  );
  setText("booking-est-energy-val", `${estimate.energyKwh} kWh`);
  setText("booking-est-time-val", `${estimate.estimatedHours} hrs`);

  updatePaymentSimulationBreakdown(estimate.estimatedCost);
  renderBookingPortSelector(station, vehicle.connector);

  const dateInput = document.getElementById("booking-date-input");
  if (dateInput && !dateInput.value) dateInput.value = getTodayDateString();

  renderBookingTimeSlots();

  document.getElementById("booking-confirmation-card")?.classList.add("hidden");
  const errEl = document.getElementById("booking-error-msg");
  if (errEl) errEl.textContent = "";

  const payBtn = document.getElementById("btn-simulate-payment");
  if (payBtn) payBtn.disabled = !selectedBookingPortId;

  showScreen("screen-booking");
}

function handleSimulateAdvancePayment() {
  const errEl = document.getElementById("booking-error-msg");
  const setErr = (msg) => {
    if (errEl) errEl.textContent = msg;
  };
  setErr("");

  const stations = getStations();
  const stationIndex = stations.findIndex((s) => String(s.id) === String(selectedStationId));
  if (stationIndex === -1) return setErr("Station not found.");

  const station = stations[stationIndex];
  const portSelect = document.getElementById("booking-port-select");
  const chosenPortId = String(portSelect?.value || selectedBookingPortId || "");
  const chosenDate = document.getElementById("booking-date-input")?.value || "";
  const chosenSlot = selectedBookingSlot || "";

  if (!chosenPortId) return setErr("Please select an Available charging port.");
  if (!chosenDate) return setErr("Please select a booking date.");
  if (!chosenSlot) return setErr("Please select a time slot.");

  const ports = Array.isArray(station.ports) ? station.ports : [];
  const portIndex = ports.findIndex(
    (p, idx) => String(p.id || `Port-${idx + 1}`) === chosenPortId
  );
  if (portIndex === -1) return setErr("Selected port not found.");

  const currentPortStatus = normalizePortStatus(ports[portIndex].status);
  if (currentPortStatus !== "Available") {
    return setErr(`Port ${chosenPortId} is currently ${currentPortStatus}.`);
  }

  const vehicle = getVehicle();
  const estimate = computeStationEstimate(station, vehicle);
  const { totalCost, advanceAmount, remainingAmount } = updatePaymentSimulationBreakdown(
    estimate.estimatedCost
  );
  const user = JSON.parse(localStorage.getItem("goev_user")) || {
    name: "Demo EV Driver",
    email: "demo@goev.app"
  };

  station.ports[portIndex].status = "Reserved";
  refreshStationAggregateStatus(station);
  stations[stationIndex] = station;
  saveStationsToStorage(stations);

  const bookingId = `GOEV-${Math.floor(100000 + Math.random() * 900000)}`;
  const bookingRecord = {
    bookingId,
    stationId: station.id,
    stationName: station.name,
    stationAddress: station.address || "City Hub",
    portId: chosenPortId,
    connector: station.ports[portIndex].connector || station.connector || vehicle.connector,
    date: chosenDate,
    timeSlot: chosenSlot,
    vehicleName: vehicle.name,
    capacityKwh: vehicle.capacity,
    currentSoc: vehicle.currentSoc,
    targetSoc: vehicle.targetSoc,
    powerKw: estimate.powerKw,
    pricePerKwh: estimate.pricePerKwh,
    energyKwh: estimate.energyKwh,
    estimatedHours: estimate.estimatedHours,
    totalEstimatedCost: totalCost,
    advancePaidSimulated: advanceAmount,
    remainingBalanceSimulated: remainingAmount,
    status: "Reserved",
    driverName: user.name,
    createdAt: new Date().toISOString()
  };

  saveBookingToStorage(bookingRecord);

  renderBookingPortSelector(station, vehicle.connector);
  const payBtn = document.getElementById("btn-simulate-payment");
  if (payBtn) payBtn.disabled = !selectedBookingPortId;

  const confirmCard = document.getElementById("booking-confirmation-card");
  if (confirmCard) {
    confirmCard.classList.remove("hidden");
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText("conf-booking-id", `Booking ID: ${bookingRecord.bookingId}`);
    setText("conf-station-name", bookingRecord.stationName);
    setText("conf-port-slot", `${bookingRecord.portId} • ${bookingRecord.date} • ${bookingRecord.timeSlot}`);
    setText("conf-vehicle-info", `${bookingRecord.vehicleName} • ${bookingRecord.energyKwh} kWh est.`);
    setText(
      "conf-payment-summary",
      `20% Advance Paid (Simulated): ₹${bookingRecord.advancePaidSimulated} • Balance (80%): ₹${bookingRecord.remainingBalanceSimulated}`
    );
  }

  renderIcons();
}

// =========================================
// BOOKING HISTORY & TELEMETRY
// =========================================
function updateBookingStatus(bookingId, newStatus) {
  const bookings = getBookingsFromStorage();
  const idx = bookings.findIndex((b) => b.bookingId === bookingId);
  if (idx === -1) return;

  const target = bookings[idx];
  const prevStatus = target.status;
  target.status = newStatus;
  bookings[idx] = target;
  saveBookingsArrayToStorage(bookings);

  if (prevStatus === "Reserved" && (newStatus === "Cancelled" || newStatus === "Completed")) {
    releaseReservedPort(target.stationId, target.portId);
  }

  renderBookingsScreen();
}

function getLiveTelemetryForBooking(booking) {
  const createdMs = booking.createdAt ? new Date(booking.createdAt).getTime() : Date.now();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
  const startSoc = Number(booking.currentSoc ?? 30);
  const targetSoc = Number(booking.targetSoc ?? 80);
  const cap = Number(booking.capacityKwh ?? 40);
  const powerKw = Number(booking.powerKw ?? 30);
  const rate = Number(booking.pricePerKwh ?? 15);

  const simMinutesElapsed = elapsedSec;
  const kwhDelivered = Math.min(
    Number(booking.energyKwh || (cap * (targetSoc - startSoc)) / 100),
    Number(((powerKw * simMinutesElapsed) / 60).toFixed(2))
  );
  const liveSoc = Math.min(
    targetSoc,
    Math.round(startSoc + (kwhDelivered / Math.max(1, cap)) * 100)
  );
  const liveAccruedCost = Math.round(kwhDelivered * rate);

  return { liveSoc, kwhDelivered, liveAccruedCost };
}

function renderBookingsScreen() {
  const listEl = document.getElementById("bookings-history-list");
  const countEl = document.getElementById("bookings-count-label");
  const bookings = getBookingsFromStorage();

  if (countEl) countEl.textContent = `${bookings.length}`;
  if (!listEl) return;

  if (bookings.length === 0) {
    listEl.innerHTML = `
      <div class="surface-card">
        <h4 class="port-item-title">No Slot Bookings Yet</h4>
        <p class="card-subtitle" style="margin-top:4px;">
          Select a station, choose an available port, and complete the simulated 20% advance payment to see your booking here.
        </p>
      </div>
    `;
    renderIcons();
    return;
  }

  listEl.innerHTML = bookings
    .map((b) => {
      const status = b.status || "Reserved";
      const badgeClass =
        status === "Reserved"
          ? "status-pill--reserved"
          : status === "Completed"
          ? "status-pill--available"
          : "status-pill--occupied";

      const isActive = status === "Reserved";
      const te = getLiveTelemetryForBooking(b);

      return `
        <article class="surface-card">
          <div class="detail-top-row" style="margin-bottom:8px;">
            <div>
              <span class="booking-id-badge">${b.bookingId}</span>
              <h4 class="port-item-title">${b.stationName}</h4>
              <p class="card-subtitle">${b.portId} • ${b.connector || "CCS2"} • ${b.date} • ${b.timeSlot}</p>
            </div>
            <span class="status-pill ${badgeClass}">${status}</span>
          </div>

          <div class="live-telemetry-strip">
            <span>SoC: <strong>${isActive ? `${te.liveSoc}%` : `${b.targetSoc || 80}%`}</strong></span>
            <span>Energy: <strong>${isActive ? `${te.kwhDelivered} kWh` : `${b.energyKwh} kWh`}</strong></span>
            <span>Est. Cost: <strong>₹${isActive ? te.liveAccruedCost : b.totalEstimatedCost}</strong></span>
          </div>

          <div class="booking-kv-grid">
            <div>
              <span class="meta-label">Vehicle</span>
              <strong class="meta-value">${b.vehicleName}</strong>
            </div>
            <div>
              <span class="meta-label">20% Adv / 80% Due</span>
              <strong class="meta-value highlight-green">₹${b.advancePaidSimulated} / ₹${b.remainingBalanceSimulated}</strong>
            </div>
          </div>

          ${
            isActive
              ? `<div class="booking-card-actions">
                  <button type="button" class="btn-sm-teal" onclick="updateBookingStatus('${b.bookingId}', 'Completed')">Complete &amp; Free Port</button>
                  <button type="button" class="btn-danger-ghost" onclick="updateBookingStatus('${b.bookingId}', 'Cancelled')">Cancel</button>
                </div>`
              : `<p class="card-subtitle" style="margin-top:10px;">Port released back to available pool.</p>`
          }
        </article>
      `;
    })
    .join("");

  renderIcons();
}

// =========================================
// USER PROFILE & VEHICLE PROFILE (FIXED SAVE)
// =========================================
function renderProfileScreen() {
  const user = JSON.parse(localStorage.getItem("goev_user")) || {
    name: "Demo EV Driver",
    email: "demo@goev.app",
    otpVerified: false
  };
  const vehicle = getVehicle();
  const bookings = getBookingsFromStorage();

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("profile-driver-name", user.name || "EV Driver");
  setText("profile-driver-email", user.email || "demo@goev.app");
  setText("profile-vehicle-summary", `${vehicle.name} • ${vehicle.capacity} kWh • ${vehicle.connector}`);
  setText("profile-soc-summary", `${vehicle.currentSoc}% → ${vehicle.targetSoc}%`);
  setText("profile-bookings-count", `${bookings.length}`);

  const otpBadge = document.getElementById("profile-otp-badge");
  if (otpBadge) {
    otpBadge.textContent = user.otpVerified ? "OTP Verified" : "Demo Session";
    otpBadge.className = `status-pill ${user.otpVerified ? "status-pill--available" : "status-pill--reserved"}`;
  }

  const msgEl = document.getElementById("profile-action-msg");
  if (msgEl) msgEl.textContent = "";

  renderIcons();
}

function handleResetSampleStations() {
  if (typeof INITIAL_STATIONS !== "undefined") {
    saveStationsToStorage(JSON.parse(JSON.stringify(INITIAL_STATIONS)));
    activeStationFilters = { ...DEFAULT_FILTER_STATE };
    const msgEl = document.getElementById("profile-action-msg");
    if (msgEl) {
      msgEl.textContent = "Stations & filters reset to default state.";
      msgEl.style.color = "#16C784";
    }
  }
}

function handleLogoutDriver() {
  localStorage.removeItem("goev_user");
  pendingAuthPayload = null;
  generatedOtpCode = null;
  resetAuthToCredentialsStep();
  setAuthMode(false);
  showScreen("screen-auth");
}

function populateVehicleForm(vehicle) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("vehicle-name", vehicle.name);
  setVal("vehicle-capacity", vehicle.capacity);
  setVal("vehicle-current-soc", vehicle.currentSoc);
  setVal("vehicle-target-soc", vehicle.targetSoc);
  setVal("vehicle-connector", vehicle.connector);
}

function renderVehicleScreen() {
  populateVehicleForm(getVehicle());
  const statusMsg = document.getElementById("vehicle-status-msg");
  if (statusMsg) statusMsg.textContent = "";
}

function handleVehicleFormSubmit(event) {
  event.preventDefault();

  const rawName = (document.getElementById("vehicle-name")?.value || "").trim();
  const capacity = Number(document.getElementById("vehicle-capacity")?.value);
  const currentSoc = Number(document.getElementById("vehicle-current-soc")?.value);
  const targetSoc = Number(document.getElementById("vehicle-target-soc")?.value);
  const connector = document.getElementById("vehicle-connector")?.value || "CCS2";
  const statusMsg = document.getElementById("vehicle-status-msg");

  const setMsg = (txt, isErr = false) => {
    if (!statusMsg) return;
    statusMsg.textContent = txt;
    statusMsg.style.color = isErr ? "#E45B64" : "#16C784";
  };

  if (!rawName) return setMsg("Please enter a vehicle model.", true);
  if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 300) {
    return setMsg("Battery capacity must be between 1 and 300 kWh.", true);
  }
  if (!Number.isFinite(currentSoc) || currentSoc < 0 || currentSoc > 99) {
    return setMsg("Current charge must be between 0% and 99%.", true);
  }
  if (!Number.isFinite(targetSoc) || targetSoc < 1 || targetSoc > 100) {
    return setMsg("Target charge must be between 1% and 100%.", true);
  }
  if (targetSoc <= currentSoc) {
    return setMsg("Target charge (%) must be greater than current charge (%).", true);
  }

  const updatedVehicle = {
    name: rawName,
    capacity: Number(capacity.toFixed(1)),
    currentSoc: Math.round(currentSoc),
    targetSoc: Math.round(targetSoc),
    connector
  };

  const savedOk = saveVehicleToStorage(updatedVehicle);
  if (savedOk) {
    setMsg(`Saved ${updatedVehicle.name} (${updatedVehicle.capacity} kWh, ${updatedVehicle.connector})!`);
    renderHomeDashboard();
    renderProfileScreen();
  } else {
    setMsg("Could not save vehicle profile to browser storage.", true);
  }
}

// =========================================
// SEARCH & FILTERS
// =========================================
function getFilteredStations() {
  const allStations = getStations();

  return allStations.filter((station) => {
    const dist = getStationDistanceKm(station);
    if (dist > activeStationFilters.maxDistance) return false;

    if (activeStationFilters.connector !== "ALL") {
      const connectors = getStationConnectorsList(station).map((c) => c.toLowerCase());
      if (!connectors.includes(activeStationFilters.connector.toLowerCase())) return false;
    }

    if (activeStationFilters.availableOnly && getAvailablePortCount(station) === 0) return false;

    if (activeStationFilters.speed !== "ALL") {
      const power = Number(station.powerKw || station.power || 0);
      const speedFilter = activeStationFilters.speed.toUpperCase();
      if (speedFilter === "SLOW" && power >= 22) return false;
      if (speedFilter === "FAST" && (power < 22 || power >= 60)) return false;
      if (speedFilter === "RAPID" && power < 60) return false;
    }

    const price = Number(station.pricePerKwh ?? station.price ?? 0);
    if (price > activeStationFilters.maxPrice) return false;

    return true;
  });
}

function syncFilterInputsFromState() {
  const distInput = document.getElementById("filter-distance");
  const connSelect = document.getElementById("filter-connector");
  const speedSelect = document.getElementById("filter-speed");
  const priceInput = document.getElementById("filter-max-price");
  const availCheck = document.getElementById("filter-available-only");

  if (distInput) distInput.value = activeStationFilters.maxDistance;
  if (connSelect) {
    connSelect.value =
      activeStationFilters.connector === "ALL" ? "" : activeStationFilters.connector;
  }
  if (speedSelect) {
    speedSelect.value = activeStationFilters.speed === "ALL" ? "" : activeStationFilters.speed;
  }
  if (priceInput) priceInput.value = activeStationFilters.maxPrice;
  if (availCheck) availCheck.checked = activeStationFilters.availableOnly;
}

function readFilterStateFromInputs() {
  const distVal = document.getElementById("filter-distance")?.value;
  const connVal = document.getElementById("filter-connector")?.value;
  const speedVal = document.getElementById("filter-speed")?.value;
  const priceVal = document.getElementById("filter-max-price")?.value;
  const availVal = document.getElementById("filter-available-only")?.checked;

  activeStationFilters = {
    maxDistance: distVal ? Number(distVal) : DEFAULT_FILTER_STATE.maxDistance,
    connector: connVal ? connVal : "ALL",
    speed: speedVal ? speedVal : "ALL",
    maxPrice: priceVal ? Number(priceVal) : DEFAULT_FILTER_STATE.maxPrice,
    availableOnly: Boolean(availVal)
  };
}

function resetStationFilters() {
  activeStationFilters = { ...DEFAULT_FILTER_STATE };
  syncFilterInputsFromState();
  refreshActiveViews();
  if (document.getElementById("screen-home")?.classList.contains("active")) {
    renderHomeDashboard();
  }
}

// =========================================
// UNIFIED STATION CARD RENDERER
// =========================================
function renderStationCardHtml(station, compactFooterLabel = "ports available") {
  const availPorts = getAvailablePortCount(station);
  const distKm = getStationDistanceKm(station);
  const aggStatus = getStationAggregateStatus(station);

  return `
    <div class="station-card">
      <div class="station-card-top">
        <span class="station-name">${station.name}</span>
        <span class="status-pill ${aggStatus.cssClass}">${aggStatus.label}</span>
      </div>
      <div class="station-meta">
        <span><i data-lucide="navigation"></i>${distKm} km</span>
        <span><i data-lucide="plug"></i>${station.connector}</span>
        <span><i data-lucide="zap"></i>${station.power} kW</span>
        <span><i data-lucide="indian-rupee"></i>₹${station.pricePerKwh}/kWh</span>
      </div>
      <div class="station-card-footer">
        <small class="muted-count">${availPorts}/${station.ports.length} ${compactFooterLabel}</small>
        <button type="button" class="btn-sm-teal" onclick="openStationDetails('${station.id}')">View Details</button>
      </div>
    </div>
  `;
}

// =========================================
// HOME MAP PREVIEW, REAL-TIME MAP & DIRECTORY
// =========================================
function renderHomePreviewMap(stations) {
  const mapEl = document.getElementById("goev-home-preview-map");
  const summaryEl = document.getElementById("home-preview-summary");
  if (summaryEl) {
    summaryEl.textContent = `${stations.length} stations in range`;
  }
  if (!mapEl || !window.L) return;

  if (!goevHomePreviewMap) {
    goevHomePreviewMap = L.map("goev-home-preview-map", {
      zoomControl: false,
      attributionControl: false
    }).setView([liveCoords.lat, liveCoords.lng], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(goevHomePreviewMap);

    previewMarkersLayer = L.layerGroup().addTo(goevHomePreviewMap);
  }

  previewMarkersLayer.clearLayers();

  L.circleMarker([liveCoords.lat, liveCoords.lng], {
    radius: 6,
    fillColor: "#16A6A0",
    color: "#FFFFFF",
    weight: 2,
    fillOpacity: 1
  }).addTo(previewMarkersLayer);

  stations.slice(0, 8).forEach((station) => {
    const marker = L.circleMarker([station.lat, station.lng], {
      radius: 7,
      fillColor: getMarkerColor(station.status),
      color: "#101D2B",
      weight: 1.5,
      fillOpacity: 0.95
    });
    marker.on("click", () => openStationDetails(station.id));
    marker.addTo(previewMarkersLayer);
  });

  setTimeout(() => {
    goevHomePreviewMap?.invalidateSize();
  }, 150);
}

function renderRealtimeMapScreen() {
  const stations = getFilteredStations().sort(
    (a, b) => getStationDistanceKm(a) - getStationDistanceKm(b)
  );

  const tickEl = document.getElementById("livemap-tick-label");
  if (tickEl) {
    tickEl.textContent = `${new Date().toLocaleTimeString()} • ${stations.length} live nodes`;
  }

  const mapEl = document.getElementById("goev-realtime-map");
  const fallbackBox = document.getElementById("livemap-fallback-box");
  const fallbackPins = document.getElementById("livemap-fallback-pins");

  if (!mapEl || !window.L) {
    fallbackBox?.classList.remove("hidden");
    if (fallbackPins) {
      fallbackPins.innerHTML = stations
        .map(
          (s) =>
            `<button type="button" class="fallback-pin-btn" style="background:${getMarkerColor(s.status)}" onclick="openStationDetails('${s.id}')">${s.name} (${getStationDistanceKm(s)}km)</button>`
        )
        .join("");
    }
  } else {
    if (!goevRealtimeMap) {
      goevRealtimeMap = L.map("goev-realtime-map").setView([liveCoords.lat, liveCoords.lng], 13);
      const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      });
      tileLayer.on("tileerror", () => fallbackBox?.classList.remove("hidden"));
      tileLayer.addTo(goevRealtimeMap);
      realtimeMarkersLayer = L.layerGroup().addTo(goevRealtimeMap);
    }

    if (!navigator.onLine) fallbackBox?.classList.remove("hidden");
    else fallbackBox?.classList.add("hidden");

    if (fallbackPins) {
      fallbackPins.innerHTML = stations
        .map(
          (s) =>
            `<button type="button" class="fallback-pin-btn" style="background:${getMarkerColor(s.status)}" onclick="openStationDetails('${s.id}')">${s.name}</button>`
        )
        .join("");
    }

    realtimeMarkersLayer.clearLayers();

    L.circleMarker([liveCoords.lat, liveCoords.lng], {
      radius: 8,
      fillColor: "#16A6A0",
      color: "#FFFFFF",
      weight: 2.5,
      fillOpacity: 1
    })
      .bindPopup(
        `<strong>${liveCoords.isLiveGps ? "Live GPS Position" : "Reference Position"}</strong><br/>${liveCoords.lat.toFixed(4)}, ${liveCoords.lng.toFixed(4)}`
      )
      .addTo(realtimeMarkersLayer);

    stations.forEach((station) => {
      const availPorts = getAvailablePortCount(station);
      const distKm = getStationDistanceKm(station);

      const marker = L.circleMarker([station.lat, station.lng], {
        radius: 9,
        fillColor: getMarkerColor(station.status),
        color: "#101D2B",
        weight: 2,
        fillOpacity: 0.95
      });

      marker.bindPopup(`
        <div>
          <strong>${station.name}</strong><br/>
          Distance: ${distKm} km<br/>
          Connector: ${station.connector} • ${station.power} kW<br/>
          Tariff: ₹${station.pricePerKwh}/kWh<br/>
          Available: ${availPorts}/${station.ports.length} ports<br/>
          <button type="button" onclick="openStationDetails('${station.id}')" style="margin-top:6px;padding:4px 8px;background:#16C784;color:#101D2B;border:none;border-radius:6px;font-weight:700;cursor:pointer;">View Details</button>
        </div>
      `);

      marker.addTo(realtimeMarkersLayer);
    });

    setTimeout(() => {
      goevRealtimeMap?.invalidateSize();
    }, 150);
  }

  const bottomCardEl = document.getElementById("livemap-selected-station-card");
  if (bottomCardEl) {
    const featured =
      stations.find((s) => String(s.id) === String(selectedStationId)) || stations[0];
    bottomCardEl.innerHTML = featured
      ? renderStationCardHtml(featured, "ports free now")
      : `<div class="station-card"><p class="muted-count">No stations match your active filters.</p></div>`;
  }

  renderIcons();
}

function renderExploreScreen() {
  const stations = getFilteredStations().sort(
    (a, b) => getStationDistanceKm(a) - getStationDistanceKm(b)
  );
  const countEl = document.getElementById("explore-station-count");
  if (countEl) countEl.textContent = `${stations.length} stations`;

  const listEl = document.getElementById("explore-stations-list");
  if (listEl) {
    listEl.innerHTML =
      stations.length === 0
        ? `<div class="station-card"><p class="muted-count">No stations match your active filters.</p></div>`
        : stations.map((s) => renderStationCardHtml(s, "ports available")).join("");
  }

  renderIcons();
}

// =========================================
// HOME DASHBOARD RENDERER
// =========================================
function renderHomeDashboard() {
  const user = JSON.parse(localStorage.getItem("goev_user"));
  const nameEl = document.getElementById("home-user-name");
  if (nameEl) nameEl.textContent = user && user.name ? user.name : "EV Driver";

  const vehicle = getVehicle();
  const allStations = getStations();
  const filteredStations = getFilteredStations().sort(
    (a, b) => getStationDistanceKm(a) - getStationDistanceKm(b)
  );
  const searchQuery = (document.getElementById("home-search-input")?.value || "")
    .trim()
    .toLowerCase();

  renderHomePreviewMap(filteredStations);

  const recContainer = document.getElementById("home-recommended-card");
  const topPick = getRecommendedStationRuleBased(filteredStations);
  if (recContainer) {
    if (topPick) {
      const { station, score, distKm, reasons } = topPick;
      const estimate = computeStationEstimate(station, vehicle);
      recContainer.innerHTML = `
        <span class="rec-badge">Rule-Based Pick • ${score}/100</span>
        <h4 class="rec-title">${station.name}</h4>
        <p class="rec-specs">${distKm} km • ${station.connector} • ${station.power} kW • ₹${station.pricePerKwh}/kWh</p>
        <ul class="rec-reasons-list">
          ${reasons.slice(0, 3).map((r) => `<li>${r}</li>`).join("")}
        </ul>
        <div class="rec-card-footer">
          <span class="rec-specs">Est. Cost: <strong>₹${estimate.estimatedCost}</strong> (${estimate.energyKwh} kWh)</span>
          <button type="button" class="btn-sm-teal" onclick="openStationDetails('${station.id}')">View Details</button>
        </div>
      `;
    } else {
      recContainer.innerHTML = `<p class="rec-specs">No stations match your active filters.</p>`;
    }
  }

  const searched = filteredStations.filter((s) => {
    if (!searchQuery) return true;
    return (
      s.name.toLowerCase().includes(searchQuery) ||
      s.connector.toLowerCase().includes(searchQuery) ||
      (s.address || "").toLowerCase().includes(searchQuery)
    );
  });

  const countEl = document.getElementById("home-station-count");
  if (countEl) countEl.textContent = `${searched.length} of ${allStations.length}`;

  const listEl = document.getElementById("home-stations-list");
  if (listEl) {
    listEl.innerHTML =
      searched.length === 0
        ? `<div class="station-card"><p class="muted-count">No matching charging stations found.</p></div>`
        : searched.map((s) => renderStationCardHtml(s, "ports free")).join("");
  }

  renderIcons();
}

// =========================================
// NAVIGATION & REAL 6-DIGIT OTP AUTH SYSTEM
// =========================================
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));

  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");

  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) {
    const hideNav = screenId === "screen-splash" || screenId === "screen-auth";
    bottomNav.classList.toggle("hidden", hideNav);
  }

  if (screenId === "screen-home") renderHomeDashboard();
  else if (screenId === "screen-live-map") renderRealtimeMapScreen();
  else if (screenId === "screen-explore") renderExploreScreen();
  else if (screenId === "screen-vehicle") renderVehicleScreen();
  else if (screenId === "screen-filters") syncFilterInputsFromState();
  else if (screenId === "screen-bookings") renderBookingsScreen();
  else if (screenId === "screen-profile") renderProfileScreen();

  setActiveNav(screenId);
  renderIcons();
}

function resetAuthToCredentialsStep() {
  document.getElementById("auth-form")?.classList.remove("hidden");
  document.getElementById("otp-verification-panel")?.classList.add("hidden");
  const otpInput = document.getElementById("otp-input");
  if (otpInput) otpInput.value = "";
  const otpMsg = document.getElementById("otp-message");
  if (otpMsg) {
    otpMsg.textContent = "";
    otpMsg.className = "auth-message";
  }
}

function setAuthMode(signup) {
  isSignupMode = signup;
  pendingAuthPayload = null;
  generatedOtpCode = null;
  resetAuthToCredentialsStep();

  document.getElementById("tab-login")?.classList.toggle("active", !signup);
  document.getElementById("tab-signup")?.classList.toggle("active", signup);
  document.getElementById("field-name-group")?.classList.toggle("hidden", !signup);

  const submitLabel = document.getElementById("btn-auth-label");
  if (submitLabel) submitLabel.textContent = signup ? "Send OTP & Register" : "Send OTP & Login";

  const msgEl = document.getElementById("auth-message");
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.className = "auth-message";
  }
}

function generateSixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function showOtpPanelForPayload(payload) {
  generatedOtpCode = generateSixDigitOtp();
  pendingAuthPayload = { ...payload, otp: generatedOtpCode, issuedAt: Date.now() };

  document.getElementById("auth-form")?.classList.add("hidden");
  document.getElementById("otp-verification-panel")?.classList.remove("hidden");

  const targetEl = document.getElementById("otp-target-label");
  if (targetEl) {
    targetEl.textContent = `6-digit code generated for ${payload.email}`;
  }

  const codeEl = document.getElementById("otp-generated-code");
  if (codeEl) {
    codeEl.textContent = generatedOtpCode;
  }

  const otpInput = document.getElementById("otp-input");
  if (otpInput) {
    otpInput.value = "";
    otpInput.focus();
  }

  const otpMsg = document.getElementById("otp-message");
  if (otpMsg) {
    otpMsg.textContent = "Enter the 6-digit OTP above to complete verification.";
    otpMsg.className = "auth-message success";
  }
}

function handleAuthSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById("auth-name")?.value.trim() || "";
  const emailInput = document.getElementById("auth-email")?.value.trim() || "";
  const passwordInput = document.getElementById("auth-password")?.value || "";
  const msgEl = document.getElementById("auth-message");

  const setErr = (txt) => {
    if (msgEl) {
      msgEl.textContent = txt;
      msgEl.className = "auth-message error";
    }
  };

  if (!emailInput || !passwordInput) return setErr("Please enter both email/phone and password.");
  if (passwordInput.length < 4) return setErr("Password must be at least 4 characters.");
  if (isSignupMode && !nameInput) return setErr("Please enter your full name to register.");

  const users = JSON.parse(localStorage.getItem("goev_users")) || [];

  if (isSignupMode) {
    if (users.some((u) => u.email.toLowerCase() === emailInput.toLowerCase())) {
      return setErr("An account with this email/phone already exists. Switch to Login.");
    }
    showOtpPanelForPayload({
      mode: "signup",
      name: nameInput,
      email: emailInput,
      password: passwordInput
    });
  } else {
    const matchedUser = users.find(
      (u) => u.email.toLowerCase() === emailInput.toLowerCase() && u.password === passwordInput
    );
    if (!matchedUser) {
      return setErr("Account not found or wrong password. Register first or use Demo Driver.");
    }
    showOtpPanelForPayload({
      mode: "login",
      name: matchedUser.name,
      email: matchedUser.email
    });
  }
}

function handleOtpVerifySubmit(event) {
  event.preventDefault();

  const enteredOtp = (document.getElementById("otp-input")?.value || "").trim();
  const otpMsg = document.getElementById("otp-message");

  if (!pendingAuthPayload || !generatedOtpCode) {
    if (otpMsg) {
      otpMsg.textContent = "No active OTP session. Please submit credentials again.";
      otpMsg.className = "auth-message error";
    }
    return;
  }

  if (enteredOtp.length !== 6 || enteredOtp !== generatedOtpCode) {
    if (otpMsg) {
      otpMsg.textContent = "Invalid 6-digit OTP. Please check the code and try again.";
      otpMsg.className = "auth-message error";
    }
    return;
  }

  if (pendingAuthPayload.mode === "signup") {
    const users = JSON.parse(localStorage.getItem("goev_users")) || [];
    users.push({
      name: pendingAuthPayload.name,
      email: pendingAuthPayload.email,
      password: pendingAuthPayload.password
    });
    localStorage.setItem("goev_users", JSON.stringify(users));
  }

  localStorage.setItem(
    "goev_user",
    JSON.stringify({
      name: pendingAuthPayload.name,
      email: pendingAuthPayload.email,
      otpVerified: true
    })
  );

  if (otpMsg) {
    otpMsg.textContent = "OTP verified! Launching GoEV...";
    otpMsg.className = "auth-message success";
  }

  pendingAuthPayload = null;
  generatedOtpCode = null;
  setTimeout(() => showScreen("screen-home"), 300);
}

window.openStationDetails = openStationDetails;
window.openCalculatorModal = openCalculatorModal;
window.closeCalculatorModal = closeCalculatorModal;
window.openSlotBooking = openSlotBooking;
window.calculateChargingEstimate = calculateChargingEstimate;
window.updateBookingStatus = updateBookingStatus;

// =========================================
// INITIALIZATION & EVENT LISTENERS
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  if (typeof initDatabase === "function") initDatabase();
  if (!localStorage.getItem("goev_vehicle")) saveVehicleToStorage(DEFAULT_GOEV_VEHICLE);

  renderIcons();
  requestLiveGpsLocation(false);

  telemetryTimerId = setInterval(() => {
    const modal = document.getElementById("calculator-modal");
    if (modal && !modal.classList.contains("hidden")) runAndRenderCalculator();

    const bookingsScreen = document.getElementById("screen-bookings");
    if (bookingsScreen && bookingsScreen.classList.contains("active")) renderBookingsScreen();

    const liveMapScreen = document.getElementById("screen-live-map");
    if (liveMapScreen && liveMapScreen.classList.contains("active")) {
      const tickEl = document.getElementById("livemap-tick-label");
      if (tickEl) {
        const count = getFilteredStations().length;
        tickEl.textContent = `${new Date().toLocaleTimeString()} • ${count} live nodes`;
      }
    }
  }, 1000);

  // Splash -> Auth
  document.getElementById("btn-get-started")?.addEventListener("click", () => {
    showScreen("screen-auth");
  });

  // Auth + OTP
  document.getElementById("tab-login")?.addEventListener("click", () => setAuthMode(false));
  document.getElementById("tab-signup")?.addEventListener("click", () => setAuthMode(true));
  document.getElementById("auth-form")?.addEventListener("submit", handleAuthSubmit);
  document.getElementById("otp-form")?.addEventListener("submit", handleOtpVerifySubmit);

  document.getElementById("btn-resend-otp")?.addEventListener("click", () => {
    if (!pendingAuthPayload) return;
    showOtpPanelForPayload(pendingAuthPayload);
  });

  document.getElementById("btn-otp-change-creds")?.addEventListener("click", () => {
    resetAuthToCredentialsStep();
  });

  document.getElementById("btn-continue-demo")?.addEventListener("click", () => {
    localStorage.setItem(
      "goev_user",
      JSON.stringify({ name: "Demo EV Driver", email: "demo@goev.app", otpVerified: false })
    );
    showScreen("screen-home");
  });

  // Home Search, GPS, Real-Time Map Button & Calculator Popup
  const searchInput = document.getElementById("home-search-input");
  searchInput?.addEventListener("input", renderHomeDashboard);

  document.getElementById("btn-home-search-clear")?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      renderHomeDashboard();
    }
  });

  document.getElementById("btn-refresh-gps-home")?.addEventListener("click", () => {
    requestLiveGpsLocation(true);
  });

  document.getElementById("btn-refresh-gps-livemap")?.addEventListener("click", () => {
    requestLiveGpsLocation(true);
  });

  document.getElementById("btn-livemap-to-explore")?.addEventListener("click", () => {
    showScreen("screen-explore");
  });

  document.getElementById("btn-explore-to-livemap")?.addEventListener("click", () => {
    showScreen("screen-live-map");
  });

  document.getElementById("btn-livemap-simulate-pulse")?.addEventListener("click", () => {
    requestLiveGpsLocation(false);
    renderRealtimeMapScreen();
  });

  document.getElementById("btn-home-open-full-map")?.addEventListener("click", () => {
    showScreen("screen-live-map");
  });

  document.getElementById("btn-home-open-filters")?.addEventListener("click", () => {
    filtersPreviousScreenId = "screen-home";
    showScreen("screen-filters");
  });

  document.getElementById("btn-home-calculator")?.addEventListener("click", () => {
    openCalculatorModal();
  });

  document.getElementById("btn-close-calculator-modal")?.addEventListener("click", () => {
    closeCalculatorModal();
  });

  document.getElementById("calculator-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "calculator-modal") closeCalculatorModal();
  });

  document.getElementById("calc-station-select")?.addEventListener("change", (e) => {
    syncCalculatorWithStation(e.target.value);
    runAndRenderCalculator();
  });

  document.getElementById("btn-calc-sync-ev")?.addEventListener("click", () => {
    const vehicle = getVehicle();
    document.getElementById("calc-capacity").value = vehicle.capacity;
    document.getElementById("calc-current-soc").value = vehicle.currentSoc;
    document.getElementById("calc-target-soc").value = vehicle.targetSoc;
    runAndRenderCalculator();
  });

  // Quick Map button opens dedicated Real-Time Map screen directly
  document.getElementById("btn-quick-map")?.addEventListener("click", () => {
    showScreen("screen-live-map");
  });

  document.getElementById("btn-quick-vehicle")?.addEventListener("click", () => {
    vehiclePreviousScreenId = "screen-home";
    showScreen("screen-vehicle");
  });

  document.getElementById("btn-quick-bookings")?.addEventListener("click", () => {
    showScreen("screen-bookings");
  });

  // Station Details
  document.getElementById("btn-back-from-details")?.addEventListener("click", () => {
    showScreen(previousScreenId || "screen-home");
  });

  document.getElementById("btn-detail-book-now")?.addEventListener("click", () => {
    if (selectedStationId) openSlotBooking(selectedStationId);
  });

  // Booking & 20% Advance Payment
  document.getElementById("btn-back-from-booking")?.addEventListener("click", () => {
    showScreen(bookingPreviousScreenId || "screen-station-details");
  });

  document.getElementById("booking-port-select")?.addEventListener("change", (e) => {
    selectedBookingPortId = e.target.value || null;
    const payBtn = document.getElementById("btn-simulate-payment");
    if (payBtn) payBtn.disabled = !selectedBookingPortId;
  });

  document.getElementById("btn-simulate-payment")?.addEventListener("click", () => {
    handleSimulateAdvancePayment();
  });

  document.getElementById("btn-conf-view-bookings")?.addEventListener("click", () => {
    showScreen("screen-bookings");
  });

  // Bookings History & Profile
  document.getElementById("btn-back-from-bookings")?.addEventListener("click", () => {
    showScreen("screen-home");
  });

  document.getElementById("btn-back-from-profile")?.addEventListener("click", () => {
    showScreen("screen-home");
  });

  document.getElementById("btn-reset-sample-stations")?.addEventListener("click", () => {
    handleResetSampleStations();
  });

  document.getElementById("btn-logout-driver")?.addEventListener("click", () => {
    handleLogoutDriver();
  });

  // Vehicle Profile Save
  document.getElementById("btn-back-from-vehicle")?.addEventListener("click", () => {
    showScreen(vehiclePreviousScreenId || "screen-home");
  });

  document.getElementById("vehicle-form")?.addEventListener("submit", handleVehicleFormSubmit);

  // Filters
  const openFiltersHandler = () => {
    const active = document.querySelector(".screen.active");
    if (active && active.id !== "screen-filters") filtersPreviousScreenId = active.id;
    showScreen("screen-filters");
  };

  document.getElementById("btn-open-filters")?.addEventListener("click", openFiltersHandler);
  document.getElementById("btn-livemap-filters")?.addEventListener("click", openFiltersHandler);

  document.getElementById("btn-back-from-filters")?.addEventListener("click", () => {
    showScreen(filtersPreviousScreenId || "screen-live-map");
  });

  document.getElementById("btn-apply-filters")?.addEventListener("click", () => {
    readFilterStateFromInputs();
    showScreen(filtersPreviousScreenId || "screen-live-map");
  });

  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    resetStationFilters();
  });

  // Live Calculator Modal Inputs
  ["calc-capacity", "calc-current-soc", "calc-target-soc", "calc-power", "calc-price"].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener("input", runAndRenderCalculator);
    }
  );

  // Bottom Navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const targetScreen = item.dataset.target;
      showScreen(document.getElementById(targetScreen) ? targetScreen : "screen-home");
    });
  });
});
