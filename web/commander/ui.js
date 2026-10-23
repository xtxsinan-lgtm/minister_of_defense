/* Commander-mode UI for MoDSim (P2). Plain JS, no build step. */
(function () {
  "use strict";
  var S = window.MoDSim, DATA = window.MOD_SIM_DATA;
  var NS = "http://www.w3.org/2000/svg";
  var R = 14, HW = Math.sqrt(3) * R, DY = 1.5 * R;
  var START = Date.UTC(2020, 8, 27, 0, 0); // tick 0 = 2020-09-27 00:00 local (UTC+4 shown as local)
  var SPEEDS = [0, 0.85, 2.9, 12.5];       // game hours per real second

  var st = {
    w: null, opts: null, speed: 0, acc: 0, last: 0, sel: null, view: { x: 0, y: 0, k: 1 },
    hexEls: [], evSeen: 0, orderLog: [], dirty: true, frontKey: "", lastRender: 0, baseline: null, adCache: null, adTick: -1,
  };
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function cxy(h) { return { x: h.q * HW + (h.r & 1 ? HW / 2 : 0), y: h.r * DY }; }
  function hexPts(c, rr) {
    var p = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 30); p.push((c.x + rr * Math.cos(a)).toFixed(1) + "," + (c.y + rr * Math.sin(a)).toFixed(1)); }
    return p.join(" ");
  }
  function fmtTime(tick) {
    var d = new Date(START + tick * 3600e3);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + " " + p(d.getUTCHours()) + ":00";
  }
  function shortTime(tick) { return "D" + Math.floor(tick / 24) + " " + ((tick % 24) < 10 ? "0" : "") + (tick % 24) + ":00"; }
  function toast(msg, kind) {
    var t = document.createElement("div"); t.className = "toast " + (kind || ""); t.innerHTML = msg; $("toasts").appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; }, 2800);
    setTimeout(function () { t.remove(); }, 3200);
  }

  // ------------------------------------------------------------------ start
  function segValue(id) { var b = $(id).querySelector("button.on"); return b ? b.getAttribute("data-v") : null; }
  document.querySelectorAll(".seg").forEach(function (seg) {
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !seg.contains(b)) return;
      if (seg.id && seg.id.indexOf("opt-") === 0) { seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); }
    });
  });

  function buildOpts() {
    var tier = segValue("opt-tier"), force = segValue("opt-force"), who = segValue("opt-ai");
    var o = { seed: (Date.now() % 100000) + 7, aiTier: tier, convoy: "continuous", player: who === "player", armAi: "competent", armAdPosture: "active" };
    if (force === "improved") { o.inventoryDelta = { ARM: { tor: 16, sam_medium: 12, atgm_heavy: 120 } }; o.fortBonus = 0.15; }
    o.force = force; o.mode = who;
    return o;
  }

  function startGame(opts) {
    st.opts = opts;
    st.w = S.createWorld(DATA, opts);
    st.sel = null; st.evSeen = 0; st.orderLog = []; st.baseline = null; st.frontKey = "";
    $("hud-convoy").value = st.w.armConvoy;
    buildBase();
    fit();
    renderAll(true);
    renderOOB();
    renderSel();
    $("feed").innerHTML = "";
    pushFeed({ t: 0, level: "crit", msg: "阿塞拜疆军队沿接触线全线发起进攻。无人机与巡飞弹正扑向我防空阵地。" });
    setSpeed(opts.mode === "spectate" ? 2 : 0);
    if (opts.mode !== "spectate") toast("游戏已暂停。先检查部署，按空格开始。", "warn");
  }

  // ------------------------------------------------------------------ base map
  function buildBase() {
    var w = st.w, H = w.map.hexes;
    ["lyr-hex", "lyr-overlay", "lyr-roads", "lyr-front", "lyr-labels", "lyr-eng", "lyr-paths", "lyr-units"].forEach(function (id) { $(id).innerHTML = ""; });
    var defs = el("defs", {}, $("vp"));
    defs.innerHTML =
      '<pattern id="pt-Mountain" width="9" height="7" patternUnits="userSpaceOnUse"><path d="M1 6 L4 2 L7 6" fill="none" stroke="rgba(255,255,255,.13)" stroke-width=".8"/></pattern>' +
      '<pattern id="pt-Forest" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".9" fill="rgba(120,220,140,.18)"/><circle cx="4.5" cy="4.5" r=".9" fill="rgba(120,220,140,.18)"/></pattern>' +
      '<pattern id="pt-Urban" width="5" height="5" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="2" height="2" fill="rgba(255,255,255,.14)"/></pattern>' +
      '<pattern id="pt-Mixed" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L8 0" stroke="rgba(255,255,255,.05)" stroke-width=".8"/></pattern>' +
      '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<marker id="ar-aze" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff6a4d"/></marker>' +
      '<marker id="ar-arm" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffb066"/></marker>' +
      '<marker id="ar-path" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker>';
    st.hexEls = [];
    H.forEach(function (h) {
      var c = cxy(h);
      var p = el("polygon", { points: hexPts(c, R), class: "hx", "data-i": h.i }, $("lyr-hex"));
      st.hexEls.push(p);
      if (h.terrain !== "Open") el("polygon", { points: hexPts(c, R - 0.5), fill: "url(#pt-" + h.terrain + ")", "pointer-events": "none", class: "terr" }, $("lyr-overlay"));
    });
    // roads
    var seen = {};
    H.forEach(function (h) {
      Object.keys(h.roadNb).forEach(function (j) {
        j = +j; var k = Math.min(h.i, j) + "-" + Math.max(h.i, j); if (seen[k]) return; seen[k] = 1;
        var a = cxy(h), b = cxy(H[j]);
        var main = h.roads.indexOf("M12_lachin") >= 0 && H[j].roads.indexOf("M12_lachin") >= 0;
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: main ? "#f2c66d" : "#c9b98a", "stroke-width": main ? 1.3 : 0.7, "stroke-opacity": main ? 0.6 : 0.32, "stroke-linecap": "round", "pointer-events": "none" }, $("lyr-roads"));
      });
    });
    // labels
    H.forEach(function (h) {
      if (!h.place) return;
      var c = cxy(h);
      var t = el("text", { x: c.x, y: c.y + R * 0.78, "text-anchor": "middle", class: "lbl" + (h.value >= 9 ? " big" : "") }, $("lyr-labels"));
      t.textContent = (h.value >= 9 ? "★ " : "") + (h.name_arm || h.place);
    });
    // armenia / AZE border hint: region outline handled by fill tint
  }

  function hexFill(h) {
    var lost = h.owner !== h.owner0;
    var base = lost ? [240, 96, 77] : h.owner === "ARM" ? [224, 129, 47] : [58, 155, 224];
    var a = { Mountain: 0.36, Forest: 0.3, Mixed: 0.25, Open: 0.2, Urban: 0.42 }[h.terrain];
    if (h.region === "armenia") a *= 0.55;
    if (h.region === "aze" && h.owner === "AZE") a *= 0.8;
    return "rgba(" + base.join(",") + "," + a.toFixed(2) + ")";
  }

  // ------------------------------------------------------------------ render
  function renderAll(force) {
    var w = st.w, H = w.map.hexes;
    // ownership fill
    var key = "";
    H.forEach(function (h, i) { var f = hexFill(h); if (st.hexEls[i].__f !== f) { st.hexEls[i].setAttribute("fill", f); st.hexEls[i].__f = f; } key += h.owner[1]; });
    if (key !== st.frontKey || force) { st.frontKey = key; renderFront(); }
    renderOverlay();
    renderEngagements();
    renderUnits();
    renderPaths();
    renderHUD();
  }

  function renderFront() {
    var w = st.w, H = w.map.hexes, g = $("lyr-front"); g.innerHTML = "";
    var vtx = function (c, i) { var a = Math.PI / 180 * (60 * i - 30); return [c.x + R * Math.cos(a), c.y + R * Math.sin(a)]; };
    var ord = function (r) { return (r & 1) ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]; };
    var key = {}; H.forEach(function (h) { key[h.q + "," + h.r] = h; });
    H.forEach(function (h) {
      var c = cxy(h);
      ord(h.r).forEach(function (d, i) {
        var n = key[(h.q + d[0]) + "," + (h.r + d[1])];
        if (!n || n.i < h.i) return;
        var a = vtx(c, i), b = vtx(c, (i + 1) % 6);
        if (n.owner !== h.owner) {
          var contact = h.region === "arm_zone" || n.region === "arm_zone" || h.owner !== h.owner0 || n.owner !== n.owner0;
          el("line", contact
            ? { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#ff6a4d", "stroke-width": 1.8, "stroke-linecap": "round", filter: "url(#glow)", "pointer-events": "none" }
            : { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "rgba(233,241,251,.35)", "stroke-width": 0.9, "stroke-dasharray": "3,2", "pointer-events": "none" }, g);
        } else if ((h.region === "armenia") !== (n.region === "armenia")) {
          el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "rgba(233,241,251,.25)", "stroke-width": 0.7, "stroke-dasharray": "2,2", "pointer-events": "none" }, g);
        }
      });
    });
  }

  function renderOverlay() {
    var w = st.w, H = w.map.hexes;
    document.querySelectorAll(".terr").forEach(function (t) { t.style.display = $("lyr-terrain").checked ? "" : "none"; });
    var showSup = $("lyr-supply").checked, showAd = $("lyr-ad").checked;
    if (showAd && (st.adTick < 0 || w.tick - st.adTick >= 3)) { st.adCache = H.map(function (h) { return h.owner === "ARM" && h.region !== "armenia" ? S.adCoverage(w, h.i) : 0; }); st.adTick = w.tick; }
    var sup = showSup ? S.supplyCosts(w, "ARM") : null;
    H.forEach(function (h, i) {
      var e = st.hexEls[i], stroke = null;
      if (showAd && st.adCache[i] > 0.05) { e.style.fill = "rgba(60,200,228," + (0.08 + 0.55 * st.adCache[i]).toFixed(2) + ")"; }
      else if (showSup && h.owner === "ARM") { var c = sup[i]; e.style.fill = c === undefined ? "rgba(240,96,77,.55)" : "rgba(61,220,132," + Math.max(0.05, 0.45 - c / 50).toFixed(2) + ")"; }
      else e.style.fill = "";
      if (stroke) e.setAttribute("stroke", stroke);
    });
  }

  function renderEngagements() {
    var w = st.w, H = w.map.hexes, g = $("lyr-eng"); g.innerHTML = "";
    Object.keys(w.engagements).forEach(function (k) {
      var e = w.engagements[k], t = H[+k], tc = cxy(t);
      if (e.lastTick < w.tick - 2) return;
      var atts = w.units.filter(function (u) { return u.posture === "attack" && u.target === +k && S.alive(u); });
      var fromSeen = {};
      atts.forEach(function (u) {
        if (u.side === "AZE" && !S.visibleToArm(st.w, u)) return;
        if (fromSeen[u.hex]) return; fromSeen[u.hex] = 1;
        var a = cxy(H[u.hex]), dx = tc.x - a.x, dy = tc.y - a.y;
        el("line", { x1: a.x + dx * 0.25, y1: a.y + dy * 0.25, x2: a.x + dx * 0.7, y2: a.y + dy * 0.7, stroke: u.side === "AZE" ? "#ff6a4d" : "#ffb066", "stroke-width": 2.4, "marker-end": "url(#ar-" + (u.side === "AZE" ? "aze" : "arm") + ")", "pointer-events": "none", opacity: 0.95 }, g);
      });
      var frac = Math.min(1, e.adv / S.P.FLIP_KM);
      var ang = frac * 2 * Math.PI, rr = R * 0.55;
      el("circle", { cx: tc.x, cy: tc.y - R * 0.05, r: rr, fill: "none", stroke: "rgba(255,255,255,.12)", "stroke-width": 2, "pointer-events": "none" }, g);
      if (frac > 0.01) {
        var x2 = tc.x + rr * Math.sin(ang), y2 = tc.y - R * 0.05 - rr * Math.cos(ang);
        el("path", { d: "M" + tc.x + "," + (tc.y - R * 0.05 - rr) + " A" + rr + "," + rr + " 0 " + (frac > 0.5 ? 1 : 0) + " 1 " + x2.toFixed(2) + "," + y2.toFixed(2), fill: "none", stroke: e.side === "AZE" ? "#ff6a4d" : "#ffb066", "stroke-width": 2, "pointer-events": "none" }, g);
      }
    });
  }

  function unitKind(u) {
    if (u.role === "artillery") return "art";
    if (u.role === "ad") return "ad";
    if (u.role === "hq") return "hq";
    if (u.role === "sof") return "sof";
    var t = 0, v = 0, m = 0;
    u.bns.forEach(function (b) { t += b.cls.tanks; v += b.cls.ifv + b.cls.apc; m += b.cls.men; });
    if (t >= 12) return "armor"; if (v >= 10) return "mech"; return "inf";
  }
  function unitStrength(u) { var m = 0, M = 0; u.bns.forEach(function (b) { m += b.cls.men; M += b.menMax; }); return M ? m / M : 0; }
  function symbol(g, kind, color) {
    var s = { "stroke": color, fill: "none", "stroke-width": 1.1 };
    if (kind === "inf" || kind === "mech") { el("path", Object.assign({ d: "M-8,-5 L8,5 M8,-5 L-8,5" }, s), g); }
    if (kind === "armor" || kind === "mech") { el("ellipse", Object.assign({ cx: 0, cy: 0, rx: 5, ry: 2.8 }, s), g); }
    if (kind === "art") { el("circle", { cx: 0, cy: 0, r: 2, fill: color }, g); }
    if (kind === "ad") { el("path", Object.assign({ d: "M-6,4 Q0,-6 6,4" }, s), g); }
    if (kind === "hq") { el("path", Object.assign({ d: "M-6,5 L-6,-5 L4,-5 L4,0 L-6,0" }, s), g); }
    if (kind === "sof") { var t = el("text", { x: 0, y: 3, "text-anchor": "middle", "font-size": 7, fill: color, "font-weight": 700 }, g); t.textContent = "SF"; }
  }

  function renderUnits() {
    var w = st.w, H = w.map.hexes, g = $("lyr-units"); g.innerHTML = "";
    var byHex = {};
    w.units.forEach(function (u) {
      if (!S.alive(u)) return;
      if (u.side === "AZE" && !S.visibleToArm(w, u)) return;
      (byHex[u.hex] = byHex[u.hex] || []).push(u);
    });
    Object.keys(byHex).forEach(function (hi) {
      var list = byHex[hi], c = cxy(H[+hi]);
      list.sort(function (a, b) { return (a.side === "ARM" ? 0 : 1) - (b.side === "ARM" ? 0 : 1) || (a.role === "maneuver" ? 0 : 1) - (b.role === "maneuver" ? 0 : 1); });
      var selIdx = list.findIndex(function (u) { return isSelected(u); });
      if (selIdx > 0) { var s0 = list.splice(selIdx, 1)[0]; list.unshift(s0); }
      var show = list.slice(0, 3);
      show.slice().reverse().forEach(function (u, ri) {
        var k = show.length - 1 - ri;
        var ox = -k * 2.0, oy = -k * 2.0;
        var color = u.side === "ARM" ? "#ffb066" : "#6cc3ff";
        var gg = el("g", { class: "unit" + (isSelected(u) ? " sel" : ""), transform: "translate(" + (c.x + ox).toFixed(1) + "," + (c.y - 3 + oy).toFixed(1) + ") scale(0.72)", "data-u": u.id }, g);
        var fill = u.side === "ARM" ? "#1b120a" : "#0a1622";
        el("rect", { x: -9, y: -6, width: 18, height: 12, rx: 1.5, fill: fill, stroke: color, class: "frame" }, gg);
        symbol(gg, unitKind(u), color);
        var s = unitStrength(u), org = S.avgOrg(u);
        el("rect", { x: -9, y: 7, width: 18, height: 1.8, fill: "rgba(255,255,255,.12)", class: "str" }, gg);
        el("rect", { x: -9, y: 7, width: (18 * Math.max(0, Math.min(1, s))).toFixed(1), height: 1.8, fill: s > 0.66 ? "#3ddc84" : s > 0.4 ? "#f2a93b" : "#f0604d", class: "str" }, gg);
        if (u.side === "ARM") {
          if (u.posture === "attack") { var t = el("text", { x: 9.5, y: -3, "font-size": 6, fill: "#ff8f80" }, gg); t.textContent = "▲"; }
          else if (u.posture === "reserve") { var t2 = el("text", { x: 9.5, y: -3, "font-size": 5.5, fill: "#9fdcf0", "font-weight": 700 }, gg); t2.textContent = "R"; }
          if (S.pendingOrders(w, u.id).length) { var t3 = el("text", { x: -12.5, y: -2, "font-size": 5.5, fill: "#3cc8e4" }, gg); t3.textContent = "⏱"; }
          if (u.inSupply === false) { var t4 = el("text", { x: -12.5, y: 6, "font-size": 5.5, fill: "#f0604d" }, gg); t4.textContent = "⚠"; }
          if (u.control === "ai" && st.opts.player) { var t5 = el("text", { x: 9.5, y: 6, "font-size": 4.5, fill: "#3cc8e4", "font-weight": 700 }, gg); t5.textContent = "AI"; }
        }
      });
      if (list.length > 3) {
        var b = el("g", { transform: "translate(" + (c.x + 9) + "," + (c.y - 10) + ")", "pointer-events": "none" }, g);
        el("circle", { r: 3.6, fill: "#0b111a", stroke: "#6f849e", "stroke-width": 0.6 }, b);
        var t = el("text", { y: 1.9, "text-anchor": "middle", "font-size": 4.8, fill: "#e9f1fb", "font-weight": 700 }, b); t.textContent = "+" + (list.length - 3);
      }
    });
  }

  function selectedUnits() {
    var w = st.w; if (!st.sel) return [];
    if (st.sel.type === "unit") { var u = w.unitById[st.sel.id]; return u && S.alive(u) ? [u] : []; }
    var f = w.formations.filter(function (x) { return x.id === st.sel.id; })[0];
    return f ? f.units.map(function (id) { return w.unitById[id]; }).filter(function (u) { return u && S.alive(u); }) : [];
  }
  function isSelected(u) {
    if (!st.sel) return false;
    if (st.sel.type === "unit") return st.sel.id === u.id;
    return u.formation === st.sel.id;
  }

  function renderPaths() {
    var w = st.w, H = w.map.hexes, g = $("lyr-paths"); g.innerHTML = "";
    selectedUnits().forEach(function (u) {
      if (u.path && u.path.length) {
        var pts = [cxy(H[u.hex])].concat(u.path.map(function (i) { return cxy(H[i]); }));
        el("polyline", { points: pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" "), fill: "none", stroke: "#fff", "stroke-width": 1.2, "stroke-dasharray": "3,2", "marker-end": "url(#ar-path)", "pointer-events": "none", opacity: 0.85 }, g);
      }
      S.pendingOrders(w, u.id).forEach(function (o) {
        if (o.order.target === undefined) return;
        var a = cxy(H[u.hex]), b = cxy(H[o.order.target]);
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#3cc8e4", "stroke-width": 1, "stroke-dasharray": "1.5,2", "pointer-events": "none" }, g);
        el("circle", { cx: b.x, cy: b.y, r: 3, fill: "none", stroke: "#3cc8e4", "stroke-width": 1, "pointer-events": "none" }, g);
      });
    });
  }

  function renderHUD() {
    var w = st.w, cs = S.coreStats(w);
    $("hud-date").textContent = fmtTime(w.tick);
    $("hud-day").textContent = "第 " + w.day + " 天 · " + (S.isNight(w) ? "夜间" : "白昼") + ((w.weather[w.day] || 1) < 1 ? " · 阴云" : "");
    $("hud-core").textContent = cs.held + " / " + cs.total;
    var sh = w.map.hexes[w.map.places.shusha];
    $("hud-shusha").textContent = sh.owner === "ARM" ? "固守" : "失守";
    $("hud-shusha").style.color = sh.owner === "ARM" ? "var(--green)" : "var(--red)";
    $("hud-kia").textContent = Math.round(w.ledger.kia.ARM).toLocaleString();
    $("hud-tb2").textContent = Math.round(w.air.tb2) + "（击落 " + w.air.tb2Lost + "）";
  }

  // ------------------------------------------------------------------ OOB
  function renderOOB() {
    var w = st.w, q = ($("oob-search").value || "").trim().toLowerCase(), onlyMap = $("oob-onlymap").checked;
    var list = $("oob-list"); list.innerHTML = "";
    var groups = w.formations.filter(function (f) { return f.side === "ARM"; });
    var loose = w.units.filter(function (u) { return u.side === "ARM" && !u.formation; });
    var count = 0;
    var mk = function (title, meta, units, fid) {
      units = units.filter(function (u) { return (!onlyMap || S.alive(u)) && (!q || (u.name + title).toLowerCase().indexOf(q) >= 0); });
      if (!units.length) return;
      count += units.length;
      var box = document.createElement("div"); box.className = "fm" + (st.sel && st.sel.type === "formation" && st.sel.id === fid ? " sel open" : "");
      if (st.openFm && st.openFm[fid || title]) box.classList.add("open");
      var men = 0, M = 0; units.forEach(function (u) { u.bns.forEach(function (b) { men += b.cls.men; M += b.menMax; }); });
      var ai = units.some(function (u) { return u.control === "ai"; }) && st.opts.player;
      box.innerHTML = '<div class="fm-h"><span class="caret">▸</span><span class="fm-name">' + title + '</span>' + (ai ? '<span class="badge-ai">AI</span>' : "") +
        '<span class="bar"><i style="width:' + Math.round(100 * men / Math.max(1, M)) + '%"></i></span></div><div class="bns"></div>';
      var bns = box.querySelector(".bns");
      units.forEach(function (u) {
        var d = document.createElement("div"); d.className = "bn" + (st.sel && st.sel.type === "unit" && st.sel.id === u.id ? " sel" : "");
        var s = unitStrength(u), stc = !S.alive(u) ? "#555" : u.posture === "attack" ? "#ff8f80" : u.posture === "move" ? "#3cc8e4" : u.inSupply === false ? "#f0604d" : "#3ddc84";
        d.innerHTML = '<span class="dot-st" style="background:' + stc + '"></span><span class="nm">' + u.name.split(" · ")[0] + '</span><span class="bar"><i style="width:' + Math.round(100 * s) + '%;background:' + (s > .66 ? "#3ddc84" : s > .4 ? "#f2a93b" : "#f0604d") + '"></i></span>';
        d.addEventListener("click", function (e) { e.stopPropagation(); select({ type: "unit", id: u.id }, true); });
        bns.appendChild(d);
      });
      box.querySelector(".fm-h").addEventListener("click", function (e) {
        var key = fid || title;
        st.openFm = st.openFm || {};
        if (e.target.classList.contains("caret")) { st.openFm[key] = !st.openFm[key]; box.classList.toggle("open"); return; }
        st.openFm[key] = true;
        if (fid) select({ type: "formation", id: fid }, true); else box.classList.toggle("open");
      });
      list.appendChild(box);
    };
    groups.forEach(function (f) { mk(f.name, "", f.units.map(function (id) { return w.unitById[id]; }), f.id); });
    if (loose.length) mk("军直属 / 战区直属部队", "", loose, null);
    $("oob-count").textContent = count + " 营";
  }

  // ------------------------------------------------------------------ selection panel
  function select(sel, center) {
    st.sel = sel; renderSel(); renderOOB(); renderUnits(); renderPaths();
    if (center) {
      var us = selectedUnits(); if (!us.length) return;
      var c = cxy(st.w.map.hexes[us[0].hex]); centerOn(c.x, c.y);
    }
  }
  function eqCell(label, v, max) { return '<div><span>' + label + '</span><b>' + v + (max !== undefined && max !== v ? ' <small>/ ' + max + '</small>' : "") + '</b></div>'; }
  function sumCls(units) {
    var t = {}, m = {};
    S.CLASSES.forEach(function (c) { t[c] = 0; m[c] = 0; });
    var menMax = 0;
    units.forEach(function (u) { u.bns.forEach(function (b) { S.CLASSES.forEach(function (c) { t[c] += b.cls[c]; m[c] += b.max[c] || 0; }); menMax += b.menMax; }); });
    t.menMax = menMax; return { t: t, m: m };
  }
  var POSTURE = { defend: "固守", attack: "进攻", move: "机动", reserve: "预备队（疏散隐蔽）" };
  var AD_TXT = { active: "开机", ambush: "伏击", silent: "静默" };

  function renderSel() {
    var w = st.w, body = $("sel-body");
    var units = selectedUnits();
    if (!units.length) {
      $("sel-title").textContent = "未选择"; $("sel-tag").textContent = "—";
      body.innerHTML = '<div class="empty"><p>在地图或左侧战斗序列中选择一个营或旅。</p><p class="muted">选旅（编组）下令更快：命令经旅部传达约 1 小时；越级直接指挥单个营约 3 小时（DC-010）。</p><p class="muted">提示：开启“防空覆盖”图层查看无人机威胁下的安全区；“补给”图层显示与亚美尼亚本土的连通。</p></div>';
      return;
    }
    var isF = st.sel.type === "formation", u0 = units[0];
    var f = isF ? w.formations.filter(function (x) { return x.id === st.sel.id; })[0] : (u0.formation ? w.formations.filter(function (x) { return x.id === u0.formation; })[0] : null);
    var mine = u0.side === "ARM" && st.opts.player;
    $("sel-title").textContent = isF ? f.name : u0.name.split(" · ")[0];
    $("sel-tag").textContent = isF ? units.length + " 个营" : ({ maneuver: "机动营", artillery: "炮兵", ad: "防空", hq: "旅部/保障", sof: "特种" }[u0.role] || u0.role);
    var c = sumCls(units), t = c.t, m = c.m;
    var org = units.reduce(function (s, u) { return s + S.avgOrg(u); }, 0) / units.length;
    var sup = units.reduce(function (s, u) { return s + u.bns.reduce(function (a, b) { return a + b.supply; }, 0) / u.bns.length; }, 0) / units.length;
    var h = w.map.hexes[u0.hex];
    var html = "";
    html += '<div class="sec"><div class="kv">' +
      (isF ? "" : '<span>所属</span><b style="font-family:var(--sans);font-weight:500;font-size:11.5px;">' + (f ? f.name : "军/战区直属") + "</b>") +
      '<span>位置</span><b style="font-family:var(--sans)">' + (h.name_arm || (h.q + "," + h.r)) + " · " + ({ Mountain: "山地", Forest: "森林", Mixed: "丘陵", Open: "平原", Urban: "城市" }[h.terrain]) + " · 工事 " + h.fort.toFixed(2) + "</b>" +
      '<span>兵力</span><b>' + t.men.toLocaleString() + " / " + t.menMax.toLocaleString() + "</b>" +
      '<span>组织度</span><b style="color:' + (org > .66 ? "var(--green)" : org > .4 ? "var(--amber)" : "var(--red)") + '">' + Math.round(org * 100) + "%</b>" +
      '<span>补给</span><b style="color:' + (sup > 1 ? "var(--green)" : sup > .4 ? "var(--amber)" : "var(--red)") + '">' + sup.toFixed(1) + " 天" + (units.some(function (u) { return u.inSupply === false; }) ? "（断补给！）" : "") + "</b>" +
      (isF ? "" : '<span>姿态</span><b style="font-family:var(--sans)">' + POSTURE[u0.posture] + (u0.dug > 0.05 ? " · 掘壕 " + Math.round(u0.dug * 100) + "%" : "") + "</b>") +
      "</div></div>";
    html += '<div class="sec"><div class="sec-h">装备</div><div class="eq">' +
      eqCell("坦克", t.tanks, m.tanks) + eqCell("步战/装甲车", t.ifv + t.apc, m.ifv + m.apc) + eqCell("反坦克导弹", t.atgm, m.atgm) +
      eqCell("火炮", t.art + t.sp, m.art + m.sp) + eqCell("火箭炮", t.mrl + t.mrl_lr, m.mrl + m.mrl_lr) + eqCell("迫击炮", t.mortar, m.mortar) +
      eqCell("防空导弹", t.sam + t.tor + t.samLong, m.sam + m.tor + m.samLong) + eqCell("高炮/便携", t.aaa + t.manpads, m.aaa + m.manpads) + eqCell("卡车", t.trucks, m.trucks) +
      "</div></div>";
    if (mine) {
      var delayVia = S.orderDelayTicks(w, u0, false, true), delayDirect = S.orderDelayTicks(w, u0, false, false);
      html += '<div class="sec"><div class="sec-h">命令</div><div class="orders">' +
        '<button class="btn" data-ord="defend">固守（D）</button><button class="btn" data-ord="reserve">预备队（R）</button>' +
        '<button class="btn" data-ord="cancel">取消待生效命令</button><button class="btn' + (units.every(function (u) { return u.control === "ai"; }) ? " on" : "") + '" data-ord="ai">交给 AI 托管</button>' +
        "</div>" +
        '<div class="hint">右键地图：移动到该格；若为相邻敌方格则发起进攻。' + (isF ? "整个旅的机动营会分散占据目标格及周边己方格。" : "") + "</div>" +
        '<div class="why" style="margin-top:8px;">命令延迟：' + (isF ? "经旅部 <b>" + delayVia + " 小时</b>" : (u0.kind === "battalion" ? "越级直接指挥本营 <b>" + delayDirect + " 小时</b>（选整个旅下令只需 " + delayVia + " 小时）" : "直属部队 <b>" + delayDirect + " 小时</b>")) +
        (S.isNight(w) ? "，夜间 ×1.2" : "") + (org < .7 ? "，组织度低 ×" + (1.5 - .5 * org).toFixed(2) : "") + "</div>";
      var pend = [];
      units.forEach(function (u) { S.pendingOrders(w, u.id).forEach(function (o) { pend.push(o); }); });
      if (pend.length) {
        var nx = Math.min.apply(null, pend.map(function (o) { return o.at; }));
        html += '<div class="pending">⏱ ' + pend.length + " 条命令待生效，最早 " + shortTime(nx) + "（还有 " + (nx - w.tick) + " 小时）</div>";
      }
      html += "</div>";
      var hasAd = t.sam + t.tor + t.samLong > 0;
      html += '<div class="sec"><div class="sec-h">防空纪律' + (hasAd ? "" : "（本部队无防空导弹，设置对随行高炮有效）") + '</div><div class="seg" id="seg-ad">' +
        ["active", "ambush", "silent"].map(function (k) { return '<button data-ad="' + k + '"' + (units.every(function (u) { return u.ad === k; }) ? ' class="on"' : "") + ">" + AD_TXT[k] + "</button>"; }).join("") +
        '</div><div class="hint">开机：拦截最多，但雷达暴露、首先被反辐射打击。伏击：间歇开机。静默：雷达不暴露，但不拦截。</div></div>';
    } else if (u0.side === "AZE") {
      html = '<div class="sec"><div class="why">敌方部队：只显示侦察到的大致情况。</div></div>' +
        '<div class="sec"><div class="kv"><span>位置</span><b style="font-family:var(--sans)">' + (h.name_arm || h.q + "," + h.r) + '</b><span>估计兵力</span><b>约 ' + (Math.round(t.men / 100) * 100).toLocaleString() + ' 人</b><span>估计装甲</span><b>约 ' + (Math.round((t.tanks + t.ifv + t.apc) / 5) * 5) + ' 辆</b></div></div>';
    }
    body.innerHTML = html;
    body.querySelectorAll("[data-ord]").forEach(function (b) { b.addEventListener("click", function () { quickOrder(b.getAttribute("data-ord")); }); });
    body.querySelectorAll("[data-ad]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-ad");
        units.forEach(function (u) { S.issueOrder(w, u.id, { type: "ad", ad: k }); });
        logOrder("ad", null, k); toast("防空纪律：" + AD_TXT[k] + "（立即生效）"); renderSel();
      });
    });
  }

  function logOrder(type, target, extra) {
    st.orderLog.push({ t: st.w.tick, sel: st.sel ? st.sel.type + ":" + st.sel.id : null, type: type, target: target, extra: extra || null });
  }

  function quickOrder(kind) {
    var w = st.w, units = selectedUnits(); if (!units.length) return;
    if (kind === "cancel") { units.forEach(function (u) { S.cancelOrders(w, u.id); }); toast("已取消待生效命令"); renderSel(); renderPaths(); return; }
    if (kind === "ai") {
      var allAi = units.every(function (u) { return u.control === "ai"; });
      units.forEach(function (u) { u.control = allAi ? "player" : "ai"; });
      toast(allAi ? "已收回指挥权" : "已交给 AI 托管（AI 会固守并调动预备队）", "warn"); renderSel(); renderOOB(); renderUnits(); return;
    }
    var maxD = 0;
    if (st.sel.type === "formation") { var r = S.issueFormationOrder(w, st.sel.id, { type: kind }); maxD = r.delay || 0; }
    else units.forEach(function (u) { var r2 = S.issueOrder(w, u.id, { type: kind }); maxD = Math.max(maxD, r2.delay || 0); });
    logOrder(kind, null);
    toast((kind === "defend" ? "固守" : "转为预备队") + "：命令将在 " + maxD + " 小时后生效");
    renderSel(); renderUnits();
  }

  function orderTo(hexI) {
    var w = st.w, units = selectedUnits().filter(function (u) { return u.side === "ARM"; });
    if (!units.length || !st.opts.player) return;
    var h = w.map.hexes[hexI];
    var r;
    if (st.sel.type === "formation") {
      r = S.issueFormationOrder(w, st.sel.id, { type: "move", target: hexI });
      if (!r.ok) { toast("该旅没有可用的机动营", "warn"); return; }
    } else {
      var u = units[0];
      var adj = w.map.hexes[u.hex].nb.indexOf(hexI) >= 0;
      if (h.owner !== "ARM" && !adj) {
        var p = S.findPath(w, "ARM", u.hex, hexI);
        if (!p) { toast("无法到达：路径被敌方控制区阻断", "warn"); return; }
      }
      if (h.owner === "ARM" && hexI !== u.hex && !S.findPath(w, "ARM", u.hex, hexI)) { toast("无法到达：路径被阻断", "warn"); return; }
      r = S.issueOrder(w, u.id, { type: h.owner !== "ARM" ? "attack" : "move", target: hexI });
    }
    logOrder(h.owner !== "ARM" ? "attack" : "move", hexI);
    flashHex(hexI);
    toast((h.owner !== "ARM" ? "进攻 " : "移动至 ") + (h.name_arm || "该地块") + "：" + r.delay + " 小时后生效" + (st.sel.type === "unit" && units[0].kind === "battalion" ? "（越级指挥）" : ""), h.owner !== "ARM" ? "warn" : "");
    renderSel(); renderPaths(); renderUnits();
  }
  function flashHex(i) {
    var e = st.hexEls[i]; e.classList.add("target"); setTimeout(function () { e.classList.remove("target"); }, 600);
  }

  // ------------------------------------------------------------------ interaction
  var stage = $("map-stage"), svg = $("map"), tip = $("tip");
  function applyView() { $("vp").setAttribute("transform", "translate(" + st.view.x.toFixed(1) + "," + st.view.y.toFixed(1) + ") scale(" + st.view.k.toFixed(3) + ")"); }
  function fit(all) {
    var H = st.w.map.hexes.filter(function (h) { return all || h.region === "arm_zone" || h.nb.some(function (j) { return st.w.map.hexes[j].region === "arm_zone"; }); });
    var xs = H.map(function (h) { return cxy(h).x; }), ys = H.map(function (h) { return cxy(h).y; });
    var minX = Math.min.apply(null, xs) - R, maxX = Math.max.apply(null, xs) + R, minY = Math.min.apply(null, ys) - R, maxY = Math.max.apply(null, ys) + R;
    var W = stage.clientWidth, Hh = stage.clientHeight;
    var k = Math.min(W / (maxX - minX), Hh / (maxY - minY)) * 0.96;
    st.view = { k: k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (Hh - (maxY - minY) * k) / 2 - minY * k };
    applyView();
  }
  function centerOn(x, y) {
    var W = stage.clientWidth, Hh = stage.clientHeight;
    st.view.k = Math.max(st.view.k, 2.2);
    st.view.x = W / 2 - x * st.view.k; st.view.y = Hh / 2 - y * st.view.k; applyView();
  }
  function zoomAt(f, px, py) {
    var k2 = Math.max(0.6, Math.min(8, st.view.k * f));
    st.view.x = px - (px - st.view.x) * (k2 / st.view.k); st.view.y = py - (py - st.view.y) * (k2 / st.view.k); st.view.k = k2; applyView();
  }
  stage.addEventListener("wheel", function (e) { e.preventDefault(); var r = stage.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  var drag = null;
  stage.addEventListener("mousedown", function (e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y, moved: false }; });
  window.addEventListener("mousemove", function (e) {
    if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add("dragging"); }
      if (drag.moved) { st.view.x = drag.vx + dx; st.view.y = drag.vy + dy; applyView(); }
    }
  });
  window.addEventListener("mouseup", function (e) {
    if (!drag) return;
    var moved = drag.moved; drag = null; stage.classList.remove("dragging");
    if (moved || !st.w) return;
    var ue = e.target.closest && e.target.closest(".unit");
    if (ue) {
      var u = st.w.unitById[ue.getAttribute("data-u")];
      var same = st.w.units.filter(function (x) { return x.hex === u.hex && S.alive(x) && (x.side === "ARM" || S.visibleToArm(st.w, x)); });
      if (st.sel && st.sel.type === "unit" && same.length > 1 && same.some(function (x) { return x.id === st.sel.id; })) {
        var idx = same.findIndex(function (x) { return x.id === st.sel.id; }); u = same[(idx + 1) % same.length];
      }
      select({ type: "unit", id: u.id }, false); return;
    }
    if (e.target.classList && e.target.classList.contains("hx")) { select(null); }
  });
  stage.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var t = e.target;
    var ue = t.closest && t.closest(".unit");
    var hi = null;
    if (ue) hi = st.w.unitById[ue.getAttribute("data-u")].hex;
    else if (t.classList.contains("hx")) hi = +t.getAttribute("data-i");
    if (hi !== null && st.sel) orderTo(hi);
  });
  svg.addEventListener("mousemove", function (e) {
    if (!st.w || drag && drag.moved) { tip.classList.remove("show"); return; }
    var t = e.target, hi = null;
    var ue = t.closest && t.closest(".unit");
    if (ue) hi = st.w.unitById[ue.getAttribute("data-u")].hex; else if (t.classList.contains("hx")) hi = +t.getAttribute("data-i");
    if (hi === null) { tip.classList.remove("show"); return; }
    var h = st.w.map.hexes[hi];
    var arm = S.unitsAt(st.w, hi, "ARM"), aze = S.unitsAt(st.w, hi, "AZE").filter(function (u) { return S.visibleToArm(st.w, u); });
    var eng = st.w.engagements[hi];
    tip.innerHTML = '<div class="tt">' + (h.name_arm ? h.name_arm + (h.name_aze && h.name_aze !== h.name_arm ? " / " + h.name_aze : "") : "地块 " + h.q + "," + h.r) + "</div>" +
      '<div class="tr"><span>控制</span><span style="color:' + (h.owner === "ARM" ? "var(--arm)" : "var(--aze)") + '">' + (h.owner === "ARM" ? "亚方" : "阿方") + (h.owner !== h.owner0 ? "（战时易手）" : "") + "</span></div>" +
      '<div class="tr"><span>地形 / 工事</span><span>' + ({ Mountain: "山地", Forest: "森林", Mixed: "丘陵", Open: "平原", Urban: "城市" }[h.terrain]) + " / " + h.fort.toFixed(2) + "</span></div>" +
      (arm.length ? '<div class="tr"><span>我方</span><span>' + arm.length + " 个营 · " + arm.reduce(function (s, u) { return s + S.unitMen(u); }, 0).toLocaleString() + " 人</span></div>" : "") +
      (aze.length ? '<div class="tr"><span>敌方（侦察）</span><span>约 ' + aze.length + " 个营</span></div>" : "") +
      (eng && eng.lastTick >= st.w.tick - 2 ? '<div class="tr" style="color:#ff9a8c"><span>交战</span><span>推进 ' + eng.adv.toFixed(1) + " / " + S.P.FLIP_KM + " km · 力量比 " + (eng.lastR || 0).toFixed(2) + "</span></div>" : "") +
      (st.sel && st.opts.player ? '<div style="margin-top:4px;color:var(--t2);font-size:10.5px;">右键：' + (h.owner === "ARM" ? "移动到此" : "进攻此地") + "</div>" : "");
    var r = stage.getBoundingClientRect(), x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 290 > r.width) x -= 300; if (y + 160 > r.height) y -= 170;
    tip.style.left = x + "px"; tip.style.top = y + "px"; tip.classList.add("show");
  });
  svg.addEventListener("mouseleave", function () { tip.classList.remove("show"); });
  $("btn-zoom-in").onclick = function () { zoomAt(1.3, stage.clientWidth / 2, stage.clientHeight / 2); };
  $("btn-zoom-out").onclick = function () { zoomAt(1 / 1.3, stage.clientWidth / 2, stage.clientHeight / 2); };
  $("btn-zoom-fit").onclick = function () { st.fitAll = !st.fitAll; fit(st.fitAll); };
  ["lyr-terrain", "lyr-supply", "lyr-ad"].forEach(function (id) { $(id).addEventListener("change", function () { if (id === "lyr-ad") st.adTick = -1; renderOverlay(); }); });
  $("oob-search").addEventListener("input", renderOOB);
  $("oob-onlymap").addEventListener("change", renderOOB);
  $("hud-convoy").addEventListener("change", function (e) {
    S.setConvoy(st.w, e.target.value); logOrder("convoy", null, e.target.value);
    toast(e.target.value === "night_only" ? "补给车队改为仅夜间：卡车损失约 −77%，运量约 −35%" : "补给车队改为全天候：运量恢复，但白天车队暴露于无人机", "warn");
  });
  document.querySelectorAll("#speed button").forEach(function (b) { b.addEventListener("click", function () { setSpeed(+b.getAttribute("data-speed")); }); });
  function setSpeed(s) {
    if (st.w && st.w.ended) s = 0;
    st.speed = s; document.querySelectorAll("#speed button").forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-speed") === s); });
  }
  window.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || !st.w || $("start-modal").classList.contains("show")) return;
    if (e.code === "Space") { e.preventDefault(); setSpeed(st.speed ? 0 : (st.prevSpeed || 1)); if (st.speed) st.prevSpeed = st.speed; }
    if (e.key === "1" || e.key === "2" || e.key === "3") { setSpeed(+e.key); st.prevSpeed = +e.key; }
    if (e.key === "d" || e.key === "D") quickOrder("defend");
    if (e.key === "r" || e.key === "R") quickOrder("reserve");
    if (e.key === "Escape") select(null);
  });
  document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest(".modal").classList.remove("show"); }); });
  $("btn-help").onclick = function () { $("help-modal").classList.add("show"); };
  window.addEventListener("resize", function () { if (st.w) fit(st.fitAll); });

  // ------------------------------------------------------------------ feed & auto-pause
  function pushFeed(ev) {
    var d = document.createElement("div"); d.className = "ev " + (ev.level || "");
    d.innerHTML = "<time>" + shortTime(ev.t) + "</time><span>" + ev.msg + "</span>";
    if (ev.hex !== undefined && ev.hex !== null) d.addEventListener("click", function () { var c = cxy(st.w.map.hexes[ev.hex]); centerOn(c.x, c.y); });
    var f = $("feed"); f.insertBefore(d, f.firstChild);
    while (f.children.length > 200) f.removeChild(f.lastChild);
  }
  function drainEvents() {
    var w = st.w, total = w.evTotal || 0, n = total - (st.evSeen || 0), pause = null;
    var fresh = n > 0 ? w.events.slice(-Math.min(n, w.events.length)) : [];
    st.evSeen = total;
    fresh.forEach(function (ev) {
      pushFeed(ev);
      if (/停火/.test(ev.msg)) pause = ev;
      else if (st.opts.player && ev.level === "crit") {
        var h = ev.hex !== undefined && ev.hex !== null ? w.map.hexes[ev.hex] : null;
        if (/被合围/.test(ev.msg) || (h && h.value >= 5)) pause = ev;
      }
    });
    if (pause && st.speed) { setSpeed(0); toast("⏸ 自动暂停：" + pause.msg, "crit"); }
  }

  // ------------------------------------------------------------------ loop
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!st.w) return;
    var dt = st.last ? Math.min(0.25, (ts - st.last) / 1000) : 0; st.last = ts;
    if (st.speed && !st.w.ended) {
      st.acc += dt * SPEEDS[st.speed];
      var n = 0;
      while (st.acc >= 1 && n < 24) { S.tick(st.w); st.acc -= 1; n++; }
      if (n) { drainEvents(); st.dirty = true; }
      if (st.w.ended) { setSpeed(0); renderAll(true); renderOOB(); renderSel(); setTimeout(showAAR, 400); }
    }
    if (st.dirty && ts - st.lastRender > 66) {
      st.dirty = false; st.lastRender = ts; renderAll(false);
      if (Math.floor(st.w.tick / 3) !== st.lastSelTick) { st.lastSelTick = Math.floor(st.w.tick / 3); renderSel(); renderOOB(); }
    }
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------------ AAR
  var HIST = { days: 44, kiaArm: 3825, kiaAze: 2906, tanks: 255, towed: 250, sam: 39, lost: 0.35 };
  var OUT_TXT = { B: "结局 B · 守住纳卡", C: "结局 C · 保住舒沙，局部失利", D: "结局 D · 舒沙失守", E: "结局 E · 防线崩溃" };
  var HOW_TXT = { nov10: "舒沙失守后按“11·10”模式停火", freeze: "阿方攻势停滞，就地停火", redline: "越过俄方红线，被迫停火", collapse: "防线崩溃" };
  function showAAR() {
    var w = st.w, s = S.summarize(w), o = s.outcome;
    $("aar-title").innerHTML = '<span class="badge ' + o.code + '" style="font-size:13px;vertical-align:4px;">' + o.code + "</span> " + OUT_TXT[o.code];
    var rows = [
      ["持续天数", s.days, HIST.days], ["亚方阵亡", s.kia.ARM, HIST.kiaArm], ["阿方阵亡", s.kia.AZE, HIST.kiaAze],
      ["亚方坦克损失", s.arm.tanks, HIST.tanks], ["亚方牵引火炮损失", s.arm.towed, HIST.towed], ["亚方防空系统损失", s.arm.sam, HIST.sam],
      ["纳卡核心格失地比例", Math.round(o.lostShare * 100) + "%", "约 35%（不含移交）"], ["击落 TB2", s.tb2Lost, "—"],
    ];
    var ms = Object.keys(s.milestones).sort(function (a, b) { return s.milestones[a] - s.milestones[b]; });
    $("aar-body").innerHTML =
      '<div class="aar-grid">' +
      '<div class="aar-card"><h3>本局结果</h3><div class="muted" style="margin-bottom:8px;">' + HOW_TXT[o.how] + " · 第 " + o.day + " 天停火 · 舒沙" + (o.shushaHeld ? "固守" : "失守") + "</div>" +
      '<table class="t"><tr><th>指标</th><th class="n">本局</th><th class="n">2020 年史实</th></tr>' + rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="n">' + (typeof r[1] === "number" ? r[1].toLocaleString() : r[1]) + '</td><td class="n">' + (typeof r[2] === "number" ? r[2].toLocaleString() : r[2]) + "</td></tr>"; }).join("") + "</table>" +
      '<div class="muted" style="margin-top:8px;font-size:11.5px;">易手顺序：' + (ms.length ? ms.map(function (k) { var h = w.map.hexes[w.map.places[k]]; return (h.name_arm || k) + " D" + Math.floor(s.milestones[k]); }).join(" → ") : "无主要城镇失守") + "</div></div>" +
      '<div class="aar-card" id="aar-baseline"><h3>同一支部队由 AI 指挥 <span class="muted" id="bl-prog">计算中…</span></h3><div class="muted">用相同部队、相同阿方档位，由 AI 司令（关键城镇留守 + 夜间调动预备队 + 防空开机 + 全天候车队，批量测试中表现最好的配置）指挥，跑 30 局。</div><div id="bl-res"></div></div>' +
      "</div>";
    $("aar-modal").classList.add("show");
    runBaseline(s);
  }
  function runBaseline(me) {
    var N = 30, i = 0, res = [];
    var base = JSON.parse(JSON.stringify(st.opts)); base.player = false; base.armAi = "competent"; base.armAdPosture = "active"; base.convoy = "continuous";
    function step() {
      for (var k = 0; k < 2 && i < N; k++, i++) {
        var o = JSON.parse(JSON.stringify(base)); o.seed = 50000 + i;
        var w = S.createWorld(DATA, o); S.runToEnd(w); res.push(S.summarize(w));
      }
      var p = $("bl-prog"); if (p) p.textContent = i + " / " + N;
      if (i < N) setTimeout(step, 0); else showBaseline(me, res);
    }
    setTimeout(step, 50);
  }
  function showBaseline(me, res) {
    st.baseline = res;
    var cnt = { B: 0, C: 0, D: 0, E: 0 }; res.forEach(function (r) { cnt[r.outcome.code]++; });
    var ls = res.map(function (r) { return r.outcome.lostShare; }).sort(function (a, b) { return a - b; });
    var q = function (p) { return ls[Math.min(ls.length - 1, Math.floor(p * (ls.length - 1)))]; };
    var better = ls.filter(function (x) { return x > me.outcome.lostShare + 1e-9; }).length / ls.length;
    var col = { B: "#3ddc84", C: "#f2a93b", D: "#f0604d", E: "#a33" };
    var verdict;
    if (better >= 0.7) verdict = "你的指挥明显优于 AI 基线：同一支部队在 AI 手里有 " + Math.round(better * 100) + "% 的局丢得比你多。";
    else if (better >= 0.35) verdict = "你的指挥与 AI 基线相当。结局主要由部队本身（防空覆盖、工事、兵力）决定——这正是十年建军要解决的问题。";
    else verdict = "AI 基线用同一支部队普遍打得比你好（只有 " + Math.round(better * 100) + "% 的局丢得比你多）。可以试试：在舒沙、斯捷潘纳克特、拉钦各留至少两个营；白天少调动、夜间机动；开战初期就把预备队调往南线。";
    $("bl-prog").textContent = "完成";
    $("bl-res").innerHTML =
      '<div class="dist">' + ["B", "C", "D", "E"].filter(function (k) { return cnt[k]; }).map(function (k) { return '<div style="width:' + (100 * cnt[k] / res.length) + "%;background:" + col[k] + '">' + k + " " + Math.round(100 * cnt[k] / res.length) + "%</div>"; }).join("") + "</div>" +
      '<table class="t"><tr><th>失地比例</th><th class="n">AI 基线 P10</th><th class="n">中位</th><th class="n">P90</th><th class="n">你</th></tr>' +
      '<tr><td>纳卡核心格</td><td class="n">' + Math.round(q(.1) * 100) + '%</td><td class="n">' + Math.round(q(.5) * 100) + '%</td><td class="n">' + Math.round(q(.9) * 100) + '%</td><td class="n"><b>' + Math.round(me.outcome.lostShare * 100) + "%</b></td></tr></table>" +
      '<div class="verdict">' + verdict + "</div>";
  }
  $("btn-restart").onclick = function () { $("aar-modal").classList.remove("show"); $("start-modal").classList.add("show"); };
  $("btn-aar-export").onclick = function () {
    var w = st.w, payload = { exported_at: new Date().toISOString(), opts: st.opts, summary: S.summarize(w), orders: st.orderLog, events: w.events,
      baseline: st.baseline ? st.baseline.map(function (r) { return { code: r.outcome.code, lostShare: r.outcome.lostShare, days: r.days }; }) : null };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }));
    a.download = "mod_commander_playtest_" + (st.opts.seed) + ".json"; a.click();
  };
  $("btn-start").onclick = function () { $("start-modal").classList.remove("show"); startGame(buildOpts()); };

  // deep link for automated screenshots: #autostart[&spectate][&t=hours]
  window.__modCommander = st;
  if (/autostart/.test(location.hash)) {
    var o = buildOpts(); o.seed = 1234;
    if (/spectate/.test(location.hash)) { o.player = false; o.mode = "spectate"; }
    $("start-modal").classList.remove("show"); startGame(o);
    var m = location.hash.match(/t=(\d+)/);
    if (m) { S.run(st.w, +m[1]); drainEvents(); renderAll(true); renderOOB(); renderSel(); setSpeed(0); if (st.w.ended) showAAR(); }
    var sm = location.hash.match(/sel=([A-Z0-9]+)/);
    if (sm) select({ type: sm[1].indexOf("F") > 0 ? "formation" : "unit", id: sm[1] }, true);
  }
})();
