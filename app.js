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
