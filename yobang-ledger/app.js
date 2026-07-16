"use strict";

// =============================================================================
// 配置：通过 CORS 代理直接拉取 yobang 页面，解析内嵌 JSON 得到当前各维度分数。
// 最近 24 小时的快照存在浏览器 localStorage 里用于画趋势图。
// 不依赖 Gist / GitHub Actions。
// =============================================================================

const UNI_ID = "530004147";
const YOBANG_URL = `https://yobang.tencentmusic.com/chart/uni-chart/detail/?uniId=${UNI_ID}&issue=&chartType=`;
const STORAGE_KEY = "yobang-ledger-v1";
const MAX_SNAPSHOTS = 288; // 24h * 60min / 5min
const REFRESH_MS = 5 * 60 * 1000;

// 多个 CORS 代理，依次尝试
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

const DIMENSION_KEYWORDS = {
  play_count: "播放量", playCount: "播放量", playnum: "播放量", playScoreNum: "播放量",
  like_count: "点赞", likeCount: "点赞", likes: "点赞", likeScoreNum: "点赞",
  share_count: "分享", shareCount: "分享", shares: "分享", shareScoreNum: "分享",
  comment_count: "评论", commentCount: "评论", comments: "评论", commentScoreNum: "评论",
  favorite_count: "收藏", favoriteCount: "收藏", favorites: "收藏",
  collect_count: "收藏", collectCount: "收藏", collectScoreNum: "收藏",
  score: "得分", total_score: "总分", totalScore: "总分", totalScoreNum: "总分",
  play_score: "播放得分", playScore: "播放得分",
  like_score: "点赞得分", likeScore: "点赞得分",
  share_score: "分享得分", shareScore: "分享得分",
  comment_score: "评论得分", commentScore: "评论得分",
  favorite_score: "收藏得分", favoriteScore: "收藏得分",
  collect_score: "收藏得分", collectScore: "收藏得分",
};

const DIMENSION_COLORS = [
  "#167447", "#2c6f99", "#a97619", "#c9553d",
  "#5b6abf", "#0f8a8a", "#b54e7a", "#6f7f28",
  "#8d5ab5", "#7a5c28",
];

const EXTRACTORS = [
  { name: "__NEXT_DATA__",     re: /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/, kind: "json", group: 1 },
  { name: "__INITIAL_STATE__", re: /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/,        kind: "json", group: 1 },
  { name: "__APOLLO_STATE__",  re: /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/,         kind: "json", group: 1 },
  { name: "window_generic",    re: /window\.([A-Z_]+)\s*=\s*(\{[\s\S]{200,}?\})\s*;/,            kind: "json_group" },
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
  snapshots: [],
  latest: null,
  error: null,
  isLoading: false,
};

let refreshTimer = null;

// =============================================================================
// 拉取 + 解析
// =============================================================================
async function fetchHtml() {
  let lastErr;
  for (let i = 0; i < PROXIES.length; i += 1) {
    const url = PROXIES[i](YOBANG_URL);
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      if (!html || html.length < 500) throw new Error("响应过短");
      return { html, proxyIndex: i };
    } catch (e) {
      lastErr = new Error(`代理 #${i + 1}: ${e.message}`);
    }
  }
  throw lastErr || new Error("所有代理失败");
}

function extractState(html) {
  for (const ex of EXTRACTORS) {
    const m = ex.re.exec(html);
    if (!m) continue;
    try {
      if (ex.kind === "json") {
        return JSON.parse(m[ex.group]);
      }
      if (ex.kind === "json_group") {
        return { [m[1]]: JSON.parse(m[2]) };
      }
    } catch (e) {
      // try next extractor
    }
  }
  throw new Error("未找到内嵌 JSON（页面可能由 JS 渲染）");
}

function walkForScores(obj) {
  const found = new Map();
  function visit(node) {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k in DIMENSION_KEYWORDS && typeof v === "number" && !Number.isNaN(v)) {
          if (!found.has(k)) {
            found.set(k, { key: k, label: DIMENSION_KEYWORDS[k], value: v, unit: "" });
          }
        }
        visit(v);
      }
    }
  }
  visit(obj);
  return Array.from(found.values());
}

