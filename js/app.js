/* Dòng tiền CK — dashboard ngành / cổ phiếu */
(function () {
  const PERIOD_BARS = { day: 1, week: 5, month: 20, year: 250 };
  const PERIOD_LABEL = {
    day: "Ngày",
    week: "Tuần",
    month: "Tháng",
    year: "Năm",
  };
  const CAFEF_URLS = [
    "https://cafef.vn/du-lieu/Ajax/PageNew/DataHistory/PriceHistory.ashx",
    "https://s.cafef.vn/Ajax/PageNew/DataHistory/PriceHistory.ashx",
  ];
  const CACHE_KEY = "dtck_cache_v4";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function cafefEndDate() {
    const d = new Date();
    return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear();
  }

  const state = {
    period: "day",
    view: "market",
    industry: null,
    query: "",
    data: null,
    live: false,
    refreshing: false,
    charts: {},
  };

  const $ = (id) => document.getElementById(id);

  function cloneSnapshot() {
    const raw = window.DT_SNAPSHOT || { indices: {}, stocks: {} };
    return JSON.parse(JSON.stringify(raw));
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.stocks || !o.indices) return null;
      const vni = (o.indices.VNINDEX && o.indices.VNINDEX.h) || [];
      if (!vni.length) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function hasBars(data) {
    const vni = data && data.indices && data.indices.VNINDEX && data.indices.VNINDEX.h;
    return !!(vni && vni.length);
  }

  function parseDMY(s) {
    if (!s) return 0;
    const p = String(s).split("/");
    if (p.length !== 3) return 0;
    return Date.UTC(+p[2], +p[1] - 1, +p[0]);
  }

  function fmtNum(n, d) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("vi-VN", {
      maximumFractionDigits: d == null ? 2 : d,
      minimumFractionDigits: d == null ? 0 : d,
    });
  }

  function fmtTy(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1000) return fmtNum(n / 1000, 2) + " nghìn tỷ";
    return fmtNum(n, 1) + " tỷ";
  }

  function clsChg(n) {
    if (n > 0.0001) return "up";
    if (n < -0.0001) return "down";
    return "flat";
  }

  function signTxt(n, d) {
    const v = fmtNum(n, d == null ? 2 : d);
    if (n > 0) return "+" + v;
    return v;
  }

  function heatColor(pct) {
    const p = Math.max(-7, Math.min(7, pct || 0));
    if (p >= 0) {
      const t = p / 7;
      const g = Math.round(80 + 100 * t);
      return `rgb(${Math.round(20 + 20 * (1 - t))}, ${g}, ${Math.round(50 + 40 * t)})`;
    }
    const t = Math.abs(p) / 7;
    return `rgb(${Math.round(140 + 90 * t)}, ${Math.round(40 + 20 * (1 - t))}, ${Math.round(55)})`;
  }

  function barsForPeriod() {
    const cap = PERIOD_BARS[state.period] || 1;
    if (state.period === "year") {
      const vni = ((state.data && state.data.indices && state.data.indices.VNINDEX) || {}).h || [];
      return Math.max(vni.length || 0, 1);
    }
    return cap;
  }

  function sliceH(h, n) {
    return (h || []).slice(0, n);
  }

  function periodChange(h, n) {
    const sl = sliceH(h, n);
    if (!sl.length) return 0;
    if (sl.length === 1) return sl[0].pct || 0;
    const newest = sl[0].c;
    const oldest = sl[sl.length - 1].c;
    if (!oldest) return sl[0].pct || 0;
    return ((newest - oldest) / oldest) * 100;
  }

  function periodValue(h, n) {
    return sliceH(h, n).reduce((s, r) => s + (Number(r.val) || 0), 0);
  }

  function periodNet(h, n) {
    return sliceH(h, n).reduce((s, r) => {
      const v = Number(r.val) || 0;
      const p = Number(r.pct) || 0;
      return s + v * (p > 0 ? 1 : p < 0 ? -1 : 0);
    }, 0);
  }

  function periodVol(h, n) {
    return sliceH(h, n).reduce((s, r) => s + (Number(r.vol) || 0), 0);
  }

  function lastSession(h) {
    return (h && h[0]) || null;
  }

  function indexSeries(key) {
    return (state.data.indices[key] && state.data.indices[key].h) || [];
  }

  function computeStocks() {
    const q = state.query.trim().toUpperCase();
    const rows = [];
    const n = barsForPeriod();
    Object.keys(state.data.stocks).forEach((sym) => {
      const rec = state.data.stocks[sym];
      const h = rec.h || [];
      if (!h.length) return;
      if (q && !sym.includes(q) && !(rec.ind || "").toUpperCase().includes(q)) return;
      const last = h[0];
      rows.push({
        sym,
        ind: rec.ind,
        last,
        pct: periodChange(h, n),
        dayPct: last.pct || 0,
        val: periodValue(h, n),
        net: periodNet(h, n),
        vol: periodVol(h, n),
        px: last.c,
        h,
      });
    });
    return rows;
  }

  function computeIndustries(stocks) {
    const map = {};
    stocks.forEach((s) => {
      const k = s.ind || "Khác";
      if (!map[k]) map[k] = { name: k, val: 0, net: 0, up: 0, down: 0, flat: 0, stocks: [] };
      const g = map[k];
      g.val += s.val;
      g.net += s.net;
      g.stocks.push(s);
      if (s.pct > 0.05) g.up += 1;
      else if (s.pct < -0.05) g.down += 1;
      else g.flat += 1;
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

  function latestDate() {
    const h = indexSeries("VNINDEX");
    return h[0] ? h[0].d : "—";
  }

  function renderIndices() {
    const keys = [
      ["VNINDEX", "VN-Index"],
      ["VN30", "VN30"],
      ["HNX-INDEX", "HNX-Index"],
      ["UPCOM-INDEX", "UPCOM"],
    ];
    const n = barsForPeriod();
    $("idxList").innerHTML = keys
      .map(([k, label]) => {
        const h = indexSeries(k);
        const last = lastSession(h);
        const pct = periodChange(h, n);
        const px = last ? last.c : 0;
        const c = clsChg(pct);
        return `<div class="idx-row">
          <div class="idx-name">${label}</div>
          <div class="idx-px">${fmtNum(px, 2)}</div>
          <div class="idx-chg ${c}">${signTxt(pct)}%</div>
        </div>`;
      })
      .join("");
  }

  function renderKpis(stocks, inds) {
    const vni = indexSeries("VNINDEX");
    const n = barsForPeriod();
    const pct = periodChange(vni, n);
    const last = lastSession(vni);
    const px = last && last.c;
    const when = "phiên " + (last ? last.d : "—");
    const br = breadth(stocks);
    const totalVal = stocks.reduce((s, x) => s + x.val, 0);
    const net = stocks.reduce((s, x) => s + x.net, 0);
    const top = inds[0];

    $("kpis").innerHTML = `
      <div class="kpi">
        <div class="lab">VN-Index · ${PERIOD_LABEL[state.period]}</div>
        <div class="val ${clsChg(pct)}">${fmtNum(px, 2)}</div>
        <div class="sub ${clsChg(pct)}">${signTxt(pct)}% · ${when}</div>
      </div>
      <div class="kpi">
        <div class="lab">Giá trị giao dịch (VN100 · ${stocks.length} mã)</div>
        <div class="val">${fmtTy(totalVal)}</div>
        <div class="sub">Tổng GTGD trong kỳ đang chọn</div>
      </div>
      <div class="kpi">
        <div class="lab">Dòng tiền ròng (GT tăng − GT giảm)</div>
        <div class="val ${clsChg(net)}">${net >= 0 ? "+" : ""}${fmtTy(net)}</div>
        <div class="sub">Phân bổ theo chiều giá các mã</div>
      </div>
      <div class="kpi">
        <div class="lab">Ngành dẫn dòng</div>
        <div class="val" style="font-size:18px">${top ? top.name : "—"}</div>
        <div class="sub ${top ? clsChg(top.pct) : ""}">${top ? fmtTy(top.val) + " · " + signTxt(top.pct) + "%" : ""}</div>
      </div>`;

    $("kpiBreadth").innerHTML = `
      <span class="up">Tăng ${br.up}</span>
      <span class="down">Giảm ${br.down}</span>
      <span class="flat">Đứng ${br.flat}</span>`;
  }

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      state.charts[id] = null;
    }
  }

  function renderFlowCharts(stocks) {
    const br = breadth(stocks);
    destroyChart("pie");
    destroyChart("bars");
    const pieCtx = $("pieChart");
    const barCtx = $("barChart");
    if (!pieCtx || !window.Chart) return;

    state.charts.pie = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Tăng", "Giảm", "Không đổi"],
        datasets: [{
          data: [br.up, br.down, br.flat],
          backgroundColor: ["#3dd68c", "#f6465d", "#c9a227"],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { labels: { color: "#c5d0dc", boxWidth: 12 } } },
        cutout: "58%",
      },
    });

    state.charts.bars = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: ["Tăng", "Giảm", "Không đổi"],
        datasets: [{
          label: "Tỷ đồng",
          data: [br.valUp, br.valDown, br.valFlat],
          backgroundColor: ["#3dd68c", "#f6465d", "#c9a227"],
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } },
          y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } },
        },
      },
    });
  }

  function renderIndexChart() {
    const h = sliceH(indexSeries("VNINDEX"), Math.max(barsForPeriod(), 20)).slice().reverse();
    destroyChart("vni");
    const ctx = $("vniChart");
    if (!ctx || !window.Chart) return;
    state.charts.vni = new Chart(ctx, {
      type: "line",
      data: {
        labels: h.map((r) => r.d.slice(0, 5)),
        datasets: [{
          label: "VN-Index",
          data: h.map((r) => r.c),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96,165,250,.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8b98a8", maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } },
        },
      },
    });
  }

  function renderIndustryTable(inds) {
    const maxVal = Math.max(...inds.map((i) => i.val), 1);
    $("indBody").innerHTML = inds
      .map((g) => {
        const w = Math.max(6, (g.val / maxVal) * 100);
        const active = state.industry === g.name ? "active" : "";
        return `<tr class="${active}" data-ind="${g.name}">
          <td><strong>${g.name}</strong><div class="hint">${g.stocks.length} mã</div></td>
          <td class="num ${clsChg(g.pct)}">${signTxt(g.pct)}%</td>
          <td class="num">${fmtNum(g.val, 0)}</td>
          <td class="num ${clsChg(g.net)}">${signTxt(g.net, 0)}</td>
          <td class="bar-cell"><div class="mini-bar"><span style="width:${w}%;background:${g.pct >= 0 ? "#3dd68c" : "#f6465d"}"></span></div></td>
        </tr>`;
      })
      .join("");
  }

  function renderHeat(inds) {
    $("heat").innerHTML = inds
      .map((g) => {
        const tiles = g.stocks
          .slice()
          .sort((a, b) => b.val - a.val)
          .map((s) => {
            const flex = Math.max(0.7, Math.min(2.4, Math.sqrt(Math.max(s.val, 1)) / 8));
            return `<div class="tile" data-sym="${s.sym}" style="background:${heatColor(s.pct)};flex:${flex}">
              <div class="t-sym">${s.sym}</div>
              <div class="t-pct">${signTxt(s.pct)}%</div>
              <div class="t-val">${fmtNum(s.val, 0)} tỷ</div>
            </div>`;
          })
          .join("");
        return `<div class="heat-sec">
          <h4><span>${g.name}</span><span class="${clsChg(g.pct)}">${signTxt(g.pct)}%</span></h4>
          <div class="tiles">${tiles}</div>
        </div>`;
      })
      .join("");
  }

  function renderStockTable(stocks, targetId) {
    const sorted = stocks.slice().sort((a, b) => b.val - a.val);
    const el = $(targetId || "stkBody");
    if (!el) return;
    el.innerHTML = sorted
      .map((s) => `<tr data-sym="${s.sym}">
        <td><strong>${s.sym}</strong></td>
        <td>${s.ind}</td>
        <td class="num">${fmtNum(s.px, 2)}</td>
        <td class="num ${clsChg(s.pct)}">${signTxt(s.pct)}%</td>
        <td class="num">${fmtNum(s.val, 1)}</td>
        <td class="num ${clsChg(s.net)}">${signTxt(s.net, 1)}</td>
      </tr>`)
      .join("");
  }

  function renderIndustryView(inds) {
    const g = inds.find((x) => x.name === state.industry);
    if (!g) {
      state.view = "market";
      state.industry = null;
      return render();
    }
    $("viewMarket").style.display = "none";
    $("viewIndustry").style.display = "block";
    $("indTitle").textContent = g.name;
    $("indMeta").innerHTML = `
      ${g.stocks.length} mã · GTGD ${fmtTy(g.val)} ·
      <span class="${clsChg(g.pct)}">${signTxt(g.pct)}%</span> ·
      ròng <span class="${clsChg(g.net)}">${signTxt(g.net, 1)} tỷ</span>`;
    renderStockTable(g.stocks, "stkBodyInd");
    const cap = $("stkCaptionInd");
    if (cap) cap.textContent = "Cổ phiếu trong ngành " + g.name;

    destroyChart("indFlow");
    const ctx = $("indFlowChart");
    if (ctx && window.Chart) {
      const top = g.stocks.slice().sort((a, b) => b.val - a.val).slice(0, 12);
      state.charts.indFlow = new Chart(ctx, {
        type: "bar",
        data: {
          labels: top.map((s) => s.sym),
          datasets: [{
            label: "GTGD (tỷ)",
            data: top.map((s) => s.val),
            backgroundColor: top.map((s) => (s.pct >= 0 ? "#3dd68c" : "#f6465d")),
          }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#8b98a8" }, grid: { display: false } },
            y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } },
          },
        },
      });
    }
  }

  function renderMarket(inds, stocks) {
    $("viewMarket").style.display = "block";
    $("viewIndustry").style.display = "none";
    renderFlowCharts(stocks);
    renderIndexChart();
    renderIndustryTable(inds);
    renderHeat(inds);
    renderStockTable(stocks);
    $("stkCaption").textContent = "Top cổ phiếu theo giá trị giao dịch · " + PERIOD_LABEL[state.period];
  }

  function renderStatus() {
    const at = ((state.data && state.data.fetchedAt) || "").slice(0, 16).replace("T", " ");
    const src = state.refreshing
      ? "Đang kéo CafeF…"
      : state.live
        ? "CafeF live · " + at
        : "CafeF snapshot · chốt " + latestDate();
    $("statusText").textContent = src + (state.refreshing ? "" : " · " + latestDate());
    $("statusDot").className = "dot" + (state.live ? "" : " warn");
    $("periodLabel").textContent = PERIOD_LABEL[state.period];
  }

  function render() {
    if (!state.data) return;
    const stocks = computeStocks();
    const inds = state.query ? computeIndustries(computeStocksRaw()) : computeIndustries(stocks);
    renderIndices();
    renderKpis(computeStocksRaw(), inds);
    renderStatus();
    if (state.view === "industry" && state.industry) renderIndustryView(inds);
    else renderMarket(inds, stocks);
  }

  function computeStocksRaw() {
    const q = state.query;
    state.query = "";
    const rows = computeStocks();
    state.query = q;
    return rows;
  }

  function openStock(sym) {
    const rec = state.data.stocks[sym];
    if (!rec) return;
    const n = barsForPeriod();
    const h = rec.h || [];
    const last = h[0] || {};
    const pct = periodChange(h, n);
    const val = periodValue(h, n);
    const net = periodNet(h, n);
    const vol = periodVol(h, n);
    const px = last.c;
    $("modalBg").classList.add("show");
    $("modalTitle").textContent = sym + " · " + rec.ind;
    $("modalKv").innerHTML = `
      <div><div class="k">Giá</div><strong>${fmtNum(px, 2)}</strong></div>
      <div><div class="k">% kỳ ${PERIOD_LABEL[state.period]}</div><strong class="${clsChg(pct)}">${signTxt(pct)}%</strong></div>
      <div><div class="k">GTGD kỳ</div><strong>${fmtTy(val)}</strong></div>
      <div><div class="k">Dòng tiền ròng</div><strong class="${clsChg(net)}">${fmtTy(net)}</strong></div>
      <div><div class="k">Cao / Thấp phiên gần nhất</div><strong>${fmtNum(last.h, 2)} / ${fmtNum(last.l, 2)}</strong></div>
      <div><div class="k">Khối lượng kỳ</div><strong>${fmtNum(vol, 0)}</strong></div>`;
    destroyChart("modal");
    const ctx = $("modalChart");
    const series = sliceH(h, 20).slice().reverse();
    if (ctx && window.Chart) {
      state.charts.modal = new Chart(ctx, {
        type: "line",
        data: {
          labels: series.map((r) => r.d.slice(0, 5)),
          datasets: [{
            data: series.map((r) => r.c),
            borderColor: periodChange(h, n) >= 0 ? "#3dd68c" : "#f6465d",
            backgroundColor: "transparent",
            tension: 0.25, pointRadius: 0, borderWidth: 2,
          }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#8b98a8", maxTicksLimit: 6 }, grid: { display: false } },
            y: { ticks: { color: "#8b98a8" }, grid: { color: "#243042" } },
          },
        },
      });
    }
  }

  function numVN(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    return parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) || 0;
  }

  function parseCafeFRow(d) {
    const raw = String(d.ThayDoi || "");
    let chg = 0, pct = 0;
    const s = raw.replace(/\s/g, "").replace("%", "").replace(")", "");
    try {
      if (s.includes("(")) {
        const a = s.split("(");
        chg = parseFloat(a[0].replace("+", "").replace(",", ".")) || 0;
        pct = parseFloat(a[1].replace("+", "").replace(",", ".")) || 0;
      }
    } catch (e) {}
    return {
      d: d.Ngay,
      c: numVN(d.GiaDongCua),
      o: numVN(d.GiaMoCua),
      h: numVN(d.GiaCaoNhat),
      l: numVN(d.GiaThapNhat),
      chg, pct,
      vol: numVN(d.KhoiLuongKhopLenh),
      val: numVN(d.GiaTriKhopLenh),
    };
  }

  async function fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchSymbol(sym, pages) {
    const out = [];
    const seen = new Set();
    const end = cafefEndDate();
    for (let p = 1; p <= pages; p++) {
      let js = null;
      for (const base of CAFEF_URLS) {
        const url = `${base}?Symbol=${encodeURIComponent(sym)}&StartDate=01/01/2026&EndDate=${end}&PageIndex=${p}&PageSize=20`;
        try {
          js = await fetchJson(url);
          if (js) break;
        } catch (e) {}
      }
      if (!js) break;
      const wrap = js.Data || {};
      const rows = wrap.Data || [];
      if (!rows.length) {
        if (p === 1 && wrap.ClosePriceIndex) {
          out.push({
            d: wrap.DateIndex,
            c: wrap.ClosePriceIndex,
            o: wrap.ClosePriceIndex,
            h: wrap.ClosePriceIndex,
            l: wrap.ClosePriceIndex,
            chg: wrap.ChgIndex || 0,
            pct: wrap.PctIndex || 0,
            vol: 0,
            val: numVN(wrap.TradingReport && wrap.TradingReport.giaTriKhopLenh),
          });
        }
        break;
      }
      rows.forEach((r) => {
        const row = parseCafeFRow(r);
        if (row.d && !seen.has(row.d)) {
          seen.add(row.d);
          out.push(row);
        }
      });
      if (rows.length < 20) break;
    }
    return out;
  }

  async function refreshLive() {
    if (state.refreshing) return;
    state.refreshing = true;
    $("btnRefresh").disabled = true;
    $("btnRefresh").textContent = "Đang tải CafeF…";
    renderStatus();
    let ok = 0;
    try {
      const pages = state.period === "year" ? 10 : 2;
      const idxKeys = ["VNINDEX", "HNX-INDEX", "UPCOM-INDEX", "VN30INDEX"];
      for (const k of idxKeys) {
        const h = await fetchSymbol(k, pages);
        if (!h.length) continue;
        const storeKey = k === "VN30INDEX" ? "VN30" : k;
        if (!state.data.indices[storeKey]) state.data.indices[storeKey] = { name: storeKey, h: [] };
        state.data.indices[storeKey].h = h;
        ok += 1;
      }
      const syms = Object.keys(state.data.stocks);
      const batch = 4;
      for (let i = 0; i < syms.length; i += batch) {
        const slice = syms.slice(i, i + batch);
        $("btnRefresh").textContent = "CafeF " + Math.min(i + batch, syms.length) + "/" + syms.length;
        await Promise.all(
          slice.map(async (sym) => {
            try {
              const h = await fetchSymbol(sym, pages);
              if (h.length) {
                state.data.stocks[sym].h = h;
                ok += 1;
              }
            } catch (e) {}
          })
        );
        render();
      }
      if (ok > 0) {
        state.live = true;
        state.data.fetchedAt = new Date().toISOString();
        state.data.source = "CafeF";
        saveCache(state.data);
      } else {
        throw new Error("CafeF không trả phiên nào");
      }
    } catch (e) {
      console.warn(e);
    } finally {
      state.refreshing = false;
      $("btnRefresh").disabled = false;
      $("btnRefresh").textContent = "Làm mới CafeF";
      render();
    }
  }

  function bind() {
    document.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.period = btn.getAttribute("data-period");
        document.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("active", b === btn));
        render();
      });
    });
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-view");
        if (v === "stocks") {
          state.view = "market";
          state.industry = null;
          document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === "stocks"));
          render();
          setTimeout(() => $("stkCard").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          return;
        }
        if (v === "industry" && !state.industry) {
          state.view = "market";
          document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
          render();
          const box = $("indBody");
          if (box) box.closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        state.view = v;
        if (v !== "industry") state.industry = null;
        document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
        render();
      });
    });
    $("search").addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });
    $("btnRefresh").addEventListener("click", refreshLive);
    $("indBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-ind]");
      if (!tr) return;
      state.industry = tr.getAttribute("data-ind");
      state.view = "industry";
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === "industry"));
      render();
    });
    $("heat").addEventListener("click", (e) => {
      const tile = e.target.closest("[data-sym]");
      if (tile) openStock(tile.getAttribute("data-sym"));
    });
    function onStockRow(e) {
      const tr = e.target.closest("tr[data-sym]");
      if (tr) openStock(tr.getAttribute("data-sym"));
    }
    $("stkBody").addEventListener("click", onStockRow);
    const indBodyTbl = $("stkBodyInd");
    if (indBodyTbl) indBodyTbl.addEventListener("click", onStockRow);
    $("btnBack").addEventListener("click", () => {
      state.view = "market";
      state.industry = null;
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === "market"));
      render();
    });
    $("modalBg").addEventListener("click", (e) => {
      if (e.target.id === "modalBg" || e.target.id === "modalClose") $("modalBg").classList.remove("show");
    });
  }

  function boot() {
    state.data = loadCache() || cloneSnapshot();
    bind();
    render();
    refreshLive();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
