// =========================================
// GoEV SAMPLE DATABASE (Fictional Demo Data)
// =========================================

const INITIAL_STATIONS = [
  {
    id: "ST-101",
    name: "GreenCharge Hub",
    address: "Sector 14, Main EV Corridor (Sample Demo Data)",
    distance: 2.4,
    connector: "CCS2",
    chargeType: "DC Fast Charging",
    power: 60,
    pricePerKwh: 12,
    status: "Available",
    lat: 18.6298,
    lng: 73.7997,
    ports: [
      { portId: "P1", connector: "CCS2", power: 60, status: "Available" },
      { portId: "P2", connector: "CCS2", power: 60, status: "Available" },
      { portId: "P3", connector: "CCS2", power: 60, status: "Occupied" }
    ]
  },
  {
    id: "ST-102",
    name: "EcoVolt Point",
    address: "Central Avenue Plaza (Sample Demo Data)",
    distance: 3.1,
    connector: "Type 2",
    chargeType: "AC Normal Charging",
    power: 22,
    pricePerKwh: 10,
    status: "Occupied",
    lat: 18.6345,
    lng: 73.8050,
    ports: [
      { portId: "P1", connector: "Type 2", power: 22, status: "Occupied" },
      { portId: "P2", connector: "Type 2", power: 22, status: "Occupied" }
    ]
  },
  {
    id: "ST-103",
    name: "PowerHub Station",
    address: "Highway Express Junction (Sample Demo Data)",
    distance: 4.6,
    connector: "CCS2",
    chargeType: "DC Ultra-Fast",
    power: 120,
    pricePerKwh: 14,
    status: "Available",
    lat: 18.6210,
    lng: 73.7910,
    ports: [
      { portId: "P1", connector: "CCS2", power: 120, status: "Available" },
      { portId: "P2", connector: "CCS2", power: 120, status: "Reserved" },
      { portId: "P3", connector: "CCS2", power: 120, status: "Available" }
    ]
  },
  {
    id: "ST-104",
    name: "E-Motion Hub",
    address: "Tech Park Gate 2 (Sample Demo Data)",
    distance: 1.8,
    connector: "CHAdeMO",
    chargeType: "DC Fast Charging",
    power: 50,
    pricePerKwh: 15,
    status: "Available",
    lat: 18.6312,
    lng: 73.7945,
    ports: [
      { portId: "P1", connector: "CHAdeMO", power: 50, status: "Available" },
      { portId: "P2", connector: "CHAdeMO", power: 50, status: "Occupied" }
    ]
  },
  {
    id: "ST-105",
    name: "CityCharge",
    address: "Metro Square Parking (Sample Demo Data)",
    distance: 5.0,
    connector: "Type 2",
    chargeType: "AC Slow Charging",
    power: 7,
    pricePerKwh: 9,
    status: "Reserved",
    lat: 18.6402,
    lng: 73.8105,
    ports: [
      { portId: "P1", connector: "Type 2", power: 7, status: "Reserved" },
      { portId: "P2", connector: "Type 2", power: 7, status: "Reserved" }
    ]
  },
  {
    id: "ST-106",
    name: "FastVolt",
    address: "Greenway Commercial Center (Sample Demo Data)",
    distance: 3.8,
    connector: "CCS2",
    chargeType: "DC Fast Charging",
    power: 30,
    pricePerKwh: 13,
    status: "Available",
    lat: 18.6255,
    lng: 73.8082,
    ports: [
      { portId: "P1", connector: "CCS2", power: 30, status: "Available" },
      { portId: "P2", connector: "CCS2", power: 30, status: "Occupied" }
    ]
  },
  {
    id: "ST-107",
    name: "GreenWay EV",
    address: "North Ring Road (Sample Demo Data)",
    distance: 6.2,
    connector: "Type 2",
    chargeType: "AC Normal Charging",
    power: 22,
    pricePerKwh: 11,
    status: "Unavailable",
    lat: 18.6450,
    lng: 73.7880,
    ports: [
      { portId: "P1", connector: "Type 2", power: 22, status: "Unavailable" },
      { portId: "P2", connector: "Type 2", power: 22, status: "Unavailable" }
    ]
  },
  {
    id: "ST-108",
    name: "ChargePoint X",
    address: "Westside Mall Basement (Sample Demo Data)",
    distance: 4.0,
    connector: "CCS2",
    chargeType: "DC Fast Charging",
    power: 60,
    pricePerKwh: 16,
    status: "Available",
    lat: 18.6185,
    lng: 73.8020,
    ports: [
      { portId: "P1", connector: "CCS2", power: 60, status: "Available" },
      { portId: "P2", connector: "CCS2", power: 60, status: "Available" }
    ]
  }
];

const DEFAULT_VEHICLE = {
  name: "Tata Nexon EV",
  capacity: 40,
  currentSoc: 30,
  targetSoc: 80,
  connector: "CCS2"
};

const SAMPLE_BOOKINGS = [
  {
    bookingId: "GOEV-8492",
    stationName: "GreenCharge Hub",
    address: "Sector 14, Main EV Corridor",
    connector: "CCS2",
    portId: "P1",
    date: "2026-09-15",
    timeSlot: "05:00 PM - 06:00 PM",
    totalCost: 300,
    advancePaid: 60,
    remainingCost: 240,
    status: "Confirmed"
  },
  {
    bookingId: "GOEV-7310",
    stationName: "FastVolt",
    address: "Greenway Commercial Center",
    connector: "CCS2",
    portId: "P1",
    date: "2026-09-05",
    timeSlot: "11:00 AM - 12:00 PM",
    totalCost: 350,
    advancePaid: 70,
    remainingCost: 280,
    status: "Completed"
  }
];

function initDatabase() {
  if (!localStorage.getItem("goev_stations")) {
    localStorage.setItem("goev_stations", JSON.stringify(INITIAL_STATIONS));
  }
  if (!localStorage.getItem("goev_vehicle")) {
    localStorage.setItem("goev_vehicle", JSON.stringify(DEFAULT_VEHICLE));
  }
  if (!localStorage.getItem("goev_bookings")) {
    localStorage.setItem("goev_bookings", JSON.stringify(SAMPLE_BOOKINGS));
  }
}

initDatabase();