"use strict";

// =============================================================================
// 配置：创建 Gist 后把这里的替换为你的 Gist ID（形如 abc123def456）
// =============================================================================
const GIST_CONFIG = {
  user: "if-wannable",
  gistId: "REPLACE_WITH_YOUR_GIST_ID",
};

const UNI_ID = "530004147";

const DIMENSION_COLORS = [
  "#167447", "#2c6f99", "#a97619", "#c9553d",
  "#5b6abf", "#0f8a8a", "#b54e7a", "#6f7f28",
  "#8d5ab5", "#7a5c28",
];

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    dashboard: document.getElementById("dashboardView"),
    data: document.getElementById("dataView"),
  },
  dayList: document.getElementById("dayList"),
  metricGrid: document.getElementById("metricGrid"),
  trendCanvas: document.getElementById("trendCanvas"),
  dimensionLegend: document.getElementById("dimensionLegend"),
  trendStatus: document.getElementById("trendStatus"),
  tableHead: document.getElementById("tableHead"),
  dataRows: document.getElementById("dataRows"),
  rowCount: document.getElementById("rowCount"),
  lastSync: document.getElementById("lastSync"),
  refreshBtn: document.getElementById("refreshBtn"),
};

const state = {
  latest: null,
  snapshots: [],
  availableDays: [],
  selectedDay: "",
  error: null,
  manifest: null,
};

let refreshTimer = null;

// =============================================================================
// Gist 读取（CDN 优先，失败时降级到 api.github.com）
// =============================================================================
function gistRawUrl(filename) {
  return `https://gist.githubusercontent.com/${GIST_CONFIG.user}/${GIST_CONFIG.gistId}/raw/${filename}?_=${Date.now()}`;
}

