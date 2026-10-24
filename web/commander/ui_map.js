/* 司令模式 · 地图层（纸质参谋图风格）
 * 负责：投影、底图（Natural Earth 陆海 + Esri 晕渲正片叠底）、六角格、接触线、北约军标兵牌、交战箭头、
 *       视图缩放平移、经纬刻度与比例尺、鼠标交互（左键选择 / 右键下令 / 悬停提示与路线预览）。
 * 与 ui_panels.js / ui_app.js 通过 window.CMD 共享状态。纯 JS，无构建步骤。 */
(function () {
  "use strict";
  var C = window.CMD = window.CMD || {};
  var S = window.MoDSim, DATA = window.MOD_SIM_DATA;
  var NS = "http://www.w3.org/2000/svg";
  C.S = S; C.DATA = DATA;
  C.START = Date.UTC(2020, 8, 27, 0, 0);      // tick 0 = 2020-09-27 00:00（显示为当地时间）
  C.SPEEDS = [0, 0.85, 2.9, 12.5];            // 每真实秒推进的游戏小时

  // ------------------------------------------------------------------ Web Mercator（Z0 = 8）
  var Z0 = 8, WORLD_PX = 256 * Math.pow(2, Z0);
  function lonToX(lon) { return WORLD_PX * (lon + 180) / 360; }
  function latToY(lat) { var s = Math.sin(lat * Math.PI / 180); return WORLD_PX * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)); }
  var X0 = lonToX(46.8), Y0 = latToY(40.1);
  function llToSvg(lat, lon) { return { x: lonToX(lon) - X0, y: latToY(lat) - Y0 }; }
  function svgToLl(x, y) {
    var lon = (x + X0) / WORLD_PX * 360 - 180;
    var n = Math.PI - 2 * Math.PI * (y + Y0) / WORLD_PX;
    return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon];
  }
  var R = 51.8; // 42 km 六角格在 Z8 下约 51.8 单位半径
  C.R = R; C.llToSvg = llToSvg;

  var st = C.st = {
    w: null, opts: null, speed: 0, prevSpeed: 1, acc: 0, last: 0, sel: null, view: { x: 0, y: 0, k: 1 },
    hexEls: [], evSeen: 0, orderLog: [], dirty: true, frontKey: "", lastRender: 0, baseline: null, adCache: null, adTick: -1,
    lmap: null, ltile: null, basemap: "paper", hexOpacity: 0.24, fitAll: false, unitK: -1, hoverHex: null, openFm: {},
  };
  var $ = C.$ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  C.el = el;

  function cxy(h) { return llToSvg(h.lat, h.lon); }
  C.cxy = cxy;
  function hexPts(h, shrink) {
    var c = cxy(h), s = shrink || 1.0;
    if (h.verts && h.verts.length === 6) {
      return h.verts.map(function (v) { var p = llToSvg(v[0], v[1]); return (c.x + (p.x - c.x) * s).toFixed(1) + "," + (c.y + (p.y - c.y) * s).toFixed(1); }).join(" ");
    }
    var pts = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 30); pts.push((c.x + R * s * Math.cos(a)).toFixed(1) + "," + (c.y + R * s * Math.sin(a)).toFixed(1)); }
    return pts.join(" ");
  }
  function hexVtx(h, i) {
    if (h.verts && h.verts[i]) { var p = llToSvg(h.verts[i][0], h.verts[i][1]); return [p.x, p.y]; }
    var c = cxy(h), a = Math.PI / 180 * (60 * i - 30);
    return [c.x + R * Math.cos(a), c.y + R * Math.sin(a)];
  }

  // ------------------------------------------------------------------ 文本工具
  C.fmtTime = function (tick) {
    var d = new Date(C.START + tick * 3600e3), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + " " + p(d.getUTCHours()) + ":00";
  };
  C.shortTime = function (tick) { return "D" + Math.floor(tick / 24) + " " + ((tick % 24) < 10 ? "0" : "") + (tick % 24) + ":00"; };
  C.toast = function (msg, kind) {
    var t = document.createElement("div"); t.className = "toast " + (kind || ""); t.innerHTML = msg; $("toasts").appendChild(t);
    while ($("toasts").children.length > 4) $("toasts").removeChild($("toasts").firstChild);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; }, 2800);
    setTimeout(function () { t.remove(); }, 3200);
  };
  C.TERRAIN_CN = { Mountain: "山地", Forest: "森林", Mixed: "丘陵", Open: "平原", Urban: "城市" };
  C.REGION_CN = { armenia: "亚美尼亚本土", arm_zone: "纳卡及周边七区（1994 实控）", nakhchivan: "纳希切万飞地", aze: "阿塞拜疆本部" };
  C.hexName = function (h) { return h.name_arm || ("地块 " + h.q + "," + h.r); };

  // ------------------------------------------------------------------ Leaflet 底图（晕渲 / 地形 / 卫星）
  var TILE_PROVIDERS = {
    paper: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}", maxNative: 13, attr: "底图：Natural Earth 10m · 地形晕渲 © Esri" },
    topo: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", maxNative: 18, attr: "地形图 © Esri, National Geographic, USGS, NASA" },
    sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxNative: 18, attr: "影像 © Esri, Maxar, Earthstar Geographics" },
  };
  function initLeaflet() {
    var box = $("leaflet-map");
    if (!box || typeof window.L === "undefined" || st.lmap) return;
    st.lmap = window.L.map(box, {
      center: [39.85, 46.75], zoom: Z0, zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.25,
      fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, interactive: false,
    });
    setBasemap(st.basemap);
  }
  function setBasemap(kind) {
    st.basemap = kind;
    var box = $("leaflet-map");
    box.className = "leaflet-underlay bm-" + kind;
    $("map-stage").classList.toggle("bm-sat", kind === "sat");
    var cfg = TILE_PROVIDERS[kind];
    $("map-attrib").textContent = cfg ? cfg.attr : "底图：Natural Earth 10m（离线纸面）";
    if (!st.lmap) return;
    if (st.ltile) { st.lmap.removeLayer(st.ltile); st.ltile = null; }
    syncLeaflet();
    if (cfg) st.ltile = window.L.tileLayer(cfg.url, { maxZoom: 18, maxNativeZoom: cfg.maxNative, minZoom: 4 }).addTo(st.lmap);
  }
  C.setBasemap = setBasemap;
  function syncLeaflet() {
    if (!st.lmap || st.basemap === "none") return;
    var stage = $("map-stage"), W = stage.clientWidth, Hh = stage.clientHeight;
    if (!W || !Hh) return;
    var ll = svgToLl((W / 2 - st.view.x) / st.view.k, (Hh / 2 - st.view.y) / st.view.k);
    st.lmap.setView(ll, Z0 + Math.log(st.view.k) / Math.LN2, { animate: false });
  }

  // ------------------------------------------------------------------ 底图 SVG（陆地 / 海 / 水线 / 经纬网）
  function ringPath(ring) {
    return ring.map(function (pt, i) { var p = llToSvg(pt[0], pt[1]); return (i ? "L" : "M") + p.x.toFixed(1) + "," + p.y.toFixed(1); }).join("") + "Z";
  }
  function ringsPath(rings) { return (rings || []).map(ringPath).join(" "); }
  function buildBasemap() {
    var g = $("bvp"); g.innerHTML = "";
    var gb = DATA.geo_borders || {};
    var a = llToSvg(43.7, 41.0), b = llToSvg(36.9, 52.0);
    el("rect", { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, fill: "#C6D6D4" }, g);
    var allLand = ["russia", "georgia", "turkey", "iran", "armenia", "azerbaijan"].map(function (k) { return ringsPath(gb[k]); }).join(" ");
    // 经典“水线”海岸：多层渐淡蓝线，随后被不透明陆地盖住内侧
    [[15, 0.10], [9, 0.16], [4.5, 0.26]].forEach(function (s) {
      el("path", { d: allLand, fill: "none", stroke: "#4F7F92", "stroke-opacity": s[1], "stroke-width": s[0], "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, g);
    });
    el("path", { d: ["russia", "georgia", "turkey", "iran"].map(function (k) { return ringsPath(gb[k]); }).join(" "), fill: "#E4D9C2" }, g);
    el("path", { d: ringsPath(gb.azerbaijan) + " " + ringsPath(gb.armenia), fill: "#F3ECDB" }, g);
    el("path", { d: allLand, fill: "none", stroke: "rgba(30,28,26,.5)", "stroke-width": 0.8, "vector-effect": "non-scaling-stroke" }, g);
    el("path", { d: ringsPath(gb.sevan), fill: "#C0D3D3", stroke: "#4F7F92", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }, g);
    // 经纬网（每 1°）
    var gr = el("g", { stroke: "rgba(30,28,26,.14)", "stroke-width": 0.7, "vector-effect": "non-scaling-stroke", fill: "none" }, g);
    for (var lon = 41; lon <= 52; lon++) { var p1 = llToSvg(43.7, lon), p2 = llToSvg(36.9, lon); el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, "vector-effect": "non-scaling-stroke" }, gr); }
    for (var lat = 37; lat <= 43; lat++) { var q1 = llToSvg(lat, 41), q2 = llToSvg(lat, 52); el("line", { x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y, "vector-effect": "non-scaling-stroke" }, gr); }
    var sea = llToSvg(40.3, 50.75);
    var t = el("text", { x: sea.x, y: sea.y, "text-anchor": "middle", class: "lbl-sea" }, g); t.textContent = "里 海";
    var t2 = el("text", { x: sea.x, y: sea.y + 16, "text-anchor": "middle", class: "lbl-country-en" }, g); t2.textContent = "MARE CASPIUM";
  }

  // ------------------------------------------------------------------ 主地图 SVG
  C.buildBase = function () {
    var w = st.w, H = w.map.hexes;
    buildBasemap();
    ["lyr-hex", "lyr-overlay", "lyr-geoborders", "lyr-roads", "lyr-front", "lyr-labels", "lyr-eng", "lyr-paths", "lyr-units"].forEach(function (id) { $(id).innerHTML = ""; });
    var oldDefs = $("vp").querySelector("defs"); if (oldDefs) oldDefs.remove();
    var defs = el("defs", {}, $("vp"));
    defs.innerHTML =
      '<pattern id="pt-Mountain" width="22" height="16" patternUnits="userSpaceOnUse"><path d="M3 13 L11 4 L19 13" fill="none" stroke="rgba(90,60,30,.32)" stroke-width="1.2"/></pattern>' +
      '<pattern id="pt-Forest" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="none" stroke="rgba(59,107,54,.4)"/><circle cx="11" cy="11" r="2" fill="none" stroke="rgba(59,107,54,.4)"/></pattern>' +
      '<pattern id="pt-Urban" width="12" height="12" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="4.5" height="4.5" fill="rgba(30,28,26,.22)"/></pattern>' +
      '<pattern id="pt-Mixed" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M2 12 q3 -5 6 0 q3 -5 6 0" fill="none" stroke="rgba(90,60,30,.25)" stroke-width="1"/></pattern>' +
      '<pattern id="pt-lost" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="rgba(179,38,30,.13)"/><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(179,38,30,.55)" stroke-width="2.4"/></pattern>' +
      '<pattern id="pt-gain" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="9" height="9" fill="rgba(31,78,158,.16)"/><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(31,78,158,.55)" stroke-width="2.4"/></pattern>' +
      '<pattern id="pt-cut" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(179,38,30,.18)"/><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(179,38,30,.7)" stroke-width="2"/></pattern>' +
      '<marker id="ar-aze" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0 0L10 5L0 10L2.5 5z" fill="#B3261E"/></marker>' +
      '<marker id="ar-arm" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0 0L10 5L0 10L2.5 5z" fill="#1F4E9E"/></marker>' +
      '<marker id="ar-path" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1E1C1A"/></marker>' +
      '<marker id="ar-prev" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#B7791F"/></marker>' +
      '<marker id="ar-pend" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1F4E9E"/></marker>';
    st.hexEls = [];
    H.forEach(function (h) {
      var p = el("polygon", { points: hexPts(h, 1.0), class: "hx" + (h.region === "arm_zone" ? " zone" : ""), "data-i": h.i }, $("lyr-hex"));
      st.hexEls.push(p);
      if (h.terrain !== "Open") el("polygon", { points: hexPts(h, 0.97), fill: "url(#pt-" + h.terrain + ")", "pointer-events": "none", class: "terr" }, $("lyr-overlay"));
    });

    // 国界、接触线与地名大字
    var gb = DATA.geo_borders, G = $("lyr-geoborders");
    if (gb) {
      var line = function (rings, attrs) { (rings || []).forEach(function (r) { el("path", Object.assign({ d: ringPath(r), fill: "none", "pointer-events": "none", "vector-effect": "non-scaling-stroke" }, attrs), G); }); };
      ["georgia", "turkey", "iran", "russia"].forEach(function (k) { line(gb[k], { stroke: "rgba(30,28,26,.5)", "stroke-width": 1.1, "stroke-dasharray": "7 3 1.5 3" }); });
      line(gb.azerbaijan, { stroke: "rgba(244,238,225,.75)", "stroke-width": 4.5 });
      line(gb.armenia, { stroke: "rgba(244,238,225,.75)", "stroke-width": 4.5 });
      line(gb.azerbaijan, { stroke: "#1E1C1A", "stroke-width": 1.5, "stroke-dasharray": "9 3 2 3" });
      line(gb.armenia, { stroke: "#1E1C1A", "stroke-width": 1.5, "stroke-dasharray": "9 3 2 3" });
      line(gb.nk_oblast, { stroke: "rgba(122,59,18,.6)", "stroke-width": 1.1, "stroke-dasharray": "2 3" });
      line(gb.loc_1994, { stroke: "rgba(244,238,225,.8)", "stroke-width": 4.5 });
      line(gb.loc_1994, { stroke: "#7A3B12", "stroke-width": 2, "stroke-dasharray": "6 3" });
      [
        { lat: 40.42, lon: 44.35, cn: "亚 美 尼 亚", en: "ARMENIA", cls: "lbl-country" },
        { lat: 40.72, lon: 48.3, cn: "阿 塞 拜 疆", en: "AZERBAIJAN", cls: "lbl-country" },
        { lat: 41.62, lon: 44.6, cn: "格 鲁 吉 亚", en: "GEORGIA", cls: "lbl-neighbor" },
        { lat: 39.95, lon: 43.25, cn: "土 耳 其", en: "TURKEY", cls: "lbl-neighbor" },
        { lat: 38.62, lon: 47.1, cn: "伊 朗", en: "IRAN", cls: "lbl-neighbor" },
        { lat: 42.05, lon: 47.2, cn: "俄 罗 斯", en: "RUSSIA", cls: "lbl-neighbor" },
        { lat: 39.3, lon: 45.35, cn: "纳希切万", cls: "lbl-region" },
        { lat: 40.05, lon: 46.55, cn: "纳戈尔诺-卡拉巴赫", cls: "lbl-region" },
      ].forEach(function (m) {
        var p = llToSvg(m.lat, m.lon);
        var t = el("text", { x: p.x, y: p.y, "text-anchor": "middle", class: m.cls }, G); t.textContent = m.cn;
        if (m.en) { var te = el("text", { x: p.x, y: p.y + 15, "text-anchor": "middle", class: "lbl-country-en" }, G); te.textContent = m.en; }
      });
    }

    // 道路：干线双线（M12 拉钦走廊 / M11），其余细线
    var seen = {};
    H.forEach(function (h) {
      Object.keys(h.roadNb).forEach(function (j) {
        j = +j; var k = Math.min(h.i, j) + "-" + Math.max(h.i, j); if (seen[k]) return; seen[k] = 1;
        var a = cxy(h), b = cxy(H[j]);
        var main = (h.roads.indexOf("M12_lachin") >= 0 && H[j].roads.indexOf("M12_lachin") >= 0) || (h.roads.indexOf("M11_vardenis") >= 0 && H[j].roads.indexOf("M11_vardenis") >= 0);
        if (main) {
          el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#7A3B12", "stroke-width": 4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, $("lyr-roads"));
          el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#F0C36A", "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, $("lyr-roads"));
        } else {
          el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "rgba(122,59,18,.55)", "stroke-width": 1.2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, $("lyr-roads"));
        }
      });
    });

    // 地名（按重要度分级显示）
    H.forEach(function (h) {
      if (!h.place) return;
      var c = cxy(h);
      var cls = h.value >= 8 ? "lbl big" : h.value >= 5 ? "lbl" : "lbl minor";
      el("circle", { cx: c.x, cy: c.y + R * 0.36, r: h.value >= 8 ? 2.6 : 1.8, fill: h.value >= 9 ? "#1E1C1A" : "#F4EEE1", stroke: "#1E1C1A", "stroke-width": 1, "vector-effect": "non-scaling-stroke", "pointer-events": "none", class: "town-dot" }, $("lyr-labels"));
      var t = el("text", { x: c.x, y: c.y + R * 0.62, "text-anchor": "middle", class: cls }, $("lyr-labels"));
      t.textContent = (h.value >= 9 ? "★ " : "") + (h.name_arm || h.place);
      if (h.sub_places && h.sub_places.length && h.region === "arm_zone") {
        var ts = el("text", { x: c.x, y: c.y + R * 0.8, "text-anchor": "middle", class: "lbl-sub" }, $("lyr-labels"));
        ts.textContent = h.sub_places.join(" · ");
      }
    });
    st.frontKey = ""; st.unitK = -1;
  };

  function hexFill(h) {
    if (h.owner !== h.owner0) return h.owner === "AZE" ? "url(#pt-lost)" : "url(#pt-gain)";
    var op = st.hexOpacity, a;
    if (h.owner === "ARM") { a = op * (h.region === "arm_zone" ? 1.15 : 0.55); return "rgba(30,85,185," + Math.min(0.8, a).toFixed(3) + ")"; }
    a = op * (h.region === "nakhchivan" ? 0.34 : 0.28);
    return "rgba(179,38,30," + Math.min(0.6, a).toFixed(3) + ")";
  }

  // ------------------------------------------------------------------ 渲染
  C.renderMap = function (force) {
    var w = st.w, H = w.map.hexes, key = "";
    H.forEach(function (h, i) {
      var f = hexFill(h);
      if (st.hexEls[i].__f !== f) { st.hexEls[i].setAttribute("fill", f); st.hexEls[i].__f = f; }
      key += h.owner[1];
    });
    if (key !== st.frontKey || force) { st.frontKey = key; renderFront(); }
    C.renderOverlay();
    renderEngagements();
    C.renderUnits();
    C.renderPaths();
  };

  function renderFront() {
    var w = st.w, H = w.map.hexes, g = $("lyr-front"); g.innerHTML = "";
    var ord = function (r) { return (r & 1) ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]; };
    var key = {}; H.forEach(function (h) { key[h.q + "," + h.r] = h; });
    var halo = "", red = "", dash = "";
    H.forEach(function (h) {
      ord(h.r).forEach(function (d, i) {
        var n = key[(h.q + d[0]) + "," + (h.r + d[1])];
        if (!n || n.i < h.i || n.owner === h.owner) return;
        var a = hexVtx(h, i), b = hexVtx(h, (i + 1) % 6);
        var seg = "M" + a[0].toFixed(1) + "," + a[1].toFixed(1) + "L" + b[0].toFixed(1) + "," + b[1].toFixed(1);
        var contact = h.region === "arm_zone" || n.region === "arm_zone" || h.owner !== h.owner0 || n.owner !== n.owner0;
        if (contact) { halo += seg; red += seg; } else dash += seg;
      });
    });
    if (halo) el("path", { d: halo, stroke: "rgba(244,238,225,.85)", "stroke-width": 7, "stroke-linecap": "round", fill: "none", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
    if (red) el("path", { d: red, stroke: "#B3261E", "stroke-width": 3.2, "stroke-linecap": "round", fill: "none", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
    if (dash) el("path", { d: dash, stroke: "rgba(30,28,26,.55)", "stroke-width": 1.3, "stroke-dasharray": "5 4", fill: "none", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
  }

  C.renderOverlay = function () {
    var w = st.w, H = w.map.hexes;
    var showTerr = $("lyr-terrain").checked;
    document.querySelectorAll(".terr").forEach(function (t) { t.style.display = showTerr ? "" : "none"; });
    $("lyr-geoborders").style.display = $("lyr-borders").checked ? "" : "none";
    $("lyr-labels").style.display = $("lyr-labels-t").checked ? "" : "none";
    $("lyr-roads").style.display = $("lyr-roads-t").checked ? "" : "none";
    var showSup = $("lyr-supply").checked, showAd = $("lyr-ad").checked;
    if (showAd && (st.adTick < 0 || w.tick - st.adTick >= 3)) { st.adCache = H.map(function (h) { return h.owner === "ARM" && h.region !== "armenia" ? S.adCoverage(w, h.i) : 0; }); st.adTick = w.tick; }
    var sup = showSup ? S.supplyCosts(w, "ARM") : null;
    H.forEach(function (h, i) {
      var e = st.hexEls[i], f = "";
      if (showAd && st.adCache[i] > 0.05) f = "rgba(31,111,106," + (0.12 + 0.5 * st.adCache[i]).toFixed(2) + ")";
      else if (showSup && h.owner === "ARM") { var c = sup[i]; f = c === undefined ? "url(#pt-cut)" : "rgba(59,107,54," + Math.max(0.08, 0.45 - c / 55).toFixed(2) + ")"; }
      if (e.__o !== f) { e.style.fill = f; e.__o = f; }
    });
  };

  function renderEngagements() {
    var w = st.w, H = w.map.hexes, g = $("lyr-eng"); g.innerHTML = "";
    Object.keys(w.engagements).forEach(function (k) {
      var e = w.engagements[k], t = H[+k], tc = cxy(t);
      if (e.lastTick < w.tick - 2) return;
      var fromSeen = {};
      w.units.forEach(function (u) {
        if (u.posture !== "attack" || u.target !== +k || !S.alive(u)) return;
        if (u.side === "AZE" && !S.visibleToArm(st.w, u)) return;
        if (fromSeen[u.hex]) return; fromSeen[u.hex] = 1;
        var a = cxy(H[u.hex]), dx = tc.x - a.x, dy = tc.y - a.y;
        // 手绘感进攻箭头：轻微弧度
        var sx = a.x + dx * 0.2, sy = a.y + dy * 0.2, ex = a.x + dx * 0.68, ey = a.y + dy * 0.68;
        var mx = (sx + ex) / 2 - dy * 0.08, my = (sy + ey) / 2 + dx * 0.08;
        var col = u.side === "AZE" ? "#B3261E" : "#1F4E9E";
        el("path", { d: "M" + sx.toFixed(1) + "," + sy.toFixed(1) + " Q" + mx.toFixed(1) + "," + my.toFixed(1) + " " + ex.toFixed(1) + "," + ey.toFixed(1), stroke: "rgba(244,238,225,.8)", "stroke-width": 8.5, fill: "none", "stroke-linecap": "round", "pointer-events": "none" }, g);
        el("path", { d: "M" + sx.toFixed(1) + "," + sy.toFixed(1) + " Q" + mx.toFixed(1) + "," + my.toFixed(1) + " " + ex.toFixed(1) + "," + ey.toFixed(1), stroke: col, "stroke-width": 5.5, fill: "none", "stroke-linecap": "round", "marker-end": "url(#ar-" + (u.side === "AZE" ? "aze" : "arm") + ")", "pointer-events": "none", opacity: 0.9 }, g);
      });
      var frac = Math.min(1, e.adv / S.P.FLIP_KM), rr = R * 0.5, cy = tc.y - R * 0.06;
      el("circle", { cx: tc.x, cy: cy, r: rr, fill: "none", stroke: "rgba(30,28,26,.22)", "stroke-width": 3, "pointer-events": "none" }, g);
      if (frac > 0.01) {
        var ang = frac * 2 * Math.PI, x2 = tc.x + rr * Math.sin(ang), y2 = cy - rr * Math.cos(ang);
        el("path", { d: "M" + tc.x + "," + (cy - rr) + " A" + rr + "," + rr + " 0 " + (frac > 0.5 ? 1 : 0) + " 1 " + x2.toFixed(2) + "," + y2.toFixed(2), fill: "none", stroke: e.side === "AZE" ? "#B3261E" : "#1F4E9E", "stroke-width": 3.6, "pointer-events": "none" }, g);
      }
    });
  }

  // ------------------------------------------------------------------ 部队（旅 / 团）汇总
  C.unitStrength = function (u) { var m = 0, M = 0; u.bns.forEach(function (b) { m += b.cls.men; M += b.menMax; }); return M ? m / M : 0; };
  C.shortFmName = function (name) {
    return name
      .replace(/^第 (\d+) 军 亚美尼亚苏式摩步团 #(\d+)$/, "$1军$2摩步团")
      .replace(/^第 (\d+) 军 亚美尼亚筑垒固守步兵团 #(\d+)$/, "$1军$2固守团")
      .replace(/^第 (\d+) 军 阿塞拜疆主力摩步旅 #(\d+)$/, "阿$1军$2摩步旅")
      .replace(/^第 (\d+) 军 阿塞拜疆二线\/轻型摩步旅 #(\d+)$/, "阿$1军$2轻摩旅")
      .replace(/^第 (\d+) 军 直属炮兵与侦察团$/, "$1军炮兵团")
      .replace(/^第 (\d+) 军（(.+?)）$/, "$1军守备旅")
      .replace(/^陆军直属部队 /, "")
      .replace(/方向团$/, "团").replace(/守备团$/, "团").replace(/第 6 防御区团$/, "6团")
      .replace(/^阿尔察赫直属装甲与炮兵旅$/, "中枢装炮旅").replace(/^阿尔察赫防空导弹旅$/, "防空导弹旅")
      .replace(/^阿尔察赫动员预备团$/, "动员预备团").replace(/^亚美尼亚总参动员预备旅$/, "总参预备旅")
      .replace(/^纳希切万独立合成集团军$/, "纳希切万军");
  };
  C.formationById = function (id) { return st.w.formations.filter(function (x) { return x.id === id; })[0]; };
  C.formationState = function (w, f) {
    var units = f.units.map(function (id) { return w.unitById[id]; }).filter(function (u) { return u && S.alive(u) && u.hex >= 0; });
    if (!units.length) return null;
    var vis = f.side === "ARM" || f.garrison || units.some(function (u) { return S.visibleToArm(w, u); });
    if (!vis) return null;
    var man = units.filter(function (u) { return u.role === "maneuver" || u.role === "sof"; });
    var pool = man.length ? man : units;
    var cnt = {}, bestH = pool[0].hex, bestC = 0;
    pool.forEach(function (u) { cnt[u.hex] = (cnt[u.hex] || 0) + 1; if (cnt[u.hex] > bestC) { bestC = cnt[u.hex]; bestH = u.hex; } });
    var men = 0, menMax = 0, tanks = 0, ifv = 0, art = 0, sam = 0, supply = 0, nb = 0, org = 0;
    units.forEach(function (u) {
      org += S.avgOrg(u);
      u.bns.forEach(function (b) {
        men += b.cls.men; menMax += b.menMax; tanks += b.cls.tanks; ifv += b.cls.ifv + b.cls.apc;
        art += b.cls.art + b.cls.sp + b.cls.mrl + b.cls.mrl_lr; sam += b.cls.sam + b.cls.tor + b.cls.samLong;
        supply += b.supply; nb++;
      });
    });
    var kind = "inf";
    if (sam >= 6 && !man.length) kind = "ad";
    else if (art >= 18 && !man.length) kind = "art";
    else if (tanks >= 28) kind = "armor";
    else if (ifv >= 20) kind = "mech";
    var posture = pool.some(function (u) { return u.posture === "attack"; }) ? "attack"
      : pool.some(function (u) { return u.posture === "move"; }) ? "move"
      : pool.every(function (u) { return u.posture === "reserve"; }) ? "reserve" : "defend";
    return {
      f: f, id: f.id, side: f.side, name: f.name, shortName: C.shortFmName(f.name),
      echelon: f.echelon || (/旅/.test(f.name) ? "X" : "III"),
      hex: bestH, units: units, kind: kind, str: menMax ? men / menMax : 0, men: men, menMax: menMax,
      org: org / units.length, supply: nb ? supply / nb : 0, sam: sam,
      posture: posture,
      pend: units.some(function (u) { return S.pendingOrders(w, u.id).length > 0; }),
      noSup: units.some(function (u) { return u.inSupply === false; }),
      ai: units.every(function (u) { return u.control === "ai"; }),
    };
  };

  // 北约 APP-6 军标：友军蓝色矩形、敌军红色菱形；框内兵种符号；上方编制等级
  C.counterMarkup = function (side, kind, echelon, noEch) {
    var fr = side === "ARM";
    var stroke = "#1E1C1A", fill = fr ? "#BFD2EE" : "#F1B9B0", s = 'stroke="' + stroke + '" fill="none" stroke-width="1.1"';
    var out = fr
      ? '<rect class="halo" x="-13.5" y="-9.5" width="27" height="19"/><rect class="frame" x="-11" y="-7" width="22" height="14" fill="' + fill + '" stroke="' + stroke + '"/>'
      : '<path class="halo" d="M0,-13 L13,0 L0,13 L-13,0Z"/><path class="frame" d="M0,-10.5 L10.5,0 L0,10.5 L-10.5,0Z" fill="' + fill + '" stroke="' + stroke + '"/>';
    var ix = fr ? 11 : 5.2, iy = fr ? 7 : 5.2;
    if (kind === "inf" || kind === "mech") out += '<path d="M' + -ix + ',' + -iy + ' L' + ix + ',' + iy + ' M' + ix + ',' + -iy + ' L' + -ix + ',' + iy + '" ' + s + '/>';
    if (kind === "armor" || kind === "mech") out += '<ellipse cx="0" cy="0" rx="' + (fr ? 6.5 : 4.6) + '" ry="' + (fr ? 3.4 : 2.6) + '" ' + s + '/>';
    if (kind === "art") out += '<circle cx="0" cy="0" r="2.4" fill="' + stroke + '"/>';
    if (kind === "ad") out += fr ? '<path d="M-11,1 Q0,-11 11,1" ' + s + '/>' : '<path d="M-6,2 Q0,-7 6,2" ' + s + '/>';
    if (kind === "hq") out += '<text x="0" y="2.6" text-anchor="middle" font-size="7" font-weight="700" fill="' + stroke + '">HQ</text>';
    if (kind === "sof") out += '<text x="0" y="2.6" text-anchor="middle" font-size="7" font-weight="700" fill="' + stroke + '">SF</text>';
    if (!noEch) out += '<text x="0" y="' + (fr ? -8.6 : -12) + '" text-anchor="middle" font-size="5.4" font-weight="800" fill="' + stroke + '" letter-spacing=".6">' + echelon + '</text>';
    return out;
  };

  C.renderUnits = function () {
    var w = st.w, H = w.map.hexes, g = $("lyr-units"); g.innerHTML = "";
    var k = st.view.k, sc = 1.5 * Math.pow(k, -0.55);
    st.unitK = k;
    var byHex = {};
    w.formations.forEach(function (f) { var fs = C.formationState(w, f); if (fs) (byHex[fs.hex] = byHex[fs.hex] || []).push(fs); });
    var selHex = null;
    Object.keys(byHex).forEach(function (hi) {
      var list = byHex[hi], c = cxy(H[+hi]);
      list.sort(function (a, b) { return (a.side === "ARM" ? 0 : 1) - (b.side === "ARM" ? 0 : 1); });
      var selIdx = list.findIndex(function (fs) { return C.isFmSelected(fs.id); });
      if (selIdx >= 0) selHex = +hi;
      if (selIdx > 0) { var s0 = list.splice(selIdx, 1)[0]; list.unshift(s0); }
      var show = list.slice(0, 3);
      show.slice().reverse().forEach(function (fs, ri) {
        var kk = show.length - 1 - ri;
        var ox = (kk - (show.length - 1) * 0.5) * 7.5 * sc, oy = -kk * 4 * sc;
        var sel = C.isFmSelected(fs.id);
        var gg = el("g", { class: "unit" + (sel ? " sel" : ""), transform: "translate(" + (c.x + ox).toFixed(1) + "," + (c.y - 6 + oy).toFixed(1) + ") scale(" + sc.toFixed(3) + ")", "data-f": fs.id }, g);
        gg.innerHTML = C.counterMarkup(fs.side, fs.kind, fs.echelon, kk > 0);
        var s = Math.max(0, Math.min(1, fs.str)), by = fs.side === "ARM" ? 8.2 : 11.4;
        el("rect", { x: -11, y: by, width: 22, height: 2.2, fill: "rgba(30,28,26,.18)" }, gg);
        el("rect", { x: -11, y: by, width: (22 * s).toFixed(1), height: 2.2, fill: s > 0.66 ? "#3B6B36" : s > 0.4 ? "#B7791F" : "#B3261E" }, gg);
        if (kk === 0) { var lbl = el("text", { x: 0, y: by + 8.4, "text-anchor": "middle", class: "unit-lbl" + (sel ? "" : " nonsel") }, gg); lbl.textContent = fs.shortName; }
        if (fs.side === "ARM") {
          var mark = function (x, y, txt, col, fsz) { var t = el("text", { x: x, y: y, "font-size": fsz || 6, fill: col, "font-weight": 800, "pointer-events": "none" }, gg); t.textContent = txt; };
          if (fs.posture === "attack") mark(12.5, -2.5, "▲", "#B3261E");
          else if (fs.posture === "move") mark(12.5, -2.5, "➔", "#1F4E9E", 5.5);
          else if (fs.posture === "reserve") mark(12.5, -2.5, "R", "#1F6F6A");
          if (fs.pend) mark(-18, -1.5, "⏱", "#1F4E9E", 5.6);
          if (fs.noSup) mark(-18, 6, "⚠", "#B3261E", 5.6);
          if (fs.ai && st.opts.player && !fs.f.garrison) mark(12.5, 6, "AI", "#1F6F6A", 4.6);
        }
      });
      if (list.length > 1) {
        var b = el("g", { transform: "translate(" + (c.x + 15 * sc + 6).toFixed(1) + "," + (c.y - 14 * sc - 8).toFixed(1) + ") scale(" + sc.toFixed(3) + ")", "pointer-events": "none" }, g);
        el("circle", { r: 6.2, fill: "#F4EEE1", stroke: "#1E1C1A", "stroke-width": 1 }, b);
        var tb = el("text", { y: 2.4, "text-anchor": "middle", "font-size": 6.6, fill: "#1E1C1A", "font-weight": 800 }, b);
        tb.textContent = list.length;
      }
    });
    if (selHex !== null) el("polygon", { points: hexPts(H[selHex], 0.94), class: "hx-sel" }, g);
  };

  // ------------------------------------------------------------------ 选择
  C.selectedUnits = function () {
    var w = st.w; if (!st.sel || !w) return [];
    if (st.sel.type === "unit") { var u = w.unitById[st.sel.id]; return u && S.alive(u) ? [u] : []; }
    var f = C.formationById(st.sel.id);
    return f ? f.units.map(function (id) { return w.unitById[id]; }).filter(function (u) { return u && S.alive(u); }) : [];
  };
  C.isFmSelected = function (fid) {
    if (!st.sel) return false;
    if (st.sel.type === "formation") return st.sel.id === fid;
    var u = st.w.unitById[st.sel.id];
    return !!(u && u.formation === fid);
  };
  C.select = function (sel, center) {
    st.sel = sel;
    C.renderInspector(); C.renderUnits(); C.renderPaths();
    if (C.drawerOpen && C.drawerOpen() === "oob") C.refreshDrawer(true);
    if (center) { var us = C.selectedUnits(); if (us.length && us[0].hex >= 0) { var c = cxy(st.w.map.hexes[us[0].hex]); C.centerOn(c.x, c.y); } }
  };

  C.renderPaths = function () {
    var w = st.w, H = w.map.hexes, g = $("lyr-paths"); g.innerHTML = "";
    var seenPath = {}, seenPend = {}, units = C.selectedUnits();
    st.previewOk = null;
    units.forEach(function (u) {
      if (u.path && u.path.length) {
        var pk = u.hex + ">" + u.path.join(",");
        if (!seenPath[pk]) {
          seenPath[pk] = 1;
          var pts = [cxy(H[u.hex])].concat(u.path.map(function (i) { return cxy(H[i]); }));
          el("polyline", { points: pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" "), fill: "none", stroke: "#1E1C1A", "stroke-width": 2.4, "stroke-dasharray": "7 4", "marker-end": "url(#ar-path)", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
        }
      }
      S.pendingOrders(w, u.id).forEach(function (o) {
        if (o.order.target === undefined) return;
        var ok = u.hex + "->" + o.order.target; if (seenPend[ok]) return; seenPend[ok] = 1;
        var a = cxy(H[u.hex]), b = cxy(H[o.order.target]);
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#1F4E9E", "stroke-width": 2.4, "stroke-dasharray": "5 4", "marker-end": "url(#ar-pend)", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
        el("circle", { cx: b.x, cy: b.y, r: R * 0.32, fill: "none", stroke: "#1F4E9E", "stroke-width": 2, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
      });
    });
    // 右键目标预览
    if (st.hoverHex !== null && units.length && st.opts && st.opts.player) {
      var u0 = units.filter(function (u) { return u.side === "ARM" && !u.garrison; })[0];
      if (u0 && st.hoverHex !== u0.hex) {
        var tgt = H[st.hoverHex], route = null;
        if (tgt.owner !== "ARM" && w.map.hexes[u0.hex].nb.indexOf(st.hoverHex) >= 0) route = [u0.hex, st.hoverHex];
        else { var p = S.findPath(w, "ARM", u0.hex, st.hoverHex); if (p) route = [u0.hex].concat(p); }
        if (route) {
          var pp = route.map(function (i) { return cxy(H[i]); });
          el("polyline", { points: pp.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" "), fill: "none", stroke: "#B7791F", "stroke-width": 2.6, "stroke-dasharray": "2 5", "stroke-linecap": "round", "marker-end": "url(#ar-prev)", "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, g);
        }
        st.previewOk = !!route;
      }
    }
  };

  // ------------------------------------------------------------------ 命令
  C.logOrder = function (type, target, extra) { st.orderLog.push({ t: st.w.tick, sel: st.sel ? st.sel.type + ":" + st.sel.id : null, type: type, target: target, extra: extra || null }); };
  C.quickOrder = function (kind) {
    var w = st.w; if (!st.sel || !st.opts.player) return;
    var units = C.selectedUnits().filter(function (u) { return !u.garrison && u.side === "ARM"; }); if (!units.length) return;
    if (kind === "cancel") { units.forEach(function (u) { S.cancelOrders(w, u.id); }); C.toast("已取消待生效命令"); C.renderInspector(); C.renderPaths(); return; }
    if (kind === "ai") {
      var allAi = units.every(function (u) { return u.control === "ai"; });
      units.forEach(function (u) { u.control = allAi ? "player" : "ai"; });
      C.toast(allAi ? "已收回指挥权" : "已交给 AI 托管（AI 会固守并调动预备队）", "warn"); C.renderInspector(); C.renderUnits(); C.refreshDrawer(); return;
    }
    var maxD = 0;
    if (st.sel.type === "formation") { var r = S.issueFormationOrder(w, st.sel.id, { type: kind }); maxD = r.delay || 0; }
    else units.forEach(function (u) { var r2 = S.issueOrder(w, u.id, { type: kind }); maxD = Math.max(maxD, r2.delay || 0); });
    C.logOrder(kind, null);
    C.toast((kind === "defend" ? "固守" : "转为预备队") + "：命令将在 " + maxD + " 小时后生效");
    C.renderInspector(); C.renderUnits();
  };
  C.setAd = function (units, k) {
    units.forEach(function (u) { S.issueOrder(st.w, u.id, { type: "ad", ad: k }); });
    C.logOrder("ad", null, k);
  };
  function orderTo(hexI) {
    var w = st.w, units = C.selectedUnits().filter(function (u) { return u.side === "ARM" && !u.garrison; });
    if (!units.length || !st.opts.player) return;
    var h = w.map.hexes[hexI], r;
    if (st.sel.type === "formation") {
      r = S.issueFormationOrder(w, st.sel.id, { type: "move", target: hexI });
      if (!r.ok) { C.toast("该旅没有可用的建制营", "warn"); return; }
    } else {
      var u = units[0], adj = w.map.hexes[u.hex].nb.indexOf(hexI) >= 0;
      if (h.owner !== "ARM" && !adj && !S.findPath(w, "ARM", u.hex, hexI)) { C.toast("无法到达：路径被敌方控制区阻断", "warn"); return; }
      if (h.owner === "ARM" && hexI !== u.hex && !S.findPath(w, "ARM", u.hex, hexI)) { C.toast("无法到达：路径被阻断", "warn"); return; }
      r = S.issueOrder(w, u.id, { type: h.owner !== "ARM" ? "attack" : "move", target: hexI });
    }
    C.logOrder(h.owner !== "ARM" ? "attack" : "move", hexI);
    flashHex(hexI);
    C.toast((h.owner !== "ARM" ? "进攻 " : "机动至 ") + C.hexName(h) + "：" + r.delay + " 小时后生效" + (st.sel.type === "unit" && units[0].kind === "battalion" ? "（越级指挥）" : ""), h.owner !== "ARM" ? "warn" : "");
    C.renderInspector(); C.renderPaths(); C.renderUnits();
  }
  function flashHex(i) { var e = st.hexEls[i]; e.classList.add("target"); setTimeout(function () { e.classList.remove("target"); }, 700); }

  // ------------------------------------------------------------------ 视图
  var stage = $("map-stage"), svg = $("map"), tip = $("tip");
  C.applyView = function () {
    var tr = "translate(" + st.view.x.toFixed(2) + "," + st.view.y.toFixed(2) + ") scale(" + st.view.k.toFixed(4) + ")";
    $("vp").setAttribute("transform", tr); $("bvp").setAttribute("transform", tr);
    var k = st.view.k, fs = Math.pow(k, -0.65).toFixed(4);
    svg.style.setProperty("--fs", fs); $("basemap").style.setProperty("--fs", fs);
    svg.classList.toggle("z-lo", k < 1.25); svg.classList.toggle("z-mid", k >= 1.25 && k < 2.3); svg.classList.toggle("z-hi", k >= 2.3);
    syncLeaflet();
    updateGraticule();
    if (st.w && Math.abs(k - st.unitK) > 1e-4) {
      if (!st.unitRaf) st.unitRaf = requestAnimationFrame(function () { st.unitRaf = 0; C.renderUnits(); });
    }
  };
  function updateGraticule() {
    var box = $("grat-lbls"), W = stage.clientWidth, Hh = stage.clientHeight, html = "";
    for (var lon = 41; lon <= 52; lon++) {
      var x = llToSvg(40, lon).x * st.view.k + st.view.x;
      if (x > 60 && x < W - 60) html += '<div class="grat-lbl lon" style="left:' + x.toFixed(0) + 'px">' + lon + "°E</div>";
    }
    for (var lat = 37; lat <= 43; lat++) {
      var y = llToSvg(lat, 46).y * st.view.k + st.view.y;
      if (y > 40 && y < Hh - 40) html += '<div class="grat-lbl lat" style="top:' + y.toFixed(0) + 'px">' + lat + "°N</div>";
    }
    box.innerHTML = html;
    // 比例尺：Web Mercator 地面分辨率
    var lat0 = svgToLl((W / 2 - st.view.x) / st.view.k, (Hh / 2 - st.view.y) / st.view.k)[0];
    var mpp = 156543.03392 * Math.cos(lat0 * Math.PI / 180) / Math.pow(2, Z0) / st.view.k;
    var nice = [5, 10, 20, 25, 50, 100, 200], km = 50;
    for (var i = 0; i < nice.length; i++) { if (nice[i] * 1000 / mpp >= 70) { km = nice[i]; break; } km = nice[i]; }
    $("sb-bar").style.width = Math.round(km * 1000 / mpp) + "px";
    $("sb-txt").textContent = km + " 公里";
  }
  C.fit = function (all) {
    st.fitAll = !!all;
    var H = st.w.map.hexes.filter(function (h) { return all || h.region === "arm_zone" || h.nb.some(function (j) { return st.w.map.hexes[j].region === "arm_zone"; }); });
    var xs = H.map(function (h) { return cxy(h).x; }), ys = H.map(function (h) { return cxy(h).y; });
    var pad = all ? R * 1.3 : R * 1.05;
    var minX = Math.min.apply(null, xs) - pad, maxX = Math.max.apply(null, xs) + pad, minY = Math.min.apply(null, ys) - pad, maxY = Math.max.apply(null, ys) + pad;
    var W = stage.clientWidth, Hh = stage.clientHeight;
    var k = Math.min(W / (maxX - minX), Hh / (maxY - minY)) * 0.96;
    st.view = { k: k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (Hh - (maxY - minY) * k) / 2 - minY * k };
    C.applyView();
  };
  C.centerOn = function (x, y) {
    var W = stage.clientWidth, Hh = stage.clientHeight;
    st.view.k = Math.max(st.view.k, 1.6);
    st.view.x = W / 2 - x * st.view.k; st.view.y = Hh / 2 - y * st.view.k; C.applyView();
  };
  C.centerHex = function (hi) { if (hi === undefined || hi === null || !st.w) return; var c = cxy(st.w.map.hexes[hi]); C.centerOn(c.x, c.y); flashHex(hi); };
  function zoomAt(f, px, py) {
    var k2 = Math.max(0.45, Math.min(6, st.view.k * f));
    st.view.x = px - (px - st.view.x) * (k2 / st.view.k); st.view.y = py - (py - st.view.y) * (k2 / st.view.k); st.view.k = k2; C.applyView();
  }
  C.zoomAt = zoomAt;

  // ------------------------------------------------------------------ 交互
  stage.addEventListener("wheel", function (e) { e.preventDefault(); var r = stage.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  var drag = null;
  svg.addEventListener("mousedown", function (e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y, moved: false }; });
  window.addEventListener("mousemove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add("dragging"); }
    if (drag.moved) { st.view.x = drag.vx + dx; st.view.y = drag.vy + dy; C.applyView(); }
  });
  function hexFromTarget(t) {
    var ue = t.closest && t.closest(".unit");
    if (ue) { var f = C.formationById(ue.getAttribute("data-f")); var fs = f ? C.formationState(st.w, f) : null; return fs ? fs.hex : null; }
    if (t.classList && t.classList.contains("hx")) return +t.getAttribute("data-i");
    return null;
  }
  window.addEventListener("mouseup", function (e) {
    if (!drag) return;
    var moved = drag.moved; drag = null; stage.classList.remove("dragging");
    if (moved || !st.w) return;
    C.closePops && C.closePops();
    var ue = e.target.closest && e.target.closest(".unit");
    if (ue) {
      var f = C.formationById(ue.getAttribute("data-f")); if (!f) return;
      var fs = C.formationState(st.w, f); if (!fs) return;
      var same = st.w.formations.map(function (x) { return C.formationState(st.w, x); }).filter(function (s) { return s && s.hex === fs.hex; });
      if (st.sel && st.sel.type === "formation" && same.length > 1 && same.some(function (s) { return s.f.id === st.sel.id; })) {
        var idx = same.findIndex(function (s) { return s.f.id === st.sel.id; });
        f = same[(idx + 1) % same.length].f;
      }
      C.select({ type: "formation", id: f.id }, false); return;
    }
    if (e.target.classList && e.target.classList.contains("hx")) C.select(null);
  });
  svg.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var hi = hexFromTarget(e.target);
    if (hi !== null && st.sel) orderTo(hi);
  });
  svg.addEventListener("mousemove", function (e) {
    if (!st.w || (drag && drag.moved)) { tip.classList.remove("show"); return; }
    var hi = hexFromTarget(e.target);
    if (hi !== st.hoverHex) { st.hoverHex = hi; if (st.sel) C.renderPaths(); }
    if (hi === null) { tip.classList.remove("show"); return; }
    var w = st.w, h = w.map.hexes[hi];
    var fmsAt = w.formations.map(function (f) { return C.formationState(w, f); }).filter(function (s) { return s && s.hex === hi; });
    var armFms = fmsAt.filter(function (s) { return s.side === "ARM"; }), azeFms = fmsAt.filter(function (s) { return s.side === "AZE"; });
    var arm = S.unitsAt(w, hi, "ARM"), aze = S.unitsAt(w, hi, "AZE").filter(function (u) { return u.garrison || S.visibleToArm(w, u); });
    var eng = w.engagements[hi];
    var mine = h.owner === "ARM";
    var html = '<div class="tt">' + C.hexName(h) + (h.name_aze && h.name_aze !== h.name_arm ? ' <span class="muted" style="font-size:11px;font-weight:400">/ ' + h.name_aze + "</span>" : "") + "</div>" +
      (h.sub_places && h.sub_places.length ? '<div class="tsub">含：' + h.sub_places.join("、") + "</div>" : "") +
      '<div class="tr"><span>控制</span><span style="color:' + (mine ? "var(--blue)" : "var(--red)") + ';font-weight:600">' + (mine ? "我方" : "敌方") + (h.owner !== h.owner0 ? "（战时易手）" : "") + "</span></div>" +
      '<div class="tr"><span>地形 · 工事</span><span>' + C.TERRAIN_CN[h.terrain] + " · " + h.fort.toFixed(2) + "</span></div>" +
      '<div class="tr"><span>分区</span><span>' + (C.REGION_CN[h.region] || h.region) + "</span></div>" +
      (armFms.length ? '<div class="tr"><span>我方驻军</span><span>' + armFms.map(function (s) { return s.shortName; }).join("、") + "（" + arm.reduce(function (s, u) { return s + S.unitMen(u); }, 0).toLocaleString() + " 人）</span></div>" : "") +
      (azeFms.length ? '<div class="tr"><span>敌军（侦察）</span><span>' + azeFms.map(function (s) { return s.shortName; }).join("、") + "（约 " + aze.length + " 个营）</span></div>" : "") +
      (eng && eng.lastTick >= w.tick - 2 ? '<div class="tr" style="color:var(--red)"><span>交战</span><span>推进 ' + eng.adv.toFixed(1) + " / " + S.P.FLIP_KM + " km · 力量比 " + (eng.lastR || 0).toFixed(2) + "</span></div>" : "");
    var us = C.selectedUnits().filter(function (u) { return u.side === "ARM" && !u.garrison; });
    if (us.length && st.opts.player && hi !== us[0].hex) {
      var d = st.sel.type === "formation" ? S.orderDelayTicks(w, us[0], false, true) : S.orderDelayTicks(w, us[0], false, false);
      html += '<div class="thint">' + (st.previewOk === false ? "⛔ 无法到达：路径被阻断" : "右键：" + (mine ? "机动至此" : "发起进攻") + " · 约 " + d + " 小时后生效") + "</div>";
    }
    tip.innerHTML = html;
    var r = stage.getBoundingClientRect(), x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
    if (x + 300 > r.width) x -= 320; if (y + 200 > r.height) y -= 210;
    tip.style.left = x + "px"; tip.style.top = y + "px"; tip.classList.add("show");
  });
  svg.addEventListener("mouseleave", function () { tip.classList.remove("show"); if (st.hoverHex !== null) { st.hoverHex = null; if (st.w && st.sel) C.renderPaths(); } });

  C.initLeaflet = initLeaflet;
})();
