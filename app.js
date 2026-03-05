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
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, digits = 2) {
  return num(value).toFixed(digits);
}

function formatTimestamp(iso) {
  if (!iso) return "No Data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeLevels(raw) {
  let minyak = clamp(num(raw.minyak_cm), 0, CM_MAX);
  let air = clamp(num(raw.air_cm), 0, CM_MAX);
  let sluge = clamp(num(raw.sluge_cm), 0, CM_MAX);

  let totalRaw = raw.total_cm;
  let total = totalRaw === null || totalRaw === undefined || totalRaw === ""
    ? clamp(minyak + air + sluge, 0, CM_MAX)
    : clamp(num(totalRaw), 0, CM_MAX);

  const sumLayers = minyak + air + sluge;
  if (sumLayers > total && sumLayers > 0) {
    const ratio = total / sumLayers;
    minyak *= ratio;
    air *= ratio;
    sluge *= ratio;
  }

  return { minyak, air, sluge, total };
}

function scaleLayersToTotal(levels) {
  const minyakPx = (levels.minyak / CM_MAX) * TANK_LIQUID_HEIGHT;
  const airPx = (levels.air / CM_MAX) * TANK_LIQUID_HEIGHT;
  const slugePx = (levels.sluge / CM_MAX) * TANK_LIQUID_HEIGHT;
  return { minyakPx, airPx, slugePx };
}

function setConnection(connected, timestamp, stale = false) {
  el.connectionDot.classList.toggle("connected", connected);
  el.connectionDot.classList.toggle("disconnected", !connected);
  el.connectionText.textContent = connected ? "Connected" : "Disconnected";
  el.lastUpdateText.textContent = `Last update: ${connected ? formatTimestamp(timestamp) : "No Data"}`;
  el.staleBadge.classList.toggle("hidden", !stale);
}

function setStaleState(isStale) {
  document.querySelectorAll(".kpi-card").forEach((node) => {
    node.classList.toggle("stale", isStale);
  });
}

function updateKPIs(data, levels) {
  el.kpiSuhu.textContent = formatNumber(data.suhu, 2);
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
  const merged = {
    temp_high: num(thresholds.temp_high || DEFAULT_THRESHOLDS.temp_high),
    pressure_high: num(thresholds.pressure_high || DEFAULT_THRESHOLDS.pressure_high),
    oil_high: num(thresholds.oil_high || DEFAULT_THRESHOLDS.oil_high),
  };

  el.alarmTemp.classList.toggle("on", num(data.suhu) >= merged.temp_high);
  el.alarmPressure.classList.toggle("on", num(data.tekanan_total) >= merged.pressure_high);
  el.alarmOil.classList.toggle("on", num(levels.minyak) >= merged.oil_high);
}

function setLayerRect(rect, y, h) {
  rect.setAttribute("y", String(y));
  rect.setAttribute("height", String(h));
}

function setLabelPosition(label, yCenter) {
  const y = clamp(yCenter, TANK_TOP_Y + 16, TANK_BOTTOM_Y - 8);
  label.setAttribute("y", String(y));
}

function updateTankSVG(levels) {
  const { minyakPx, airPx, slugePx } = scaleLayersToTotal(levels);

  const ySluge = TANK_BOTTOM_Y - slugePx;
  const yAir = ySluge - airPx;
  const yMinyak = yAir - minyakPx;

  setLayerRect(el.slugeLayer, ySluge, slugePx);
  setLayerRect(el.airLayer, yAir, airPx);
  setLayerRect(el.minyakLayer, yMinyak, minyakPx);

  setLabelPosition(el.labelSluge, ySluge + slugePx / 2);
  setLabelPosition(el.labelAir, yAir + airPx / 2);
  setLabelPosition(el.labelMinyak, yMinyak + minyakPx / 2);
}

function createScaleTicks() {
  const x1 = 264;
  const x2 = 282;
  const xText = 286;

  for (let cm = 0; cm <= 90; cm += 10) {
    const y = TANK_BOTTOM_Y - (cm / CM_MAX) * TANK_LIQUID_HEIGHT;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(xText));
    text.setAttribute("y", String(y + 3));
    text.textContent = `${cm} cm`;

    el.scaleGroup.appendChild(line);
    el.scaleGroup.appendChild(text);
  }
}

function initCharts() {
  const sharedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        ticks: { color: "#a5caf1", maxTicksLimit: 8 },
        grid: { color: "rgba(132,170,214,0.16)" },
      },
      y: {
        ticks: { color: "#a5caf1" },
        grid: { color: "rgba(132,170,214,0.16)" },
      },
    },
    plugins: {
      legend: { labels: { color: "#dbecff" } },
      tooltip: {
        backgroundColor: "rgba(9, 18, 32, 0.95)",
        titleColor: "#e9f3ff",
        bodyColor: "#cde4ff",
        borderColor: "rgba(86,145,207,0.7)",
        borderWidth: 1,
      },
    },
  };

  tempChart = new Chart(document.getElementById("tempChart"), {
    type: "line",
    data: {
      labels: historyData.labels,
      datasets: [
        {
          label: "Suhu (°C)",
          data: historyData.suhu,
          borderColor: "#ff8a6f",
          backgroundColor: "rgba(255,138,111,0.2)",
          pointRadius: 2,
          borderWidth: 2,
          tension: 0.28,
        },
      ],
    },
    options: sharedOptions,
  });

  oilVolChart = new Chart(document.getElementById("oilVolChart"), {
    type: "line",
    data: {
      labels: historyData.labels,
      datasets: [
        {
          label: "Volume Minyak (m³)",
          data: historyData.volMinyak,
          borderColor: "#ffe067",
          backgroundColor: "rgba(255,224,103,0.2)",
          pointRadius: 2,
          borderWidth: 2,
          tension: 0.28,
        },
      ],
    },
    options: sharedOptions,
  });
}

function pushChartPoint(data) {
  const label = data.timestamp_iso
    ? new Date(data.timestamp_iso).toLocaleTimeString("id-ID", { hour12: false })
    : new Date().toLocaleTimeString("id-ID", { hour12: false });

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
  const response = await fetch(API_URL, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refreshData() {
  try {
    const payload = await fetchLatest();

    if (!payload?.ok || !payload?.has_data) {
      throw new Error("API returned no data");
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

createScaleTicks();
initCharts();
setConnection(false, null, false);
setStaleState(false);
refreshData();
setInterval(refreshData, POLLING_MS);
