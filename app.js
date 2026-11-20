// =========================================
// GoEV CORE APPLICATION LOGIC (SCREENS 1–10)
// =========================================

let isSignupMode = false;
let goevMap = null;
let mapMarkersLayer = null;
let selectedStationId = null;
let previousScreenId = "screen-home";
let vehiclePreviousScreenId = "screen-home";
let filtersPreviousScreenId = "screen-explore";
let calcPreviousScreenId = "screen-home";

const DEFAULT_GOEV_VEHICLE = {
  name: "Tata Nexon EV",
  capacity: 40,
  currentSoc: 30,
  targetSoc: 80,
  connector: "CCS2"
};

const DEFAULT_FILTER_STATE = {
  maxDistance: 25,
  connector: "ALL",
  availableOnly: false,
  speed: "ALL",
  maxPrice: 30
};

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

function getStatusClass(status) {
  const normalized = normalizePortStatus(status).toLowerCase();
  if (normalized === "available") return "status-available";
  if (normalized === "occupied") return "status-occupied";
  if (normalized === "reserved") return "status-reserved";
  return "status-unavailable";
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

function getMarkerColor(status) {
  const normalized = normalizePortStatus(status).toLowerCase();
  if (normalized === "available") return "#16C784";
  if (normalized === "occupied") return "#EF5350";
  if (normalized === "reserved") return "#FFAA45";
  return "#64748B";
}

function getStationConnectorsList(station) {
  if (Array.isArray(station.connectors) && station.connectors.length > 0) {
    return station.connectors.map((c) => String(c).trim());
  }
  if (Array.isArray(station.ports) && station.ports.length > 0) {
    const fromPorts = station.ports
      .map((p) => p.connector || p.type)
      .filter(Boolean);
    if (fromPorts.length > 0) return [...new Set(fromPorts)];
  }
  return station.connector ? [String(station.connector).trim()] : ["CCS2"];
}

// =========================================
// SCREENS 8 & 9: CHARGING TIME & COST CALCULATOR
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
    return { valid: false, error: "Current SoC must be between 0% and 99%." };
  }
  if (!Number.isFinite(tgt) || tgt < 1 || tgt > 100) {
    return { valid: false, error: "Target SoC must be between 1% and 100%." };
  }
  if (tgt <= cur) {
    return { valid: false, error: "Target SoC (%) must be higher than Current SoC (%)." };
  }
  if (!Number.isFinite(power) || power <= 0) {
    return { valid: false, error: "Charger power must be greater than 0 kW." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { valid: false, error: "Price per kWh cannot be negative." };
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
    return {
      energyKwh: 0,
      estimatedHours: 0,
      estimatedCost: 0,
      powerKw,
      pricePerKwh
    };
  }

  return {
    energyKwh: calc.energyRequiredKwh,
    estimatedHours: calc.estimatedHours,
    estimatedCost: calc.roundedCost,
    powerKw,
    pricePerKwh
  };
}

function fillCalculatorFromVehicleAndStation(stationId = null) {
  const vehicle = getVehicle();
  const stations = getStations();
  const station =
    stations.find((s) => String(s.id) === String(stationId || selectedStationId)) ||
    stations[0] ||
    {};

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal("calc-capacity", vehicle.capacity);
  setVal("calc-current-soc", vehicle.currentSoc);
  setVal("calc-target-soc", vehicle.targetSoc);
  setVal("calc-power", station.powerKw || station.power || 30);
  setVal("calc-price", station.pricePerKwh || station.price || 15);
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

  if (!result.valid) {
    if (errEl) errEl.textContent = result.error;
    if (energyOut) energyOut.textContent = "-- kWh";
    if (timeOut) timeOut.textContent = "-- hrs";
    if (costOut) costOut.textContent = "₹--";
    return result;
  }

  if (errEl) errEl.textContent = "";
  if (energyOut) energyOut.textContent = `${result.energyRequiredKwh} kWh`;
  if (timeOut) {
    timeOut.textContent = `${result.estimatedHours} hrs (${result.formattedDuration})`;
  }
  if (costOut) costOut.textContent = `₹${result.roundedCost}`;
  return result;
}