// =============================================================================
// localStorage 持久化
// =============================================================================
function loadSnapshots() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveSnapshots(snaps) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps.slice(-MAX_SNAPSHOTS)));
  } catch {
    // 容量满或无痕模式，忽略
  }
}

// =============================================================================
// 主刷新流程
// =============================================================================
async function refresh() {
  if (state.isLoading) return;
  state.isLoading = true;
  setSync("ok", "获取中…");
  try {
    const { html, proxyIndex } = await fetchHtml();
    const stateObj = extractState(html);
    const dimensions = walkForScores(stateObj);
    const now = new Date();
    const iso = now.toISOString();
    const snap = {
      captured_at: iso,
      fetched_at: iso,
      uni_id: UNI_ID,
      ok: true,
      dimensions,
      proxy_used: proxyIndex,
      raw_excerpt: safeStringify(stateObj).slice(0, 500),
      schema_version: 1,
    };
    state.latest = snap;
    state.snapshots = [...state.snapshots, snap].slice(-MAX_SNAPSHOTS);
    saveSnapshots(state.snapshots);
    state.error = null;
    setSync("ok", `同步于 ${now.toLocaleTimeString("zh-CN", { hour12: false })} · ${dimensions.length} 维度 · 代理 #${proxyIndex + 1}`);
    render();
  } catch (e) {
    state.error = e.message;
    setSync("err", `获取失败：${e.message}`);
    render();
  } finally {
    state.isLoading = false;
  }
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch { return String(obj); }
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
        <span class="metric-label">${state.error ? "获取失败" : "暂无维度"}</span>
        <strong>-</strong>
        <span class="metric-foot">${escapeHtml(state.error || "等待首次获取")}</span>
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
  const a = (latest.dimensions || []).find((d) => d.key === key);
  const b = (prev.dimensions || []).find((d) => d.key === key);
  if (!a || !b || typeof a.value !== "number" || typeof b.value !== "number") return "";
  const diff = a.value - b.value;
  if (diff === 0) return " · 持平";
  const sign = diff > 0 ? "+" : "";
  return ` · ${sign}${formatNumber(diff)}`;
}

function renderDayList() {
  if (state.snapshots.length === 0) {
    els.dayList.innerHTML = "";
    return;
  }
  const counts = new Map();
  for (const s of state.snapshots) {
    const day = (s.captured_at || "").slice(0, 10);
    if (!day) continue;
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const days = Array.from(counts.keys()).sort().reverse();
  els.dayList.innerHTML = days
    .map((day) => {
      const count = counts.get(day);
      return `
        <div class="tracker-item" data-day="${day}">
          <strong>${day}</strong>
          <span>${count} 条快照</span>
        </div>`;
    })
    .join("");
}

function renderLegend() {
  const dims = collectDimensions();
  if (dims.length === 0) {
    els.dimensionLegend.innerHTML = "";
    return;
  }
  const latest = state.latest || state.snapshots.at(-1);
  els.dimensionLegend.innerHTML = dims.map((dim, i) => {
    const color = DIMENSION_COLORS[i % DIMENSION_COLORS.length];
    const match = latest && (latest.dimensions || []).find((d) => d.key === dim.key);
    const value = match ? formatNumber(match.value) : "-";
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
// Canvas 趋势图
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
    drawEmptyState(ctx, w, h, state.error ? `错误：${state.error}` : "等待首次获取");
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
      return `<td>${m ? formatNumber(m.value) : "-"}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(snap.captured_at || snap.fetched_at || "")}</td>${cells}</tr>`;
  }).join("");
  els.rowCount.textContent = `${state.snapshots.length} 行`;
}

// =============================================================================
// 工具
// =============================================================================
function formatNumber(n) {
  if (n == null) return "-";
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
  setSync("ok", "手动刷新中…");
  refresh();
});
window.addEventListener("resize", () => drawTrendChart());

state.snapshots = loadSnapshots();
state.latest = state.snapshots.at(-1) || null;
if (state.latest) {
  setSync("ok", `本地缓存 ${state.snapshots.length} 条 · ${new Date(state.latest.captured_at).toLocaleTimeString("zh-CN", { hour12: false })}`);
} else {
  setSync("ok", "等待首次获取…");
}
render();
refresh();
refreshTimer = setInterval(refresh, REFRESH_MS);
