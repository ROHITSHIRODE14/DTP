// =========================================
// GoEV CORE APPLICATION LOGIC (PHASE 2.3 - MAP)
// =========================================

let isSignupMode = false;
let goevMap = null;
let mapMarkersLayer = null;
let selectedStationId = null;

function renderIcons() {
  if (window.lucide) {
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
  return JSON.parse(localStorage.getItem("goev_stations")) || INITIAL_STATIONS;
}

function getVehicle() {
  return JSON.parse(localStorage.getItem("goev_vehicle")) || DEFAULT_VEHICLE;
}

function getAvailablePortCount(station) {
  if (!Array.isArray(station.ports)) return 0;
  return station.ports.filter((p) => p.status === "Available").length;
}

function getStatusClass(status) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "available") return "status-available";
  if (normalized === "occupied") return "status-occupied";
  if (normalized === "reserved") return "status-reserved";
  return "status-unavailable";
}

function getMarkerColor(status) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "available") return "#16C784"; // Green
  if (normalized === "occupied") return "#EF5350";  // Red
  if (normalized === "reserved") return "#FFAA45";  // Orange
  return "#64748B";                                 // Grey
}

function openStationDetails(stationId) {
  selectedStationId = stationId;
  const station = getStations().find((s) => s.id === stationId);
  if (station) {
    alert(
      `${station.name}\nStatus: ${station.status}\nConnector: ${station.connector} (${station.power} kW)\nPrice: ₹${station.pricePerKwh}/kWh\nAvailable Ports: ${getAvailablePortCount(station)}/${station.ports.length}\n\n(Full Screen 5 Station Details view will be built in the next step!)`
    );
  }
}

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
  const stations = getStations();
  const countEl = document.getElementById("explore-station-count");
  if (countEl) {
    countEl.textContent = `${stations.length} sample stations`;
  }

  initOrUpdateMap(stations);

  const listEl = document.getElementById("explore-stations-list");
  if (listEl) {
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

  renderIcons();
}

function pickRuleBasedRecommendation(stations, vehicle) {
  const compatibleAvailable = stations.filter(
    (s) => s.connector === vehicle.connector && getAvailablePortCount(s) > 0
  );
  const pool = compatibleAvailable.length > 0
    ? compatibleAvailable
    : stations.filter((s) => getAvailablePortCount(s) > 0);

  if (pool.length === 0) return null;

  return pool.slice().sort((a, b) => {
    const scoreA = a.distance * 2 + a.pricePerKwh - a.power * 0.05;
    const scoreB = b.distance * 2 + b.pricePerKwh - b.power * 0.05;
    return scoreA - scoreB;
  })[0];
}

