/**
 * MoDSim — commander-mode operational simulation (prototype, P1)
 * ---------------------------------------------------------------------------
 * Runs in the browser (window.MoDSim) and headless in JavaScriptCore (tools/sim/batch.js).
 * Deterministic for a given seed. One tick = 1 hour.
 *
 * Simplified from the specs:
 *   04 strip layer   -> one engagement per defended hex, single advanceKm (DC-023), hex flips at FLIP_KM
 *   08 air / AD      -> AZE drone & loitering-munition strikes vs ARM AD coverage with EMCON trade-off
 *   06 logistics     -> supply reach from sources over friendly hexes, convoy policy (day vs night)
 *   09 time / orders -> order delay by command echelon (DC-010), night, fatigue
 *   12 AI            -> AZE operational planner (H/P/B tiers), ARM AI commander (historical / competent)
 * Force strength comes from templates x inventory (01), so TO&E and procurement changes propagate.
 */
var MoDSim = (function () {
  "use strict";

  // ------------------------------------------------------------------ params
  var P = {
    FLIP_KM: 20,
    // per-item combat values
    ATT: { tanks: 10, ifv: 4, apc: 1.5, atgm: 2, mortar: 1, aaa: 1, men: 0.06 },
    DEF: { tanks: 7, ifv: 3, apc: 1.2, atgm: 6, mortar: 2, aaa: 1.5, men: 0.1 },
    ARMOR_T: { Open: 1.0, Mixed: 0.75, Forest: 0.45, Mountain: 0.35, Urban: 0.4 },
    INF_T: { Open: 0.8, Mixed: 1.0, Forest: 1.1, Mountain: 1.0, Urban: 1.0 },
    DEF_T: { Open: 1.0, Mixed: 1.2, Forest: 1.45, Mountain: 1.65, Urban: 1.6 },
    MOVE_T: { Open: 1.0, Mixed: 0.82, Forest: 0.62, Mountain: 0.52, Urban: 0.5 },
    MOVE_H: { Open: 8, Mixed: 11, Forest: 15, Mountain: 20, Urban: 12 }, // hours per 42 km hex off-road
    ROAD_H: 4,
    FORT_MULT: 1.4,
    FIRE: { art: 1.0, sp: 1.3, mrl: 1.8, mrl_lr: 2.5 },
    FIRE_RANGE: { art: 1, sp: 1, mrl: 1, mrl_lr: 3 },
    FIRE_W: 0.95,
    SPOT: { AZE: 1.65, ARM: 0.75 },
    ADV_BASE: 0.24,          // km/h at (R-1)=1 on open ground
    ADV_NIGHT: 0.45,
    LOSS_K: 0.0052,          // fraction of engaged strength per hour at parity
    ORG_LOSS: 1.85,          // org drop per unit loss fraction
    ORG_RECOVER: 0.012,
    BREAK_ORG: 0.19,
    RETREAT_LOSS: 0.22,      // heavy equipment abandoned when a 42 km district sector falls
    ENCIRCLED_LOSS: 0.75,
    // air
    DAY_START: 7, DAY_END: 18,
    TB2_SORTIES_PER_DAY: 1.6,
    SHOTS_PER_SORTIE: 3,
    LOITER_PER_DAY: 7,
    PK_DRONE: 0.62,
    AD_PROTECT: 0.78,
    TB2_LOSS_K: 0.009,
    TB2_RESUPPLY_PER_WEEK: 2,
    DECOY_DAYS: 5, DECOY_MULT: 4.0,
    CB_K: 0.0050,           // artillery duel: items killed per unit of fire per hour (x spotting)
    CB_EVERY: 3,
    EMIT_WEIGHT: { active: 5, ambush: 1.6, silent: 0.6 },
    AD_EFF: { active: 1.0, ambush: 0.82, silent: 0.0 },
    CONVOY_LOSS_PER_H: 0.55,  // trucks/h of daylight convoy under drone threat (scaled by drone intensity)
    NIGHT_CONVOY_LOSS: 0.23,
    NIGHT_CONVOY_THROUGHPUT: 0.88,
    CONVOY_POOL: 520,        // theatre transport trucks (ARM); convoy losses shrink throughput
    // supply
    SUPPLY_MAX_COST: 26,
    SUPPLY_USE: { idle: 0.6, engaged: 1.6 }, // days of stock per day
    SUPPLY_REFILL: 1.8,
    // orders (minutes) — DC-010
    DELAY_MIN: { formation: 60, corps_bn: 90, detached_bn: 180, sof: 15 },
    // mobilisation
    MOB_START_DAY: 2, MOB_RATE: 0.05,
    // AI
    AI_ATTACK_RATIO: { H: 0.90, P: 0.86, B: 0.78 },
    AZE_DRONE_MULT: { H: 1.0, P: 1.0, B: 1.35 },
    CEASEFIRE_STALL_DAYS: 12, CEASEFIRE_STALL_P: 0.15, CEASEFIRE_CHECK_FROM: 43, MAX_DAYS: 60,
    AXIS_THRESH: { south: 0.82, north: 1.45, east: 1.65, reserve: 1.0 },
  };

  var CLASSES = ["men", "tanks", "ifv", "apc", "art", "sp", "mrl", "mrl_lr", "mortar", "atgm", "sam", "tor", "samLong", "aaa", "manpads", "trucks"];
  var CAT2CLS = {
    mbt: "tanks", ifv: "ifv", recon_ifv: "ifv", apc: "apc", mrap: "apc", light_armored_vehicle: "apc",
    howitzer_light_towed: "art", howitzer_heavy_towed: "art", howitzer_light_sp: "sp", howitzer_heavy_sp: "sp", howitzer_heavy_truck: "sp",
    mrl_light: "mrl", mrl_long_range: "mrl_lr", mortar_heavy: "mortar", mortar_medium: "mortar", sp_mortar_howitzer: "mortar",
    atgm_heavy: "atgm", atgm_light: "atgm", atgm_vehicle: "atgm", atgm_portable: "atgm",
    sam_short: "sam", spaag: "aaa", manpads: "manpads", truck_medium: "trucks", truck_heavy: "trucks",
  };
  // pooled inventory categories -> template slot category they fill
  var POOL_ALIAS = { recon_ifv: "ifv", mrap: "apc", light_armored_vehicle: "apc", atgm_vehicle: "atgm_heavy", atgm_portable: "atgm_heavy", sp_mortar_howitzer: "mortar_heavy" };

  // -------------------------------------------------------------------- rng
  function makeRng(seed) {
    var a = seed >>> 0;
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      uni: function (lo, hi) { return lo + (hi - lo) * next(); },
      chance: function (p) { return next() < p; },
      pickWeighted: function (items, wfn) {
        var tot = 0, i, w = [];
        for (i = 0; i < items.length; i++) { w.push(Math.max(0, wfn(items[i]))); tot += w[i]; }
        if (tot <= 0) return null;
        var x = next() * tot;
        for (i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i]; }
        return items[items.length - 1];
      },
    };
  }

  // -------------------------------------------------------------------- map
  function nbrOffsets(r) {
    return (r & 1) ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  }
  function cube(q, r) { var x = q - (r - (r & 1)) / 2; return [x, -x - r, r]; }
  function hexDist(a, b) {
    var ca = cube(a.q, a.r), cb = cube(b.q, b.r);
    return Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2]));
  }

  function buildMap(data) {
    var hexes = data.hexes.map(function (h, i) {
      return {
        i: i, q: h.q, r: h.r, lat: h.lat, lon: h.lon, verts: h.verts || null,
        region: h.region, de_jure: h.de_jure || (h.region === "armenia" ? "ARM" : "AZE"), terrain: h.terrain,
        owner: h.owner, owner0: h.owner, fort: h.fort || 0.1, nk: !!h.nk_oblast,
        place: h.place || null, name_arm: h.name_arm || null, name_aze: h.name_aze || null,
        sub_places: h.sub_places || [], value: h.place_value || 0, roads: h.roads || [], nb: [], roadNb: {},
      };
    });
    var key = {};
    hexes.forEach(function (h) { key[h.q + "," + h.r] = h.i; });
    hexes.forEach(function (h) {
      nbrOffsets(h.r).forEach(function (d) {
        var j = key[(h.q + d[0]) + "," + (h.r + d[1])];
        if (j !== undefined) h.nb.push(j);
      });
    });
    data.road_links.forEach(function (l) {
      var a = key[l[0] + "," + l[1]], b = key[l[2] + "," + l[3]];
      if (a !== undefined && b !== undefined) { hexes[a].roadNb[b] = true; hexes[b].roadNb[a] = true; }
    });
    var places = {};
    hexes.forEach(function (h) { if (h.place) places[h.place] = h.i; });
    // secondary town aliases inside the 42 km operational sectors
    var ALIAS = { talysh: "sugovushan", martuni: "aghdam", askeran: "stepanakert", sotk: "vardenis", kapan: "goris" };
    Object.keys(ALIAS).forEach(function (k) { if (places[k] === undefined && places[ALIAS[k]] !== undefined) places[k] = places[ALIAS[k]]; });
    var sources = {};
    ["ARM", "AZE"].forEach(function (s) {
      sources[s] = (data.supply_sources[s] || []).map(function (x) { return { i: key[x.q + "," + x.r], w: x.w }; })
        .filter(function (x) { return x.i !== undefined; });
    });
    return { hexes: hexes, key: key, places: places, sources: sources };
  }

  function nearestHex(map, lat, lon, filter) {
    var best = -1, bd = 1e9;
    map.hexes.forEach(function (h) {
      if (filter && !filter(h)) return;
      var d = Math.pow((h.lat - lat) * 111, 2) + Math.pow((h.lon - lon) * 85.3, 2);
      if (d < bd) { bd = d; best = h.i; }
    });
    return best;
  }

  // ------------------------------------------------------------------ force
  function expandTemplate(tpls, id, mult, acc, depth) {
    var t = tpls[id];
    if (!t || depth > 8) return;
    if (t.level === "squad" || !t.children || !t.children.length) {
      var k;
      for (k in (t.personnel || {})) acc.men += t.personnel[k] * mult;
      for (k in (t.slots || {})) acc.slots[k] = (acc.slots[k] || 0) + t.slots[k] * mult;
      for (k in (t.slots_unassigned || {})) acc.slots[k] = (acc.slots[k] || 0) + t.slots_unassigned[k] * mult;
      return;
    }
    t.children.forEach(function (c) { expandTemplate(tpls, c.template, mult * (c.count || 1), acc, depth + 1); });
  }

  // battalion-level templates directly below a brigade/regiment template
  function battalionsOf(tpls, id) {
    var t = tpls[id], out = [];
    if (!t) return out;
    if (t.level === "battalion" || t.level === "company" || t.level === "squad") return [{ template: id, count: 1 }];
    (t.children || []).forEach(function (c) {
      var ct = tpls[c.template];
      if (!ct) return;
      if (ct.level === "battalion") out.push({ template: c.template, count: c.count || 1 });
      else if (ct.level === "company" || ct.level === "platoon") out.push({ template: c.template, count: c.count || 1, attachedCo: true });
    });
    return out;
  }

  var TIER_MEN = { active: 0.92, reduced: 0.55, cadre: 0.25 };

  function makeBattalion(tpls, tplId, tier, name) {
    var acc = { men: 0, slots: {} };
    expandTemplate(tpls, tplId, 1, acc, 0);
    return {
      tpl: tplId, name: name || (tpls[tplId] && tpls[tplId].name) || tplId, tier: tier || "active",
      req: acc.slots, menMax: Math.round(acc.men), cls: {}, max: {}, org: 1.0, supply: 3.0, mobilising: tier !== "active",
    };
  }

  function allocateInventory(data, side, bns, opts) {
    // pool by template slot category
    var inv = data.inventory[side] || {}, pools = { shared: {}, nk: {} };
    Object.keys(inv).forEach(function (k) {
      var nk = k.indexOf("_nk_") === 0, mid = nk ? k.slice(4) : k, m = data.models[mid];
      if (!m || !m.category) return;
      var cat = POOL_ALIAS[m.category] || m.category, pool = nk ? pools.nk : pools.shared;
      pool[cat] = (pool[cat] || 0) + inv[k];
    });
    var extra = (opts && opts.inventoryDelta && opts.inventoryDelta[side]) || {};
    Object.keys(extra).forEach(function (cat) { pools.shared[cat] = Math.max(0, (pools.shared[cat] || 0) + extra[cat]); });
    var af = data.autofill[side] || { categories: [], share: 0.9 }, afSet = {};
    af.categories.forEach(function (c) { afSet[c] = true; });

    bns.slice().sort(function (a, b) { return a.priority - b.priority; }).forEach(function (bn) {
      CLASSES.forEach(function (c) { bn.cls[c] = 0; });
      Object.keys(bn.req).forEach(function (cat) {
        var need = bn.req[cat], got;
        if (afSet[cat]) got = Math.round(need * af.share);
        else {
          got = 0;
          if (bn.nk && pools.nk[cat]) { var a = Math.min(need, pools.nk[cat]); pools.nk[cat] -= a; got += a; }
          if (got < need && pools.shared[cat]) { var b = Math.min(need - got, pools.shared[cat]); pools.shared[cat] -= b; got += b; }
        }
        var cls = CAT2CLS[cat];
        if (cls) bn.cls[cls] += got;
      });
      bn.cls.men = Math.round(bn.menMax * TIER_MEN[bn.tier]);
      CLASSES.forEach(function (c) { bn.max[c] = c === "men" ? bn.menMax : bn.cls[c]; });
    });
    // leftover NK stock flows to shared use
    return pools;
  }

  // ------------------------------------------------------------------ world
  function createWorld(data, opts) {
    opts = opts || {};
    var map = buildMap(data);
    var rng = makeRng(opts.seed || 1);
    var w = {
      data: data, map: map, rng: rng, opts: opts, tick: 0, day: 0, ended: false, outcome: null,
      aiTier: opts.aiTier || "H", armAi: opts.armAi === undefined ? "historical" : opts.armAi,
      units: [], unitById: {}, engagements: {}, orders: [], nextUnitId: 1,
      air: { tb2: 12 * P.AZE_DRONE_MULT[opts.aiTier || "H"], tb2Max: 12 * P.AZE_DRONE_MULT[opts.aiTier || "H"], loiter: 250 * P.AZE_DRONE_MULT[opts.aiTier || "H"], tb2Lost: 0, strikes: 0 },
      armConvoy: opts.convoy || "continuous", convoyPool: P.CONVOY_POOL,
      ledger: {
        ARM: zeroCls(), AZE: zeroCls(), captured: { ARM: zeroCls(), AZE: zeroCls() },
        byLine: { A: 0, C: 0, E: 0 }, samDay14: null, kia: { ARM: 0, AZE: 0 },
      },
      milestones: {}, events: [], gainsByDay: [], redLine: false, weather: [],
      fortBonus: opts.fortBonus || 0,
    };
    for (var d = 0; d <= P.MAX_DAYS + 2; d++) w.weather.push(rng.chance(0.14) ? 0.35 : 1.0);
    if (w.fortBonus) map.hexes.forEach(function (h) { if (h.region === "arm_zone") h.fort = Math.min(0.95, h.fort + w.fortBonus); });
    deployForces(w, data, opts);
    return w;
  }

  function zeroCls() { var o = {}; CLASSES.forEach(function (c) { o[c] = 0; }); return o; }

  function inBox(map, lat, lon) {
    return lat <= 40.78 && lat >= 38.85 && lon >= 45.55 && lon <= 47.8;
  }

  // Off-map formations that historically reinforced the theatre (estimated arrival day)
  var ARM_REINFORCE = { arm_2nd_corps: { day: 6, entry: "vardenis" }, arm_4th_corps: { day: 9, entry: "sisian" }, arm_army_troops: { day: 3, entry: "sisian" } };

  var MANEUVER_BRANCH = { mech_infantry: 1, motor_infantry: 1, light_infantry: 1, armor: 1 };
  function roleOf(tpls, tplId) {
    var t = tpls[tplId] || {};
    if (t.level === "battalion" && MANEUVER_BRANCH[t.branch]) return "maneuver";
    if (t.branch === "artillery" || t.branch === "fire_support") return "artillery";
    if (t.branch === "air_defense") return "ad";
    return "hq";
  }

  function deployForces(w, data, opts) {
    var map = w.map, tpls = data.templates;
    w.formations = [];
    ["ARM", "AZE"].forEach(function (side) {
      var allBns = [];
      data.oob[side].forEach(function (corps) {
        var cLat = corps.lat, cLon = corps.lon;
        var on = inBox(map, cLat, cLon), re = side === "ARM" ? ARM_REINFORCE[corps.id] : null;
        var isNK = corps.id === "arm_nk_army";
        var children = [];
        (corps.children || []).forEach(function (ch) { for (var n = 0; n < (ch.count || 1); n++) children.push({ ch: ch, idx: n }); });
        children.forEach(function (c) {
          var lat = c.ch.lat || cLat, lon = c.ch.lon || cLon, onMap = inBox(map, lat, lon);
          if (!onMap && !re) return;
          var tier = c.ch.tier || corps.tier || "active", t = tpls[c.ch.template];
          var fname = c.ch.name || ((corps.name || "") + " " + ((t && t.name) || c.ch.template) + (children.length > 1 ? " #" + (c.idx + 1) : ""));
          // Rename "拉钦/赞格兰守备团" to its historical 6th Defense District role at Talysh/Madaghis
          if (fname === "拉钦/赞格兰守备团") {
            fname = "塔利什/马达吉斯第 6 防御区团";
            lat = 40.33; lon = 46.74; tier = "active";
          }
          var f = { id: side[0] + "F" + (w.formations.length + 1), side: side, name: fname, corps: corps.id, tier: tier, units: [],
                    anchor: { lat: lat, lon: lon }, onMap: onMap, arriveDay: onMap ? 0 : re.day, entry: re ? re.entry : null, isNK: isNK,
                    echelon: /旅/.test(fname) ? "X" : "III" };
          w.formations.push(f);
          var hqGroup = null;
          battalionsOf(tpls, c.ch.template).forEach(function (bspec) {
            for (var k = 0; k < bspec.count; k++) {
              var bn = makeBattalion(tpls, bspec.template, tier);
              bn.priority = (c.ch.priority || corps.priority || 50) + (onMap ? 0 : 5); bn.nk = isNK; allBns.push(bn);
              var role = roleOf(tpls, bspec.template);
              if (role === "hq") {
                if (!hqGroup) { hqGroup = newUnit(w, side, "battalion", fname + " · 旅/团部与保障群", corps.id); hqGroup.role = "hq"; attach(hqGroup, f); }
                hqGroup.bns.push(bn); continue;
              }
              var u = newUnit(w, side, "battalion", bn.name + " · " + fname, corps.id);
              u.role = role; u.bns.push(bn); attach(u, f);
            }
          });
        });
        if ((corps.direct || []).length && (on || re)) {
          var dfName = isNK ? "阿尔察赫直属装甲与炮兵旅" : (corps.name + " 直属炮兵与侦察团");
          var df = { id: side[0] + "F" + (w.formations.length + 1), side: side, name: dfName, corps: corps.id, tier: corps.tier || "active", units: [],
                     anchor: { lat: cLat, lon: cLon }, onMap: on, arriveDay: on ? 0 : re.day, entry: re ? re.entry : null, isNK: isNK,
                     echelon: /旅/.test(dfName) ? "X" : "III", isDirectGroup: true };
          w.formations.push(df);
          (corps.direct || []).forEach(function (dr) {
            for (var n = 0; n < (dr.count || 1); n++) {
              var tier = dr.tier || corps.tier || "active";
              var bn = makeBattalion(tpls, dr.template, tier, dr.name);
              bn.priority = (corps.priority || 50) + 2; bn.nk = isNK; allBns.push(bn);
              var u = newUnit(w, side, "corps_bn", (dr.name || bn.name) + " · " + dfName, corps.id);
              u.role = /特种/.test(dr.name || "") ? "sof" : roleOf(tpls, dr.template);
              if (u.role === "sof") u.kind = "sof";
              u.bns.push(bn); attach(u, df);
            }
          });
        }
      });
      var left = allocateInventory(data, side, allBns, opts);
      provisionalUnits(w, side, left);
      if (side === "ARM") addTheatreAD(w, data, opts);
      if (side === "ARM") distributeDeliveries(w, opts);
      placeFormations(w, side);
    });
    addBorderGarrisons(w, data);
    w.units.forEach(function (u) { if (u.side === "ARM") u.ad = (opts.armAdPosture || (w.armAi === "historical" ? "active" : "ambush")); });
  }

  // Border-garrison corps pinned at their actual historical headquarters (deterministic, no RNG/pool draw)
  function addBorderGarrisons(w, data) {
    var map = w.map;
    var specs = [
      { side: "ARM", corps: "arm_3rd_corps", fname: "第 3 军（瓦纳佐尔北方守备旅）", place: "vanadzor", nb: 3, tier: "reduced", men: 520, tanks: 10, ifv: 15, art: 12 },
      { side: "ARM", corps: "arm_5th_corps", fname: "第 5 军（埃里温首都守备旅）", place: "yerevan", nb: 2, tier: "cadre", men: 460, tanks: 8, ifv: 12, art: 10 },
      { side: "AZE", corps: "aze_nakhchivan_army", fname: "纳希切万独立合成集团军", place: "nakhchivan", nb: 3, tier: "active", men: 620, tanks: 18, ifv: 24, art: 18 },
    ];
    specs.forEach(function (sp) {
      var hi = map.places[sp.place];
      if (hi === undefined) return;
      var h = map.hexes[hi];
      var f = { id: sp.side[0] + "F" + (w.formations.length + 1), side: sp.side, name: sp.fname, corps: sp.corps, tier: sp.tier, units: [],
                anchor: { lat: h.lat, lon: h.lon }, onMap: true, arriveDay: 0, entry: null, isNK: false, garrison: true, hex: hi, echelon: "X" };
      w.formations.push(f);
      for (var idx = 0; idx < sp.nb; idx++) {
        var u = newUnit(w, sp.side, "battalion", "守备摩步营 #" + (idx + 1) + " · " + sp.fname, sp.corps);
        u.role = "maneuver"; u.static = true; u.garrison = true; u.hex = hi;
        var bn = { tpl: "garrison_bn", name: "守备摩步营", tier: sp.tier, req: {}, menMax: 650, cls: zeroCls(), max: zeroCls(), org: 0.9, supply: 3.5, mobilising: false };
        bn.cls.men = sp.men; bn.cls.tanks = sp.tanks; bn.cls.ifv = sp.ifv; bn.cls.art = sp.art; bn.cls.atgm = 6; bn.cls.trucks = 18;
        CLASSES.forEach(function (c) { bn.max[c] = c === "men" ? 650 : bn.cls[c]; });
        u.bns.push(bn); attach(u, f); u.hex = hi;
      }
    });
  }

  // Stored equipment that has no template slot is issued to provisional battalions manned by mobilised
  // reservists (reduced tier), grouped into a Mobilized Reserve Brigade per side.
  var PROV = [
    { cat: "mbt", cls: "tanks", per: 30, men: 120, name: "动员坦克营", role: "maneuver" },
    { cat: "ifv", cls: "ifv", per: 30, men: 420, name: "动员机步营", role: "maneuver" },
    { cat: "howitzer_light_sp", cls: "sp", per: 18, men: 160, name: "动员自行炮营", role: "artillery" },
    { cat: "howitzer_heavy_sp", cls: "sp", per: 18, men: 160, name: "动员自行炮营", role: "artillery" },
    { cat: "howitzer_light_towed", cls: "art", per: 18, men: 180, name: "动员牵引炮营", role: "artillery" },
    { cat: "howitzer_heavy_towed", cls: "art", per: 18, men: 180, name: "动员牵引炮营", role: "artillery" },
    { cat: "mrl_light", cls: "mrl", per: 12, men: 110, name: "动员火箭炮营", role: "artillery" },
  ];
  function provisionalUnits(w, side, pools) {
    [["nk", 0.0], ["shared", side === "ARM" ? 0.5 : 0.8]].forEach(function (pp) {
      var pool = pools[pp[0]], share = pp[1];
      if (pp[0] === "nk" && side !== "ARM") return;
      var created = [];
      PROV.forEach(function (p) {
        var s = p.cls === "mrl" ? 1.0 : (pp[0] === "nk" ? 1 : share);
        var have = Math.floor((pool[p.cat] || 0) * s);
        while (have >= p.per * 0.5) {
          var n = Math.min(p.per, have); have -= n; pool[p.cat] -= n;
          var bn = { tpl: "provisional", name: p.name, tier: "reduced", req: {}, menMax: p.men, cls: zeroCls(), max: zeroCls(), org: 0.8, supply: 2.5, mobilising: true };
          bn.cls[p.cls] = n; bn.cls.men = Math.round(p.men * 0.5); bn.cls.trucks = Math.round(n * 0.6);
          if (p.cls === "ifv") bn.cls.atgm = 4;
          CLASSES.forEach(function (c) { bn.max[c] = c === "men" ? p.men : bn.cls[c]; });
          created.push({ bn: bn, role: p.role, name: p.name });
        }
      });
      if (!created.length) return;
      var onMap = !(side === "ARM" && pp[0] === "shared");
      var fname = side === "ARM" ? (pp[0] === "nk" ? "阿尔察赫动员预备团" : "亚美尼亚总参动员预备旅") : "阿塞拜疆总参预备炮兵与装甲旅";
      var anchor = side === "ARM" ? { lat: 39.82, lon: 46.75 } : { lat: 40.02, lon: 47.15 };
      var f = { id: side[0] + "F" + (w.formations.length + 1), side: side, name: fname,
                corps: side === "ARM" ? (pp[0] === "nk" ? "arm_nk_army" : "arm_army_troops") : "aze_army_troops",
                tier: "reduced", units: [], anchor: anchor, onMap: onMap,
                arriveDay: onMap ? 0 : 5, entry: onMap ? null : "sisian", isNK: pp[0] === "nk", echelon: "X" };
      w.formations.push(f);
      created.forEach(function (item, idx) {
        var u = newUnit(w, side, "corps_bn", item.name + " #" + (idx + 1) + " · " + fname, f.corps);
        u.role = item.role; u.bns.push(item.bn); attach(u, f);
      });
    });
  }

  function attach(u, f) {
    u.formation = f.id; u.anchor = f.anchor; u.tier = f.tier; u.onMap = f.onMap; u.isNK = f.isNK;
    u.arriveDay = f.arriveDay; u.entry = f.entry; f.units.push(u.id);
  }

  // Explicit historical sector assignment for 42 km operational hexes:
  // Every Brigade/Regiment deploys cohesively in its single operational sector hex (no 1-per-hex carpet scattering).
  var EXPLICIT_FORMATION_PLACE = {
    "克尔巴贾尔守备团": "kalbajar",
    "塔利什/马达吉斯第 6 防御区团": "sugovushan",
    "马尔塔克特方向团": "martakert",
    "阿斯克兰/阿格达姆方向团": "stepanakert",
    "马尔图尼方向团": "aghdam",
    "哈德鲁特/菲祖利方向团": "fuzuli",
    "杰布拉伊尔方向团": "jabrayil",
    "阿尔察赫直属装甲与炮兵旅": "shusha",
    "阿尔察赫防空导弹旅": "stepanakert",
    "阿尔察赫动员预备团": "shusha",
    "第 1 军 亚美尼亚苏式摩步团 #1": "goris",
    "第 1 军 亚美尼亚苏式摩步团 #2": "goris",
    "第 1 军 直属炮兵与侦察团": "goris",
  };

  function placeFormations(w, side) {
    var map = w.map, hexes = map.hexes, occ = w._occ || (w._occ = {});
    var isKarabakhFront = function (h) {
      if (h.owner !== side) return false;
      if (side === "ARM") return h.region === "arm_zone" && h.nb.some(function (j) { return hexes[j].owner !== side; });
      return h.region === "aze" && h.nb.some(function (j) { return hexes[j].region === "arm_zone"; });
    };
    var okRegion = function (h, f) {
      if (h.owner !== side) return false;
      if (side === "AZE") return h.region === "aze";
      return f.isNK ? h.region === "arm_zone" : (h.region === "arm_zone" || h.place === "goris" || h.place === "sisian" || h.place === "vardenis");
    };
    var dist2 = function (h, a) { return Math.pow((h.lat - a.lat) * 111, 2) + Math.pow((h.lon - a.lon) * 85.3, 2); };

    // AZE jump-off hubs along the Line of Contact + strategic reserve hubs
    var AZE_CORPS_HUBS = {
      aze_3rd_corps: ["gadabay", "goranboy"],
      aze_1st_corps: ["goranboy", "tartar", "agjabadi"],
      aze_2nd_corps: ["beylagan", "horadiz", "aras_east"],
      aze_4th_corps: ["baku", "mingachevir"],
      aze_army_troops: ["mingachevir", "horadiz"],
    };

    w.formations.filter(function (f) { return f.side === side && f.onMap && !f.garrison; })
      .sort(function (a, b) { return (a.tier === "active" ? 0 : 1) - (b.tier === "active" ? 0 : 1); })
      .forEach(function (f, fIdx) {
        var units = f.units.map(function (id) { return w.unitById[id]; }).filter(Boolean);
        var chosenHex = -1;
        if (side === "ARM" && EXPLICIT_FORMATION_PLACE[f.name] && map.places[EXPLICIT_FORMATION_PLACE[f.name]] !== undefined) {
          chosenHex = map.places[EXPLICIT_FORMATION_PLACE[f.name]];
        } else if (side === "AZE" && AZE_CORPS_HUBS[f.corps]) {
          var hubs = AZE_CORPS_HUBS[f.corps].map(function (p) { return map.places[p]; }).filter(function (x) { return x !== undefined; });
          if (hubs.length) {
            var bestH = hubs[0], bdH = 1e18;
            hubs.forEach(function (hi) {
              var d = dist2(hexes[hi], f.anchor) + (occ[hi] || 0) * 2500;
              if (d < bdH) { bdH = d; bestH = hi; }
            });
            chosenHex = bestH;
          }
        }
        if (chosenHex < 0) {
          var front = f.tier === "active" && (side === "AZE" || f.isNK);
          var best = -1, bd = 1e18;
          hexes.forEach(function (h) {
            if (!okRegion(h, f) || (front && !isKarabakhFront(h))) return;
            var d = dist2(h, f.anchor) * (1 + (occ[h.i] || 0) * 0.5);
            if (d < bd) { bd = d; best = h.i; }
          });
          if (best < 0) best = nearestHex(map, f.anchor.lat, f.anchor.lon, function (h) { return okRegion(h, f); });
          chosenHex = best;
        }
        f.hex = chosenHex;
        occ[chosenHex] = (occ[chosenHex] || 0) + 1;
        units.forEach(function (u) { u.hex = chosenHex; });
      });

    // Any un-deployed off-map formations get hex = -1 until arrival
    w.formations.filter(function (f) { return f.side === side && !f.onMap; }).forEach(function (f) {
      f.hex = -1;
      f.units.forEach(function (id) { var u = w.unitById[id]; if (u) u.hex = -1; });
    });
  }

  function addTheatreAD(w, data, opts) {
    var inv = data.inventory.ARM, map = w.map;
    var s300 = (inv.s300ps || 0) + ((opts.inventoryDelta && opts.inventoryDelta.ARM && opts.inventoryDelta.ARM.sam_long) || 0);
    var med = (inv.krug || 0) + (inv.s125_pechora || 0) + (inv.buk_m1_2 || 0) + ((opts.inventoryDelta && opts.inventoryDelta.ARM && opts.inventoryDelta.ARM.sam_medium) || 0);
    var tor = (inv.tor_m2km || 0);
    var hStep = map.places.stepanakert;
    var f = { id: "AF" + (w.formations.length + 1), side: "ARM", name: "阿尔察赫防空导弹旅", corps: "arm_air_defence", tier: "active", units: [],
              anchor: { lat: 39.82, lon: 46.75 }, onMap: true, arriveDay: 0, entry: null, isNK: true, hex: hStep, echelon: "X" };
    w.formations.push(f);
    var spots = [["stepanakert", s300 * 0.5, med * 0.4, tor * 0.5], ["stepanakert", s300 * 0.25, med * 0.3, tor * 0.25], ["martakert", s300 * 0.25, med * 0.3, tor * 0.25]];
    spots.forEach(function (s, idx) {
      var h = map.places[s[0]];
      if (h === undefined) return;
      var u = newUnit(w, "ARM", "corps_bn", "防空导弹营 #" + (idx + 1) + " · 阿尔察赫防空导弹旅", "arm_air_defence");
      u.role = "ad";
      var bn = { tpl: "theatre_ad", name: u.name, tier: "active", req: {}, menMax: 160, cls: zeroCls(), max: zeroCls(), org: 1, supply: 3, mobilising: false };
      bn.cls.samLong = Math.round(s[1]); bn.cls.sam = Math.round(s[2]); bn.cls.tor = Math.round(s[3]); bn.cls.men = 160; bn.cls.trucks = 20;
      CLASSES.forEach(function (c) { bn.max[c] = bn.cls[c]; });
      u.bns.push(bn); attach(u, f); u.hex = hStep; u.onMap = true; u.arriveDay = 0; u.static = true;
    });
  }

  // Extra deliveries (procurement deltas) for systems issued below brigade level: mobile SHORAD (Tor) to the
  // AD/HQ elements of NK formations, ATGM teams to NK maneuver battalions. (Template slots for these are auto-filled.)
  function distributeDeliveries(w, opts) {
    var d = (opts.inventoryDelta && opts.inventoryDelta.ARM) || {};
    var nkUnits = w.units.filter(function (u) { return u.side === "ARM" && u.isNK && u.onMap; });
    var spread = function (n, pool, cls) {
      if (!n || !pool.length) return;
      for (var i = 0; i < n; i++) { var b = pool[i % pool.length].bns[0]; b.cls[cls] += 1; b.max[cls] = (b.max[cls] || 0) + 1; }
    };
    spread(d.tor || 0, nkUnits.filter(function (u) { return u.role === "ad" || u.role === "hq"; }), "tor");
    spread(d.atgm_heavy || 0, nkUnits.filter(function (u) { return u.role === "maneuver"; }), "atgm");
  }

  function newUnit(w, side, kind, name, corps) {
    var u = {
      id: side[0] + (w.nextUnitId++), side: side, kind: kind, name: name, corps: corps, bns: [], hex: -1,
      posture: "defend", target: -1, path: [], moveProg: 0, ad: "ambush", dug: 0, arriveDay: 0,
      control: side === "ARM" && w.opts.player ? "player" : "ai", lastOrderTick: -999, engagedTicks: 0,
    };
    w.units.push(u); w.unitById[u.id] = u;
    return u;
  }

  function placeUnits(w, side, units) {
    var map = w.map;
    var occupancy = {};
    function occ(i) { return occupancy[i] || 0; }
    var isFront = function (h) { return h.owner === side && h.nb.some(function (j) { return map.hexes[j].owner !== side; }); };
    // NK regiments and corps formations: front hex near anchor; reduced tier: rear
    units.sort(function (a, b) { return (a.tier === "active" ? 0 : 1) - (b.tier === "active" ? 0 : 1); });
    units.forEach(function (u) {
      if (u.hex >= 0) { occupancy[u.hex] = occ(u.hex) + 1; return; }
      if (!u.onMap) { u.hex = -1; return; }
      var wantFront = u.kind === "formation" && u.tier === "active" && !isArtilleryUnit(u);
      var cands = map.hexes.filter(function (h) {
        if (h.owner !== side) return false;
        if (side === "AZE" && h.region !== "aze") return false;
        if (side === "ARM" && h.region === "armenia" && u.isNK) return false;
        return wantFront ? isFront(h) : !isFront(h) || u.kind !== "formation";
      });
      var best = -1, bd = 1e9;
      cands.forEach(function (h) {
        var d = Math.pow((h.lat - u.anchor.lat) * 111, 2) + Math.pow((h.lon - u.anchor.lon) * 85.3, 2);
        d *= 1 + occ(h.i) * (wantFront ? 3.0 : 0.6);
        if (d < bd) { bd = d; best = h.i; }
      });
      if (best < 0) best = nearestHex(map, u.anchor.lat, u.anchor.lon, function (h) { return h.owner === side; });
      u.hex = best; occupancy[best] = occ(best) + 1;
    });
  }

  function isArtilleryUnit(u) {
    var a = 0, d = 0;
    u.bns.forEach(function (b) { a += b.cls.art + b.cls.sp + b.cls.mrl + b.cls.mrl_lr; d += b.cls.tanks + b.cls.ifv + b.cls.apc + b.cls.men / 40; });
    return a > d * 0.5;
  }

  // ------------------------------------------------------------- strengths
  function bnAttack(bn, terrain) {
    var c = bn.cls, A = P.ATT;
    var armor = (c.tanks * A.tanks + c.ifv * A.ifv + c.apc * A.apc) * P.ARMOR_T[terrain];
    var inf = (c.men * A.men + c.atgm * A.atgm + c.mortar * A.mortar + c.aaa * A.aaa) * P.INF_T[terrain];
    return (armor + inf) * bn.org * supplyFactor(bn);
  }
  function bnDefense(bn, terrain) {
    var c = bn.cls, D = P.DEF;
    var armor = (c.tanks * D.tanks + c.ifv * D.ifv + c.apc * D.apc) * (0.5 + 0.5 * P.ARMOR_T[terrain]);
    var inf = c.men * D.men + c.atgm * D.atgm + c.mortar * D.mortar + c.aaa * D.aaa;
    return (armor + inf) * P.DEF_T[terrain] * (0.35 + 0.65 * bn.org) * supplyFactor(bn);
  }
  function bnFire(bn) {
    var c = bn.cls, F = P.FIRE;
    return (c.art * F.art + c.sp * F.sp + c.mrl * F.mrl + c.mrl_lr * F.mrl_lr) * supplyFactor(bn);
  }
  function supplyFactor(bn) { return Math.max(0.25, Math.min(1, bn.supply / 1.0)); }
  function unitMen(u) { var s = 0; u.bns.forEach(function (b) { s += b.cls.men; }); return s; }
  function unitsAt(w, hexI, side) {
    return w.units.filter(function (u) { return u.hex === hexI && u.side === side && alive(u); });
  }
  function alive(u) { return u.hex >= 0 && u.bns.length > 0 && unitMen(u) > 15; }

  // ------------------------------------------------------------------ orders
  function orderDelayTicks(w, u, urgent, viaFormation) {
    var base = viaFormation ? P.DELAY_MIN.formation
      : P.DELAY_MIN[u.kind === "sof" ? "sof" : u.kind === "battalion" ? "detached_bn" : "corps_bn"];
    var night = isNight(w) ? 1.2 : 1.0;
    var orgF = 1.5 - 0.5 * avgOrg(u);
    return Math.max(1, Math.round((base * night * orgF * (urgent ? 0.6 : 1)) / 60));
  }
  function avgOrg(u) { var s = 0, n = 0; u.bns.forEach(function (b) { s += b.org; n++; }); return n ? s / n : 0; }

  // order: {type:'move'|'attack'|'defend'|'reserve'|'ad'|'convoy', target:hexIndex, ad:'active'|...}
  function issueOrder(w, unitId, order) {
    var u = w.unitById[unitId];
    if (!u || !alive(u)) return { ok: false, reason: "unit_gone" };
    if (order.type === "ad") { u.ad = order.ad; return { ok: true, delay: 0 }; } // EMCON is a standing unit setting
    var d = orderDelayTicks(w, u, order.type === "defend", !!order.viaFormation);
    w.orders.push({ unit: unitId, order: order, at: w.tick + d, issued: w.tick });
    return { ok: true, delay: d };
  }
  // Formation order (DC-010 fast path): on 42 km hexes, the entire brigade/regiment acts cohesively in a single sector hex.
  function issueFormationOrder(w, formationId, order) {
    var f = (w.formations || []).filter(function (x) { return x.id === formationId; })[0];
    if (!f) return { ok: false, reason: "no_formation" };
    var units = f.units.map(function (id) { return w.unitById[id]; }).filter(function (u) { return u && alive(u); });
    var man = units.filter(function (u) { return u.role === "maneuver" || u.role === "sof"; });
    if (order.type === "ad") { units.forEach(function (u) { u.ad = order.ad; }); return { ok: true, delay: 0, n: units.length }; }
    var actUnits = man.length ? man : units;
    if (!actUnits.length) return { ok: false, reason: "no_maneuver" };
    var maxDelay = 0;
    actUnits.forEach(function (u) {
      var o = { type: order.type, target: order.target, viaFormation: true };
      var r = issueOrder(w, u.id, o);
      maxDelay = Math.max(maxDelay, r.delay || 0);
    });
    if (order.type === "move" || order.type === "defend" || order.type === "reserve") {
      units.filter(function (u) { return actUnits.indexOf(u) < 0; }).forEach(function (u) {
        issueOrder(w, u.id, { type: order.type, target: order.target, viaFormation: true });
      });
    }
    return { ok: true, delay: maxDelay, n: units.length };
  }
  function pendingOrders(w, unitId) { return w.orders.filter(function (o) { return o.unit === unitId; }); }
  function cancelOrders(w, unitId) { w.orders = w.orders.filter(function (o) { return o.unit !== unitId; }); }
  function setConvoy(w, policy) { w.armConvoy = policy; }
  // Fog of war for the ARM player: enemy units are visible within 1 hex of a friendly unit (2 with recon)
  function visibleToArm(w, u) {
    if (u.side === "ARM") return true;
    var hexes = w.map.hexes, h = hexes[u.hex];
    if (!h) return false;
    for (var i = 0; i < w.units.length; i++) {
      var o = w.units[i];
      if (o.side !== "ARM" || !alive(o)) continue;
      var d = hexDist(hexes[o.hex], h);
      if (d <= 1) return true;
    }
    return false;
  }

  function processOrders(w) {
    var keep = [];
    w.orders.forEach(function (o) {
      if (o.at > w.tick) { keep.push(o); return; }
      var u = w.unitById[o.unit];
      if (!u || !alive(u)) return;
      applyOrder(w, u, o.order);
    });
    w.orders = keep;
  }
  function applyOrder(w, u, ord) {
    u.lastOrderTick = w.tick;
    if (ord.type === "defend") { u.posture = "defend"; u.target = -1; u.path = []; return; }
    if (ord.type === "reserve") { u.posture = "reserve"; u.target = -1; u.path = []; return; }
    if (ord.type === "move" || ord.type === "attack") {
      var dest = ord.target, h = w.map.hexes[dest];
      if (h.owner !== u.side && w.map.hexes[u.hex].nb.indexOf(dest) >= 0) { u.posture = "attack"; u.target = dest; u.path = []; return; }
      var path = findPath(w, u.side, u.hex, dest);
      if (!path) return;
      u.path = path; u.moveProg = 0; u.posture = "move"; u.target = -1; u.dug = 0;
    }
  }

  function moveCostH(w, a, b) {
    var ha = w.map.hexes[a], hb = w.map.hexes[b];
    var c = ha.roadNb[b] ? P.ROAD_H : P.MOVE_H[hb.terrain];
    return c;
  }
  function findPath(w, side, from, to) {
    // Dijkstra over own-controlled hexes; the final step may enter an enemy hex (= attack on arrival)
    var hexes = w.map.hexes, dist = {}, prev = {}, open = [from];
    dist[from] = 0;
    while (open.length) {
      var bi = 0;
      for (var k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      var cur = open.splice(bi, 1)[0];
      if (cur === to) break;
      hexes[cur].nb.forEach(function (n) {
        if (hexes[n].owner !== side && n !== to) return;
        if (side === "AZE" && hexes[n].region === "armenia") return;
        var nd = dist[cur] + moveCostH(w, cur, n);
        if (dist[n] === undefined || nd < dist[n]) { dist[n] = nd; prev[n] = cur; if (open.indexOf(n) < 0) open.push(n); }
      });
    }
    if (dist[to] === undefined) return null;
    var path = [], c = to;
    while (c !== from) { path.unshift(c); c = prev[c]; }
    return path;
  }

  // ------------------------------------------------------------------ tick
  function isNight(w) { var h = w.tick % 24; return h < P.DAY_START || h >= P.DAY_END; }

  function tick(w) {
    if (w.ended) return;
    w.tick++;
    var newDay = w.tick % 24 === 0;
    if (newDay) w.day++;
    arrivals(w);
    if (w.tick % 6 === 1) { aiAZE(w); if (w.armAi) aiARM(w); }
    processOrders(w);
    movement(w);
    resolveCombat(w);
    if (!isNight(w)) airStrikes(w);
    if (w.tick % P.CB_EVERY === 0) artilleryDuel(w);
    if (w.tick % 6 === 0) supply(w);
    recover(w);
    if (newDay) dailyChecks(w);
  }

  function arrivals(w) {
    w.units.forEach(function (u) {
      if (u.hex >= 0 || u.dead || u.arriveDay === undefined || u.arriveDay > w.day || u.onMap) return;
      if (u.arriveDay <= w.day && u.entry) {
        var h = w.map.places[u.entry];
        if (h !== undefined && w.map.hexes[h].owner === u.side) {
          u.hex = h; u.onMap = true; u.posture = "reserve";
          var key = (u.formation || u.id) + ":" + w.day;
          if (!w._arrLogged) w._arrLogged = {};
          if (!w._arrLogged[key]) {
            w._arrLogged[key] = true;
            var f = u.formation && w.formations.filter(function (x) { return x.id === u.formation; })[0];
            logEv(w, "info", (u.side === "ARM" ? "增援抵达 " : "阿方增援 ") + (h !== undefined ? (w.map.hexes[h].name_arm || "") : "") + "：" + (f ? f.name : u.name), h);
          }
        }
      }
    });
  }

  function movement(w) {
    w.units.forEach(function (u) {
      if (!alive(u) || u.posture !== "move" || !u.path.length) return;
      var next = u.path[0], h = w.map.hexes[next];
      if (h.owner !== u.side) {
        var enemy = unitsAt(w, next, u.side === "ARM" ? "AZE" : "ARM");
        if (enemy.length) { u.posture = "attack"; u.target = next; u.path = []; return; }
      }
      u.moveProg += (isNight(w) ? 0.7 : 1.0) / moveCostH(w, u.hex, next);
      if (u.moveProg >= 1) {
        u.moveProg = 0; u.path.shift();
        if (h.owner !== u.side) captureHex(w, next, u.side, "walk-in");
        u.hex = next; u.dug = 0;
        if (!u.path.length) u.posture = "defend";
      }
    });
  }

  function captureHex(w, hi, side, how) {
    var h = w.map.hexes[hi];
    if (h.owner === side) return;
    (w.captureLog = w.captureLog || []).push({ day: w.day, hex: hi, side: side, how: how, by: w._capBy || null });
    h.owner = side;
    if (side === "AZE" && h.region === "armenia") w.redLine = true;
    if (h.region === "arm_zone") w.gainsByDay[w.day] = (w.gainsByDay[w.day] || 0) + (side === "AZE" ? 1 : -1);
    if (h.place && w.milestones[h.place] === undefined && side === "AZE") w.milestones[h.place] = w.day + (w.tick % 24) / 24;
    if (h.place) logEv(w, side === "AZE" ? "crit" : "good", (side === "AZE" ? "阿方占领 " : "亚方收复 ") + (h.name_arm || h.place), hi);
    h.fort = Math.min(h.fort, 0.15);
  }

  // engagements: one per defended hex that has attackers targeting it
  function resolveCombat(w) {
    var hexes = w.map.hexes, targets = {};
    w.units.forEach(function (u) {
      if (!alive(u) || u.posture !== "attack" || u.target < 0) return;
      if (hexes[u.target].owner === u.side) { u.posture = "defend"; u.target = -1; return; }
      if (hexes[u.hex].nb.indexOf(u.target) < 0) { u.posture = "defend"; u.target = -1; return; }
      (targets[u.target] = targets[u.target] || []).push(u);
    });
    var night = isNight(w);
    var fireUsed = {};
    Object.keys(targets).forEach(function (ti) {
      ti = +ti;
      var atts = targets[ti], aSide = atts[0].side, dSide = aSide === "ARM" ? "AZE" : "ARM", hx = hexes[ti];
      var defs = unitsAt(w, ti, dSide);
      var eng = w.engagements[ti] || (w.engagements[ti] = { adv: 0, side: aSide, start: w.tick, hours: 0 });
      if (eng.side !== aSide) { eng.adv = 0; eng.side = aSide; }
      eng.hours++; eng.lastTick = w.tick;
      if (!defs.length) {
        eng.adv += (P.FLIP_KM / P.MOVE_H[hx.terrain]) / (1 + 2 * hx.fort) * (night ? 0.5 : 1);
        if (eng.adv >= P.FLIP_KM) { w._capBy = atts.map(function (u) { return u.id + ":" + (u.axis || "") + ":" + u.corps; }).join(","); captureHex(w, ti, aSide, "empty"); moveInto(w, atts, ti); delete w.engagements[ti]; }
        return;
      }
      var EA = 0, ED = 0;
      atts.forEach(function (u) { u.bns.forEach(function (b) { EA += bnAttack(b, hx.terrain); }); u.engagedTicks++; });
      defs.forEach(function (u) { u.bns.forEach(function (b) { ED += bnDefense(b, hx.terrain); }); u.engagedTicks++; });
      var fortM = 1 + P.FORT_MULT * Math.min(1, hx.fort + defs.reduce(function (s, u) { return Math.max(s, u.dug); }, 0) * 0.25);
      ED *= fortM;
      var FA = fireSupport(w, aSide, ti, fireUsed) * P.SPOT[aSide] * (night ? 0.6 : 1);
      var FD = fireSupport(w, dSide, ti, fireUsed) * P.SPOT[dSide] * (night ? 0.8 : 1);
      var effA = (EA + P.FIRE_W * FA) * (night ? 0.75 : 1), effD = ED + P.FIRE_W * FD;
      if (effA <= 0 || effD <= 0) return;
      var R = effA / effD;
      eng.lastR = R;
      // advance (DC-023: single advanceKm per strip)
      var dAdv = P.ADV_BASE * P.MOVE_T[hx.terrain] * Math.max(0, Math.min(2.2, R - 1.0)) * (night ? P.ADV_NIGHT : 1) * w.rng.uni(0.6, 1.4);
      eng.adv += dAdv;
      // losses: AZE drone/artillery stand-off fire inflicts heavier attrition on exposed defenders while sparing AZE assault infantry
      var share = effA / (effA + effD);
      var intensity = night ? 0.5 : 1.0;
      var stackScale = Math.pow(Math.min(1, 10 / Math.max(1, defs.length)), 0.20);
      var dLoss = P.LOSS_K * 2.38 * share * intensity * stackScale / (0.65 + 0.35 * fortM) * w.rng.uni(0.7, 1.3);
      var aLoss = P.LOSS_K * 1.15 * (1 - share) * intensity * w.rng.uni(0.7, 1.3);
      var fireShareD = FA / Math.max(1e-6, effA / (night ? 0.75 : 1));
      defs.forEach(function (u) {
        var rMul = (u.role === "maneuver" || u.role === "sof") ? 1.0 : 0.25;
        u.bns.forEach(function (b) {
          applyLoss(w, dSide, b, dLoss * rMul, fireShareD > 0.25 ? "C" : "E", 0.84, 0.80);
          b.org = Math.max(0, b.org - P.ORG_LOSS * dLoss * rMul * (R > 1 ? 1.2 : 0.75));
        });
      });
      atts.forEach(function (u) {
        var rMul = (u.role === "maneuver" || u.role === "sof") ? 1.0 : 0.25;
        u.bns.forEach(function (b) { applyLoss(w, aSide, b, aLoss * rMul, "E", 0.75, 0.38); b.org = Math.max(0, b.org - P.ORG_LOSS * aLoss * rMul * 0.55); });
      });
      // break-through / retreat (measured on frontline maneuver battalions)
      var dOrg = 0, n = 0;
      defs.forEach(function (u) {
        if (u.role !== "maneuver" && u.role !== "sof") return;
        u.bns.forEach(function (b) { dOrg += b.org; n++; });
      });
      if (!n) defs.forEach(function (u) { u.bns.forEach(function (b) { dOrg += b.org; n++; }); });
      dOrg = n ? dOrg / n : 0;
      if (eng.adv >= P.FLIP_KM || dOrg < P.BREAK_ORG) {
        defs.forEach(function (u) { retreat(w, u, ti); });
        w._capBy = atts.map(function (u) { return u.id + ":" + (u.axis || "") + ":" + u.corps; }).join(",");
        captureHex(w, ti, aSide, "assault");
        moveInto(w, atts, ti);
        delete w.engagements[ti];
      }
      // attacker exhaustion: stop when org too low
      atts.forEach(function (u) { if (avgOrg(u) < 0.30) { u.posture = "defend"; u.target = -1; } });
    });
    // decay stale engagements
    Object.keys(w.engagements).forEach(function (k) {
      if (w.engagements[k].lastTick < w.tick - 12) delete w.engagements[k];
    });
  }

  function moveInto(w, atts, ti) {
    // On a 42 km operational sector, the main attacking group (up to 70% of committed battalions) advances into the captured sector
    var sorted = atts.slice().sort(function (a, b) { return unitMen(b) - unitMen(a); });
    var nMove = Math.max(1, Math.ceil(sorted.length * 0.75));
    atts.forEach(function (u) { u.posture = "defend"; u.target = -1; });
    for (var i = 0; i < nMove && i < sorted.length; i++) {
      sorted[i].hex = ti; sorted[i].dug = 0;
    }
  }

  function fireSupport(w, side, ti, used) {
    var tot = 0, th = w.map.hexes[ti];
    w.units.forEach(function (u) {
      if (u.side !== side || !alive(u) || u.posture === "move") return;
      var d = hexDist(w.map.hexes[u.hex], th);
      u.bns.forEach(function (b, bi) {
        var key = u.id + ":" + bi;
        if (used[key]) return;
        var c = b.cls, f = 0;
        if (d <= P.FIRE_RANGE.art) f += c.art * P.FIRE.art + c.sp * P.FIRE.sp;
        if (d <= P.FIRE_RANGE.mrl) f += c.mrl * P.FIRE.mrl;
        if (d <= P.FIRE_RANGE.mrl_lr) f += c.mrl_lr * P.FIRE.mrl_lr;
        if (f > 0) { used[key] = true; tot += f * supplyFactor(b); }
      });
    });
    return tot;
  }

  var LOSS_EXPOSURE = { men: 2.0, tanks: 0.9, ifv: 0.55, apc: 0.6, atgm: 0.6, mortar: 0.5, aaa: 0.5, manpads: 0.3, trucks: 0.4, art: 0.15, sp: 0.15, mrl: 0.15, sam: 0.02, tor: 0.02 };
  function applyLoss(w, side, b, frac, line, menMult, armorMult) {
    Object.keys(LOSS_EXPOSURE).forEach(function (c) {
      var have = b.cls[c];
      if (!have) return;
      var expected = have * frac * LOSS_EXPOSURE[c] * (c === "men" && menMult ? menMult : 1) * ((c === "tanks" || c === "ifv") && armorMult ? armorMult : 1);
      var lost = Math.floor(expected) + (w.rng.chance(expected - Math.floor(expected)) ? 1 : 0);
      lost = Math.min(have, lost);
      if (!lost) return;
      b.cls[c] -= lost;
      w.ledger[side][c] += lost;
      if (c === "men") w.ledger.kia[side] += side === "AZE" ? lost * 0.14 : Math.round(lost * 0.32);
      else { w.ledger.kia[side] += lost * (c === "tanks" ? 0.8 : 0.3); if (side === "ARM") w.ledger.byLine[line] += lost; }
    });
  }

  function retreat(w, u, fromHex) {
    var hexes = w.map.hexes;
    var opts = hexes[fromHex].nb.filter(function (j) { return hexes[j].owner === u.side; });
    // prefer hexes not adjacent to the attackers' side
    opts.sort(function (a, b) { return enemyAdj(w, a, u.side) - enemyAdj(w, b, u.side); });
    var lossFrac = opts.length ? P.RETREAT_LOSS * (1.5 - avgOrg(u)) : P.ENCIRCLED_LOSS;
    var capSide = u.side === "ARM" ? "AZE" : "ARM";
    u.bns.forEach(function (b) {
      ["tanks", "ifv", "apc", "art", "sp", "mrl", "mortar", "trucks", "sam", "aaa"].forEach(function (c) {
        var lost = Math.round(b.cls[c] * lossFrac * (c === "sam" ? 0.04 : c === "trucks" ? 0.5 : c === "tanks" ? 1.3 : 1) * w.rng.uni(0.6, 1.2));
        lost = Math.min(b.cls[c], lost);
        if (!lost) return;
        b.cls[c] -= lost; w.ledger[u.side][c] += lost; w.ledger.captured[capSide][c] += lost;
        if (u.side === "ARM") w.ledger.byLine.E += lost;
      });
      var menLost = Math.round(b.cls.men * lossFrac * 0.35);
      b.cls.men -= menLost; w.ledger[u.side].men += menLost; w.ledger.kia[u.side] += Math.round(menLost * 0.3);
      b.org = Math.max(0.15, b.org * 0.7);
    });
    if (!opts.length) { u.hex = -1; u.dead = true; logEv(w, "crit", u.name + " 被合围歼灭", fromHex); return; }
    u.hex = opts[0]; u.posture = "defend"; u.target = -1; u.path = []; u.dug = 0;
  }
  function enemyAdj(w, hi, side) {
    var hexes = w.map.hexes;
    return hexes[hi].nb.filter(function (j) { return hexes[j].owner !== side; }).length;
  }

  // ---------------------------------------------------- artillery duel (C line)
  // Counter-battery and harassing fire outside assaults. Drone spotting makes AZE fire far more lethal.
  function artilleryDuel(w) {
    var hexes = w.map.hexes, night = isNight(w);
    ["AZE", "ARM"].forEach(function (side) {
      var enemy = side === "AZE" ? "ARM" : "AZE";
      var targets = w.units.filter(function (u) { return u.side === enemy && !u.garrison && alive(u) && hexes[u.hex].region !== (enemy === "ARM" ? "armenia" : "__"); });
      if (!targets.length) return;
      var spot = side === "AZE" ? (night ? 0.6 : P.SPOT.AZE * Math.min(1, 0.4 + 0.6 * w.air.tb2 / Math.max(1, w.air.tb2Max))) : (night ? 0.3 : P.SPOT.ARM * 0.6);
      w.units.forEach(function (u) {
        if (u.side !== side || u.garrison || !alive(u) || u.posture === "move") return;
        var fire = 0, rng = 0;
        u.bns.forEach(function (b) { var f = bnFire(b); fire += f; if (b.cls.mrl_lr) rng = Math.max(rng, P.FIRE_RANGE.mrl_lr); else if (b.cls.mrl) rng = Math.max(rng, P.FIRE_RANGE.mrl); else if (b.cls.art + b.cls.sp) rng = Math.max(rng, P.FIRE_RANGE.art); });
        if (fire <= 0) return;
        var here = hexes[u.hex];
        var cand = targets.filter(function (t) { return hexDist(hexes[t.hex], here) <= rng; });
        if (!cand.length) return;
        var t = w.rng.pickWeighted(cand, function (x) {
          var c = 0; x.bns.forEach(function (b) { c += (b.cls.art + b.cls.sp + b.cls.mrl) * 2 + b.cls.men * 0.01 + b.cls.tanks * 0.3; });
          return c * (x.posture === "move" ? 2 : 1) * (hexes[x.hex].region === "armenia" ? 0.1 : 1);
        });
        if (!t) return;
        var kills = P.CB_K * fire * spot * P.CB_EVERY * w.rng.uni(0.5, 1.5) * (1 - 0.4 * t.dug);
        t.bns.forEach(function (b) {
          var share = kills / t.bns.length;
          ["art", "sp", "mrl", "mrl_lr", "men", "trucks", "ifv", "apc", "tanks"].forEach(function (c) {
            if (!b.cls[c]) return;
            var wgt = { art: 0.48, sp: 0.35, mrl: 4.5, mrl_lr: 1.0, men: 7, trucks: 0.15, ifv: 0.08, apc: 0.08, tanks: 0.06 }[c];
            var exp = share * wgt * Math.min(1, b.cls[c] / 6);
            var lost = Math.min(b.cls[c], Math.floor(exp) + (w.rng.chance(exp - Math.floor(exp)) ? 1 : 0));
            if (!lost) return;
            b.cls[c] -= lost; w.ledger[enemy][c] += lost;
            if (c === "men") w.ledger.kia[enemy] += Math.round(lost * 0.35);
            else { w.ledger.kia[enemy] += lost * 0.4; if (enemy === "ARM") w.ledger.byLine.C += lost; }
          });
          b.org = Math.max(0, b.org - 0.004 * kills);
        });
      });
    });
  }

  // -------------------------------------------------------------------- air
  function adCoverage(w, hi) {
    var hexes = w.map.hexes, h = hexes[hi], s = 0;
    w.units.forEach(function (u) {
      if (u.side !== "ARM" || !alive(u)) return;
      var d = hexDist(hexes[u.hex], h);
      if (d > 1) return;
      var eff = P.AD_EFF[u.ad] || 0;
      u.bns.forEach(function (b) {
        var c = b.cls;
        if (d === 0) s += (c.sam * 0.9 + c.tor * 2.6 + c.samLong * 0.85) * eff + c.aaa * 0.22 * (eff > 0 ? 1 : 0.4) + c.manpads * 0.025;
        else if (d === 1) s += (c.samLong * 0.45 + c.tor * 0.35 + c.sam * 0.12) * eff;
      });
    });
    return 1 - Math.exp(-s / 6);
  }

  function airStrikes(w) {
    var weather = w.weather[w.day] || 1;
    var hours = P.DAY_END - P.DAY_START;
    var sorties = w.air.tb2 * P.TB2_SORTIES_PER_DAY / hours * weather;
    var loiter = w.air.loiter > 0 ? (P.LOITER_PER_DAY * P.AZE_DRONE_MULT[w.aiTier] / hours) * weather : 0;
    var nSort = Math.floor(sorties) + (w.rng.chance(sorties - Math.floor(sorties)) ? 1 : 0);
    var nLoit = Math.floor(loiter) + (w.rng.chance(loiter - Math.floor(loiter)) ? 1 : 0);
    var decoy = w.day < P.DECOY_DAYS ? P.DECOY_MULT : (w.day < 14 ? 1.4 : 0.25);
    var targets = [];
    w.units.forEach(function (u) {
      if (u.side !== "ARM" || u.garrison || !alive(u)) return;
      u.bns.forEach(function (b) { targets.push({ u: u, b: b }); });
    });
    if (!targets.length) return;
    var wt = function (t) {
      var c = t.b.cls, u = t.u;
      var emit = (c.sam + c.tor + c.samLong) > 0 ? P.EMIT_WEIGHT[u.ad] * decoy : 0;
      var val = c.tanks * 1.0 + c.ifv * 0.5 + (c.art + c.sp) * 0.8 + c.mrl * 1.2 + c.trucks * 0.15 + c.men * 0.004 + (c.sam + c.tor + c.samLong) * emit;
      var exposure = u.posture === "move" ? 3.0 : u.posture === "reserve" ? 0.55 : 1.0;
      if (u.hex >= 0 && w.map.hexes[u.hex].region === "armenia") exposure *= 0.15; // political restraint on striking Armenia proper
      return val * exposure;
    };
    var doStrike = function (shots, isTb2) {
      var t = w.rng.pickWeighted(targets, wt);
      if (!t) return;
      var cov = adCoverage(w, t.u.hex);
      if (isTb2) {
        if (w.rng.chance(P.TB2_LOSS_K * cov * 2)) { w.air.tb2 = Math.max(0, w.air.tb2 - 1); w.air.tb2Lost++; logEv(w, "good", "防空击落一架 TB2", t.u.hex); return; }
      }
      for (var s = 0; s < shots; s++) {
        if (!w.rng.chance(P.PK_DRONE * (1 - cov * P.AD_PROTECT))) continue;
        var c = t.b.cls, emit = P.EMIT_WEIGHT[t.u.ad];
        var cls = w.rng.pickWeighted(["samLong", "sam", "tor", "tanks", "ifv", "art", "sp", "mrl", "trucks", "men"], function (k) {
          var wgt = { samLong: (w.day < 14 ? 1.1 : 0.25) * emit, sam: (w.day < 14 ? 1.1 : 0.25) * emit, tor: (w.day < 14 ? 0.6 : 0.2) * emit, tanks: 4.6, ifv: 1.1, art: 2.2, sp: 2.0, mrl: 34.0, trucks: 0.6, men: 0.6 }[k];
          return (c[k] > 0 ? wgt : 0) * (k === "men" ? 1 : Math.min(3, c[k]));
        });
        if (!cls) continue;
        if (cls === "men") {
          var k = Math.min(c.men, Math.round(w.rng.uni(1, 6)));
          c.men -= k; w.ledger.ARM.men += k; w.ledger.kia.ARM += Math.round(k * 0.6);
        } else {
          c[cls] -= 1; w.ledger.ARM[cls] += 1; w.ledger.byLine.A += 1; w.ledger.kia.ARM += cls === "tanks" ? 1.2 : 0.6;
          var men = Math.min(c.men, 2); c.men -= men; w.ledger.ARM.men += men;
        }
        t.b.org = Math.max(0, t.b.org - 0.01);
        w.air.strikes++;
      }
    };
    for (var i = 0; i < nSort; i++) doStrike(P.SHOTS_PER_SORTIE, true);
    for (var j = 0; j < nLoit; j++) { if (w.air.loiter <= 0) break; w.air.loiter--; doStrike(1, false); }
    // daylight convoy interdiction on ARM supply lines
    var droneIntensity = (w.air.tb2 / 12) * weather;
    var convoyLoss = P.CONVOY_LOSS_PER_H * droneIntensity * (w.armConvoy === "night_only" ? P.NIGHT_CONVOY_LOSS : 1) * w.rng.uni(0.5, 1.5);
    var lost = Math.floor(convoyLoss) + (w.rng.chance(convoyLoss - Math.floor(convoyLoss)) ? 1 : 0);
    if (lost) { w.ledger.ARM.trucks += lost; w.ledger.byLine.A += lost; w.armTrucksLostConvoy = (w.armTrucksLostConvoy || 0) + lost; w.convoyPool = Math.max(0, w.convoyPool - lost); }
  }

  // ----------------------------------------------------------------- supply
  function supplyCosts(w, side) {
    var hexes = w.map.hexes, cost = {}, open = [];
    w.map.sources[side].forEach(function (s) { if (hexes[s.i].owner === side) { cost[s.i] = 0; open.push(s.i); } });
    while (open.length) {
      var bi = 0;
      for (var k = 1; k < open.length; k++) if (cost[open[k]] < cost[open[bi]]) bi = k;
      var cur = open.splice(bi, 1)[0];
      hexes[cur].nb.forEach(function (n) {
        if (hexes[n].owner !== side) return;
        var c = cost[cur] + (hexes[cur].roadNb[n] ? 1 : { Open: 2, Mixed: 3, Forest: 4, Mountain: 6, Urban: 2 }[hexes[n].terrain]);
        if (c > P.SUPPLY_MAX_COST) return;
        if (cost[n] === undefined || c < cost[n]) { cost[n] = c; if (open.indexOf(n) < 0) open.push(n); }
      });
    }
    return cost;
  }
  function supply(w) {
    ["ARM", "AZE"].forEach(function (side) {
      var cost = supplyCosts(w, side);
      var thru = side === "ARM" ? (w.armConvoy === "night_only" ? P.NIGHT_CONVOY_THROUGHPUT : 1.0) * Math.pow(Math.max(0.2, w.convoyPool / P.CONVOY_POOL), 0.8) : 1.0;
      w.units.forEach(function (u) {
        if (u.side !== side || !alive(u)) return;
        var c = cost[u.hex];
        u.inSupply = c !== undefined;
        var engaged = u.posture === "attack" || u.engagedTicks > 0;
        u.bns.forEach(function (b) {
          b.supply -= (engaged ? P.SUPPLY_USE.engaged : P.SUPPLY_USE.idle) / 4;
          if (c !== undefined) b.supply += (P.SUPPLY_REFILL / 4) * thru * (1 / (1 + c / 10));
          b.supply = Math.max(0, Math.min(4, b.supply));
          if (b.supply < 0.2) b.org = Math.max(0, b.org - 0.02);
        });
        u.engagedTicks = 0;
      });
    });
  }

  function recover(w) {
    w.units.forEach(function (u) {
      if (!alive(u)) return;
      var engaged = u.posture === "attack" || !!w.engagements[u.hex];
      if (!engaged && u.posture !== "move") {
        u.bns.forEach(function (b) { b.org = Math.min(1, b.org + P.ORG_RECOVER * supplyFactor(b)); });
        if (u.posture === "defend") u.dug = Math.min(1, u.dug + 1 / 48);
      }
      if (w.day >= P.MOB_START_DAY && u.side === "ARM") {
        u.bns.forEach(function (b) { if (b.cls.men < b.menMax * 0.92 && b.tier !== "active") b.cls.men = Math.min(Math.round(b.menMax * 0.92), b.cls.men + Math.ceil(b.menMax * P.MOB_RATE / 24)); });
      }
    });
  }

  // ------------------------------------------------------------------- AI
  var AXES = {
    south: ["jabrayil", "fuzuli", "zangilan", "qubadli", "hadrut", "shusha", "lachin", "stepanakert"],
    north: [],
    east: [],
    // P/B tiers widen the campaign
    north_wide: ["sugovushan", "martakert", "kalbajar"],
    east_wide: ["aghdam", "fuzuli", "stepanakert"],
    hold: [],
  };
  var AXIS_PLACES = {
    south: { jabrayil: 1, fuzuli: 1, zangilan: 1, qubadli: 1, hadrut: 1, shusha: 1, lachin: 1, stepanakert: 1 },
    north: { sugovushan: 1, martakert: 1, kalbajar: 1 },
    east: { aghdam: 1, fuzuli: 1, stepanakert: 1 },
  };
  // operational zone of each axis: units only assault hexes inside their axis zone
  function inAxisZone(axis, h, tier) {
    return !!(AXIS_PLACES[axis] && AXIS_PLACES[axis][h.place]);
  }
  function southStageAllowed(w, place) {
    var m = w.milestones;
    if (place === "fuzuli" || place === "hadrut") return m.jabrayil !== undefined;
    if (place === "zangilan") return m.fuzuli !== undefined || m.hadrut !== undefined;
    if (place === "qubadli") return m.zangilan !== undefined && (m.fuzuli !== undefined || m.hadrut !== undefined);
    if (place === "shusha") return m.qubadli !== undefined && m.hadrut !== undefined && m.fuzuli !== undefined;
    if (place === "lachin" || place === "stepanakert") return m.shusha !== undefined;
    return true;
  }
  function axisObjectives(w, axis) {
    var list = AXES[(w.aiTier !== "H" && AXES[axis + "_wide"]) ? axis + "_wide" : axis] || [], out = [];
    for (var i = 0; i < list.length && out.length < 3; i++) {
      var h = w.map.places[list[i]];
      if (h !== undefined && w.map.hexes[h].owner !== "AZE") out.push(h);
    }
    return out;
  }
  function axisObjective(w, axis) {
    var list = AXES[(w.aiTier !== "H" && AXES[axis + "_wide"]) ? axis + "_wide" : axis] || [];
    for (var i = 0; i < list.length; i++) {
      var h = w.map.places[list[i]];
      if (h !== undefined && w.map.hexes[h].owner !== "AZE") return h;
    }
    return -1;
  }
  function azeAxisFor(u, w) {
    if (u.axis) return u.axis;
    var h = w.map.hexes[u.hex >= 0 ? u.hex : 0];
    if (u.corps === "aze_2nd_corps" || u.corps === "aze_army_troops") u.axis = "south";
    else if (u.corps === "aze_3rd_corps") u.axis = w.aiTier === "H" ? "hold" : "north";
    else if (u.corps === "aze_1st_corps") u.axis = h.lat > 40.15 ? "north" : "east";
    else if (u.corps === "aze_4th_corps") u.axis = "reserve";
    else u.axis = "east";
    return u.axis;
  }
  function estDefense(w, hi) {
    var h = w.map.hexes[hi], s = 0;
    unitsAt(w, hi, h.owner).forEach(function (u) { u.bns.forEach(function (b) { s += bnDefense(b, h.terrain); }); });
    return s * (1 + P.FORT_MULT * h.fort);
  }
  function estAttack(w, u, hi) {
    var t = w.map.hexes[hi].terrain, s = 0;
    u.bns.forEach(function (b) { s += bnAttack(b, t); });
    return s;
  }

  // AZE operational planner. Every 6 h, per axis: score ARM hexes in the axis zone that touch AZE maneuver units,
  // pick the best 1-3 targets whose combined local attack beats the threshold, commit all adjacent battalions,
  // and pull the rest of the axis toward those targets (concentration). Artillery / AD / HQ follow behind.
  function aiAZE(w) {
    var hexes = w.map.hexes, tier = w.aiTier;
    var progress = { south: 0, north: 0, east: 0 };
    Object.keys(w.milestones).forEach(function (p) { ["south", "north", "east"].forEach(function (a) { if (AXES[a].indexOf(p) >= 0) progress[a]++; }); });
    var mainAxis = "south";
    if (tier !== "H") { mainAxis = Object.keys(progress).sort(function (a, b) { return progress[b] - progress[a]; })[0]; if (!progress[mainAxis]) mainAxis = "south"; }
    var byAxis = { south: [], north: [], east: [], hold: [], reserve: [] };
    w.units.forEach(function (u) {
      if (u.side !== "AZE" || u.garrison || !alive(u)) return;
      var axis = azeAxisFor(u, w);
      if (axis === "reserve" && w.day >= 5) { u.axis = mainAxis; axis = mainAxis; }
      if (axis !== mainAxis && w.day >= 8 && u.role === "maneuver" && !u.released && axisObjective(w, axis) < 0 && (parseInt(u.id.slice(1), 10) % 2 === 0)) {
        u.released = true; u.axis = mainAxis; axis = mainAxis;
      }
      (byAxis[axis] = byAxis[axis] || []).push(u);
    });
    ["south", "north", "east"].forEach(function (axis) {
      var units = byAxis[axis] || [];
      var obj = axisObjective(w, axis);
      var man = units.filter(function (u) { return (u.role === "maneuver" || u.role === "sof") && u.posture !== "move"; });
      units.forEach(function (u) { if (u.role !== "maneuver" && u.role !== "sof" && u.posture !== "move") supportFollow(w, u, "AZE", obj); });
      if (obj < 0) { man.forEach(function (u) { if (u.posture === "attack") { u.posture = "defend"; u.target = -1; } }); return; }
      // candidate targets
      var cand = {};
      man.forEach(function (u) {
        if (avgOrg(u) < 0.45) { if (u.posture === "attack") { u.posture = "defend"; u.target = -1; } return; }
        hexes[u.hex].nb.forEach(function (j) {
          var h = hexes[j];
          if (h.owner !== "ARM" || h.region === "armenia" || !inAxisZone(axis, h, tier)) return;
          if (axis === "south" && !southStageAllowed(w, h.place)) return;
          (cand[j] = cand[j] || []).push(u);
        });
      });
      var scored = Object.keys(cand).map(function (k) {
        var j = +k, A = 0;
        cand[j].forEach(function (u) { A += estAttack(w, u, j); });
        var D = estDefense(w, j) + 1;
        var ratio = A * (1 + 0.5 * P.SPOT.AZE) / D;
        var objs = axisObjectives(w, axis), dObj = 99;
        objs.forEach(function (o, oi) { dObj = Math.min(dObj, hexDist(hexes[j], hexes[o]) + oi * 3); });
        return { j: j, ratio: ratio, dObj: dObj, score: ratio * (tier === "H" ? 1 : 1.3) - dObj * 0.35 };
      }).sort(function (a, b) { return b.score - a.score; });
      var maxT = tier === "H" ? 2 : 3, thresh = P.AI_ATTACK_RATIO[tier] * (tier === "H" ? P.AXIS_THRESH[axis] : 1);
      var chosen = [], used = {};
      scored.forEach(function (t) {
        if (chosen.length >= maxT || t.ratio < thresh) return;
        chosen.push(t);
        cand[t.j].forEach(function (u) { if (!used[u.id]) { used[u.id] = true; u.posture = "attack"; u.target = t.j; } });
      });
      man.forEach(function (u) { if (!used[u.id] && u.posture === "attack" && !chosen.some(function (t) { return t.j === u.target; })) { u.posture = "defend"; u.target = -1; } });
      // concentrate the uncommitted battalions toward the best target (chosen or most promising)
      var focus = chosen.length ? chosen[0].j : (scored.length ? scored[0].j : obj);
      units.forEach(function (u) {
        if ((u.role !== "maneuver" && u.role !== "sof") || used[u.id] || u.posture === "move") return;
        var here = hexes[u.hex];
        var touching = here.nb.indexOf(focus) >= 0;
        if (touching) return;
        if (here.nb.some(function (j) { return hexes[j].owner === "ARM"; }) && stackCount(w, u.hex, "AZE") <= 2) return; // keep a garrison on contact hexes
        var best = -1, bd = 1e9;
        hexes[focus].nb.forEach(function (j) {
          var h = hexes[j];
          if (h.owner !== "AZE" || stackCount(w, j, "AZE") >= 10) return;
          var d = hexDist(h, here);
          if (d < bd) { bd = d; best = j; }
        });
        if (best < 0) {
          hexes.forEach(function (h) {
            if (h.owner !== "AZE" || h.region === "armenia" || stackCount(w, h.i, "AZE") >= 10) return;
            if (!h.nb.some(function (j) { return hexes[j].owner === "ARM" && inAxisZone(axis, hexes[j], tier); })) return;
            var d = hexDist(h, hexes[focus]) * 3 + hexDist(h, here);
            if (d < bd) { bd = d; best = h.i; }
          });
        }
        if (best >= 0 && best !== u.hex) {
          var path = findPath(w, "AZE", u.hex, best);
          if (path && path.length <= 14) { u.path = path; u.posture = "move"; u.moveProg = 0; }
        }
      });
    });
  }

  function here0(w, u) { return w.map.hexes[u.hex]; }
  function stackCount(w, hi, side) {
    var n = 0;
    w.units.forEach(function (u) { if (u.hex === hi && u.side === side && u.role === "maneuver" && alive(u)) n++; });
    return n;
  }
  // Organic artillery / AD / HQ stay in the same 42 km sector hex as their parent brigade/regiment's maneuver battalions.
  function supportFollow(w, u, side, obj) {
    if (!u.formation) return;
    var f = (w.formations || []).filter(function (x) { return x.id === u.formation; })[0];
    if (!f) return;
    var man = f.units.map(function (id) { return w.unitById[id]; }).filter(function (m) {
      return m && alive(m) && (m.role === "maneuver" || m.role === "sof") && m.hex >= 0;
    });
    if (!man.length) return;
    // Find modal hex of this brigade's maneuver battalions
    var counts = {}, bestH = man[0].hex, bestC = 0;
    man.forEach(function (m) {
      counts[m.hex] = (counts[m.hex] || 0) + 1;
      if (counts[m.hex] > bestC) { bestC = counts[m.hex]; bestH = m.hex; }
    });
    if (bestH >= 0 && bestH !== u.hex) {
      var path = findPath(w, side, u.hex, bestH);
      if (path && path.length <= 8) { u.path = path; u.posture = "move"; u.moveProg = 0; }
      else if (w.map.hexes[bestH].owner === side) { u.hex = bestH; }
    }
  }

  // ARM AI commander: "historical" = rigid hold + early armoured counter-attacks + AD always on;
  // "competent" = hold, shift reserves to the weakest threatened hex, no suicidal counter-attacks.
  function aiARM(w) {
    var hexes = w.map.hexes, mode = w.armAi;
    var threatened = Object.keys(w.engagements).map(Number).filter(function (k) { return hexes[k].owner === "ARM"; });
    w.units.forEach(function (u) {
      if (u.side !== "ARM" || !alive(u) || u.static) return;
      if (u.control === "player" && !w.opts.armAllAi) return;
      if (u.role !== "maneuver" && u.role !== "sof") {
        if (u.posture !== "move" && (hexes[u.hex].region === "armenia" || u.posture === "reserve")) { u.posture = "defend"; supportFollow(w, u, "ARM", -1); }
        return;
      }
      if (u.control === "player" && !w.opts.armAllAi) return;
      if (u.posture === "move") return;
      var here = hexes[u.hex];
      var contact = here.nb.some(function (j) { return hexes[j].owner === "AZE"; });
      if (mode === "historical" && w.day >= 4 && w.day <= 12 && contact && unitTanks(u) >= 10 && w.rng.chance(0.05)) {
        var lost = here.nb.filter(function (j) { return hexes[j].owner === "AZE" && hexes[j].owner0 === "ARM"; });
        if (lost.length) { u.posture = "attack"; u.target = lost[0]; return; }
      }
      if (u.posture === "attack") return;
      var manHere = unitsAt(w, u.hex, "ARM").filter(function (o) { return o.role === "maneuver"; });
      if (contact && manHere.indexOf(u) < 5) { u.posture = "defend"; return; }
      if (mode === "competent") {
        // fortify Shusha, Hadrut, and Lachin with >= 4 battalions; redeploy reserves at night
        var keys = ["shusha", "hadrut", "lachin"].map(function (p) { return w.map.places[p]; }).filter(function (x) { return x !== undefined && hexes[x].owner === "ARM"; });
        var manAt = function (hi) { return unitsAt(w, hi, "ARM").filter(function (o) { return o.role === "maneuver"; }).length; };
        if (keys.indexOf(u.hex) >= 0 && manAt(u.hex) <= 5) { u.posture = "defend"; return; }
        var needKey = keys.filter(function (k) { return manAt(k) < 4; })[0];
        if (needKey !== undefined && isNight(w) && hexDist(hexes[needKey], here) <= 6) {
          var pk = findPath(w, "ARM", u.hex, needKey);
          if (pk) { u.path = pk; u.posture = "move"; u.moveProg = 0; return; }
        }
        if (!isNight(w) && keys.indexOf(u.hex) < 0 && !contact) { u.posture = "reserve"; return; }
      }
      // garrisons of named towns stay unless another battalion holds the town; in historical mode NK sector regiments stay tied to their sector
      if (here.value >= 4 && unitsAt(w, u.hex, "ARM").filter(function (o) { return o.role === "maneuver"; }).length <= (mode === "historical" && u.isNK ? 2 : 1)) { u.posture = "defend"; return; }
      // reserve: move toward the most threatened hex
      if (!threatened.length) return;
      if (mode === "historical" && stackCount(w, threatened[0], "ARM") >= 4) return;
      var target = -1, worst = 1e9;
      threatened.forEach(function (t) {
        var e = w.engagements[t]; var r = e && e.lastR ? 1 / e.lastR : 1;
        var d = hexDist(hexes[t], here);
        var sc = r * (mode === "competent" ? 1.0 : 0.6) + d * 0.15 + (hexes[t].value >= 9 ? -0.5 : 0);
        if (sc < worst) { worst = sc; target = t; }
      });
      if (mode === "competent" && worst > 1.1) { u.posture = "reserve"; return; } // nothing urgent: stay dispersed
      if (target >= 0 && target !== u.hex && (mode === "competent" || w.rng.chance(0.35))) {
        var path = findPath(w, "ARM", u.hex, target);
        if (path) { u.path = path; u.posture = "move"; u.moveProg = 0; }
      }
    });
  }
  function unitTanks(u) { var s = 0; u.bns.forEach(function (b) { s += b.cls.tanks; }); return s; }

  // -------------------------------------------------------------- end-game
  function coreStats(w) {
    var tot = 0, held = 0;
    w.map.hexes.forEach(function (h) { if (h.region === "arm_zone") { tot++; if (h.owner === "ARM") held++; } });
    return { total: tot, held: held, lostShare: (tot - held) / tot };
  }
  function dailyChecks(w) {
    if (w.day === 14) w.ledger.samDay14 = w.ledger.ARM.sam + w.ledger.ARM.tor + w.ledger.ARM.samLong;
    if (w.day % 7 === 0) w.air.tb2 = Math.min(w.air.tb2Max, w.air.tb2 + P.TB2_RESUPPLY_PER_WEEK);
    var sh = w.map.places.shusha;
    if (w.redLine) return endWar(w, "redline");
    if (sh !== undefined && w.map.hexes[sh].owner === "AZE") {
      return endWar(w, "nov10");
    }
    var cs = coreStats(w);
    if (cs.held / cs.total < 0.15) return endWar(w, "collapse");
    if (w.day >= P.CEASEFIRE_CHECK_FROM) {
      var g = 0;
      for (var d = Math.max(0, w.day - P.CEASEFIRE_STALL_DAYS); d < w.day; d++) g += Math.max(0, w.gainsByDay[d] || 0);
      if (g === 0 && w.rng.chance(P.CEASEFIRE_STALL_P)) return endWar(w, "freeze");
    }
    if (w.day >= P.MAX_DAYS) return endWar(w, "freeze");
  }
  function endWar(w, how) {
    w.ended = true;
    var cs = coreStats(w), sh = w.map.places.shusha, shushaHeld = w.map.hexes[sh].owner === "ARM";
    var code;
    if (how === "collapse" || cs.lostShare > 0.85) code = "E";
    else if (!shushaHeld || cs.lostShare > 0.6) code = "D";
    else if (cs.lostShare <= 0.3) code = "B";
    else code = "C";
    w.outcome = { code: code, how: how, day: w.day, lostShare: cs.lostShare, shushaHeld: shushaHeld };
    logEv(w, code === "B" ? "good" : code === "C" ? "warn" : "crit", "停火（" + { nov10: "舒沙失守，11·10 式停火", freeze: "攻势停滞，就地停火", redline: "越过俄方红线，被迫停火", collapse: "防线崩溃" }[how] + "）· 结局 " + code, sh);
  }
  function logEv(w, level, msg, hex) {
    w.events.push({ t: w.tick, day: w.day, level: level, msg: msg, hex: hex });
    w.evTotal = (w.evTotal || 0) + 1;
    if (w.events.length > 400) w.events.shift();
  }

  function run(w, hours) { for (var i = 0; i < hours && !w.ended; i++) tick(w); return w; }
  function runToEnd(w) { while (!w.ended) tick(w); return w; }

  function summarize(w) {
    var L = w.ledger, A = L.ARM, Z = L.AZE;
    var lineTot = L.byLine.A + L.byLine.C + L.byLine.E;
    var samTot = A.sam + A.tor + A.samLong;
    return {
      outcome: w.outcome, days: w.outcome ? w.outcome.day : w.day,
      kia: { ARM: Math.round(L.kia.ARM), AZE: Math.round(L.kia.AZE) },
      arm: { tanks: A.tanks, ifv: A.ifv, apc: A.apc, towed: A.art, sp: A.sp, mrl: A.mrl + A.mrl_lr, sam: samTot, trucks: A.trucks },
      aze: { tanks: Z.tanks, ifv: Z.ifv, apc: Z.apc },
      acShare: lineTot ? (L.byLine.A + L.byLine.C) / lineTot : 0,
      day14AdShare: samTot ? (L.samDay14 === null ? samTot : L.samDay14) / samTot : 0,
      milestones: w.milestones, tb2Lost: w.air.tb2Lost, redLine: w.redLine, strikes: w.air.strikes,
    };
  }

  return {
    P: P, CLASSES: CLASSES, createWorld: createWorld, tick: tick, run: run, runToEnd: runToEnd,
    issueOrder: issueOrder, issueFormationOrder: issueFormationOrder, pendingOrders: pendingOrders, cancelOrders: cancelOrders,
    setConvoy: setConvoy, visibleToArm: visibleToArm, supplyCosts: supplyCosts, summarize: summarize, endWar: endWar, coreStats: coreStats, findPath: findPath, hexDist: hexDist,
    unitsAt: unitsAt, alive: alive, unitMen: unitMen, avgOrg: avgOrg, bnAttack: bnAttack, bnDefense: bnDefense,
    adCoverage: adCoverage, orderDelayTicks: orderDelayTicks, isNight: isNight,
  };
})();
if (typeof window !== "undefined") window.MoDSim = MoDSim;