function openCalculatorScreen(stationId = null) {
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-calculator") {
    calcPreviousScreenId = activeScreen.id;
  }
  fillCalculatorFromVehicleAndStation(stationId);
  runAndRenderCalculator();
  showScreen("screen-calculator");
}

// =========================================
// SCREEN 10: RULE-BASED RECOMMENDATION (NOT AI)
// =========================================
function scoreStationRuleBased(station, vehicle) {
  let score = 0;
  const reasons = [];

  const vehicleConnector = String(vehicle?.connector || "CCS2").toLowerCase();
  const stationConnectors = getStationConnectorsList(station).map((c) => c.toLowerCase());

  // Rule 1: Connector compatibility (30 pts)
  if (stationConnectors.includes(vehicleConnector)) {
    score += 30;
    reasons.push(`Supports your ${vehicle?.connector || "CCS2"} connector`);
  } else {
    score += 5;
    reasons.push(`Check adapter for ${vehicle?.connector || "CCS2"}`);
  }

  // Rule 2: Available ports (25 pts)
  const availablePortsCount = getAvailablePortCount(station);
  if (availablePortsCount > 0) {
    score += Math.min(25, 15 + availablePortsCount * 5);
    reasons.push(`${availablePortsCount} open port${availablePortsCount > 1 ? "s" : ""} ready`);
  } else {
    reasons.push("No open ports currently available");
  }

  // Rule 3: Sample distance proximity (20 pts)
  const distKm = Number(station.distanceKm ?? station.distance ?? 10);
  const clampedDist = Math.max(0, Math.min(25, distKm));
  score += Math.round(((25 - clampedDist) / 25) * 20);
  reasons.push(`${distKm} km away (sample distance)`);

  // Rule 4: Charging speed in kW (15 pts)
  const powerKw = Number(station.powerKw ?? station.power ?? 22);
  const clampedPower = Math.max(0, Math.min(120, powerKw));
  score += Math.round((clampedPower / 120) * 15);
  reasons.push(`${powerKw} kW charging output`);

  // Rule 5: Tariff price per kWh (10 pts)
  const pricePerKwh = Number(station.pricePerKwh ?? station.price ?? 16);
  const clampedPrice = Math.max(5, Math.min(30, pricePerKwh));
  score += Math.round(((30 - clampedPrice) / 25) * 10);
  reasons.push(`₹${pricePerKwh}/kWh sample tariff`);

  return {
    station,
    score,
    availablePortsCount,
    reasons
  };
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
      const distA = Number(a.station.distanceKm ?? a.station.distance ?? 999);
      const distB = Number(b.station.distanceKm ?? b.station.distance ?? 999);
      return distA - distB;
    });

  return ranked[0];
}

