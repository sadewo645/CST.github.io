const API_URL = "/api/latest";

const POLLING_MS = 2000;
const MAX_POINTS = 120;
const CM_MAX = 90;

const TANK_TOP_Y = 78;
const TANK_BOTTOM_Y = 498;
const TANK_LIQUID_HEIGHT = TANK_BOTTOM_Y - TANK_TOP_Y;

const DEFAULT_THRESHOLDS = {
  temp_high: 60,
  pressure_high: 1.5,
  oil_high: 70,
};

const el = {
  connectionDot: document.getElementById("connectionDot"),
  connectionText: document.getElementById("connectionText"),
  lastUpdateText: document.getElementById("lastUpdateText"),
  staleBadge: document.getElementById("staleBadge"),

  kpiSuhu: document.getElementById("kpiSuhu"),
  kpiTekanan: document.getElementById("kpiTekanan"),
  kpiTotalCm: document.getElementById("kpiTotalCm"),
  kpiMinyakCm: document.getElementById("kpiMinyakCm"),
  kpiAirCm: document.getElementById("kpiAirCm"),
  kpiSlugeCm: document.getElementById("kpiSlugeCm"),
  kpiVolMinyak: document.getElementById("kpiVolMinyak"),
  kpiVolAir: document.getElementById("kpiVolAir"),
  kpiVolSluge: document.getElementById("kpiVolSluge"),

  alarmTemp: document.getElementById("alarmTemp"),
  alarmPressure: document.getElementById("alarmPressure"),
  alarmOil: document.getElementById("alarmOil"),

  minyakLayer: document.getElementById("minyakLayer"),
  airLayer: document.getElementById("airLayer"),
  slugeLayer: document.getElementById("slugeLayer"),
  labelMinyak: document.getElementById("labelMinyak"),
  labelAir: document.getElementById("labelAir"),
  labelSluge: document.getElementById("labelSluge"),

  scaleGroup: document.getElementById("scaleGroup"),
};

const historyData = {
  labels: [],
  suhu: [],
  volMinyak: [],
};

let tempChart;
let oilVolChart;



function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function num(value) {
  if (value === null || value === undefined) return 0;

  const v = String(value).replace(",", ".");
  const n = Number(v);

  return Number.isFinite(n) ? n : 0;
}



function formatNumber(value, digits = 2) {
  return num(value).toFixed(digits);
}



function formatTimestamp(iso) {
  if (!iso) return "No Data";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleString("id-ID");
}



function normalizeLevels(raw) {

  let minyak = clamp(num(raw.minyak_cm), 0, CM_MAX);
  let air = clamp(num(raw.air_cm), 0, CM_MAX);
  let sluge = clamp(num(raw.sluge_cm), 0, CM_MAX);

  let totalRaw = raw.total_cm;

  let total = totalRaw
    ? clamp(num(totalRaw), 0, CM_MAX)
    : clamp(minyak + air + sluge, 0, CM_MAX);

  const sum = minyak + air + sluge;

  if (sum > total && sum > 0) {
    const ratio = total / sum;

    minyak *= ratio;
    air *= ratio;
    sluge *= ratio;
  }

  return { minyak, air, sluge, total };
}



function scaleLayersToTotal(levels) {

  return {
    minyakPx: (levels.minyak / CM_MAX) * TANK_LIQUID_HEIGHT,
    airPx: (levels.air / CM_MAX) * TANK_LIQUID_HEIGHT,
    slugePx: (levels.sluge / CM_MAX) * TANK_LIQUID_HEIGHT,
  };
}



function setConnection(connected, timestamp, stale = false) {

  el.connectionDot.classList.toggle("connected", connected);
  el.connectionDot.classList.toggle("disconnected", !connected);

  el.connectionText.textContent =
    connected ? "Connected" : "Disconnected";

  el.lastUpdateText.textContent =
    "Last update: " + (connected ? formatTimestamp(timestamp) : "No Data");

  el.staleBadge.classList.toggle("hidden", !stale);
}



function setStaleState(state) {

  document.querySelectorAll(".kpi-card").forEach((e) => {
    e.classList.toggle("stale", state);
  });
}



