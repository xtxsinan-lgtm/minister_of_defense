/* 司令模式 · 应用层
 * 作战命令（开局设定）、主循环、事件分发与自动暂停、系统菜单、图层弹窗、快捷键、新手引导、战后总结报告。 */
(function () {
  "use strict";
  var C = window.CMD, S = C.S, DATA = C.DATA, st = C.st, $ = C.$;

  // ------------------------------------------------------------------ 作战命令（开局设定）
  document.querySelectorAll("#start-modal .choice-cards").forEach(function (g) {
    g.addEventListener("click", function (e) {
      var b = e.target.closest(".choice"); if (!b) return;
      g.querySelectorAll(".choice").forEach(function (x) { x.classList.toggle("on", x === b); });
    });
  });
  function choiceValue(id) { var b = $(id).querySelector(".choice.on"); return b ? b.getAttribute("data-v") : null; }
  function buildOpts() {
    var tier = choiceValue("opt-tier"), force = choiceValue("opt-force"), who = choiceValue("opt-ai");
    var o = { seed: (Date.now() % 100000) + 7, aiTier: tier, convoy: "continuous", player: who === "player", armAi: "competent", armAdPosture: "active" };
    if (force === "improved") { o.inventoryDelta = { ARM: { tor: 16, sam_medium: 12, atgm_heavy: 120 } }; o.fortBonus = 0.15; }
    o.force = force; o.mode = who;
    return o;
  }

  function startGame(opts) {
    st.opts = opts;
    st.w = S.createWorld(DATA, opts);
    st.sel = null; st.evSeen = 0; st.orderLog = []; st.baseline = null; st.frontKey = ""; st.openFm = {}; st.adTick = -1; st.hoverHex = null;
    C.initLeaflet();
    C.buildBase();
    C.fit(st.fitAll);
    C.renderMap(true);
    C.closeDrawer();
    C.renderInspector();
    $("feed").innerHTML = "";
    C.pushFeed({ t: 0, level: "crit", msg: "阿塞拜疆军队沿接触线全线发起进攻。无人机与巡飞弹正扑向我防空阵地。" });
    C.renderHUD(); C.renderAlerts();
    setSpeed(opts.mode === "spectate" ? 2 : 0);
    if (opts.mode !== "spectate") C.toast("战役已暂停。检查部署后按 <kbd>空格</kbd> 开始。", "warn");
  }
  C.startGame = startGame;

  // ------------------------------------------------------------------ 速度
  function setSpeed(s) {
    if (st.w && st.w.ended) s = 0;
    st.speed = s;
    document.querySelectorAll("#speed button").forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-speed") === s); });
    if (st.w) C.renderHUD();
  }
  C.setSpeed = setSpeed;
  function togglePause() { if (st.speed) { st.prevSpeed = st.speed; setSpeed(0); } else setSpeed(st.prevSpeed || 1); }
  document.querySelectorAll("#speed button").forEach(function (b) { b.addEventListener("click", function () { var s = +b.getAttribute("data-speed"); if (s) st.prevSpeed = s; setSpeed(s); }); });
  $("prop-watch").addEventListener("click", togglePause);

  // ------------------------------------------------------------------ 事件与自动暂停
  function drainEvents() {
    var w = st.w, total = w.evTotal || 0, n = total - (st.evSeen || 0), pause = null;
    var fresh = n > 0 ? w.events.slice(-Math.min(n, w.events.length)) : [];
    st.evSeen = total;
    fresh.forEach(function (ev) {
      C.pushFeed(ev, true);
      if (/停火/.test(ev.msg)) pause = ev;
      else if (st.opts.player && ev.level === "crit") {
        var h = ev.hex !== undefined && ev.hex !== null ? w.map.hexes[ev.hex] : null;
        if (/被合围/.test(ev.msg) || (h && h.value >= 5)) pause = ev;
      }
    });
    if (pause && st.speed) { setSpeed(0); C.toast("⏸ 自动暂停：" + pause.msg, "crit"); }
  }

  // ------------------------------------------------------------------ 主循环
  C.pointerDown = false;
  window.addEventListener("mousedown", function () { C.pointerDown = true; }, true);
  window.addEventListener("mouseup", function () { setTimeout(function () { C.pointerDown = false; }, 0); }, true);
  function refreshPanels(force) {
    C.renderHUD(); C.renderAlerts();
    if (force || !C.pointerDown) C.renderInspector();
    C.refreshDrawer(force);
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!st.w) return;
    var dt = st.last ? Math.min(0.25, (ts - st.last) / 1000) : 0; st.last = ts;
    if (st.speed && !st.w.ended) {
      st.acc += dt * C.SPEEDS[st.speed];
      var n = 0;
      while (st.acc >= 1 && n < 24) { S.tick(st.w); st.acc -= 1; n++; }
      if (n) { drainEvents(); st.dirty = true; }
      if (st.w.ended) { setSpeed(0); C.renderMap(true); refreshPanels(true); setTimeout(showAAR, 500); }
    }
    if (st.dirty && ts - st.lastRender > 66) {
      st.dirty = false; st.lastRender = ts; C.renderMap(false); C.renderHUD();
      if (Math.floor(st.w.tick / 3) !== st.lastSelTick) { st.lastSelTick = Math.floor(st.w.tick / 3); refreshPanels(false); }
    }
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------------ 底部道具栏 / 顶栏指标 → 抽屉
  document.querySelectorAll(".prop[data-drawer]").forEach(function (b) { b.addEventListener("click", function () { C.toggleDrawer(b.getAttribute("data-drawer")); }); });
  document.querySelectorAll(".kpi[data-open]").forEach(function (k) { k.addEventListener("click", function () { C.openDrawer(k.getAttribute("data-open")); }); });

  // ------------------------------------------------------------------ 系统菜单 / 图层弹窗
  C.closePops = function () { $("menu-pop").classList.remove("show"); $("layers-pop").classList.remove("show"); };
  $("btn-menu").addEventListener("click", function (e) { e.stopPropagation(); $("layers-pop").classList.remove("show"); $("menu-pop").classList.toggle("show"); });
  $("btn-layers").addEventListener("click", function (e) { e.stopPropagation(); $("menu-pop").classList.remove("show"); $("layers-pop").classList.toggle("show"); });
  document.querySelectorAll("[data-close-pop]").forEach(function (b) { b.addEventListener("click", C.closePops); });
  document.addEventListener("mousedown", function (e) {
    if (!e.target.closest("#menu-pop, #btn-menu, #layers-pop, #btn-layers")) C.closePops();
  });
  $("menu-pop").addEventListener("click", function (e) {
    var b = e.target.closest("[data-menu]"); if (!b) return;
    var m = b.getAttribute("data-menu"); C.closePops();
    if (m === "help") $("help-modal").classList.add("show");
    else if (m === "tour") startTour();
    else if (m === "layers") $("layers-pop").classList.add("show");
    else if (m === "export") exportLog();
    else if (m === "restart") { setSpeed(0); $("start-modal").classList.add("show"); }
    else if (m === "home") location.href = "../../index.html";
  });
  $("btn-help").addEventListener("click", function () { $("help-modal").classList.add("show"); });
  document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest(".modal").classList.remove("show"); }); });
  document.querySelectorAll(".modal").forEach(function (m) { m.addEventListener("mousedown", function (e) { if (e.target === m && m.id !== "start-modal") m.classList.remove("show"); }); });

  $("basemap-sel").addEventListener("change", function (e) { C.setBasemap(e.target.value); });
  $("hex-opacity").addEventListener("input", function (e) {
    st.hexOpacity = parseFloat(e.target.value) || 0.24;
    if (st.w) { st.hexEls.forEach(function (x) { x.__f = ""; }); C.renderMap(false); }
  });
  ["lyr-borders", "lyr-labels-t", "lyr-roads-t", "lyr-terrain", "lyr-supply", "lyr-ad"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      if (id === "lyr-ad") { st.adTick = -1; if ($(id).checked) $("lyr-supply").checked = false; }
      if (id === "lyr-supply" && $(id).checked) $("lyr-ad").checked = false;
      if (st.w) { C.renderOverlay(); C.refreshDrawer(true); }
    });
  });
  $("btn-zoom-in").onclick = function () { var s = $("map-stage"); C.zoomAt(1.3, s.clientWidth / 2, s.clientHeight / 2); };
  $("btn-zoom-out").onclick = function () { var s = $("map-stage"); C.zoomAt(1 / 1.3, s.clientWidth / 2, s.clientHeight / 2); };
  $("btn-zoom-nk").onclick = function () { if (st.w) C.fit(false); };
  $("btn-zoom-all").onclick = function () { if (st.w) C.fit(true); };

  // ------------------------------------------------------------------ 快捷键
  var DRAWER_KEYS = { b: "oob", a: "air", l: "logistics", i: "intel", c: "losses", g: "goals" };
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !st.w || $("start-modal").classList.contains("show")) return;
    var k = e.key.toLowerCase();
    if (e.code === "Space") { e.preventDefault(); togglePause(); return; }
    if (k === "1" || k === "2" || k === "3") { st.prevSpeed = +k; setSpeed(+k); return; }
    if (k === "escape") {
      if (tourOn) { endTour(); return; }
      var openModal = document.querySelector(".modal.show"); if (openModal) { openModal.classList.remove("show"); return; }
      if ($("menu-pop").classList.contains("show") || $("layers-pop").classList.contains("show")) { C.closePops(); return; }
      if (C.drawerOpen()) { C.closeDrawer(); return; }
      C.select(null); return;
    }
    if (document.querySelector(".modal.show")) return;
    if (k === "d") C.quickOrder("defend");
    else if (k === "r") C.quickOrder("reserve");
    else if (DRAWER_KEYS[k]) C.toggleDrawer(DRAWER_KEYS[k]);
    else if (k === "m") { $("menu-pop").classList.remove("show"); $("layers-pop").classList.toggle("show"); }
    else if (k === "f") C.fit(false);
    else if (k === "h" || k === "?") $("help-modal").classList.add("show");
  });
  window.addEventListener("resize", function () { if (st.lmap) st.lmap.invalidateSize(); if (st.w) C.fit(st.fitAll); });

  // ------------------------------------------------------------------ 新手引导
  var TOUR = [
    { sel: "#tb-kpis", t: "顶栏：一眼看清全局", d: "纳卡核心格、舒沙、拉钦走廊、阵亡与敌无人机。点击任一指标即可打开对应菜单。" },
    { sel: "#map-stage", t: "地图：你的战场", d: "蓝色矩形是我方旅 / 团，红色菱形是已侦察到的敌军（北约军标）。<b>左键</b>选择，<b>右键</b>下达机动或进攻；悬停可预览路线与命令延迟。" },
    { sel: "#props", t: "桌面道具就是菜单", d: "战斗序列、防空、后勤、敌情、战损、目标都收在这里，主界面保持干净。键盘 <kbd>B</kbd><kbd>A</kbd><kbd>L</kbd><kbd>I</kbd><kbd>C</kbd><kbd>G</kbd> 直接打开。" },
    { sel: "#outliner", t: "预警与战况通报", d: "红色预警需要立即处理，点击即可定位或打开相关菜单。关键城镇遭攻击、部队被合围时会自动暂停。" },
    { sel: ".tb-speed", t: "时间由你掌控", d: "战役开局暂停。检查部署后按 <kbd>空格</kbd> 开始，<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 调速。" },
  ];
  var tourOn = false, tourI = 0;
  function startTour() { tourOn = true; tourI = 0; showTourStep(); }
  function endTour() {
    tourOn = false; $("tour-spot").style.display = "none"; $("tour-box").style.display = "none";
    try { localStorage.setItem("mod_cmd_tour_v2", "1"); } catch (e) { /* 隐私模式忽略 */ }
  }
  function showTourStep() {
    var s = TOUR[tourI], tgt = document.querySelector(s.sel); if (!tgt) { endTour(); return; }
    var r = tgt.getBoundingClientRect(), sp = $("tour-spot"), box = $("tour-box");
    sp.style.display = "block"; sp.style.left = (r.left - 4) + "px"; sp.style.top = (r.top - 4) + "px"; sp.style.width = (r.width + 8) + "px"; sp.style.height = (r.height + 8) + "px";
    box.innerHTML = '<div class="tb-step">第 ' + (tourI + 1) + " / " + TOUR.length + ' 步</div><div class="tb-t">' + s.t + '</div><div class="tb-d">' + s.d + '</div><div class="tb-btns"><button class="btn sm" id="tour-skip">跳过</button><button class="btn sm primary" id="tour-next">' + (tourI === TOUR.length - 1 ? "开始指挥" : "下一步") + "</button></div>";
    box.style.display = "block";
    var bw = 340, bh = box.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x, y;
    if (r.height > vh * 0.6) { x = r.left + r.width / 2 - bw / 2; y = r.top + r.height / 2 - bh / 2; if (s.sel === "#outliner") { x = r.left - bw - 16; } }
    else if (r.top > vh / 2) { x = r.left + 20; y = r.top - bh - 14; }
    else { x = r.left + 20; y = r.bottom + 14; }
    box.style.left = Math.max(10, Math.min(vw - bw - 10, x)) + "px"; box.style.top = Math.max(10, Math.min(vh - bh - 10, y)) + "px";
    $("tour-skip").onclick = endTour;
    $("tour-next").onclick = function () { tourI++; if (tourI >= TOUR.length) endTour(); else showTourStep(); };
  }

  // ------------------------------------------------------------------ 战后总结报告
  var HOW_TXT = { nov10: "舒沙失守后按“11·10”模式停火", freeze: "阿方攻势停滞，就地停火", redline: "越过俄方红线，被迫停火", collapse: "防线崩溃" };
  function showAAR() {
    var w = st.w, s = S.summarize(w), o = s.outcome, H = C.HIST;
    var stamp = $("aar-stamp");
    stamp.textContent = "结局 " + o.code;
    stamp.className = "stamp big " + (o.code === "B" ? "green" : o.code === "C" ? "amber" : "");
    $("aar-meta").textContent = C.OUT_TXT[o.code] + " · " + HOW_TXT[o.how] + " · 第 " + o.day + " 天停火 · 舒沙" + (o.shushaHeld ? "固守" : "失守");
    var rows = [
      ["持续天数", s.days, H.days], ["我方阵亡", s.kia.ARM, H.kiaArm], ["敌方阵亡", s.kia.AZE, H.kiaAze],
      ["我方坦克损失", s.arm.tanks, H.tanks], ["我方牵引火炮损失", s.arm.towed, H.towed], ["我方防空系统损失", s.arm.sam, H.sam],
      ["纳卡核心格失地比例", Math.round(o.lostShare * 100) + "%", "约 35%（不含移交）"], ["击落 TB2", s.tb2Lost, "—"],
    ];
    var ms = Object.keys(s.milestones).sort(function (a, b) { return s.milestones[a] - s.milestones[b]; });
    $("aar-body").innerHTML =
      '<div class="aar-grid"><div><h3>本局结果</h3>' +
      '<table class="t"><tr><th>指标</th><th class="n">本局</th><th class="n">2020 年史实</th></tr>' + rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="n">' + (typeof r[1] === "number" ? r[1].toLocaleString() : r[1]) + '</td><td class="n muted">' + (typeof r[2] === "number" ? r[2].toLocaleString() : r[2]) + "</td></tr>"; }).join("") + "</table>" +
      '<div class="d-note">易手顺序：' + (ms.length ? ms.map(function (k) { var h = w.map.hexes[w.map.places[k]]; return C.hexName(h) + " D" + Math.floor(s.milestones[k]); }).join(" → ") : "无主要城镇失守") + "</div></div>" +
      '<div><h3>同一支部队由 AI 指挥 <span class="muted" id="bl-prog" style="font:12px var(--font-ui)">计算中…</span></h3><p class="muted" style="font-size:12.5px;line-height:1.6">用相同部队、相同阿方档位，由 AI 司令指挥，跑 30 局对照，看结局有多少取决于你的指挥、多少取决于部队本身。</p><div id="bl-res"></div></div></div>';
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
    setTimeout(step, 60);
  }
  function showBaseline(me, res) {
    st.baseline = res;
    var cnt = { B: 0, C: 0, D: 0, E: 0 }; res.forEach(function (r) { cnt[r.outcome.code]++; });
    var ls = res.map(function (r) { return r.outcome.lostShare; }).sort(function (a, b) { return a - b; });
    var q = function (p) { return ls[Math.min(ls.length - 1, Math.floor(p * (ls.length - 1)))]; };
    var better = ls.filter(function (x) { return x > me.outcome.lostShare + 1e-9; }).length / ls.length;
    var col = { B: "#3B6B36", C: "#B7791F", D: "#B3261E", E: "#5A1410" };
    var verdict;
    if (better >= 0.7) verdict = "你的指挥明显优于 AI 基线：同一支部队在 AI 手里有 " + Math.round(better * 100) + "% 的局丢得比你多。";
    else if (better >= 0.35) verdict = "你的指挥与 AI 基线相当。结局主要由部队本身（防空覆盖、工事、兵力）决定——这正是十年建军要解决的问题。";
    else verdict = "AI 基线用同一支部队普遍打得比你好（只有 " + Math.round(better * 100) + "% 的局丢得比你多）。可以试试：在舒沙、斯捷潘纳克特、拉钦各留至少两个营；白天少调动、夜间机动；开战初期就把预备队调往南线。";
    $("bl-prog").textContent = "完成";
    $("bl-res").innerHTML =
      '<div class="dist">' + ["B", "C", "D", "E"].filter(function (k) { return cnt[k]; }).map(function (k) { return '<div style="width:' + (100 * cnt[k] / res.length) + "%;background:" + col[k] + '">' + k + " " + Math.round(100 * cnt[k] / res.length) + "%</div>"; }).join("") + "</div>" +
      '<table class="t"><tr><th>失地比例</th><th class="n">AI P10</th><th class="n">中位</th><th class="n">P90</th><th class="n">你</th></tr>' +
      '<tr><td>纳卡核心格</td><td class="n">' + Math.round(q(0.1) * 100) + '%</td><td class="n">' + Math.round(q(0.5) * 100) + '%</td><td class="n">' + Math.round(q(0.9) * 100) + '%</td><td class="n"><b>' + Math.round(me.outcome.lostShare * 100) + "%</b></td></tr></table>" +
      '<div class="verdict">' + verdict + "</div>";
  }
  function exportLog() {
    if (!st.w) return;
    var w = st.w, payload = { exported_at: new Date().toISOString(), opts: st.opts, tick: w.tick, summary: S.summarize(w), orders: st.orderLog, events: w.events,
      baseline: st.baseline ? st.baseline.map(function (r) { return { code: r.outcome.code, lostShare: r.outcome.lostShare, days: r.days }; }) : null };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }));
    a.download = "mod_commander_playtest_" + st.opts.seed + ".json"; a.click();
  }
  $("btn-aar-export").onclick = exportLog;
  $("btn-aar-close").onclick = function () { $("aar-modal").classList.remove("show"); };
  $("btn-restart").onclick = function () { $("aar-modal").classList.remove("show"); $("start-modal").classList.add("show"); };
  $("btn-start").onclick = function () {
    $("start-modal").classList.remove("show");
    var o = buildOpts(); startGame(o);
    var done = false; try { done = localStorage.getItem("mod_cmd_tour_v2") === "1"; } catch (e) { /* ignore */ }
    if (!done && o.mode !== "spectate") setTimeout(startTour, 350);
  };

  // ------------------------------------------------------------------ 自动化截图深链
  // #autostart[&spectate][&t=小时][&all|&nk][&bm=paper|topo|sat|none][&sel=ID][&drawer=oob|air|logistics|intel|losses|goals][&tour][&aar]
  window.__modCommander = st;
  if (/autostart/.test(location.hash)) {
    var hs = location.hash;
    var bm = hs.match(/bm=([a-z]+)/); if (bm) { st.basemap = bm[1]; $("basemap-sel").value = bm[1]; }
    st.fitAll = /[#&]all/.test(hs);
    var o = buildOpts(); o.seed = 1234;
    if (/spectate/.test(hs)) { o.player = false; o.mode = "spectate"; }
    $("start-modal").classList.remove("show"); startGame(o);
    var m = hs.match(/[&#]t=(\d+)/);
    if (m) { S.run(st.w, +m[1]); drainEvents(); C.renderMap(true); refreshPanels(true); setSpeed(0); if (st.w.ended && /aar/.test(hs)) showAAR(); }
    var sm = hs.match(/sel=([A-Za-z0-9_]+)/);
    if (sm) C.select({ type: C.formationById(sm[1]) ? "formation" : "unit", id: sm[1] }, false);
    var dm = hs.match(/drawer=([a-z]+)/); if (dm) C.openDrawer(dm[1]);
    if (/tour/.test(hs)) setTimeout(startTour, 300);
  }
})();