// =========================================
// SCREEN 5: STATION DETAILS & PORT VIEW
// =========================================
function renderStationPorts(station, vehicleConnector) {
  const portsContainer = document.getElementById("detail-ports-list");
  const portsCountEl = document.getElementById("detail-ports-count");
  if (!portsContainer) return;

  const ports = Array.isArray(station.ports) ? station.ports : [];
  if (portsCountEl) {
    const availableCount = getAvailablePortCount(station);
    portsCountEl.textContent = `${availableCount} of ${ports.length} available`;
  }

  if (ports.length === 0) {
    portsContainer.innerHTML = `<p class="muted-text">No port details listed for this sample station.</p>`;
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

      const pillClass =
        status === "Available"
          ? "status-pill--available"
          : status === "Occupied"
          ? "status-pill--occupied"
          : status === "Reserved"
          ? "status-pill--reserved"
          : "status-pill--unavailable";

      return `
        <div class="port-item-card" data-port-id="${portId}">
          <div>
            <p class="port-item-title">${portId} • ${connector}</p>
            <p class="port-item-sub">
              Up to ${power} kW • ${isCompatible ? "Matches your EV" : "Check connector"}
            </p>
          </div>
          <span class="status-pill ${pillClass}">${status}</span>
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

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("detail-station-name", station.name || "Unnamed Station");
  setText("detail-station-address", station.address || station.area || "Sample City Area");

  const badgeEl = document.getElementById("detail-station-status-badge");
  if (badgeEl) {
    badgeEl.textContent = aggStatus.label;
    badgeEl.className = `status-pill ${aggStatus.cssClass}`;
  }

  const distVal = station.distanceKm ?? station.distance;
  setText("detail-station-distance", distVal !== undefined ? `${distVal} km` : "Sample km");
  setText("detail-station-type", station.chargerType || station.type || "DC Fast");
  setText("detail-station-power", `${estimate.powerKw} kW`);
  setText("detail-station-price", `₹${estimate.pricePerKwh} / kWh`);

  const connectorsList = getStationConnectorsList(station).join(", ");
  setText("detail-station-connectors", `Connectors: ${connectorsList}`);

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
    if (span) {
      span.textContent = hasAvailablePort ? "Book Charging Slot" : "No Ports Available";
    }
  }

  showScreen("screen-station-details");
}

// =========================================
// SCREEN 6: EV VEHICLE PROFILE
// =========================================
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
  const currentVehicle = getVehicle();
  populateVehicleForm(currentVehicle);
  const statusMsg = document.getElementById("vehicle-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "";
    statusMsg.className = "form-status-msg";
  }
}

// =========================================
// SCREEN 7: STATION FILTERS & RESET
// =========================================
function getFilteredStations() {
  const allStations = getStations();

  return allStations.filter((station) => {
    const dist = Number(station.distanceKm ?? station.distance ?? 0);
    if (dist > activeStationFilters.maxDistance) return false;

    if (activeStationFilters.connector !== "ALL") {
      const connectors = getStationConnectorsList(station).map((c) => c.toLowerCase());
      if (!connectors.includes(activeStationFilters.connector.toLowerCase())) {
        return false;
      }
    }

    if (activeStationFilters.availableOnly && getAvailablePortCount(station) === 0) {
      return false;
    }

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
    speedSelect.value =
      activeStationFilters.speed === "ALL" ? "" : activeStationFilters.speed;
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
  renderExploreScreen();
  renderHomeDashboard();
}

// =========================================
// SCREEN 4: INTERACTIVE MAP & EXPLORE LIST
// =========================================
function initOrUpdateMap(stations) {
  const mapEl = document.getElementById("goev-map");
  const fallbackBox = document.getElementById("map-fallback-box");
  const fallbackPins = document.getElementById("fallback-pins");

  if (!mapEl || !window.L) {
    fallbackBox?.classList.remove("hidden");
    if (fallbackPins) {
      fallbackPins.innerHTML = stations
        .map(
          (s) =>
            `<button type="button" class="fallback-pin-btn" style="background:${getMarkerColor(s.status)}" onclick="openStationDetails('${s.id}')">${s.name} (${s.distance}km)</button>`
        )
        .join("");
    }
    return;
  }

  if (!goevMap) {
    goevMap = L.map("goev-map").setView([18.6298, 73.7997], 13);

    const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    });

    tileLayer.on("tileerror", () => {
      fallbackBox?.classList.remove("hidden");
    });

    tileLayer.addTo(goevMap);
    mapMarkersLayer = L.layerGroup().addTo(goevMap);
  }

  if (!navigator.onLine) {
    fallbackBox?.classList.remove("hidden");
  } else {
    fallbackBox?.classList.add("hidden");
  }

  if (fallbackPins) {
    fallbackPins.innerHTML = stations
      .map(
        (s) =>
          `<button type="button" class="fallback-pin-btn" style="background:${getMarkerColor(s.status)}" onclick="openStationDetails('${s.id}')">${s.name}</button>`
      )
      .join("");
  }

  mapMarkersLayer.clearLayers();

  stations.forEach((station) => {
    const color = getMarkerColor(station.status);
    const availPorts = getAvailablePortCount(station);

    const marker = L.circleMarker([station.lat, station.lng], {
      radius: 9,
      fillColor: color,
      color: "#101D2B",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    });

    marker.bindPopup(`
      <div>
        <strong>${station.name}</strong><br/>
        Distance: ${station.distance} km<br/>
        Connector: ${station.connector}<br/>
        Power: ${station.power} kW<br/>
        Price: ₹${station.pricePerKwh}/kWh<br/>
        Available Ports: ${availPorts}/${station.ports.length}<br/>
        <button type="button" onclick="openStationDetails('${station.id}')" style="margin-top:6px;padding:4px 8px;background:#16C784;color:#101D2B;border:none;border-radius:6px;font-weight:700;cursor:pointer;">View Details</button>
      </div>
    `);

    marker.addTo(mapMarkersLayer);
  });

  setTimeout(() => {
    goevMap.invalidateSize();
  }, 150);
}

function renderExploreScreen() {
  const stations = getFilteredStations();
  const countEl = document.getElementById("explore-station-count");
  if (countEl) {
    countEl.textContent = `${stations.length} sample stations`;
  }

  initOrUpdateMap(stations);

  const listEl = document.getElementById("explore-stations-list");
  if (listEl) {
    if (stations.length === 0) {
      listEl.innerHTML = `<div class="station-card"><p class="rec-specs" style="color:#64748B;margin:0;">No stations match your active filters.</p></div>`;
    } else {
      listEl.innerHTML = stations
        .map((station) => {
          const availPorts = getAvailablePortCount(station);
          return `
            <div class="station-card">
              <div class="station-card-top">
                <span class="station-name">${station.name}</span>
                <span class="status-pill ${getStatusClass(station.status)}">${station.status}</span>
              </div>
              <div class="station-meta">
                <span><i data-lucide="navigation"></i>${station.distance} km</span>
                <span><i data-lucide="plug"></i>${station.connector}</span>
                <span><i data-lucide="zap"></i>${station.power} kW</span>
                <span><i data-lucide="indian-rupee"></i>₹${station.pricePerKwh}/kWh</span>
              </div>
              <div class="station-card-footer">
                <small class="muted-count">${availPorts} of ${station.ports.length} ports available</small>
                <button type="button" class="btn-sm-teal" onclick="openStationDetails('${station.id}')">View Details</button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  renderIcons();
}

// =========================================
// SCREEN 3 & 10: HOME DASHBOARD + RECOMMENDATION
// =========================================
function renderHomeDashboard() {
  const user = JSON.parse(localStorage.getItem("goev_user"));
  const nameEl = document.getElementById("home-user-name");
  if (nameEl) {
    nameEl.textContent = user && user.name ? user.name : "EV Driver";
  }

  const vehicle = getVehicle();
  const allStations = getStations();
  const filteredStations = getFilteredStations();
  const searchQuery = (document.getElementById("home-search-input")?.value || "")
    .trim()
    .toLowerCase();

  // Render Screen 10 Rule-Based Pick
  const recContainer = document.getElementById("home-recommended-card");
  const topPick = getRecommendedStationRuleBased(filteredStations);
  if (recContainer) {
    if (topPick) {
      const { station, score, reasons } = topPick;
      const estimate = computeStationEstimate(station, vehicle);
      recContainer.innerHTML = `
        <div class="rec-card-header">
          <div>
            <span class="rec-badge">Rule-Based Pick (Not AI) • ${score}/100</span>
            <h4 class="rec-title">${station.name}</h4>
            <p class="rec-specs">${station.distance} km • ${station.connector} • ${station.power} kW • ₹${station.pricePerKwh}/kWh</p>
          </div>
        </div>
        <ul class="rec-reasons-list">
          ${reasons.slice(0, 3).map((r) => `<li>${r}</li>`).join("")}
        </ul>
        <div class="rec-card-footer">
          <span class="rec-specs" style="margin:0;">Est. Cost: <strong>₹${estimate.estimatedCost}</strong> (${estimate.energyKwh} kWh)</span>
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
  if (countEl) {
    countEl.textContent = `${searched.length} of ${allStations.length} sample stations`;
  }

  const listEl = document.getElementById("home-stations-list");
  if (listEl) {
    if (searched.length === 0) {
      listEl.innerHTML = `<div class="station-card"><p class="rec-specs" style="color:#64748B;margin:0;">No matching sample stations found.</p></div>`;
    } else {
      listEl.innerHTML = searched
        .map((station) => {
          const availPorts = getAvailablePortCount(station);
          return `
            <div class="station-card">
              <div class="station-card-top">
                <span class="station-name">${station.name}</span>
                <span class="status-pill ${getStatusClass(station.status)}">${station.status}</span>
              </div>
              <div class="station-meta">
                <span><i data-lucide="navigation"></i>${station.distance} km</span>
                <span><i data-lucide="plug"></i>${station.connector}</span>
                <span><i data-lucide="zap"></i>${station.power} kW</span>
                <span><i data-lucide="indian-rupee"></i>₹${station.pricePerKwh}/kWh</span>
              </div>
              <div class="station-card-footer">
                <small class="muted-count">${availPorts}/${station.ports.length} ports free</small>
                <button type="button" class="btn-sm-teal" onclick="openStationDetails('${station.id}')">View Details</button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  renderIcons();
}

// =========================================
// NAVIGATION & AUTHENTICATION (SCREENS 1 & 2)
// =========================================
function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((screen) => screen.classList.remove("active"));

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }

  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) {
    const hideNav = screenId === "screen-splash" || screenId === "screen-auth";
    bottomNav.classList.toggle("hidden", hideNav);
  }

  if (screenId === "screen-home") {
    renderHomeDashboard();
  } else if (screenId === "screen-explore") {
    renderExploreScreen();
  } else if (screenId === "screen-vehicle") {
    renderVehicleScreen();
  } else if (screenId === "screen-filters") {
    syncFilterInputsFromState();
  } else if (screenId === "screen-calculator") {
    fillCalculatorFromVehicleAndStation();
    runAndRenderCalculator();
  }

  setActiveNav(screenId);
  renderIcons();
}