function updateKPIs(data, levels) {

  el.kpiSuhu.textContent = formatNumber(data.suhu);
  el.kpiTekanan.textContent = formatNumber(data.tekanan_total, 3);

  el.kpiTotalCm.textContent = formatNumber(levels.total, 1);

  el.kpiMinyakCm.textContent = formatNumber(levels.minyak, 1);
  el.kpiAirCm.textContent = formatNumber(levels.air, 1);
  el.kpiSlugeCm.textContent = formatNumber(levels.sluge, 1);

  el.kpiVolMinyak.textContent = formatNumber(data.volume_minyak, 3);
  el.kpiVolAir.textContent = formatNumber(data.volume_air, 3);
  el.kpiVolSluge.textContent = formatNumber(data.volume_sluge, 3);
}



function updateAlarms(data, levels, thresholds = {}) {

  const tempHigh = thresholds.temp_high || DEFAULT_THRESHOLDS.temp_high;
  const pressureHigh = thresholds.pressure_high || DEFAULT_THRESHOLDS.pressure_high;
  const oilHigh = thresholds.oil_high || DEFAULT_THRESHOLDS.oil_high;

  el.alarmTemp.classList.toggle("on", num(data.suhu) >= tempHigh);
  el.alarmPressure.classList.toggle("on", num(data.tekanan_total) >= pressureHigh);
  el.alarmOil.classList.toggle("on", num(levels.minyak) >= oilHigh);
}



function updateTankSVG(levels) {

  const { minyakPx, airPx, slugePx } = scaleLayersToTotal(levels);

  const ySluge = TANK_BOTTOM_Y - slugePx;
  const yAir = ySluge - airPx;
  const yMinyak = yAir - minyakPx;

  el.slugeLayer.setAttribute("y", ySluge);
  el.slugeLayer.setAttribute("height", slugePx);

  el.airLayer.setAttribute("y", yAir);
  el.airLayer.setAttribute("height", airPx);

  el.minyakLayer.setAttribute("y", yMinyak);
  el.minyakLayer.setAttribute("height", minyakPx);
}



function pushChartPoint(data) {

  const label = new Date().toLocaleTimeString("id-ID");

  historyData.labels.push(label);
  historyData.suhu.push(num(data.suhu));
  historyData.volMinyak.push(num(data.volume_minyak));

  if (historyData.labels.length > MAX_POINTS) {

    historyData.labels.shift();
    historyData.suhu.shift();
    historyData.volMinyak.shift();
  }

  tempChart.update();
  oilVolChart.update();
}



async function fetchLatest() {

  const response = await fetch(API_URL, {
    method: "GET",
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  try {
    return JSON.parse(text);
  } catch (err) {

    console.error("Invalid JSON:", text);

    throw err;
  }
}



async function refreshData() {

  try {

    const payload = await fetchLatest();

    if (!payload.ok || !payload.has_data) {
      throw new Error("No Data");
    }

    const levels = normalizeLevels(payload);

    updateKPIs(payload, levels);

    updateTankSVG(levels);

    updateAlarms(payload, levels, payload.thresholds || {});

    pushChartPoint(payload);

    setConnection(true, payload.timestamp_iso, false);

    setStaleState(false);

  } catch (err) {

    console.error("Polling failed:", err);

    setConnection(false, null, true);

    setStaleState(true);
  }
}



function initCharts() {

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false
  };

  tempChart = new Chart(
    document.getElementById("tempChart"),
    {
      type: "line",
      data: {
        labels: historyData.labels,
        datasets: [{
          label: "Suhu",
          data: historyData.suhu,
          borderColor: "#ff8a6f",
          tension: 0.3
        }]
      },
      options: baseOptions
    }
  );

  oilVolChart = new Chart(
    document.getElementById("oilVolChart"),
    {
      type: "line",
      data: {
        labels: historyData.labels,
        datasets: [{
          label: "Volume Minyak",
          data: historyData.volMinyak,
          borderColor: "#ffe067",
          tension: 0.3
        }]
      },
      options: baseOptions
    }
  );
}



function createScaleTicks() {

  for (let cm = 0; cm <= 90; cm += 10) {

    const y = TANK_BOTTOM_Y - (cm / CM_MAX) * TANK_LIQUID_HEIGHT;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

    line.setAttribute("x1", "264");
    line.setAttribute("x2", "282");
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");

    text.setAttribute("x", "286");
    text.setAttribute("y", y + 3);

    text.textContent = cm + " cm";

    el.scaleGroup.appendChild(line);
    el.scaleGroup.appendChild(text);
  }
}



createScaleTicks();
initCharts();

setConnection(false, null, false);

setStaleState(false);

refreshData();

setInterval(refreshData, POLLING_MS);
