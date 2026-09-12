/* Dong tien CK */
(function () {
  const PERIOD_BARS = { day: 1, week: 5, month: 20, quarter: 60 };
  const PERIOD_LABEL = { day: "Ngay", week: "Tuan", month: "Thang", quarter: "Quy" };
  const CAFEF = "https://cafef.vn/du-lieu/Ajax/PageNew/DataHistory/PriceHistory.ashx";
  function pad2(n) { return String(n).padStart(2, "0"); }
  function cafefEndDate() {
    const d = new Date();
    return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear();
  }
  const state = { period: "day", view: "market", industry: null, query: "", data: null, live: false, refreshing: false, charts: {} };
  const $ = (id) => document.getElementById(id);
  function cloneSnapshot() {
    const raw = window.DT_SNAPSHOT || { indices: {}, stocks: {} };
    return JSON.parse(JSON.stringify(raw));
  }
  function fmtNum(n, d) {
    if (n == null || Number.isNaN(n)) return "-";
    return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: d == null ? 0 : d });
  }
  function fmtTy(n) {
    if (n == null || Number.isNaN(n)) return "-";
    if (Math.abs(n) >= 1000) return fmtNum(n / 1000, 2) + " nghin ty";
    return fmtNum(n, 1) + " ty";
  }
  function clsChg(n) { return n > 0.0001 ? "up" : n < -0.0001 ? "down" : "flat"; }
  function signTxt(n, d) { const v = fmtNum(n, d == null ? 2 : d); return n > 0 ? "+" + v : v; }
  function heatColor(pct) {
    const p = Math.max(-7, Math.min(7, pct || 0));
    if (p >= 0) { const t = p / 7; return "rgb(" + Math.round(20 + 20 * (1 - t)) + ", " + Math.round(80 + 100 * t) + ", " + Math.round(50 + 40 * t) + ")"; }
    const t = Math.abs(p) / 7; return "rgb(" + Math.round(140 + 90 * t) + ", " + Math.round(40 + 20 * (1 - t)) + ", 55)";
  }
  function barsForPeriod() { return PERIOD_BARS[state.period] || 1; }
  function sliceH(h, n) { return (h || []).slice(0, n); }
  function periodChange(h, n) {
    const sl = sliceH(h, n);
    if (!sl.length) return 0;
    if (sl.length === 1) return sl[0].pct || 0;
    const newest = sl[0].c, oldest = sl[sl.length - 1].c;
    if (!oldest) return sl[0].pct || 0;
    return ((newest - oldest) / oldest) * 100;
  }
  function periodValue(h, n) { return sliceH(h, n).reduce((s, r) => s + (Number(r.val) || 0), 0); }
  function periodNet(h, n) {
    return sliceH(h, n).reduce((s, r) => {
      const v = Number(r.val) || 0, p = Number(r.pct) || 0;
      return s + v * (p > 0 ? 1 : p < 0 ? -1 : 0);
    }, 0);
  }
  function periodVol(h, n) { return sliceH(h, n).reduce((s, r) => s + (Number(r.vol) || 0), 0); }
  function lastSession(h) { return (h && h[0]) || null; }
  function indexSeries(key) { return (state.data.indices[key] && state.data.indices[key].h) || []; }
  function computeStocks() {
    const n = barsForPeriod(), q = state.query.trim().toUpperCase(), rows = [];
    Object.keys(state.data.stocks).forEach((sym) => {
      const rec = state.data.stocks[sym], h = rec.h || [];
      if (!h.length) return;
      if (q && !sym.includes(q) && !(rec.ind || "").toUpperCase().includes(q)) return;
      const last = h[0];
      rows.push({ sym, ind: rec.ind, last, pct: periodChange(h, n), dayPct: last.pct || 0, val: periodValue(h, n), net: periodNet(h, n), vol: periodVol(h, n), px: last.c, h });
    });
    return rows;
  }
  function computeIndustries(stocks) {
    const map = {};
    stocks.forEach((s) => {
      const k = s.ind || "Khac";
      if (!map[k]) map[k] = { name: k, val: 0, net: 0, up: 0, down: 0, flat: 0, stocks: [] };
      const g = map[k]; g.val += s.val; g.net += s.net; g.stocks.push(s);
      if (s.pct > 0.05) g.up += 1; else if (s.pct < -0.05) g.down += 1; else g.flat += 1;
    });
    const list = Object.values(map).map((g) => {
      const w = g.stocks.reduce((s, x) => s + Math.abs(x.val), 0) || 1;
      const pct = g.stocks.reduce((s, x) => s + x.pct * Math.abs(x.val), 0) / w;
      return Object.assign(g, { pct });
    });
    list.sort((a, b) => b.val - a.val);
    return list;
  }
  function breadth(stocks) {
    let up = 0, down = 0, flat = 0, valUp = 0, valDown = 0, valFlat = 0;
    stocks.forEach((s) => {
      if (s.pct > 0.05) { up += 1; valUp += s.val; }
      else if (s.pct < -0.05) { down += 1; valDown += s.val; }
      else { flat += 1; valFlat += s.val; }
    });
    return { up, down, flat, valUp, valDown, valFlat, total: stocks.length };
  }
  function latestDate() { const h = indexSeries("VNINDEX"); return h[0] ? h[0].d : "-"; }
  function computeStocksRaw() { const q = state.query; state.query = ""; const rows = computeStocks(); state.query = q; return rows; }
  function renderIndices() {
    const keys = [["VNINDEX", "VN-Index"], ["VN30", "VN30"], ["HNX-INDEX", "HNX-Index"], ["UPCOM-INDEX", "UPCOM"]];
    const n = barsForPeriod();
    $("idxList").innerHTML = keys.map(([k, label]) => {
      const h = indexSeries(k), last = lastSession(h), pct = periodChange(h, n), px = last ? last.c : 0;
      return '<div class="idx-row"><div class="idx-name">' + label + '</div><div class="idx-px">' + fmtNum(px, 2) + '</div><div class="idx-chg ' + clsChg(pct) + '">' + signTxt(pct) + '%</div></div>';
    }).join("");
  }
  function renderKpis(stocks, inds) {
    const vni = indexSeries("VNINDEX"), n = barsForPeriod(), pct = periodChange(vni, n), last = lastSession(vni);
    const totalVal = stocks.reduce((s, x) => s + x.val, 0), net = stocks.reduce((s, x) => s + x.net, 0), top = inds[0], br = breadth(stocks);
    $("kpis").innerHTML = '<div class="kpi"><div class="lab">VN-Index</div><div class="val ' + clsChg(pct) + '">' + fmtNum(last && last.c, 2) + '</div><div class="sub ' + clsChg(pct) + '">' + signTxt(pct) + '% · ' + (last ? last.d : "-") + '</div></div>' +
      '<div class="kpi"><div class="lab">GTGD (' + stocks.length + ' ma)</div><div class="val">' + fmtTy(totalVal) + '</div><div class="sub">Tong GTGD trong ky</div></div>' +
      '<div class="kpi"><div class="lab">Dong tien rong</div><div class="val ' + clsChg(net) + '">' + (net >= 0 ? "+" : "") + fmtTy(net) + '</div><div class="sub">GT tang - GT giam</div></div>' +
      '<div class="kpi"><div class="lab">Nganh dan dong</div><div class="val" style="font-size:18px">' + (top ? top.name : "-") + '</div><div class="sub ' + (top ? clsChg(top.pct) : "") + '">' + (top ? fmtTy(top.val) + " · " + signTxt(top.pct) + "%" : "") + '</div></div>';
    $("kpiBreadth").innerHTML = '<span class="up">Tang ' + br.up + '</span> <span class="down">Giam ' + br.down + '</span> <span class="flat">Dung ' + br.flat + '</span>';
  }
  function destroyChart(id) { if (state.charts[id]) { state.charts[id].destroy(); state.charts[id] = null; } }
  function renderFlowCharts(stocks) {
    const br = breadth(stocks); destroyChart("pie"); destroyChart("bars");
    const pieCtx = $("pieChart"), barCtx = $("barChart");
    if (!pieCtx || !window.Chart) return;
    state.charts.pie = new Chart(pieCtx, { type: "doughnut", data: { labels: ["Tang", "Giam", "Khong doi"], datasets: [{ data: [br.up, br.down, br.flat], backgroundColor: ["#3dd68c", "#f6465d", "#c9a227"], borderWidth: 0 }] }, options: { plugins: { legend: { labels: { color: "#c5d0dc", boxWidth: 12 } } }, cutout: "58%" } });
    state.charts.bars = new Chart(barCtx, { type: "bar", data: { labels: ["Tang", "Giam", "Khong doi"], datasets: [{ label: "Ty dong", data: [br.valUp, br.valDown, br.valFlat], backgroundColor: ["#3dd68c", "#f6465d", "#c9a227"] }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } }, y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } } } } });
  }
  function renderIndexChart() {
    const h = sliceH(indexSeries("VNINDEX"), Math.max(barsForPeriod(), 20)).slice().reverse();
    destroyChart("vni"); const ctx = $("vniChart"); if (!ctx || !window.Chart) return;
    state.charts.vni = new Chart(ctx, { type: "line", data: { labels: h.map((r) => r.d.slice(0, 5)), datasets: [{ label: "VN-Index", data: h.map((r) => r.c), borderColor: "#60a5fa", backgroundColor: "rgba(96,165,250,.12)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8b98a8", maxTicksLimit: 8 }, grid: { display: false } }, y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } } } } });
  }
  function renderIndustryTable(inds) {
    const maxVal = Math.max.apply(null, inds.map((i) => i.val).concat([1]));
    $("indBody").innerHTML = inds.map((g) => {
      const w = Math.max(6, (g.val / maxVal) * 100);
      return '<tr class="' + (state.industry === g.name ? "active" : "") + '" data-ind="' + g.name + '"><td><strong>' + g.name + '</strong><div class="hint">' + g.stocks.length + ' ma</div></td><td class="num ' + clsChg(g.pct) + '">' + signTxt(g.pct) + '%</td><td class="num">' + fmtNum(g.val, 0) + '</td><td class="num ' + clsChg(g.net) + '">' + signTxt(g.net, 0) + '</td><td class="bar-cell"><div class="mini-bar"><span style="width:' + w + '%;background:' + (g.pct >= 0 ? "#3dd68c" : "#f6465d") + '"></span></div></td></tr>';
    }).join("");
  }
  function renderHeat(inds) {
    $("heat").innerHTML = inds.map((g) => {
      const tiles = g.stocks.slice().sort((a, b) => b.val - a.val).map((s) => {
        const flex = Math.max(0.7, Math.min(2.4, Math.sqrt(Math.max(s.val, 1)) / 8));
        return '<div class="tile" data-sym="' + s.sym + '" style="background:' + heatColor(s.pct) + ';flex:' + flex + '"><div class="t-sym">' + s.sym + '</div><div class="t-pct">' + signTxt(s.pct) + '%</div><div class="t-val">' + fmtNum(s.val, 0) + ' ty</div></div>';
      }).join("");
      return '<div class="heat-sec"><h4><span>' + g.name + '</span><span class="' + clsChg(g.pct) + '">' + signTxt(g.pct) + '%</span></h4><div class="tiles">' + tiles + '</div></div>';
    }).join("");
  }
  function renderStockTable(stocks, targetId) {
    const el = $(targetId || "stkBody"); if (!el) return;
    el.innerHTML = stocks.slice().sort((a, b) => b.val - a.val).map((s) => '<tr data-sym="' + s.sym + '"><td><strong>' + s.sym + '</strong></td><td>' + s.ind + '</td><td class="num">' + fmtNum(s.px, 2) + '</td><td class="num ' + clsChg(s.pct) + '">' + signTxt(s.pct) + '%</td><td class="num">' + fmtNum(s.val, 1) + '</td><td class="num ' + clsChg(s.net) + '">' + signTxt(s.net, 1) + '</td></tr>').join("");
  }
  function renderIndustryView(inds) {
    const g = inds.find((x) => x.name === state.industry);
    if (!g) { state.view = "market"; state.industry = null; return render(); }
    $("viewMarket").style.display = "none"; $("viewIndustry").style.display = "block";
    $("indTitle").textContent = g.name;
    $("indMeta").innerHTML = g.stocks.length + " ma · GTGD " + fmtTy(g.val) + ' · <span class="' + clsChg(g.pct) + '">' + signTxt(g.pct) + '%</span>';
    renderStockTable(g.stocks, "stkBodyInd");
    destroyChart("indFlow");
    const ctx = $("indFlowChart");
    if (ctx && window.Chart) {
      const top = g.stocks.slice().sort((a, b) => b.val - a.val).slice(0, 12);
      state.charts.indFlow = new Chart(ctx, { type: "bar", data: { labels: top.map((s) => s.sym), datasets: [{ label: "GTGD", data: top.map((s) => s.val), backgroundColor: top.map((s) => s.pct >= 0 ? "#3dd68c" : "#f6465d") }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8b98a8" }, grid: { display: false } }, y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } } } } });
    }
  }
  function renderMarket(inds, stocks) {
    $("viewMarket").style.display = "block"; $("viewIndustry").style.display = "none";
    renderFlowCharts(stocks); renderIndexChart(); renderIndustryTable(inds); renderHeat(inds); renderStockTable(stocks);
    $("stkCaption").textContent = "Top co phieu theo GTGD";
  }
  function renderStatus() {
    const src = state.live ? "CafeF (da lam moi)" : "CafeF snapshot";
    $("statusText").textContent = src + " · chot " + latestDate();
    $("statusDot").className = "dot" + (state.live ? "" : " warn");
    $("periodLabel").textContent = PERIOD_LABEL[state.period];
  }
  function render() {
    if (!state.data) return;
    const stocks = computeStocks();
    const inds = computeIndustries(computeStocksRaw());
    renderIndices(); renderKpis(computeStocksRaw(), inds); renderStatus();
    if (state.view === "industry" && state.industry) renderIndustryView(inds); else renderMarket(inds, stocks);
  }
  function openStock(sym) {
    const rec = state.data.stocks[sym]; if (!rec) return;
    const n = barsForPeriod(), h = rec.h || [], last = h[0] || {};
    $("modalBg").classList.add("show");
    $("modalTitle").textContent = sym + " · " + rec.ind;
    $("modalKv").innerHTML = '<div><div class="k">Gia</div><strong>' + fmtNum(last.c, 2) + '</strong></div><div><div class="k">% ky</div><strong class="' + clsChg(periodChange(h, n)) + '">' + signTxt(periodChange(h, n)) + '%</strong></div><div><div class="k">GTGD</div><strong>' + fmtTy(periodValue(h, n)) + '</strong></div><div><div class="k">Rong</div><strong class="' + clsChg(periodNet(h, n)) + '">' + fmtTy(periodNet(h, n)) + '</strong></div>';
    destroyChart("modal");
    const ctx = $("modalChart"), series = sliceH(h, 20).slice().reverse();
    if (ctx && window.Chart) {
      state.charts.modal = new Chart(ctx, { type: "line", data: { labels: series.map((r) => r.d.slice(0, 5)), datasets: [{ data: series.map((r) => r.c), borderColor: periodChange(h, n) >= 0 ? "#3dd68c" : "#f6465d", backgroundColor: "transparent", tension: 0.25, pointRadius: 0, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8b98a8", maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } } } } });
    }
  }
  function parseCafeFRow(d) {
    const raw = String(d.ThayDoi || ""); let chg = 0, pct = 0;
    const s = raw.replace(/\s/g, "").replace("%", "").replace(")", "");
    try { if (s.indexOf("(") >= 0) { const a = s.split("("); chg = parseFloat(a[0].replace("+", "").replace(",", ".")) || 0; pct = parseFloat(a[1].replace("+", "").replace(",", ".")) || 0; } } catch (e) {}
    return { d: d.Ngay, c: d.GiaDongCua, o: d.GiaMoCua, h: d.GiaCaoNhat, l: d.GiaThapNhat, chg: chg, pct: pct, vol: d.KhoiLuongKhopLenh || 0, val: d.GiaTriKhopLenh || 0 };
  }
  async function fetchSymbol(sym, pages) {
    const out = [], seen = {};
    for (let p = 1; p <= pages; p++) {
      const url = CAFEF + "?Symbol=" + encodeURIComponent(sym) + "&StartDate=01/01/2026&EndDate=" + cafefEndDate() + "&PageIndex=" + p + "&PageSize=20";
      const res = await fetch(url); if (!res.ok) break;
      const js = await res.json(); const wrap = js.Data || {}; const rows = wrap.Data || [];
      if (!rows.length) {
        if (p === 1 && wrap.ClosePriceIndex) {
          out.push({ d: wrap.DateIndex, c: wrap.ClosePriceIndex, o: wrap.ClosePriceIndex, h: wrap.ClosePriceIndex, l: wrap.ClosePriceIndex, chg: wrap.ChgIndex || 0, pct: wrap.PctIndex || 0, vol: 0, val: 0 });
        }
        break;
      }
      rows.forEach((r) => { const row = parseCafeFRow(r); if (row.d && !seen[row.d]) { seen[row.d] = 1; out.push(row); } });
      if (rows.length < 20) break;
    }
    return out;
  }
  async function refreshLive() {
    if (state.refreshing) return; state.refreshing = true;
    $("btnRefresh").disabled = true; $("btnRefresh").textContent = "Dang tai...";
    try {
      const pages = 1;
      const idxKeys = ["VNINDEX", "HNX-INDEX", "UPCOM-INDEX", "VN30INDEX"];
      for (let i = 0; i < idxKeys.length; i++) {
        const k = idxKeys[i], h = await fetchSymbol(k, pages); if (!h.length) continue;
        const storeKey = k === "VN30INDEX" ? "VN30" : k;
        if (!state.data.indices[storeKey]) state.data.indices[storeKey] = { name: storeKey, h: [] };
        state.data.indices[storeKey].h = h;
        render();
      }
      const syms = Object.keys(state.data.stocks);
      for (let i = 0; i < syms.length; i += 8) {
        const slice = syms.slice(i, i + 8);
        await Promise.all(slice.map(async (sym) => { try { const h = await fetchSymbol(sym, pages); if (h.length) state.data.stocks[sym].h = h; } catch (e) {} }));
        render();
      }
      state.live = true; state.data.fetchedAt = new Date().toISOString();
    } catch (e) { console.warn(e); }
    finally { state.refreshing = false; $("btnRefresh").disabled = false; $("btnRefresh").textContent = "Lam moi CafeF"; render(); }
  }
  function bind() {
    document.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => { state.period = btn.getAttribute("data-period"); document.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("active", b === btn)); render(); });
    });
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-view");
        if (v === "stocks") { state.view = "market"; state.industry = null; render(); setTimeout(() => $("stkCard").scrollIntoView({ behavior: "smooth", block: "start" }), 50); return; }
        if (v === "industry" && !state.industry) { state.view = "market"; render(); const box = $("indBody"); if (box) box.closest(".card").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        state.view = v; if (v !== "industry") state.industry = null; render();
      });
    });
    $("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
    $("btnRefresh").addEventListener("click", refreshLive);
    $("indBody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-ind]"); if (!tr) return; state.industry = tr.getAttribute("data-ind"); state.view = "industry"; render(); });
    $("heat").addEventListener("click", (e) => { const tile = e.target.closest("[data-sym]"); if (tile) openStock(tile.getAttribute("data-sym")); });
    function onStockRow(e) { const tr = e.target.closest("tr[data-sym]"); if (tr) openStock(tr.getAttribute("data-sym")); }
    $("stkBody").addEventListener("click", onStockRow);
    const indBodyTbl = $("stkBodyInd"); if (indBodyTbl) indBodyTbl.addEventListener("click", onStockRow);
    $("btnBack").addEventListener("click", () => { state.view = "market"; state.industry = null; render(); });
    $("modalBg").addEventListener("click", (e) => { if (e.target.id === "modalBg" || e.target.id === "modalClose") $("modalBg").classList.remove("show"); });
  }
  function boot() {
    state.data = cloneSnapshot(); bind(); render();
    refreshLive();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