function setAuthMode(signup) {
  isSignupMode = signup;
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const nameGroup = document.getElementById("field-name-group");
  const submitLabel = document.getElementById("btn-auth-label");
  const msgEl = document.getElementById("auth-message");

  tabLogin?.classList.toggle("active", !signup);
  tabSignup?.classList.toggle("active", signup);
  nameGroup?.classList.toggle("hidden", !signup);
  if (submitLabel) submitLabel.textContent = signup ? "Create Account" : "Login";
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.className = "auth-message";
  }
}

function handleAuthSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById("auth-name")?.value.trim() || "";
  const emailInput = document.getElementById("auth-email")?.value.trim() || "";
  const passwordInput = document.getElementById("auth-password")?.value || "";
  const msgEl = document.getElementById("auth-message");

  if (!emailInput || !passwordInput) {
    if (msgEl) {
      msgEl.textContent = "Please enter both email and password.";
      msgEl.className = "auth-message error";
    }
    return;
  }

  if (isSignupMode && !nameInput) {
    if (msgEl) {
      msgEl.textContent = "Please enter your name to sign up.";
      msgEl.className = "auth-message error";
    }
    return;
  }

  const users = JSON.parse(localStorage.getItem("goev_users")) || [];

  if (isSignupMode) {
    const exists = users.some((u) => u.email.toLowerCase() === emailInput.toLowerCase());
    if (exists) {
      if (msgEl) {
        msgEl.textContent = "Account with this email already exists. Try logging in.";
        msgEl.className = "auth-message error";
      }
      return;
    }

    const newUser = { name: nameInput, email: emailInput, password: passwordInput };
    users.push(newUser);
    localStorage.setItem("goev_users", JSON.stringify(users));
    localStorage.setItem("goev_user", JSON.stringify({ name: newUser.name, email: newUser.email }));

    if (msgEl) {
      msgEl.textContent = "Account created! Opening Home Dashboard...";
      msgEl.className = "auth-message success";
    }
    setTimeout(() => showScreen("screen-home"), 400);
  } else {
    const matchedUser = users.find(
      (u) => u.email.toLowerCase() === emailInput.toLowerCase() && u.password === passwordInput
    );

    if (matchedUser) {
      localStorage.setItem("goev_user", JSON.stringify({ name: matchedUser.name, email: matchedUser.email }));
      if (msgEl) {
        msgEl.textContent = "Login successful! Opening Home Dashboard...";
        msgEl.className = "auth-message success";
      }
      setTimeout(() => showScreen("screen-home"), 400);
    } else if (msgEl) {
      msgEl.textContent = "Invalid email or password. Try Sign Up or Continue as Demo Driver.";
      msgEl.className = "auth-message error";
    }
  }
}