function renderHomeDashboard() {
  const user = JSON.parse(localStorage.getItem("goev_user"));
  const nameEl = document.getElementById("home-user-name");
  if (nameEl) {
    nameEl.textContent = user && user.name ? user.name : "EV Driver";
  }

  const vehicle = getVehicle();
  const stations = getStations();
  const searchQuery = (document.getElementById("home-search-input")?.value || "")
    .trim()
    .toLowerCase();

  const recContainer = document.getElementById("home-recommended-card");
  const recStation = pickRuleBasedRecommendation(stations, vehicle);
  if (recContainer) {
    if (recStation) {
      const availPorts = getAvailablePortCount(recStation);
      recContainer.innerHTML = `
        <div class="rec-top">
          <span class="rec-title">${recStation.name}</span>
          <span class="rec-badge">Best Match</span>
        </div>
        <div class="rec-specs">
          ${recStation.distance} km • ${recStation.connector} • ${recStation.power} kW • ₹${recStation.pricePerKwh}/kWh • ${availPorts} port(s) free
        </div>
        <div class="rec-reason">
          Why recommended: Matches ${vehicle.connector} connector, has available port(s), short distance (${recStation.distance} km), and balanced speed/price.
        </div>
      `;
    } else {
      recContainer.innerHTML = `<p class="rec-specs">No stations currently have open ports in sample data.</p>`;
    }
  }

  const filtered = stations.filter((s) => {
    if (!searchQuery) return true;
    return (
      s.name.toLowerCase().includes(searchQuery) ||
      s.connector.toLowerCase().includes(searchQuery) ||
      s.address.toLowerCase().includes(searchQuery)
    );
  });

  const countEl = document.getElementById("home-station-count");
  if (countEl) {
    countEl.textContent = `${filtered.length} of ${stations.length} sample stations`;
  }

  const listEl = document.getElementById("home-stations-list");
  if (listEl) {
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="station-card"><p class="rec-specs" style="color:#64748B;margin:0;">No matching sample stations found.</p></div>`;
    } else {
      listEl.innerHTML = filtered
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
                <span><i data-lucide="check-circle"></i>${availPorts}/${station.ports.length} ports free</span>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  renderIcons();
}

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

  tabLogin.classList.toggle("active", !signup);
  tabSignup.classList.toggle("active", signup);
  nameGroup.classList.toggle("hidden", !signup);
  submitLabel.textContent = signup ? "Create Account" : "Login";
  msgEl.textContent = "";
  msgEl.className = "auth-message";
}

function handleAuthSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById("auth-name").value.trim();
  const emailInput = document.getElementById("auth-email").value.trim();
  const passwordInput = document.getElementById("auth-password").value;
  const msgEl = document.getElementById("auth-message");

  if (!emailInput || !passwordInput) {
    msgEl.textContent = "Please enter both email and password.";
    msgEl.className = "auth-message error";
    return;
  }

  if (isSignupMode && !nameInput) {
    msgEl.textContent = "Please enter your name to sign up.";
    msgEl.className = "auth-message error";
    return;
  }

  const users = JSON.parse(localStorage.getItem("goev_users")) || [];

  if (isSignupMode) {
    const exists = users.some((u) => u.email.toLowerCase() === emailInput.toLowerCase());
    if (exists) {
      msgEl.textContent = "Account with this email already exists. Try logging in.";
      msgEl.className = "auth-message error";
      return;
    }

    const newUser = { name: nameInput, email: emailInput, password: passwordInput };
    users.push(newUser);
    localStorage.setItem("goev_users", JSON.stringify(users));
    localStorage.setItem("goev_user", JSON.stringify({ name: newUser.name, email: newUser.email }));

    msgEl.textContent = "Account created! Opening Home Dashboard...";
    msgEl.className = "auth-message success";
    setTimeout(() => showScreen("screen-home"), 400);
  } else {
    const matchedUser = users.find(
      (u) => u.email.toLowerCase() === emailInput.toLowerCase() && u.password === passwordInput
    );

    if (matchedUser) {
      localStorage.setItem("goev_user", JSON.stringify({ name: matchedUser.name, email: matchedUser.email }));
      msgEl.textContent = "Login successful! Opening Home Dashboard...";
      msgEl.className = "auth-message success";
      setTimeout(() => showScreen("screen-home"), 400);
    } else {
      msgEl.textContent = "Invalid email or password. Try Sign Up or Continue as Demo Driver.";
      msgEl.className = "auth-message error";
    }
  }
}
/* =========================================
   SCREEN 5: STATION DETAILS & PORT VIEW
   ========================================= */
let selectedStationId = null;
let previousScreenId = "screen-home";

function getStationsFromStorage() {
  try {
    const raw = localStorage.getItem("goev_stations");
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read goev_stations from LocalStorage:", err);
    return [];
  }
}

function getVehicleFromStorage() {
  const fallbackVehicle = {
    name: "Tata Nexon EV",
    capacity: 40,
    currentSoc: 30,
    targetSoc: 80,
    connector: "CCS2"
  };
  try {
    const raw = localStorage.getItem("goev_vehicle");
    return raw ? { ...fallbackVehicle, ...JSON.parse(raw) } : fallbackVehicle;
  } catch (err) {
    console.error("Failed to read goev_vehicle from LocalStorage:", err);
    return fallbackVehicle;
  }
}

function normalizePortStatus(status) {
  const clean = String(status || "Unavailable").toLowerCase();
  if (clean === "available") return "Available";
  if (clean === "occupied") return "Occupied";
  if (clean === "reserved") return "Reserved";
  return "Unavailable";
}

function getStationAggregateStatus(station) {
  const ports = Array.isArray(station.ports) ? station.ports : [];
  const hasAvailable = ports.some(
    (p) => normalizePortStatus(p.status) === "Available"
  );
  if (hasAvailable) {
    return { label: "Available", cssClass: "status-pill--available" };
  }
  const hasReserved = ports.some(
    (p) => normalizePortStatus(p.status) === "Reserved"
  );
  if (hasReserved) {
    return { label: "Reserved", cssClass: "status-pill--reserved" };
  }
  const hasOccupied = ports.some(
    (p) => normalizePortStatus(p.status) === "Occupied"
  );
  if (hasOccupied) {
    return { label: "Occupied", cssClass: "status-pill--occupied" };
  }
  return { label: "Unavailable", cssClass: "status-pill--unavailable" };
}

function computeStationEstimate(station, vehicle) {
  const capacity = Number(vehicle.capacity) || 40;
  const currentSoc = Number(vehicle.currentSoc) || 30;
  const targetSoc = Number(vehicle.targetSoc) || 80;
  const socDelta = Math.max(0, targetSoc - currentSoc);

  const energyKwh = Number(((capacity * socDelta) / 100).toFixed(2));
  const powerKw = Number(station.powerKw || station.power || 30);
  const pricePerKwh = Number(station.pricePerKwh || station.price || 15);

  const estimatedHours =
    powerKw > 0 ? Number((energyKwh / powerKw).toFixed(2)) : 0;
  const estimatedCost = Math.round(energyKwh * pricePerKwh);

  return {
    energyKwh,
    estimatedHours,
    estimatedCost,
    powerKw,
    pricePerKwh
  };
}

function renderStationPorts(station, vehicleConnector) {
  const portsContainer = document.getElementById("detail-ports-list");
  const portsCountEl = document.getElementById("detail-ports-count");
  if (!portsContainer) return;

  const ports = Array.isArray(station.ports) ? station.ports : [];
  if (portsCountEl) {
    const availableCount = ports.filter(
      (p) => normalizePortStatus(p.status) === "Available"
    ).length;
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
  const stations = getStationsFromStorage();
  const station = stations.find((s) => String(s.id) === String(stationId));

  if (!station) {
    console.warn("Station not found for ID:", stationId);
    return;
  }

  selectedStationId = station.id;

  // Track active screen before switching so Back returns smoothly
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-station-details") {
    previousScreenId = activeScreen.id;
  }

  const vehicle = getVehicleFromStorage();
  const estimate = computeStationEstimate(station, vehicle);
  const aggStatus = getStationAggregateStatus(station);

  // Populate hero card
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("detail-station-name", station.name || "Unnamed Station");
  setText(
    "detail-station-address",
    station.address || station.area || "Sample City Area"
  );

  const badgeEl = document.getElementById("detail-station-status-badge");
  if (badgeEl) {
    badgeEl.textContent = aggStatus.label;
    badgeEl.className = `status-pill ${aggStatus.cssClass}`;
  }

  const distanceText =
    station.distanceKm !== undefined ? `${station.distanceKm} km` : "Sample km";
  setText("detail-station-distance", distanceText);
  setText("detail-station-type", station.chargerType || station.type || "DC Fast");
  setText("detail-station-power", `${estimate.powerKw} kW`);
  setText("detail-station-price", `₹${estimate.pricePerKwh} / kWh`);

  const connectorsList = Array.isArray(station.connectors)
    ? station.connectors.join(", ")
    : station.connector || "CCS2";
  setText("detail-station-connectors", `Connectors: ${connectorsList}`);

  // Populate estimate preview
  setText(
    "detail-vehicle-label",
    `${vehicle.name} (${vehicle.currentSoc}% → ${vehicle.targetSoc}%)`
  );
  setText("detail-est-energy", `${estimate.energyKwh} kWh`);
  setText("detail-est-time", `${estimate.estimatedHours} hrs`);
  setText("detail-est-cost", `₹${estimate.estimatedCost}`);

  // Populate individual ports
  renderStationPorts(station, vehicle.connector);

  // Enable/disable Book Now based on whether any port is Available
  const bookBtn = document.getElementById("btn-detail-book-now");
  const hasAvailablePort = Array.isArray(station.ports) &&
    station.ports.some((p) => normalizePortStatus(p.status) === "Available");

  if (bookBtn) {
    bookBtn.disabled = !hasAvailablePort;
    bookBtn.querySelector("span").textContent = hasAvailablePort
      ? "Book Charging Slot"
      : "No Ports Available";
  }

  // Switch to Screen 5 (replace with your existing screen switcher if named differently)
  if (typeof showScreen === "function") {
    showScreen("screen-station-details");
  } else {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.getElementById("screen-station-details");
    if (target) target.classList.add("active");
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

window.openStationDetails = openStationDetails;

document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("btn-back-from-details");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (typeof showScreen === "function") {
        showScreen(previousScreenId);
      } else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        const prev = document.getElementById(previousScreenId) || document.getElementById("screen-home");
        if (prev) prev.classList.add("active");
      }
    });
  }

  const bookNowBtn = document.getElementById("btn-detail-book-now");
  if (bookNowBtn) {
    bookNowBtn.addEventListener("click", () => {
      if (!selectedStationId) return;
      // Hook for upcoming Slot Booking step (Screens 11-13)
      if (typeof openSlotBooking === "function") {
        openSlotBooking(selectedStationId);
      } else {
        console.log("Ready to book station ID:", selectedStationId);
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initDatabase();
  renderIcons();

  document.getElementById("btn-get-started")?.addEventListener("click", () => {
    showScreen("screen-auth");
  });

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
    showScreen("screen-vehicle");
  });
  document.getElementById("btn-quick-bookings")?.addEventListener("click", () => {
    showScreen("screen-bookings");
  });

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
/* =========================================
   SCREEN 6: EV VEHICLE PROFILE (#screen-vehicle)
   ========================================= */
const DEFAULT_GOEV_VEHICLE = {
  name: "Tata Nexon EV",
  capacity: 40,
  currentSoc: 30,
  targetSoc: 80,
  connector: "CCS2"
};

let vehiclePreviousScreenId = "screen-home";

function saveVehicleToStorage(vehicleObj) {
  try {
    localStorage.setItem("goev_vehicle", JSON.stringify(vehicleObj));
    return true;
  } catch (err) {
    console.error("Failed to save goev_vehicle to LocalStorage:", err);
    return false;
  }
}

function renderVehicleSummary(vehicle) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("vehicle-display-name", vehicle.name);
  setText("vehicle-display-connector", vehicle.connector);
  setText("vehicle-display-capacity", `${vehicle.capacity} kWh`);
  setText("vehicle-display-current", `${vehicle.currentSoc}%`);
  setText("vehicle-display-target", `${vehicle.targetSoc}%`);
}

function populateVehicleForm(vehicle) {
  const nameInput = document.getElementById("vehicle-name-input");
  const capInput = document.getElementById("vehicle-capacity-input");
  const curInput = document.getElementById("vehicle-current-soc-input");
  const tgtInput = document.getElementById("vehicle-target-soc-input");
  const connSelect = document.getElementById("vehicle-connector-select");

  if (nameInput) nameInput.value = vehicle.name;
  if (capInput) capInput.value = vehicle.capacity;
  if (curInput) curInput.value = vehicle.currentSoc;
  if (tgtInput) tgtInput.value = vehicle.targetSoc;
  if (connSelect) connSelect.value = vehicle.connector;
}

function setVehicleFeedback(message, type = "success") {
  const feedbackEl = document.getElementById("vehicle-form-feedback");
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.className = `form-feedback ${
    type === "error" ? "form-feedback--error" : "form-feedback--success"
  }`;
}

function openVehicleScreen() {
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-vehicle") {
    vehiclePreviousScreenId = activeScreen.id;
  }

  const currentVehicle = getVehicleFromStorage();
  renderVehicleSummary(currentVehicle);
  populateVehicleForm(currentVehicle);
  setVehicleFeedback("", "success");

  if (typeof showScreen === "function") {
    showScreen("screen-vehicle");
  } else {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.getElementById("screen-vehicle");
    if (target) target.classList.add("active");
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

window.openVehicleScreen = openVehicleScreen;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize default vehicle if missing
  if (!localStorage.getItem("goev_vehicle")) {
    saveVehicleToStorage(DEFAULT_GOEV_VEHICLE);
  }

  const quickVehicleBtn = document.getElementById("btn-quick-vehicle");
  if (quickVehicleBtn) {
    quickVehicleBtn.addEventListener("click", openVehicleScreen);
  }

  const backVehicleBtn = document.getElementById("btn-back-from-vehicle");
  if (backVehicleBtn) {
    backVehicleBtn.addEventListener("click", () => {
      if (typeof showScreen === "function") {
        showScreen(vehiclePreviousScreenId);
      } else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        const prev =
          document.getElementById(vehiclePreviousScreenId) ||
          document.getElementById("screen-home");
        if (prev) prev.classList.add("active");
      }
    });
  }

  const resetDefaultBtn = document.getElementById("btn-vehicle-reset-default");
  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener("click", () => {
      saveVehicleToStorage(DEFAULT_GOEV_VEHICLE);
      renderVehicleSummary(DEFAULT_GOEV_VEHICLE);
      populateVehicleForm(DEFAULT_GOEV_VEHICLE);
      setVehicleFeedback("Reset to default Tata Nexon EV profile.", "success");
    });
  }

  const vehicleForm = document.getElementById("vehicle-form");
  if (vehicleForm) {
    vehicleForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const rawName = (document.getElementById("vehicle-name-input")?.value || "").trim();
      const capacity = Number(document.getElementById("vehicle-capacity-input")?.value);
      const currentSoc = Number(document.getElementById("vehicle-current-soc-input")?.value);
      const targetSoc = Number(document.getElementById("vehicle-target-soc-input")?.value);
      const connector = document.getElementById("vehicle-connector-select")?.value || "CCS2";

      if (!rawName) {
        setVehicleFeedback("Please enter a vehicle name.", "error");
        return;
      }
      if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 250) {
        setVehicleFeedback("Battery capacity must be between 1 and 250 kWh.", "error");
        return;
      }
      if (!Number.isFinite(currentSoc) || currentSoc < 0 || currentSoc > 99) {
        setVehicleFeedback("Current charge must be between 0% and 99%.", "error");
        return;
      }
      if (!Number.isFinite(targetSoc) || targetSoc < 1 || targetSoc > 100) {
        setVehicleFeedback("Target charge must be between 1% and 100%.", "error");
        return;
      }
      if (targetSoc <= currentSoc) {
        setVehicleFeedback("Target charge (%) must be greater than current charge (%).", "error");
        return;
      }

      const updatedVehicle = {
        name: rawName,
        capacity: Number(capacity.toFixed(1)),
        currentSoc: Math.round(currentSoc),
        targetSoc: Math.round(targetSoc),
        connector
      };

      if (saveVehicleToStorage(updatedVehicle)) {
        renderVehicleSummary(updatedVehicle);
        setVehicleFeedback("EV profile saved to LocalStorage.", "success");

        // Refresh open station details estimate if currently selected
        if (selectedStationId) {
          const stations = getStationsFromStorage();
          const station = stations.find((s) => String(s.id) === String(selectedStationId));
          if (station) {
            const est = computeStationEstimate(station, updatedVehicle);
            const vLabel = document.getElementById("detail-vehicle-label");
            const eVal = document.getElementById("detail-est-energy");
            const tVal = document.getElementById("detail-est-time");
            const cVal = document.getElementById("detail-est-cost");
            if (vLabel) {
              vLabel.textContent = `${updatedVehicle.name} (${updatedVehicle.currentSoc}% → ${updatedVehicle.targetSoc}%)`;
            }
            if (eVal) eVal.textContent = `${est.energyKwh} kWh`;
            if (tVal) tVal.textContent = `${est.estimatedHours} hrs`;
            if (cVal) cVal.textContent = `₹${est.estimatedCost}`;
          }
        }
      } else {
        setVehicleFeedback("Could not save vehicle profile.", "error");
      }
    });
  }
});
/* =========================================
   SCREEN 7: STATION FILTERS & RESET (app.js)
   ========================================= */
const DEFAULT_FILTER_STATE = {
  maxDistance: 25,       // km
  connector: "ALL",      // ALL | CCS2 | Type 2 | CHAdeMO | Bharat DC-001
  availableOnly: false,  // true = at least 1 Available port
  speed: "ALL",          // ALL | AC | DC
  maxPrice: 30           // ₹ per kWh
};

let activeStationFilters = { ...DEFAULT_FILTER_STATE };
let filtersPreviousScreenId = "screen-explore";

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

function getFilteredStations() {
  const allStations = getStationsFromStorage();

  return allStations.filter((station) => {
    // 1. Distance filter (sample distanceKm)
    const dist = Number(station.distanceKm ?? station.distance ?? 0);
    if (dist > activeStationFilters.maxDistance) return false;

    // 2. Connector filter
    if (activeStationFilters.connector !== "ALL") {
      const connectors = getStationConnectorsList(station).map((c) =>
        c.toLowerCase()
      );
      if (!connectors.includes(activeStationFilters.connector.toLowerCase())) {
        return false;
      }
    }

    // 3. Port availability filter
    if (activeStationFilters.availableOnly) {
      const ports = Array.isArray(station.ports) ? station.ports : [];
      const hasOpenPort = ports.some(
        (p) => normalizePortStatus(p.status) === "Available"
      );
      if (!hasOpenPort) return false;
    }

    // 4. Charging speed / type filter (AC vs DC)
    if (activeStationFilters.speed !== "ALL") {
      const power = Number(station.powerKw || station.power || 0);
      const rawType = String(station.chargerType || station.type || "").toUpperCase();
      const isDc = rawType.includes("DC") || power >= 22;

      if (activeStationFilters.speed === "DC" && !isDc) return false;
      if (activeStationFilters.speed === "AC" && isDc) return false;
    }

    // 5. Charging price filter (sample ₹/kWh)
    const price = Number(station.pricePerKwh ?? station.price ?? 0);
    if (price > activeStationFilters.maxPrice) return false;

    return true;
  });
}

function syncFilterInputsFromState() {
  const distInput = document.getElementById("filter-distance");
  const distLabel = document.getElementById("filter-distance-value");
  const connSelect = document.getElementById("filter-connector");
  const availCheck = document.getElementById("filter-available-only");
  const speedSelect = document.getElementById("filter-speed");
  const priceInput = document.getElementById("filter-max-price");
  const priceLabel = document.getElementById("filter-price-value");

  if (distInput) distInput.value = activeStationFilters.maxDistance;
  if (distLabel) distLabel.textContent = `${activeStationFilters.maxDistance} km`;
  if (connSelect) connSelect.value = activeStationFilters.connector;
  if (availCheck) availCheck.checked = activeStationFilters.availableOnly;
  if (speedSelect) speedSelect.value = activeStationFilters.speed;
  if (priceInput) priceInput.value = activeStationFilters.maxPrice;
  if (priceLabel) priceLabel.textContent = `₹${activeStationFilters.maxPrice}/kWh`;

  updateFilterMatchCounter();
}

function readFilterStateFromInputs() {
  const distInput = document.getElementById("filter-distance");
  const connSelect = document.getElementById("filter-connector");
  const availCheck = document.getElementById("filter-available-only");
  const speedSelect = document.getElementById("filter-speed");
  const priceInput = document.getElementById("filter-max-price");

  activeStationFilters = {
    maxDistance: distInput ? Number(distInput.value) || 25 : DEFAULT_FILTER_STATE.maxDistance,
    connector: connSelect ? connSelect.value : DEFAULT_FILTER_STATE.connector,
    availableOnly: availCheck ? Boolean(availCheck.checked) : DEFAULT_FILTER_STATE.availableOnly,
    speed: speedSelect ? speedSelect.value : DEFAULT_FILTER_STATE.speed,
    maxPrice: priceInput ? Number(priceInput.value) || 30 : DEFAULT_FILTER_STATE.maxPrice
  };
}

function updateFilterMatchCounter() {
  const countEl = document.getElementById("filter-result-count");
  if (!countEl) return;
  const matches = getFilteredStations();
  countEl.textContent = `${matches.length} station${matches.length === 1 ? "" : "s"} match`;
}

function applyStationFiltersToUI() {
  const filtered = getFilteredStations();

  // Re-render Explore list if your existing function exists, else render clean fallback cards
  if (typeof renderExploreStations === "function") {
    renderExploreStations(filtered);
  } else {
    const exploreList = document.getElementById("explore-stations-list");
    if (exploreList) {
      exploreList.innerHTML =
        filtered.length === 0
          ? `<p class="muted-text">No sample stations match your filters. Try resetting filters.</p>`
          : filtered
              .map((st) => {
                const status = getStationAggregateStatus(st);
                return `
                  <div class="station-card">
                    <div class="station-card-top">
                      <div>
                        <h4>${st.name}</h4>
                        <p class="muted-text">${st.area || st.address || "Sample Location"} • ${st.distanceKm ?? "--"} km</p>
                      </div>
                      <span class="status-pill ${status.cssClass}">${status.label}</span>
                    </div>
                    <p class="muted-text">${st.chargerType || "DC"} • ${st.powerKw || st.power || "--"} kW • ₹${st.pricePerKwh || st.price || "--"}/kWh</p>
                    <button type="button" class="btn-secondary-outline" onclick="openStationDetails('${st.id}')">
                      View Details
                    </button>
                  </div>
                `;
              })
              .join("");
    }
  }

  // Re-render Home stations list if helper exists
  if (typeof renderHomeStations === "function") {
    renderHomeStations(filtered);
  }

  // Refresh Leaflet map markers if your existing map marker updater exists
  if (typeof renderMapMarkers === "function") {
    renderMapMarkers(filtered);
  }

  updateFilterMatchCounter();
  return filtered;
}

function openFiltersScreen() {
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen && activeScreen.id !== "screen-filters") {
    filtersPreviousScreenId = activeScreen.id;
  }

  syncFilterInputsFromState();

  if (typeof showScreen === "function") {
    showScreen("screen-filters");
  } else {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const filterScreen = document.getElementById("screen-filters");
    if (filterScreen) filterScreen.classList.add("active");
  }
}

function resetStationFilters() {
  activeStationFilters = { ...DEFAULT_FILTER_STATE };
  syncFilterInputsFromState();
  applyStationFiltersToUI();
}

window.openFiltersScreen = openFiltersScreen;
window.resetStationFilters = resetStationFilters;
window.getFilteredStations = getFilteredStations;

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("btn-open-filters");
  if (openBtn) {
    openBtn.addEventListener("click", openFiltersScreen);
  }

  const backBtn = document.getElementById("btn-back-from-filters");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (typeof showScreen === "function") {
        showScreen(filtersPreviousScreenId);
      } else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        const prev = document.getElementById(filtersPreviousScreenId) || document.getElementById("screen-explore");
        if (prev) prev.classList.add("active");
      }
    });
  }

  // Live preview updates as sliders/inputs change
  const distInput = document.getElementById("filter-distance");
  if (distInput) {
    distInput.addEventListener("input", () => {
      const distLabel = document.getElementById("filter-distance-value");
      if (distLabel) distLabel.textContent = `${distInput.value} km`;
      readFilterStateFromInputs();
      updateFilterMatchCounter();
    });
  }

  const priceInput = document.getElementById("filter-max-price");
  if (priceInput) {
    priceInput.addEventListener("input", () => {
      const priceLabel = document.getElementById("filter-price-value");
      if (priceLabel) priceLabel.textContent = `₹${priceInput.value}/kWh`;
      readFilterStateFromInputs();
      updateFilterMatchCounter();
    });
  }

  ["filter-connector", "filter-available-only", "filter-speed"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        readFilterStateFromInputs();
        updateFilterMatchCounter();
      });
    }
  });

  const applyBtn = document.getElementById("btn-apply-filters");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      readFilterStateFromInputs();
      applyStationFiltersToUI();

      if (typeof showScreen === "function") {
        showScreen(filtersPreviousScreenId);
      } else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        const prev = document.getElementById(filtersPreviousScreenId) || document.getElementById("screen-explore");
        if (prev) prev.classList.add("active");
      }
    });
  }

  const resetBtn = document.getElementById("btn-reset-filters");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetStationFilters);
  }
});
/* =========================================
   SCREENS 8 & 9: CHARGING TIME & COST CALCULATOR (app.js)
   ========================================= */
let calcPreviousScreenId = "screen-home";

/**
 * Core GoEV Charging Calculator
 * @param {Object} params
 * @param {number} params.capacityKwh - EV battery capacity in kWh
 * @param {number} params.currentSoc - Current state of charge (0 - 99)
 * @param {number} params.targetSoc - Target state of charge (1 - 100)
 * @param {number} params.chargerPowerKw - Charger output power in kW
 * @param {number} params.pricePerKwh - Sample tariff in ₹ per kWh
 */
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

  // Formula 1: Energy Required (kWh) = Battery Capacity * (Target % - Current %) / 100
  const energyRequiredKwh = (cap * (tgt - cur)) / 100;

  // Formula 2: Estimated Time (hours) = Energy Required / Charger Power
  const estimatedHours = energyRequiredKwh / power;

  // Formula 3: Estimated Cost = Energy Required * Price per kWh
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

function setCalculatorError(msg) {
  const errEl = document.getElementById("calc-error-msg");
  if (!errEl) return;
  errEl.textContent = msg || "";
}

function populateCalculatorStationDropdown(stations, selectedId = null) {
  const selectEl = document.getElementById("calc-station-select");
  if (!selectEl) return;

  selectEl.innerHTML = stations
    .map((st, idx) => {
      const power = st.powerKw || st.power || 30;
      const price = st.pricePerKwh || st.price || 15;
      const isSelected =
        selectedId !== null
          ? String(st.id) === String(selectedId)
          : idx === 0;
      return `<option value="${st.id}" ${isSelected ? "selected" : ""}>${st.name} (${power} kW • ₹${price}/kWh)</option>`;
    })
    .join("");
}

function fillCalculatorFromVehicleAndStation(stationId = null) {
  const vehicle = getVehicleFromStorage();
  const stations = getStationsFromStorage();
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

  populateCalculatorStationDropdown(stations, station.id);
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

  const energyOut = document.getElementById("calc-energy-out");
  const timeOut = document.getElementById("calc-time-out");
  const costOut = document.getElementById("calc-cost-out");

  if (!result.valid) {
    setCalculatorError(result.error);
    if (energyOut) energyOut.textContent = "-- kWh";
    if (timeOut) timeOut.textContent = "-- hrs";
    if (costOut) costOut.textContent = "₹--";
    return result;
  }

  setCalculatorError("");
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

  if (typeof showScreen === "function") {
    showScreen("screen-calculator");
  } else {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const calcScreen = document.getElementById("screen-calculator");
    if (calcScreen) calcScreen.classList.add("active");
  }
}

window.calculateChargingEstimate = calculateChargingEstimate;
window.openCalculatorScreen = openCalculatorScreen;
window.runAndRenderCalculator = runAndRenderCalculator;

document.addEventListener("DOMContentLoaded", () => {
  const backCalcBtn = document.getElementById("btn-back-from-calc");
  if (backCalcBtn) {
    backCalcBtn.addEventListener("click", () => {
      if (typeof showScreen === "function") {
        showScreen(calcPreviousScreenId);
      } else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        const prev =
          document.getElementById(calcPreviousScreenId) ||
          document.getElementById("screen-home");
        if (prev) prev.classList.add("active");
      }
    });
  }

  const useVehicleBtn = document.getElementById("btn-calc-use-vehicle");
  if (useVehicleBtn) {
    useVehicleBtn.addEventListener("click", () => {
      const selectedId = document.getElementById("calc-station-select")?.value || null;
      fillCalculatorFromVehicleAndStation(selectedId);
      runAndRenderCalculator();
    });
  }

  const stationSelect = document.getElementById("calc-station-select");
  if (stationSelect) {
    stationSelect.addEventListener("change", () => {
      const stations = getStationsFromStorage();
      const chosen = stations.find((s) => String(s.id) === String(stationSelect.value));
      if (chosen) {
        const powerEl = document.getElementById("calc-power");
        const priceEl = document.getElementById("calc-price");
        if (powerEl) powerEl.value = chosen.powerKw || chosen.power || 30;
        if (priceEl) priceEl.value = chosen.pricePerKwh || chosen.price || 15;
      }
      runAndRenderCalculator();
    });
  }

  const computeBtn = document.getElementById("btn-calc-compute");
  if (computeBtn) {
    computeBtn.addEventListener("click", runAndRenderCalculator);
  }

  ["calc-capacity", "calc-current-soc", "calc-target-soc", "calc-power", "calc-price"].forEach(
    (id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", runAndRenderCalculator);
      }
    }
  );
});
/* =========================================
   SCREEN 10: RULE-BASED RECOMMENDATION (app.js)
   Deterministic scoring — explicitly rule-based, not AI.
   ========================================= */

/**
 * Scores a single station using transparent, deterministic rules.
 * Max possible score = 100 points:
 *  - Connector match: up to 30 pts
 *  - Available ports: up to 25 pts
 *  - Distance (closer is better, sample km): up to 20 pts
 *  - Charging speed (higher kW is faster): up to 15 pts
 *  - Tariff price (lower ₹/kWh is cheaper): up to 10 pts
 */
function scoreStationRuleBased(station, vehicle) {
  let score = 0;
  const reasons = [];

  const vehicleConnector = String(vehicle?.connector || "CCS2").toLowerCase();
  const stationConnectors = getStationConnectorsList(station).map((c) =>
    c.toLowerCase()
  );

  // Rule 1: Connector compatibility (30 pts)
  const hasMatchingConnector = stationConnectors.includes(vehicleConnector);
  if (hasMatchingConnector) {
    score += 30;
    reasons.push(`Supports your ${vehicle?.connector || "CCS2"} connector`);
  } else {
    score += 5;
    reasons.push(`Check adapter for ${vehicle?.connector || "CCS2"}`);
  }

  // Rule 2: Available ports (25 pts)
  const ports = Array.isArray(station.ports) ? station.ports : [];
  const availablePortsCount = ports.filter(
    (p) => normalizePortStatus(p.status) === "Available"
  ).length;

  if (availablePortsCount > 0) {
    const portPoints = Math.min(25, 15 + availablePortsCount * 5);
    score += portPoints;
    reasons.push(
      `${availablePortsCount} open port${availablePortsCount > 1 ? "s" : ""} ready`
    );
  } else {
    reasons.push("No open ports currently available");
  }

  // Rule 3: Sample distance proximity (20 pts)
  const distKm = Number(station.distanceKm ?? station.distance ?? 10);
  const clampedDist = Math.max(0, Math.min(25, distKm));
  const distPoints = Math.round(((25 - clampedDist) / 25) * 20);
  score += distPoints;
  reasons.push(`${distKm} km away (sample distance)`);

  // Rule 4: Charging speed in kW (15 pts)
  const powerKw = Number(station.powerKw ?? station.power ?? 22);
  const clampedPower = Math.max(0, Math.min(120, powerKw));
  const speedPoints = Math.round((clampedPower / 120) * 15);
  score += speedPoints;
  reasons.push(`${powerKw} kW charging output`);

  // Rule 5: Tariff price per kWh (10 pts)
  const pricePerKwh = Number(station.pricePerKwh ?? station.price ?? 16);
  const clampedPrice = Math.max(5, Math.min(30, pricePerKwh));
  const pricePoints = Math.round(((30 - clampedPrice) / 25) * 10);
  score += pricePoints;
  reasons.push(`₹${pricePerKwh}/kWh sample tariff`);

  return {
    station,
    score,
    availablePortsCount,
    hasMatchingConnector,
    reasons
  };
}

function getRecommendedStationRuleBased(stationsList = null) {
  const stations = Array.isArray(stationsList)
    ? stationsList
    : getStationsFromStorage();

  if (!stations || stations.length === 0) return null;

  const vehicle = getVehicleFromStorage();
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

function renderRuleBasedRecommendation(stationsList = null) {
  const recCard = document.getElementById("home-recommended-card");
  const topPick = getRecommendedStationRuleBased(stationsList);

  if (!topPick) {
    if (recCard) {
      recCard.innerHTML = `<p class="muted-text">No stations available for rule-based recommendation.</p>`;
    }
    return null;
  }

  const { station, score, reasons } = topPick;
  const estimate = computeStationEstimate(station, getVehicleFromStorage());
  const topReasons = reasons.slice(0, 3);

  // Update optional dedicated elements if Sakshi included them
  const nameEl = document.getElementById("rec-station-name");
  const scoreEl = document.getElementById("rec-station-score");
  const reasonsEl = document.getElementById("rec-station-reasons");
  const badgeEl = document.getElementById("rec-mode-badge");

  if (nameEl) nameEl.textContent = station.name;
  if (scoreEl) scoreEl.textContent = `Rule Score: ${score}/100`;
  if (badgeEl) badgeEl.textContent = "Rule-Based Logic (Not AI)";
  if (reasonsEl) {
    reasonsEl.innerHTML = reasons.map((r) => `<li>${r}</li>`).join("");
  }

  // Render clean summary inside #home-recommended-card
  if (recCard) {
    recCard.innerHTML = `
      <div class="rec-card-header">
        <div>
          <span class="rec-badge">Rule-Based Pick (Not AI) • ${score}/100</span>
          <h3 class="rec-title">${station.name}</h3>
          <p class="muted-text">${station.area || station.address || "Sample Location"} • ${station.distanceKm ?? "--"} km • ${station.powerKw || station.power || "--"} kW • ₹${station.pricePerKwh || station.price || "--"}/kWh</p>
        </div>
      </div>
      <ul class="rec-reasons-list">
        ${topReasons.map((reason) => `<li>${reason}</li>`).join("")}
      </ul>
      <div class="rec-card-footer">
        <span class="muted-text">Est. Cost: <strong>₹${estimate.estimatedCost}</strong> (${estimate.energyKwh} kWh)</span>
        <button type="button" class="btn-primary-action" onclick="openStationDetails('${station.id}')">
          View Details
        </button>
      </div>
    `;
  }

  return topPick;
}

window.scoreStationRuleBased = scoreStationRuleBased;
window.getRecommendedStationRuleBased = getRecommendedStationRuleBased;
window.renderRuleBasedRecommendation = renderRuleBasedRecommendation;

document.addEventListener("DOMContentLoaded", () => {
  renderRuleBasedRecommendation();
});
