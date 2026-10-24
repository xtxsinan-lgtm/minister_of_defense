/* 司令模式 · 面板层
 * 顶部状态栏、右侧预警 / 战况通报、选中部队卡、六个抽屉菜单（战斗序列 / 防空 / 后勤 / 敌情 / 战损 / 目标）。 */
(function () {
  "use strict";
  var C = window.CMD, S = C.S, st = C.st, $ = C.$;

  var CORPS_CN = {
    arm_nk_army: "阿尔察赫国防军（斯捷潘纳克特）", arm_1_corps: "亚美尼亚第 1 军（戈里斯）", arm_2_corps: "亚美尼亚第 2 军（哈伊卡申）",
    arm_3_corps: "亚美尼亚第 3 军（瓦纳佐尔）", arm_4_corps: "亚美尼亚第 4 军（叶海格纳佐尔）", arm_5_corps: "亚美尼亚第 5 军（埃里温）",
    arm_gs_direct: "亚美尼亚总参 / 防空直属", aze_1_corps: "阿塞拜疆第 1 军（巴尔达）", aze_2_corps: "阿塞拜疆第 2 军（贝拉甘）",
    aze_3_corps: "阿塞拜疆第 3 军（沙姆基尔）", aze_4_corps: "阿塞拜疆第 4 军（巴库）", aze_nakh_army: "纳希切万独立合成集团军", aze_gs_direct: "阿塞拜疆总参 / 防空直属",
  };
  C.CORPS_CN = CORPS_CN;
  var POSTURE = { defend: "固守", attack: "进攻", move: "机动", reserve: "预备队" };
  var AD_TXT = { active: "开机", ambush: "伏击", silent: "静默" };
  var KIND_CN = { inf: "步兵", mech: "机械化步兵", armor: "装甲", art: "炮兵", ad: "防空", hq: "指挥", sof: "特种" };
  var HIST = { days: 44, kiaArm: 3825, kiaAze: 2906, tanks: 255, towed: 250, sam: 39 };
  C.HIST = HIST;
  var KEY_OBJ = [
    { p: "shusha", d: "失守即触发“11·10”式停火" }, { p: "stepanakert", d: "首府 · 战区司令部" }, { p: "lachin", d: "拉钦走廊咽喉 · M12 干线" },
    { p: "hadrut", d: "南线门户" }, { p: "martakert", d: "北线要点" }, { p: "fuzuli", d: "南线平原前沿" }, { p: "jabrayil", d: "阿方史实主攻起点" },
  ];
  function pct(x) { return Math.round(x * 100) + "%"; }
  function bar(frac, cls, wpx) { return '<span class="bar ' + (cls || "") + '" style="width:' + (wpx || 64) + 'px"><i style="width:' + Math.round(100 * Math.max(0, Math.min(1, frac))) + '%"></i></span>'; }
  function lvlCls(x, hi, lo) { return x > hi ? "" : x > lo ? "amber" : "red"; }
  function miniCounter(side, kind, ech, w, h) { return '<svg viewBox="-16 -16 32 30" width="' + (w || 30) + '" height="' + (h || 26) + '" style="vertical-align:middle">' + C.counterMarkup(side, kind, ech) + "</svg>"; }
  function hexOf(place) { var i = st.w.map.places[place]; return i === undefined ? null : st.w.map.hexes[i]; }
  function engagedRecent(hi) { var e = st.w.engagements[hi]; return e && e.lastTick >= st.w.tick - 2 ? e : null; }
  C.lachinStatus = function () {
    var w = st.w, la = hexOf("lachin"), sh = hexOf("shusha");
    if (!la) return { t: "—", c: "" };
    if (la.owner !== "ARM") return { t: "切断", c: "bad" };
    var sup = S.supplyCosts(w, "ARM"), stp = w.map.places.stepanakert;
    if (stp !== undefined && sup[stp] === undefined) return { t: "切断", c: "bad" };
    if ((sh && sh.owner !== "ARM") || engagedRecent(la.i) || (sh && engagedRecent(sh.i))) return { t: "受威胁", c: "warn-t" };
    return { t: "畅通", c: "good" };
  };
  function armFormStates() {
    var w = st.w;
    return w.formations.filter(function (f) { return f.side === "ARM"; }).map(function (f) { return { f: f, fs: C.formationState(w, f) }; });
  }

  // ------------------------------------------------------------------ 顶部状态栏
  C.renderHUD = function () {
    var w = st.w, cs = S.coreStats(w);
    $("hud-date").textContent = C.fmtTime(w.tick);
    $("hud-day").textContent = "第 " + w.day + " 天 · " + (S.isNight(w) ? "夜间" : "白昼") + ((w.weather[w.day] || 1) < 1 ? " · 阴云" : "") + (w.ended ? " · 已停火" : "");
    $("hud-core").innerHTML = cs.held + '<small> / ' + cs.total + "</small>";
    $("hud-core").className = "kv " + (cs.lostShare > 0.6 ? "bad" : cs.lostShare > 0.3 ? "warn-t" : "");
    var sh = hexOf("shusha");
    $("hud-shusha").textContent = sh && sh.owner === "ARM" ? (engagedRecent(sh.i) ? "交战中" : "固守") : "失守";
    $("hud-shusha").className = "kv " + (sh && sh.owner === "ARM" ? (engagedRecent(sh.i) ? "warn-t" : "good") : "bad");
    var la = C.lachinStatus();
    $("hud-lachin").textContent = la.t; $("hud-lachin").className = "kv " + la.c;
    $("hud-kia").textContent = Math.round(w.ledger.kia.ARM).toLocaleString();
    $("hud-tb2").innerHTML = Math.round(w.air.tb2) + '<small>（击落 ' + w.air.tb2Lost + "）</small>";
    $("hud-convoy").textContent = w.armConvoy === "night_only" ? "仅夜间" : "全天候";
    var sp = st.speed;
    $("watch-txt").innerHTML = (sp ? "推进中 ×" + sp : "暂停中") + " · <kbd>空格</kbd>";
  };

  // ------------------------------------------------------------------ 预警 + 战况通报
  C.renderAlerts = function () {
    var w = st.w, out = [];
    ["shusha", "stepanakert", "lachin"].forEach(function (p) {
      var h = hexOf(p); if (!h) return;
      var e = engagedRecent(h.i);
      if (h.owner === "ARM" && e) out.push({ c: "red", i: "急", t: C.hexName(h) + " 遭到进攻 · 推进 " + e.adv.toFixed(1) + " / " + S.P.FLIP_KM + " km", hex: h.i });
    });
    var la = C.lachinStatus();
    if (la.t === "切断") out.push({ c: "red", i: "急", t: "拉钦走廊已被切断，纳卡部队将逐步耗尽补给", open: "logistics" });
    var afs = armFormStates().filter(function (x) { return x.fs; });
    var noSup = afs.filter(function (x) { return x.fs.noSup; });
    if (noSup.length) out.push({ c: "red", i: "补", t: noSup.length + " 支部队断补给：" + noSup.slice(0, 3).map(function (x) { return x.fs.shortName; }).join("、") + (noSup.length > 3 ? " 等" : ""), open: "logistics" });
    var engN = Object.keys(w.engagements).filter(function (k) { var e = w.engagements[k]; return e.lastTick >= w.tick - 2 && w.map.hexes[+k].owner === "ARM"; }).length;
    if (engN) out.push({ c: "amber", i: "战", t: engN + " 处我方阵地正在交战", open: "intel" });
    var lowOrg = afs.filter(function (x) { return x.fs.org < 0.4; });
    if (lowOrg.length) out.push({ c: "amber", i: "组", t: lowOrg.length + " 支部队组织度低于 40%，建议后撤休整", open: "oob" });
    if (!S.isNight(w) && w.air.tb2 >= 6) {
      var silent = afs.filter(function (x) { return x.fs.sam > 0 && x.fs.units.every(function (u) { return u.ad === "silent"; }); }).length;
      if (silent) out.push({ c: "amber", i: "空", t: "白昼 TB2 活跃（" + Math.round(w.air.tb2) + " 架），" + silent + " 支防空部队处于静默", open: "air" });
    }
    var pend = 0, nx = Infinity;
    w.units.forEach(function (u) { if (u.side !== "ARM") return; S.pendingOrders(w, u.id).forEach(function (o) { pend++; nx = Math.min(nx, o.at); }); });
    if (pend) out.push({ c: "blue", i: "令", t: pend + " 条营级命令待生效 · 最早 " + C.shortTime(nx), open: "oob" });
    var arriving = w.formations.filter(function (f) { return f.side === "ARM" && f.arriveDay > w.day; });
    if (arriving.length) { var d = Math.min.apply(null, arriving.map(function (f) { return f.arriveDay; })); out.push({ c: "blue", i: "援", t: "增援：" + arriving.length + " 支部队陆续抵达，最早 D" + d, open: "oob" }); }
    var box = $("alerts");
    box.innerHTML = out.length ? out.map(function (a, i) { return '<div class="alert ' + a.c + '" data-a="' + i + '"><span class="ai">' + a.i + "</span><span>" + a.t + "</span></div>"; }).join("") : '<div class="none">暂无激活预警</div>';
    box.querySelectorAll(".alert").forEach(function (d) {
      d.onclick = function () { var a = out[+d.getAttribute("data-a")]; if (a.hex !== undefined) C.centerHex(a.hex); if (a.open) C.openDrawer(a.open); };
    });
    var cnt = { red: 0, amber: 0, blue: 0 }; out.forEach(function (a) { cnt[a.c] = (cnt[a.c] || 0) + 1; });
    $("alert-count").textContent = "红 " + cnt.red + " · 黄 " + cnt.amber + " · 蓝 " + cnt.blue;
    // 道具栏角标
    $("badge-log").textContent = noSup.length || "";
    $("badge-intel").textContent = engN || "";
    var lostKeys = KEY_OBJ.filter(function (o) { var h = hexOf(o.p); return h && h.owner !== "ARM"; }).length;
    $("badge-goal").textContent = lostKeys || "";
  };
  C.pushFeed = function (ev, fresh) {
    var d = document.createElement("div"); d.className = "ev " + (ev.level || "") + (fresh ? " fresh" : "");
    d.innerHTML = "<time>" + C.shortTime(ev.t) + "</time><span>" + ev.msg + "</span>";
    if (ev.hex !== undefined && ev.hex !== null) { d.setAttribute("data-hex", ev.hex); d.addEventListener("click", function () { C.centerHex(ev.hex); }); }
    var f = $("feed"); f.insertBefore(d, f.firstChild);
    while (f.children.length > 250) f.removeChild(f.lastChild);
  };
  document.querySelectorAll("#feed-tools button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#feed-tools button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("feed").className = "feed f-" + b.getAttribute("data-f");
    });
  });
  var fst = document.createElement("style");
  fst.textContent = ".feed.f-crit .ev:not(.crit){display:none}.feed.f-good .ev:not(.good){display:none}";
  document.head.appendChild(fst);

  // ------------------------------------------------------------------ 选中部队卡
  function sumCls(units) {
    var t = {}, m = {}; S.CLASSES.forEach(function (c) { t[c] = 0; m[c] = 0; });
    var menMax = 0;
    units.forEach(function (u) { u.bns.forEach(function (b) { S.CLASSES.forEach(function (c) { t[c] += b.cls[c]; m[c] += b.max[c] || 0; }); menMax += b.menMax; }); });
    t.menMax = menMax; return { t: t, m: m };
  }
  function eqCell(label, v, max) { return "<div><span>" + label + "</span><b>" + v + (max !== undefined && max !== v ? " <small>/ " + max + "</small>" : "") + "</b></div>"; }
  C.renderInspector = function () {
    var w = st.w, box = $("inspector"), units = C.selectedUnits();
    if (!w || !units.length) { box.classList.remove("show"); return; }
    box.classList.add("show");
    var isF = st.sel.type === "formation", u0 = units[0];
    var f = isF ? C.formationById(st.sel.id) : (u0.formation ? C.formationById(u0.formation) : null);
    var fs = f ? C.formationState(w, f) : null;
    var mine = u0.side === "ARM" && st.opts.player && !u0.garrison;
    var c = sumCls(units), t = c.t, m = c.m;
    var org = units.reduce(function (s, u) { return s + S.avgOrg(u); }, 0) / units.length;
    var sup = units.reduce(function (s, u) { return s + u.bns.reduce(function (a, b) { return a + b.supply; }, 0) / Math.max(1, u.bns.length); }, 0) / units.length;
    var h = w.map.hexes[isF && fs ? fs.hex : u0.hex];
    var kind = fs ? fs.kind : ({ artillery: "art", ad: "ad", hq: "hq", sof: "sof" }[u0.role] || "inf");
    var ech = isF ? (fs ? fs.echelon : "X") : "II";
    var title = isF ? f.name : u0.name.split(" · ")[0];
    var sub = isF ? ((ech === "III" ? "团级（III）" : "旅级（X）") + " · " + KIND_CN[kind] + " · " + units.length + " 个营") : (({ maneuver: "机动营", artillery: "炮兵营", ad: "防空营", hq: "旅部 / 保障", sof: "特种分队" }[u0.role] || u0.role) + (f ? " · 隶属 " + C.shortFmName(f.name) : ""));
    $("ins-h").innerHTML = miniCounter(u0.side, kind, ech, 44, 36) + '<div><div class="nm">' + title + '</div><div class="sub">' + sub + '</div></div><button class="btn sm x" id="ins-close" title="取消选择（Esc）">✕</button>';
    $("ins-close").onclick = function () { C.select(null); };
    var html = "";
    if (u0.side === "AZE") {
      html += '<div class="ins-sec"><div class="why">敌方作战群：仅显示侦察获知的番号与估算规模。</div></div>' +
        '<div class="ins-sec"><div class="kv"><span>所在战区格</span><b>' + C.hexName(h) + "</b><span>上级</span><b>" + (f ? (CORPS_CN[f.corps] || f.corps) : "—") + "</b><span>估计兵力</span><b>约 " + (Math.round(t.men / 100) * 100).toLocaleString() + " 人</b><span>估计装甲</span><b>约 " + (Math.round((t.tanks + t.ifv + t.apc) / 5) * 5) + " 辆</b><span>估计火炮</span><b>约 " + (Math.round((t.art + t.sp + t.mrl + t.mrl_lr) / 5) * 5) + " 门</b></div></div>";
      $("ins-b").innerHTML = html; return;
    }
    html += '<div class="ins-sec"><div class="ins-sec-h">态势</div><div class="kv">' +
      "<span>上级建制</span><b>" + (f ? (CORPS_CN[f.corps] || f.corps) : "战区直属") + "</b>" +
      "<span>驻防</span><b>" + C.hexName(h) + " · " + C.TERRAIN_CN[h.terrain] + " · 工事 " + h.fort.toFixed(2) + "</b>" +
      "<span>兵力</span><b>" + bar(t.men / Math.max(1, t.menMax), lvlCls(t.men / Math.max(1, t.menMax), 0.66, 0.4), 60) + t.men.toLocaleString() + " / " + t.menMax.toLocaleString() + "</b>" +
      "<span>组织度</span><b>" + bar(org, lvlCls(org, 0.66, 0.4), 60) + pct(org) + "</b>" +
      "<span>补给储备</span><b>" + bar(sup / 3, lvlCls(sup, 1, 0.4), 60) + sup.toFixed(1) + " 天" + (units.some(function (u) { return u.inSupply === false; }) ? ' <span class="tag red">断补给</span>' : "") + "</b>" +
      "<span>姿态</span><b>" + POSTURE[isF && fs ? fs.posture : u0.posture] + (u0.dug > 0.05 ? " · 掘壕 " + pct(u0.dug) : "") + "</b>" +
      "</div></div>";
    if (u0.garrison) {
      html += '<div class="ins-sec"><div class="why">边境守备部队：负责牵制土耳其 / 纳希切万 / 塔武什方向敌军，不可调入纳卡战区。</div></div>';
    } else if (mine) {
      var delayVia = S.orderDelayTicks(w, u0, false, true), delayDirect = S.orderDelayTicks(w, u0, false, false);
      var allAi = units.every(function (u) { return u.control === "ai"; });
      html += '<div class="ins-sec"><div class="ins-sec-h">命令 <small>右键地图：机动 / 进攻</small></div><div class="orders">' +
        '<button class="btn" data-ord="defend">固守 <kbd>D</kbd></button><button class="btn" data-ord="reserve">转为预备队 <kbd>R</kbd></button>' +
        '<button class="btn" data-ord="cancel">取消待生效命令</button><button class="btn' + (allAi ? " on" : "") + '" data-ord="ai">' + (allAi ? "收回指挥权" : "交给 AI 托管") + "</button></div>" +
        '<div class="hintline">命令延迟：' + (isF ? "经旅部传达 <b>" + delayVia + " 小时</b>" : (u0.kind === "battalion" ? "越级指挥单营 <b>" + delayDirect + " 小时</b>（按整旅下令仅需 " + delayVia + " 小时）" : "直属部队 <b>" + delayDirect + " 小时</b>")) +
        (S.isNight(w) ? "，夜间 ×1.2" : "") + (org < 0.7 ? "，组织度低 ×" + (1.5 - 0.5 * org).toFixed(2) : "") + "</div>";
      var pend = []; units.forEach(function (u) { S.pendingOrders(w, u.id).forEach(function (o) { pend.push(o); }); });
      if (pend.length) { var nx = Math.min.apply(null, pend.map(function (o) { return o.at; })); html += '<div class="pending">⏱ ' + pend.length + " 条营级命令待生效 · 最早 " + C.shortTime(nx) + "（还有 " + (nx - w.tick) + " 小时）</div>"; }
      html += "</div>";
      var hasAd = t.sam + t.tor + t.samLong > 0;
      html += '<div class="ins-sec"><div class="ins-sec-h">防空纪律 <small>' + (hasAd ? "立即生效" : "本部无防空导弹，仅影响高炮 / 便携") + '</small></div><div class="seg" id="seg-ad">' +
        ["active", "ambush", "silent"].map(function (k) { return '<button data-ad="' + k + '"' + (units.every(function (u) { return u.ad === k; }) ? ' class="on"' : "") + ">" + AD_TXT[k] + "</button>"; }).join("") +
        '</div><div class="hintline">开机拦截最多但雷达暴露；伏击间歇开机；静默不暴露但不拦截。</div></div>';
    }
    html += '<div class="ins-sec"><div class="ins-sec-h">合成装备 <small>现有 / 编制</small></div><div class="eq">' +
      eqCell("坦克", t.tanks, m.tanks) + eqCell("步战 / 装甲车", t.ifv + t.apc, m.ifv + m.apc) + eqCell("反坦克导弹", t.atgm, m.atgm) +
      eqCell("火炮", t.art + t.sp, m.art + m.sp) + eqCell("火箭炮", t.mrl + t.mrl_lr, m.mrl + m.mrl_lr) + eqCell("迫击炮", t.mortar, m.mortar) +
      eqCell("防空导弹", t.sam + t.tor + t.samLong, m.sam + m.tor + m.samLong) + eqCell("高炮 / 便携", t.aaa + t.manpads, m.aaa + m.manpads) + eqCell("卡车", t.trucks, m.trucks) + "</div></div>";
    if (isF && units.length) {
      html += '<details class="fold ins-sec"' + (st.insBnOpen ? " open" : "") + ' id="ins-bns"><summary>下辖建制营（' + units.length + "）</summary><div class=\"sub-bns\">" +
        units.map(function (u) { return '<div class="sub-bn" data-subu="' + u.id + '"><span>' + (u.name.split(" · ")[0]) + "</span><b>" + S.unitMen(u) + " 人 · 组织 " + pct(S.avgOrg(u)) + " · " + POSTURE[u.posture] + "</b></div>"; }).join("") + "</div></details>";
    } else if (!isF && f) {
      html += '<div class="ins-sec"><button class="btn" id="btn-back-fm" style="width:100%">← 返回所属：' + C.shortFmName(f.name) + "</button></div>";
    }
    var sc = $("ins-b").scrollTop;
    $("ins-b").innerHTML = html; $("ins-b").scrollTop = sc;
    var bb = $("btn-back-fm"); if (bb) bb.onclick = function () { C.select({ type: "formation", id: f.id }, false); };
    var det = $("ins-bns"); if (det) det.addEventListener("toggle", function () { st.insBnOpen = det.open; });
    $("ins-b").querySelectorAll("[data-subu]").forEach(function (e) { e.addEventListener("click", function () { C.select({ type: "unit", id: e.getAttribute("data-subu") }, false); }); });
    $("ins-b").querySelectorAll("[data-ord]").forEach(function (b) { b.addEventListener("click", function () { C.quickOrder(b.getAttribute("data-ord")); }); });
    $("ins-b").querySelectorAll("[data-ad]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.getAttribute("data-ad"); C.setAd(units, k); C.toast("防空纪律：" + AD_TXT[k] + "（立即生效）"); C.renderInspector(); });
    });
  };

  // ------------------------------------------------------------------ 抽屉菜单框架
  var DRAWERS = [
    { id: "oob", tab: "战斗序列", key: "B", title: "战斗序列", hint: "点击番号选中并定位 · ▸ 展开下辖营 · 选中后在地图上右键下令" },
    { id: "air", tab: "防空空情", key: "A", title: "防空与空情", hint: "无人机是这场战争的决定性因素：防空纪律是你最重要的取舍之一" },
    { id: "logistics", tab: "后勤补给", key: "L", title: "后勤补给", hint: "部队必须经己方地块连回亚美尼亚本土；拉钦走廊是唯一干线" },
    { id: "intel", tab: "敌情研判", key: "I", title: "敌情研判", hint: "仅显示侦察获知的敌军；估算值已取整" },
    { id: "losses", tab: "战损战报", key: "C", title: "战损与战报", hint: "与 2020 年史实对照 · 完整战报可筛选" },
    { id: "goals", tab: "作战目标", key: "G", title: "作战目标与停火条件", hint: "结局由纳卡核心格失地比例与舒沙得失决定" },
  ];
  C.DRAWERS = DRAWERS;
  var cur = null, lastRefresh = 0;
  C.drawerOpen = function () { return cur; };
  $("dr-tabs").innerHTML = DRAWERS.map(function (d) { return '<button class="dr-tab" data-dr="' + d.id + '">' + d.tab + " <kbd>" + d.key + "</kbd></button>"; }).join("");
  $("dr-tabs").querySelectorAll(".dr-tab").forEach(function (b) { b.onclick = function () { C.openDrawer(b.getAttribute("data-dr")); }; });
  $("dr-close").onclick = function () { C.closeDrawer(); };
  C.openDrawer = function (id) {
    if (!st.w) return;
    var d = DRAWERS.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    cur = id;
    $("drawer").classList.add("show");
    $("dr-title").textContent = d.title; $("dr-hint").textContent = d.hint;
    document.querySelectorAll(".dr-tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-dr") === id); });
    document.querySelectorAll(".prop[data-drawer]").forEach(function (b) { b.classList.toggle("open", b.getAttribute("data-drawer") === id); });
    $("dr-body").scrollTop = 0;
    buildTools(id);
    C.refreshDrawer(true);
  };
  C.closeDrawer = function () {
    cur = null; $("drawer").classList.remove("show");
    document.querySelectorAll(".prop[data-drawer]").forEach(function (b) { b.classList.remove("open"); });
  };
  C.toggleDrawer = function (id) { if (cur === id) C.closeDrawer(); else C.openDrawer(id); };
  C.refreshDrawer = function (force) {
    if (!cur || !st.w) return;
    var now = performance.now();
    if (!force && (C.pointerDown || now - lastRefresh < 700)) return;
    lastRefresh = now;
    var body = $("dr-body"), sc = body.scrollTop;
    body.innerHTML = RENDER[cur]();
    body.scrollTop = sc;
    BIND[cur] && BIND[cur](body);
  };
  function buildTools(id) {
    var t = $("dr-tools"); t.innerHTML = "";
    if (id === "oob") {
      t.innerHTML = '<input type="text" id="oob-q" placeholder="搜索番号 / 驻地…" style="width:200px" value="' + (st.oobQ || "") + '"/>' +
        '<div class="mini-seg" id="oob-f">' + [["all", "全部"], ["map", "在场"], ["nosup", "断补给"], ["pend", "有待生效命令"], ["ai", "AI 托管"]].map(function (x) { return '<button data-v="' + x[0] + '"' + ((st.oobF || "map") === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" +
        '<span class="muted" style="font-size:11.5px">军标：<span style="color:var(--blue)">▭</span> 我方 · X 旅 · III 团</span>';
      $("oob-q").addEventListener("input", function (e) { st.oobQ = e.target.value; C.refreshDrawer(true); });
      t.querySelectorAll("#oob-f button").forEach(function (b) { b.onclick = function () { st.oobF = b.getAttribute("data-v"); t.querySelectorAll("#oob-f button").forEach(function (x) { x.classList.toggle("on", x === b); }); C.refreshDrawer(true); }; });
    } else if (id === "losses") {
      t.innerHTML = '<span class="muted" style="font-size:12px">战报筛选</span><div class="mini-seg" id="log-f">' + [["all", "全部"], ["crit", "紧急"], ["warn", "警告"], ["good", "战果"]].map(function (x) { return '<button data-v="' + x[0] + '"' + ((st.logF || "all") === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>";
      t.querySelectorAll("#log-f button").forEach(function (b) { b.onclick = function () { st.logF = b.getAttribute("data-v"); t.querySelectorAll("#log-f button").forEach(function (x) { x.classList.toggle("on", x === b); }); C.refreshDrawer(true); }; });
    }
  }
  function kpi(l, v, s) { return '<div class="d-kpi"><div class="l">' + l + '</div><div class="v">' + v + "</div>" + (s ? '<div class="s">' + s + "</div>" : "") + "</div>"; }
  function locOf(fs, f) { if (fs) return C.hexName(st.w.map.hexes[fs.hex]); return f.arriveDay > st.w.day ? "D" + f.arriveDay + " 增援" : "已被歼灭"; }

  var RENDER = {}, BIND = {};

  // ---- D1 战斗序列
  RENDER.oob = function () {
    var w = st.w, q = (st.oobQ || "").trim().toLowerCase(), F = st.oobF || "map";
    var rows = armFormStates().filter(function (x) {
      var f = x.f, fs = x.fs;
      if (q && (f.name + locOf(fs, f)).toLowerCase().indexOf(q) < 0) return false;
      if (F === "map" && !fs) return false;
      if (F === "nosup" && !(fs && fs.noSup)) return false;
      if (F === "pend" && !(fs && fs.pend)) return false;
      if (F === "ai" && !(fs && fs.ai && !f.garrison)) return false;
      return true;
    });
    var groups = {}; rows.forEach(function (x) { (groups[x.f.corps] = groups[x.f.corps] || []).push(x); });
    var tot = armFormStates(), onMap = tot.filter(function (x) { return x.fs; });
    var men = onMap.reduce(function (s, x) { return s + x.fs.men; }, 0), menMax = onMap.reduce(function (s, x) { return s + x.fs.menMax; }, 0);
    var html = '<div class="d-kpis">' + kpi("在场旅 / 团", onMap.length + " <small>/ " + tot.length + "</small>") + kpi("总兵力", men.toLocaleString(), "编制 " + menMax.toLocaleString()) +
      kpi("断补给", onMap.filter(function (x) { return x.fs.noSup; }).length) + kpi("待生效命令", onMap.filter(function (x) { return x.fs.pend; }).length) +
      kpi("AI 托管", onMap.filter(function (x) { return x.fs.ai && !x.f.garrison; }).length) + "</div>";
    html += '<table class="t"><tr><th style="width:58px"></th><th>番号</th><th>驻地</th><th>兵力</th><th class="n">组织</th><th class="n">补给</th><th>姿态</th><th>状态</th></tr>';
    Object.keys(groups).forEach(function (g) {
      html += '<tr class="grp"><td colspan="8">' + (CORPS_CN[g] || g) + "</td></tr>";
      groups[g].forEach(function (x) {
        var f = x.f, fs = x.fs, sel = st.sel && st.sel.type === "formation" && st.sel.id === f.id, open = st.openFm[f.id];
        var tags = [];
        if (fs) {
          if (fs.noSup) tags.push('<span class="tag red">断补给</span>');
          if (fs.pend) tags.push('<span class="tag blue">⏱ 待令</span>');
          if (fs.ai && st.opts.player && !f.garrison) tags.push('<span class="tag teal">AI</span>');
          if (f.garrison) tags.push('<span class="tag ink">边境守备</span>');
          if (fs.org < 0.4) tags.push('<span class="tag amber">组织低</span>');
        }
        html += '<tr class="' + (fs ? "click" : "") + (sel ? " sel" : "") + '" data-f="' + f.id + '"><td style="white-space:nowrap"><span class="caret" data-caret="' + f.id + '">' + (fs ? (open ? "▾" : "▸") : "") + "</span>" + (fs ? miniCounter("ARM", fs.kind, fs.echelon, 26, 22) : "") + "</td>" +
          "<td><b style=\"font-family:var(--font-title)\">" + f.name + "</b></td><td>" + locOf(fs, f) + "</td>" +
          "<td>" + (fs ? bar(fs.str, lvlCls(fs.str, 0.66, 0.4), 56) + ' <span class="mono" style="font-size:11px">' + pct(fs.str) + "</span>" : "—") + "</td>" +
          '<td class="n">' + (fs ? pct(fs.org) : "—") + '</td><td class="n">' + (fs ? fs.supply.toFixed(1) + "天" : "—") + "</td>" +
          "<td>" + (fs ? POSTURE[fs.posture] : "—") + "</td><td>" + tags.join(" ") + "</td></tr>";
        if (fs && open) {
          fs.units.forEach(function (u) {
            var s = C.unitStrength(u), usel = st.sel && st.sel.type === "unit" && st.sel.id === u.id;
            html += '<tr class="sub click' + (usel ? " sel" : "") + '" data-u="' + u.id + '"><td></td><td>' + u.name.split(" · ")[0] + "</td><td>" + C.hexName(w.map.hexes[u.hex]) + "</td><td>" + bar(s, lvlCls(s, 0.66, 0.4), 56) + ' <span class="mono" style="font-size:11px">' + S.unitMen(u) + "人</span></td>" +
              '<td class="n">' + pct(S.avgOrg(u)) + '</td><td class="n">' + (u.bns.reduce(function (a, b) { return a + b.supply; }, 0) / Math.max(1, u.bns.length)).toFixed(1) + "天</td><td>" + POSTURE[u.posture] + "</td><td>" + (u.inSupply === false ? '<span class="tag red">断补给</span>' : "") + "</td></tr>";
          });
        }
      });
    });
    if (!rows.length) html += '<tr><td colspan="8" class="muted" style="padding:14px">没有符合条件的部队</td></tr>';
    return html + "</table>";
  };
  BIND.oob = function (body) {
    body.querySelectorAll("[data-caret]").forEach(function (c) { c.addEventListener("click", function (e) { e.stopPropagation(); var id = c.getAttribute("data-caret"); st.openFm[id] = !st.openFm[id]; C.refreshDrawer(true); }); });
    body.querySelectorAll("tr[data-f].click").forEach(function (r) { r.addEventListener("click", function () { C.select({ type: "formation", id: r.getAttribute("data-f") }, true); }); });
    body.querySelectorAll("tr[data-u]").forEach(function (r) { r.addEventListener("click", function () { C.select({ type: "unit", id: r.getAttribute("data-u") }, true); }); });
  };

  // ---- D2 防空与空情
  RENDER.air = function () {
    var w = st.w, L = w.ledger.ARM;
    var zone = w.map.hexes.filter(function (h) { return h.region === "arm_zone" && h.owner === "ARM"; });
    var cov = zone.length ? zone.reduce(function (s, h) { return s + S.adCoverage(w, h.i); }, 0) / zone.length : 0;
    var html = '<div class="d-summary">阿方以 TB2 与巡飞弹先打防空、再猎杀装甲与火炮。<b>开机</b>能击落无人机但雷达暴露于反辐射打击；<b>静默</b>保住雷达却任由无人机猎杀。按部队逐一设置，或一键统一。</div>';
    html += '<div class="d-kpis">' + kpi("敌 TB2 现存", Math.round(w.air.tb2) + " <small>/ " + Math.round(w.air.tb2Max) + "</small>", "每周补充 " + S.P.TB2_RESUPPLY_PER_WEEK + " 架") + kpi("已击落 TB2", w.air.tb2Lost) +
      kpi("敌无人机打击", w.air.strikes.toLocaleString(), "累计架次") + kpi("敌巡飞弹（估）", "约 " + Math.round(w.air.loiter / 10) * 10) +
      kpi("我防空导弹损失", L.sam + L.tor + L.samLong, "史实约 " + HIST.sam + " 套") + kpi("纳卡防空覆盖", pct(cov), "我方控制核心格平均") + "</div>";
    html += '<div class="d-card"><h4>一键设置防空纪律 <small>对全部我方机动部队立即生效</small></h4><div class="choice-cards">' +
      '<button class="choice" data-adall="active"><b>全部开机</b>拦截最多；雷达持续暴露，最先遭反辐射弹打击。</button>' +
      '<button class="choice" data-adall="ambush"><b>全部伏击</b>间歇开机，拦截约 82%，暴露显著降低。</button>' +
      '<button class="choice" data-adall="silent"><b>全部静默</b>雷达完全隐蔽，但完全不拦截无人机。</button></div>' +
      '<div style="margin-top:8px"><label class="chk"><input type="checkbox" id="dr-ad-ov"' + ($("lyr-ad").checked ? " checked" : "") + "/> 在地图上显示防空覆盖</label></div></div>";
    var rows = armFormStates().filter(function (x) { return x.fs && !x.f.garrison; }).map(function (x) {
      var t = sumCls(x.fs.units); return { x: x, t: t.t, m: t.m, sam: t.t.sam + t.t.tor + t.t.samLong, samM: t.m.sam + t.m.tor + t.m.samLong, aaa: t.t.aaa + t.t.manpads };
    }).filter(function (r) { return r.sam > 0 || r.aaa > 0; }).sort(function (a, b) { return b.sam - a.sam; });
    html += '<div class="d-card"><h4>各部队防空 <small>' + rows.length + " 支部队装备防空武器</small></h4><table class=\"t\"><tr><th>番号</th><th>驻地</th><th class=\"n\">防空导弹</th><th class=\"n\">高炮 / 便携</th><th>纪律</th></tr>" +
      rows.map(function (r) {
        var us = r.x.fs.units, mode = ["active", "ambush", "silent"].filter(function (k) { return us.every(function (u) { return u.ad === k; }); })[0];
        return '<tr class="click" data-f="' + r.x.f.id + '"><td><b style="font-family:var(--font-title)">' + r.x.fs.shortName + "</b></td><td>" + C.hexName(w.map.hexes[r.x.fs.hex]) + '</td><td class="n">' + r.sam + (r.samM !== r.sam ? ' <span class="muted">/ ' + r.samM + "</span>" : "") + '</td><td class="n">' + r.aaa + "</td>" +
          '<td><div class="mini-seg">' + ["active", "ambush", "silent"].map(function (k) { return '<button data-ad="' + k + '" data-adf="' + r.x.f.id + '"' + (mode === k ? ' class="on"' : "") + ">" + AD_TXT[k] + "</button>"; }).join("") + (mode ? "" : ' <span class="muted" style="font-size:11px;padding:0 4px">混合</span>') + "</div></td></tr>";
      }).join("") + "</table></div>";
    return html;
  };
  BIND.air = function (body) {
    body.querySelectorAll("[data-adall]").forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-adall"), us = [];
        armFormStates().forEach(function (x) { if (x.fs && !x.f.garrison) us = us.concat(x.fs.units); });
        C.setAd(us, k); C.toast("全部部队防空纪律：" + AD_TXT[k] + "（立即生效）", "warn"); C.refreshDrawer(true); C.renderInspector();
      };
    });
    body.querySelectorAll("[data-adf]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var f = C.formationById(b.getAttribute("data-adf")), fs = C.formationState(st.w, f), k = b.getAttribute("data-ad");
        C.setAd(fs.units, k); C.toast(fs.shortName + " 防空纪律：" + AD_TXT[k]); C.refreshDrawer(true); C.renderInspector();
      };
    });
    body.querySelectorAll("tr[data-f]").forEach(function (r) { r.addEventListener("click", function () { C.select({ type: "formation", id: r.getAttribute("data-f") }, true); }); });
    var ov = $("dr-ad-ov"); if (ov) ov.onchange = function () { $("lyr-ad").checked = ov.checked; if (ov.checked) $("lyr-supply").checked = false; st.adTick = -1; C.renderOverlay(); };
  };

  // ---- D3 后勤补给
  RENDER.logistics = function () {
    var w = st.w, la = C.lachinStatus(), sup = S.supplyCosts(w, "ARM");
    var afs = armFormStates().filter(function (x) { return x.fs && !x.f.garrison; });
    var avg = afs.length ? afs.reduce(function (s, x) { return s + x.fs.supply; }, 0) / afs.length : 0;
    var night = w.armConvoy === "night_only";
    var html = '<div class="d-summary">补给沿己方控制的地块从亚美尼亚本土流向前线。拉钦（别尔佐尔）与舒沙一旦失守，M12 走廊被切断，纳卡守军只能依靠存量作战。</div>';
    html += '<div class="d-kpis">' + kpi("拉钦走廊", '<span class="' + la.c + '">' + la.t + "</span>") + kpi("车队运力", Math.round(w.convoyPool) + " <small>/ " + S.P.CONVOY_POOL + " 辆</small>") +
      kpi("车队卡车损失", Math.round(w.armTrucksLostConvoy || 0)) + kpi("断补给部队", afs.filter(function (x) { return x.fs.noSup; }).length) + kpi("平均补给储备", avg.toFixed(1) + " <small>天</small>") + "</div>";
    html += '<div class="d-card"><h4>补给车队运行方式 <small>全局设定 · 立即生效</small></h4><div class="choice-cards">' +
      '<button class="choice' + (night ? "" : " on") + '" data-convoy="continuous"><b>全天候</b>运量 100%。白天车队暴露在无人机下，卡车持续损失。</button>' +
      '<button class="choice' + (night ? " on" : "") + '" data-convoy="night_only"><b>仅夜间</b>卡车损失约 −77%，但运量约 −35%（夜间通行能力 ' + pct(S.P.NIGHT_CONVOY_THROUGHPUT) + "）。</button></div>" +
      '<div style="margin-top:8px"><label class="chk"><input type="checkbox" id="dr-sup-ov"' + ($("lyr-supply").checked ? " checked" : "") + "/> 在地图上显示补给网络（绿色越深距补给源越近，红色斜线为切断）</label></div></div>";
    var rows = afs.slice().sort(function (a, b) { return a.fs.supply - b.fs.supply; });
    html += '<div class="d-card"><h4>各部队补给 <small>按储备由低到高</small></h4><table class="t"><tr><th>番号</th><th>驻地</th><th>补给储备</th><th class="n">距补给源</th><th>状态</th></tr>' +
      rows.map(function (x) {
        var c = sup[x.fs.hex], s = x.fs.supply;
        return '<tr class="click" data-f="' + x.f.id + '"><td><b style="font-family:var(--font-title)">' + x.fs.shortName + "</b></td><td>" + C.hexName(w.map.hexes[x.fs.hex]) + "</td><td>" + bar(s / 3, lvlCls(s, 1, 0.4), 80) + ' <span class="mono" style="font-size:11px">' + s.toFixed(1) + " 天</span></td>" +
          '<td class="n">' + (c === undefined ? '<span class="bad">切断</span>' : c.toFixed(0)) + "</td><td>" + (x.fs.noSup ? '<span class="tag red">断补给</span>' : s < 0.4 ? '<span class="tag amber">储备告急</span>' : '<span class="tag green">正常</span>') + "</td></tr>";
      }).join("") + "</table></div>";
    return html;
  };
  BIND.logistics = function (body) {
    body.querySelectorAll("[data-convoy]").forEach(function (b) {
      b.onclick = function () {
        var v = b.getAttribute("data-convoy"); if (st.w.armConvoy === v) return;
        S.setConvoy(st.w, v); C.logOrder("convoy", null, v);
        C.toast(v === "night_only" ? "补给车队改为仅夜间：卡车损失约 −77%，运量约 −35%" : "补给车队改为全天候：运量恢复，但白天车队暴露于无人机", "warn");
        C.renderHUD(); C.refreshDrawer(true);
      };
    });
    body.querySelectorAll("tr[data-f]").forEach(function (r) { r.addEventListener("click", function () { C.select({ type: "formation", id: r.getAttribute("data-f") }, true); }); });
    var ov = $("dr-sup-ov"); if (ov) ov.onchange = function () { $("lyr-supply").checked = ov.checked; if (ov.checked) $("lyr-ad").checked = false; C.renderOverlay(); };
  };

  // ---- D4 敌情研判
  RENDER.intel = function () {
    var w = st.w, H = w.map.hexes;
    var enemy = w.formations.filter(function (f) { return f.side === "AZE"; }).map(function (f) { return { f: f, fs: C.formationState(w, f) }; }).filter(function (x) { return x.fs; });
    var estMen = enemy.reduce(function (s, x) { return s + x.fs.men; }, 0);
    var engs = Object.keys(w.engagements).map(function (k) { return { hi: +k, e: w.engagements[k] }; }).filter(function (x) { return x.e.lastTick >= w.tick - 2; }).sort(function (a, b) { return b.e.adv - a.e.adv; });
    var cs = S.coreStats(w);
    var html = '<div class="d-kpis">' + kpi("已识别敌旅 / 团", enemy.length) + kpi("估计敌兵力", "约 " + (Math.round(estMen / 1000) * 1000).toLocaleString()) +
      kpi("进行中交战", engs.length) + kpi("阿方指挥", { H: "H · 史实", P: "P · 自适应", B: "B · 强化" }[w.aiTier] || w.aiTier) + kpi("已失守核心格", (cs.total - cs.held) + " <small>/ " + cs.total + "</small>") + "</div>";
    html += '<div class="d-card"><h4>交战态势 <small>推进满 ' + S.P.FLIP_KM + " km 即易手</small></h4>" + (engs.length ? '<table class="t"><tr><th>地点</th><th>攻方</th><th>推进</th><th class="n">力量比</th><th>守方驻军</th></tr>' +
      engs.map(function (x) {
        var h = H[x.hi], att = x.e.side, def = att === "AZE" ? "ARM" : "AZE";
        var defs = w.formations.filter(function (f) { return f.side === def; }).map(function (f) { return C.formationState(w, f); }).filter(function (s) { return s && s.hex === x.hi; });
        return '<tr class="click" data-hex="' + x.hi + '"><td><b style="font-family:var(--font-title)">' + C.hexName(h) + "</b></td><td>" + (att === "AZE" ? '<span class="tag red">阿方</span>' : '<span class="tag blue">我方</span>') + "</td><td>" + bar(x.e.adv / S.P.FLIP_KM, att === "AZE" ? "red" : "blue", 90) + ' <span class="mono" style="font-size:11px">' + x.e.adv.toFixed(1) + " km</span></td>" +
          '<td class="n">' + (x.e.lastR || 0).toFixed(2) + "</td><td>" + (defs.length ? defs.map(function (s) { return s.shortName; }).join("、") : '<span class="muted">无旅级驻军</span>') + "</td></tr>";
      }).join("") + "</table>" : '<div class="muted">当前没有进行中的交战。</div>') + "</div>";
    var axis = ["jabrayil", "fuzuli", "hadrut", "zangilan", "qubadli", "lachin", "shusha", "stepanakert"].map(function (p) { return { p: p, h: hexOf(p) }; }).filter(function (x) { return x.h; });
    html += '<div class="d-two"><div class="d-card"><h4>史实南线攻势轴 <small>2020 年阿方主攻顺序</small></h4><div class="obj-list">' +
      axis.map(function (x) {
        var lost = x.h.owner !== "ARM", day = w.milestones[x.p], e = engagedRecent(x.h.i);
        return '<div class="obj" data-hex="' + x.h.i + '"><span class="st ' + (lost ? "bad" : e ? "warn-t" : "good") + '">' + (lost ? "✕" : e ? "⚔" : "✓") + '</span><span><div class="nm">' + C.hexName(x.h) + '</div></span><span class="muted" style="font-size:11.5px">' + (lost ? "失守" + (day !== undefined ? " D" + Math.floor(day) : "") : e ? "交战中" : "我方控制") + "</span></div>";
      }).join("") + "</div></div>";
    html += '<div class="d-card"><h4>已识别敌部队 <small>点击定位</small></h4><table class="t"><tr><th></th><th>番号</th><th>位置</th><th class="n">兵力（估）</th></tr>' +
      enemy.sort(function (a, b) { return b.fs.men - a.fs.men; }).map(function (x) {
        return '<tr class="click" data-ef="' + x.f.id + '"><td>' + miniCounter("AZE", x.fs.kind, x.fs.echelon, 22, 20) + "</td><td>" + x.fs.shortName + (x.fs.posture === "attack" ? ' <span class="tag red">进攻</span>' : "") + "</td><td>" + C.hexName(H[x.fs.hex]) + '</td><td class="n">' + (Math.round(x.fs.men / 100) * 100).toLocaleString() + "</td></tr>";
      }).join("") + "</table></div></div>";
    return html;
  };
  BIND.intel = function (body) {
    body.querySelectorAll("[data-hex]").forEach(function (r) { r.addEventListener("click", function () { C.centerHex(+r.getAttribute("data-hex")); }); });
    body.querySelectorAll("[data-ef]").forEach(function (r) { r.addEventListener("click", function () { C.select({ type: "formation", id: r.getAttribute("data-ef") }, true); }); });
  };

  // ---- D5 战损与战报
  RENDER.losses = function () {
    var w = st.w, A = w.ledger.ARM, Z = w.ledger.AZE, L = w.ledger;
    var kA = Math.round(L.kia.ARM), kZ = Math.round(L.kia.AZE);
    var lineTot = L.byLine.A + L.byLine.C + L.byLine.E;
    var html = '<div class="d-kpis">' + kpi("我方阵亡", kA.toLocaleString(), "史实 " + HIST.kiaArm.toLocaleString()) + kpi("敌方阵亡", kZ.toLocaleString(), "史实 " + HIST.kiaAze.toLocaleString()) +
      kpi("交换比", kA ? (kZ / kA).toFixed(2) : "—", "敌 / 我") + kpi("我坦克损失", A.tanks, "史实 " + HIST.tanks) + kpi("击落 TB2", w.air.tb2Lost) + "</div>";
    var rows = [["坦克", A.tanks, Z.tanks, HIST.tanks], ["步战 / 装甲车", A.ifv + A.apc, Z.ifv + Z.apc, "—"], ["牵引火炮", A.art, Z.art, HIST.towed], ["自行火炮", A.sp, Z.sp, "—"],
      ["火箭炮", A.mrl + A.mrl_lr, Z.mrl + Z.mrl_lr, "—"], ["防空导弹系统", A.sam + A.tor + A.samLong, Z.sam + Z.tor + Z.samLong, HIST.sam], ["卡车", A.trucks, Z.trucks, "—"]];
    html += '<div class="d-two"><div class="d-card"><h4>装备损失对照 <small>含被俘 / 遗弃</small></h4><table class="t"><tr><th>类别</th><th class="n">我方</th><th class="n">敌方</th><th class="n">史实（我方）</th></tr>' +
      rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="n">' + Math.round(r[1]).toLocaleString() + '</td><td class="n">' + Math.round(r[2]).toLocaleString() + '</td><td class="n muted">' + r[3] + "</td></tr>"; }).join("") + "</table>" +
      (lineTot ? '<div class="d-note">我方装备损失来源：无人机空袭 <b>' + pct(L.byLine.A / lineTot) + "</b> · 炮火 <b>" + pct(L.byLine.C / lineTot) + "</b> · 撤退遗弃 <b>" + pct(L.byLine.E / lineTot) + "</b></div>" : "") + "</div>";
    var ms = Object.keys(w.milestones).sort(function (a, b) { return w.milestones[a] - w.milestones[b]; });
    html += '<div class="d-card"><h4>失地时间线</h4>' + (ms.length ? '<div class="obj-list">' + ms.map(function (k) { var h = hexOf(k); return h ? '<div class="obj" data-hex="' + h.i + '"><span class="st bad">✕</span><span class="nm">' + C.hexName(h) + '</span><span class="mono muted">D' + Math.floor(w.milestones[k]) + "</span></div>" : ""; }).join("") + "</div>" : '<div class="muted">尚无主要城镇失守。</div>') + "</div></div>";
    var F = st.logF || "all";
    var evs = w.events.slice().reverse().filter(function (e) { return F === "all" || e.level === F; });
    html += '<div class="d-card"><h4>完整战报 <small>' + evs.length + " 条 · 点击定位</small></h4><div class=\"loglist\">" +
      evs.slice(0, 300).map(function (e) { return '<div class="ev ' + (e.level || "") + '"' + (e.hex !== undefined && e.hex !== null ? ' data-hex="' + e.hex + '"' : "") + "><time>" + C.shortTime(e.t) + "</time><span>" + e.msg + "</span></div>"; }).join("") + "</div></div>";
    return html;
  };
  BIND.losses = function (body) { body.querySelectorAll("[data-hex]").forEach(function (r) { r.addEventListener("click", function () { C.centerHex(+r.getAttribute("data-hex")); }); }); };

  // ---- D6 作战目标
  C.projectOutcome = function () {
    var w = st.w, cs = S.coreStats(w), sh = hexOf("shusha"), held = sh && sh.owner === "ARM";
    if (cs.lostShare > 0.85) return "E"; if (!held || cs.lostShare > 0.6) return "D"; if (cs.lostShare <= 0.3) return "B"; return "C";
  };
  var OUT_TXT = { B: "守住纳卡", C: "保住舒沙，局部失利", D: "舒沙失守", E: "防线崩溃" };
  C.OUT_TXT = OUT_TXT;
  RENDER.goals = function () {
    var w = st.w, cs = S.coreStats(w), proj = C.projectOutcome(), o = st.opts;
    var html = '<div class="d-summary"><b>任务：</b>以旅 / 团为单位组织防御，<b>守住舒沙与拉钦走廊</b>，尽量保住纳卡及周边七区 12 个核心战区格，直至停火。</div>';
    html += '<div class="d-two"><div class="d-card"><h4>关键目标 <small>点击定位</small></h4><div class="obj-list">' +
      KEY_OBJ.map(function (ob) {
        var h = hexOf(ob.p); if (!h) return "";
        var lost = h.owner !== "ARM", e = engagedRecent(h.i), day = w.milestones[ob.p];
        return '<div class="obj" data-hex="' + h.i + '"><span class="st ' + (lost ? "bad" : e ? "warn-t" : "good") + '">' + (lost ? "✕" : e ? "⚔" : "✓") + '</span><span><div class="nm">' + C.hexName(h) + '</div><div class="ds">' + ob.d + "</div></span>" +
          '<span class="' + (lost ? "bad" : e ? "warn-t" : "good") + '" style="font-size:12px;font-weight:600">' + (lost ? "失守" + (day !== undefined ? " D" + Math.floor(day) : "") : e ? "交战 " + e.adv.toFixed(0) + "/" + S.P.FLIP_KM + "km" : "固守") + "</span></div>";
      }).join("") + "</div></div>";
    var ls = cs.lostShare;
    html += '<div><div class="d-card"><h4>核心格控制 <small>' + cs.held + " / " + cs.total + " · 失地 " + pct(ls) + "</small></h4>" +
      '<div class="thresh"><span class="zl" style="left:15%">B</span><span class="zl" style="left:45%">C</span><span class="zl" style="left:72.5%">D</span><span class="zl" style="left:92.5%">E</span><span class="mk" style="left:calc(' + (ls * 100).toFixed(1) + '% - 1.5px)" data-l="当前 ' + pct(ls) + '"></span></div>' +
      '<div class="d-note">B：失地 ≤30% 且舒沙在手 · C：30–60% · D：>60% 或舒沙失守 · E：>85% 或防线崩溃</div>' +
      '<div style="margin-top:8px;font-size:13px">若此刻停火，预计结局：<span class="code-badge ' + (proj === "B" ? "good" : proj === "C" ? "warn-t" : "bad") + '">' + proj + "</span><b>" + OUT_TXT[proj] + "</b></div></div>";
    var sh = hexOf("shusha");
    html += '<div class="d-card"><h4>停火条件</h4><table class="t">' +
      "<tr><td>舒沙失守 → “11·10”式停火</td><td>" + (sh && sh.owner === "ARM" ? '<span class="tag green">舒沙在手</span>' : '<span class="tag red">已触发</span>') + "</td></tr>" +
      "<tr><td>阿方攻入亚美尼亚本土 → 俄方红线</td><td>" + (w.redLine ? '<span class="tag red">已触发</span>' : '<span class="tag green">未越线</span>') + "</td></tr>" +
      "<tr><td>核心格守住不足 15% → 防线崩溃</td><td>" + (cs.held / cs.total < 0.15 ? '<span class="tag red">已触发</span>' : '<span class="tag green">' + pct(cs.held / cs.total) + " 在手</span>") + "</td></tr>" +
      "<tr><td>第 " + S.P.CEASEFIRE_CHECK_FROM + " 天起攻势停滞 " + S.P.CEASEFIRE_STALL_DAYS + " 天 → 可能就地停火</td><td>" + (w.day >= S.P.CEASEFIRE_CHECK_FROM ? '<span class="tag amber">检查中</span>' : '<span class="tag ink">第 ' + w.day + " 天</span>") + "</td></tr>" +
      "<tr><td>最长 " + S.P.MAX_DAYS + " 天</td><td><span class=\"tag ink\">剩余 " + Math.max(0, S.P.MAX_DAYS - w.day) + " 天</span></td></tr></table></div>";
    html += '<div class="d-card"><h4>本局设定</h4><div class="kv"><span>阿方指挥</span><b>' + ({ H: "H · 史实", P: "P · 自适应", B: "B · 强化" }[o.aiTier]) + "</b><span>我方部队</span><b>" + (o.force === "improved" ? "改进部队（演示）" : "史实部队") + "</b><span>指挥方式</span><b>" + (o.mode === "spectate" ? "AI 指挥（观战）" : "我来指挥") + '</b><span>随机种子</span><b class="mono">' + o.seed + "</b></div></div></div></div>";
    return html;
  };
  BIND.goals = function (body) { body.querySelectorAll("[data-hex]").forEach(function (r) { r.addEventListener("click", function () { C.centerHex(+r.getAttribute("data-hex")); }); }); };
  C.sumCls = sumCls;
})();