window.openStationDetails = openStationDetails;
window.openCalculatorScreen = openCalculatorScreen;
window.calculateChargingEstimate = calculateChargingEstimate;

// =========================================
// INITIALIZATION & EVENT LISTENERS
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  if (typeof initDatabase === "function") {
    initDatabase();
  }
  if (!localStorage.getItem("goev_vehicle")) {
    saveVehicleToStorage(DEFAULT_GOEV_VEHICLE);
  }

  renderIcons();

  // Screen 1: Splash -> Auth
  document.getElementById("btn-get-started")?.addEventListener("click", () => {
    showScreen("screen-auth");
  });

  // Screen 2: Auth
  document.getElementById("tab-login")?.addEventListener("click", () => setAuthMode(false));
  document.getElementById("tab-signup")?.addEventListener("click", () => setAuthMode(true));
  document.getElementById("auth-form")?.addEventListener("submit", handleAuthSubmit);

  document.getElementById("btn-continue-demo")?.addEventListener("click", () => {
    localStorage.setItem(
      "goev_user",
      JSON.stringify({ name: "Demo EV Driver", email: "demo@goev.app" })
    );
    showScreen("screen-home");
  });

  // Screen 3: Home Search & Quick Actions
  const searchInput = document.getElementById("home-search-input");
  searchInput?.addEventListener("input", renderHomeDashboard);

  document.getElementById("btn-home-search-clear")?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      renderHomeDashboard();
    }
  });

  document.getElementById("btn-quick-map")?.addEventListener("click", () => {
    showScreen("screen-explore");
  });
  document.getElementById("btn-quick-vehicle")?.addEventListener("click", () => {
    vehiclePreviousScreenId = "screen-home";
    showScreen("screen-vehicle");
  });
  document.getElementById("btn-quick-bookings")?.addEventListener("click", () => {
    if (document.getElementById("screen-bookings")) {
      showScreen("screen-bookings");
    } else {
      alert("Bookings History (Screen 14) will be built right after Slot Booking!");
    }
  });

  // Screen 5: Station Details Back & Book Now
  document.getElementById("btn-back-from-details")?.addEventListener("click", () => {
    showScreen(previousScreenId || "screen-home");
  });

  document.getElementById("btn-detail-book-now")?.addEventListener("click", () => {
    if (!selectedStationId) return;
    if (typeof openSlotBooking === "function") {
      openSlotBooking(selectedStationId);
    } else {
      alert("Slot Booking & 20% Advance Simulation (Screens 11–13) is our very next step!");
    }
  });

  // Screen 6: EV Vehicle Profile
  document.getElementById("btn-back-from-vehicle")?.addEventListener("click", () => {
    showScreen(vehiclePreviousScreenId || "screen-home");
  });

  document.getElementById("vehicle-form")?.addEventListener("submit", (event) => {
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
      statusMsg.style.color = isErr ? "#F87171" : "#16C784";
    };

    if (!rawName) return setMsg("Please enter a vehicle name.", true);
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

    if (saveVehicleToStorage(updatedVehicle)) {
      setMsg("EV profile saved to LocalStorage!");
    } else {
      setMsg("Failed to save EV profile.", true);
    }
  });

  // Screen 7: Station Filters & Reset
  document.getElementById("btn-open-filters")?.addEventListener("click", () => {
    const active = document.querySelector(".screen.active");
    if (active && active.id !== "screen-filters") {
      filtersPreviousScreenId = active.id;
    }
    showScreen("screen-filters");
  });

  document.getElementById("btn-back-from-filters")?.addEventListener("click", () => {
    showScreen(filtersPreviousScreenId || "screen-explore");
  });

  document.getElementById("btn-apply-filters")?.addEventListener("click", () => {
    readFilterStateFromInputs();
    showScreen(filtersPreviousScreenId || "screen-explore");
  });

  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    resetStationFilters();
  });

  // Screens 8 & 9: Charging Time & Cost Calculator
  document.getElementById("btn-back-from-calculator")?.addEventListener("click", () => {
    showScreen(calcPreviousScreenId || "screen-home");
  });

  ["calc-capacity", "calc-current-soc", "calc-target-soc", "calc-power", "calc-price"].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener("input", runAndRenderCalculator);
    }
  );

  // Bottom Navigation Bar
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const targetScreen = item.dataset.target;
      if (document.getElementById(targetScreen)) {
        showScreen(targetScreen);
      } else {
        showScreen("screen-home");
      }
    });
  });
});