function gistApiUrl(filename) {
  return `https://api.github.com/gists/${GIST_CONFIG.gistId}`;
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function fetchGistFile(filename, asJson) {
  try {
    return asJson
      ? await fetchJson(gistRawUrl(filename))
      : await fetchText(gistRawUrl(filename));
  } catch (e) {
    // 降级到 api.github.com
    const data = await fetchJson(gistApiUrl());
    const file = (data.files || {})[filename];
    if (!file) throw new Error(`Gist 中找不到 ${filename}`);
    const content = file.content || "";
    return asJson ? JSON.parse(content) : content;
  }
}

// =============================================================================
// 主加载流程
// =============================================================================
async function load() {
  try {
    state.error = null;
    state.manifest = await fetchGistFile("manifest.json", true);
    state.availableDays = listKnownDays(state.manifest);

    state.latest = await fetchGistFile("latest.json", true);
    const latestDay = (state.latest.captured_at || "").slice(0, 10);
    if (!state.selectedDay) state.selectedDay = latestDay || todayStr();

    if (!state.availableDays.includes(state.selectedDay)) {
      state.availableDays = [state.selectedDay, ...state.availableDays.filter((d) => d !== state.selectedDay)];
    }

    const text = await fetchGistFile(`${state.selectedDay}.jsonl`, false);
    state.snapshots = parseJsonl(text);

    render();
    setSync("ok", `同步于 ${nowTime()}`);
  } catch (e) {
    state.error = e.message;
    render();
    setSync("err", `同步失败：${e.message}`);
  }
}

function listKnownDays(manifest) {
  if (!manifest) return [];
  const days = [];
  if (manifest.current_file) {
    days.push(manifest.current_file.replace(/\.jsonl$/, ""));
  }
  return days;
}

function parseJsonl(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

// =============================================================================
// 渲染
// =============================================================================
function render() {
  renderMetricGrid();
  renderDayList();
  drawTrendChart();
  renderLegend();
  renderTable();
}

function renderMetricGrid() {
  const dims = (state.latest && state.latest.dimensions) || [];
  if (dims.length === 0) {
    els.metricGrid.innerHTML = `
      <div class="metric">
        <span class="metric-label">暂无维度</span>
        <strong>—</strong>
        <span class="metric-foot">${state.error || "等待 Gist 首次写入"}</span>
      </div>`;
    return;
  }
  els.metricGrid.innerHTML = dims.map((dim, i) => {
    const color = DIMENSION_COLORS[i % DIMENSION_COLORS.length];
    const delta = computeDelta(dim.key);
    return `
      <div class="metric" style="border-top-color:${color}">
        <span class="metric-label">${escapeHtml(dim.label || dim.key)}</span>
        <strong>${formatNumber(dim.value)}</strong>
        <span class="metric-foot">${escapeHtml(dim.unit || "")}${delta}</span>
      </div>`;
  }).join("");
}

function computeDelta(key) {
  if (state.snapshots.length < 2) return "";
  const latest = state.snapshots.at(-1);
  const prev = state.snapshots.at(-2);
  const a = latest.dimensions.find((d) => d.key === key);
  const b = prev.dimensions.find((d) => d.key === key);
  if (!a || !b || typeof a.value !== "number" || typeof b.value !== "number") return "";
  const diff = a.value - b.value;
  if (diff === 0) return " · 持平";
  const sign = diff > 0 ? "+" : "";
  return ` · ${sign}${formatNumber(diff)}`;
}

function renderDayList() {
  if (state.availableDays.length === 0) {
    els.dayList.innerHTML = "";
    return;
  }
  els.dayList.innerHTML = state.availableDays
    .map((day) => {
      const isActive = day === state.selectedDay;
      const count = day === state.selectedDay ? state.snapshots.length : "";
      return `
        <div class="tracker-item ${isActive ? "is-active" : ""}" data-day="${day}">
          <strong>${day}</strong>
          <span>${count !== "" ? `${count} 条快照` : "点击载入"}</span>
        </div>`;
    })
    .join("");
  els.dayList.querySelectorAll(".tracker-item").forEach((el) => {
    el.addEventListener("click", () => switchDay(el.dataset.day));
  });
}

async function switchDay(day) {
  if (day === state.selectedDay) return;
  state.selectedDay = day;
  setSync("ok", `载入 ${day}…`);
  try {
    const text = await fetchGistFile(`${day}.jsonl`, false);
    state.snapshots = parseJsonl(text);
    render();
    setSync("ok", `已载入 ${day} · ${nowTime()}`);
  } catch (e) {
    setSync("err", `载入失败：${e.message}`);
  }
}

function renderLegend() {
  const dims = collectDimensions();
  if (dims.length === 0) {
    els.dimensionLegend.innerHTML = "";
    return;
  }
  const latest = state.snapshots.at(-1) || state.latest;
  els.dimensionLegend.innerHTML = dims.map((dim, i) => {
    const color = DIMENSION_COLORS[i % DIMENSION_COLORS.length];
    const match = latest && latest.dimensions.find((d) => d.key === dim.key);
    const value = match ? formatNumber(match.value) : "—";
    return `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-name">${escapeHtml(dim.label || dim.key)}</span>
        <span class="legend-value">${value}</span>
      </div>`;
  }).join("");
}

function collectDimensions() {
  const seen = new Map();
  for (const snap of state.snapshots) {
    for (const d of snap.dimensions || []) {
      if (!seen.has(d.key)) seen.set(d.key, d);
    }
  }
  if (state.latest) {
    for (const d of state.latest.dimensions || []) {
      if (!seen.has(d.key)) seen.set(d.key, d);
    }
  }
  return Array.from(seen.values());
}

// =============================================================================
// Canvas 趋势图（原生 2D Context，多维度折线）
// =============================================================================
function drawTrendChart() {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 980;
  const h = canvas.clientHeight || 360;
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 24, right: 24, bottom: 42, left: 64 };
  const width = w - pad.left - pad.right;
  const height = h - pad.top - pad.bottom;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const snaps = state.snapshots;
  const dims = collectDimensions();
  if (snaps.length === 0 || dims.length === 0) {
    drawEmptyState(ctx, w, h, state.error ? `错误：${state.error}` : "暂无记录");
    els.trendStatus.textContent = snaps.length === 0 ? "尚无快照" : `${snaps.length} 条 · ${dims.length} 个维度`;
    return;
  }

  const series = dims.map((dim) => ({
    dim,
    values: snaps.map((s) => {
      const m = (s.dimensions || []).find((d) => d.key === dim.key);
      return m && typeof m.value === "number" ? m.value : null;
    }),
  }));

  let max = -Infinity;
  let min = Infinity;
  for (const s of series) {
    for (const v of s.values) {
      if (v == null) continue;
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }
  if (!isFinite(max)) { max = 1; min = 0; }
  if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
  if (min > 0 && min < max * 0.1) min = 0;
  const span = Math.max(1, max - min);

  ctx.strokeStyle = "#d9dfdc";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#68736e";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = max - (span / 4) * i;
    ctx.fillText(formatNumber(value), pad.left - 10, pad.top + (height / 4) * i);
  }

  const xFor = (i) =>
    snaps.length === 1
      ? pad.left + width / 2
      : pad.left + (width / (snaps.length - 1)) * i;
  const yFor = (v) => pad.top + height - ((v - min) / span) * height;

  series.forEach((s, idx) => {
    const color = DIMENSION_COLORS[idx % DIMENSION_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = yFor(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = yFor(v);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  });

  ctx.fillStyle = "#68736e";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const first = snaps[0];
  const last = snaps.at(-1);
  ctx.fillText(formatAxisTime(first.captured_at), xFor(0), pad.top + height + 12);
  if (last !== first) {
    ctx.fillText(formatAxisTime(last.captured_at), xFor(snaps.length - 1), pad.top + height + 12);
  }

  els.trendStatus.textContent = `${snaps.length} 条快照 · ${dims.length} 个维度 · 区间 [${formatNumber(min)}, ${formatNumber(max)}]`;
}

function drawEmptyState(ctx, w, h, msg) {
  ctx.fillStyle = "#68736e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "14px system-ui";
  ctx.fillText(msg || "暂无记录", w / 2, h / 2);
}

function formatAxisTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const md = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  return `${md} ${hh}:${mm}`;
}

// =============================================================================
// 数据表
// =============================================================================
function renderTable() {
  const dims = collectDimensions();
  els.tableHead.innerHTML =
    "<th>时间</th>" +
    dims.map((d) => `<th>${escapeHtml(d.label || d.key)}</th>`).join("");

  const rows = state.snapshots.slice().reverse();
  els.dataRows.innerHTML = rows.map((snap) => {
    const cells = dims.map((d) => {
      const m = (snap.dimensions || []).find((x) => x.key === d.key);
      return `<td>${m ? formatNumber(m.value) : "—"}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(snap.captured_at || snap.fetched_at || "")}</td>${cells}</tr>`;
  }).join("");
  els.rowCount.textContent = `${state.snapshots.length} 行`;
}

// =============================================================================
// 工具
// =============================================================================
function formatNumber(n) {
  if (n == null) return "—";
  if (typeof n !== "number") return String(n);
  if (Number.isInteger(n)) return n.toLocaleString("zh-CN");
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setSync(kind, text) {
  els.lastSync.textContent = text;
  els.lastSync.classList.remove("sync-ok", "sync-err");
  if (kind === "ok") els.lastSync.classList.add("sync-ok");
  else if (kind === "err") els.lastSync.classList.add("sync-err");
}

function setView(name) {
  els.tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  Object.entries(els.views).forEach(([k, v]) =>
    v.classList.toggle("is-visible", k === name)
  );
  if (name === "dashboard") drawTrendChart();
}

// =============================================================================
// 启动
// =============================================================================
els.tabs.forEach((t) => t.addEventListener("click", () => setView(t.dataset.view)));
els.refreshBtn.addEventListener("click", () => {
  setSync("ok", "刷新中…");
  load();
});

window.addEventListener("resize", () => drawTrendChart());

if (GIST_CONFIG.gistId === "REPLACE_WITH_YOUR_GIST_ID") {
  setSync("err", "未配置 Gist ID（见 app.js 顶部 GIST_CONFIG）");
} else {
  load();
  refreshTimer = setInterval(load, 5 * 60 * 1000);
}
