/**
 * Minister of Defense / 战争部长 — V8 Interactive Web Playtest & Validation Engine
 * Covers:
 *   - Tab 1: 2010-2020 10-Year Build-up + 2016 April Four-Day War (V2b) + 2020 44-Day War
 *            Interactive Operational Hex & 5-Phase Strip Simulator
 *   - Tab 2: Phase 0 Proving Ground & 60-Step Animated Squad Combat Sandbox (V1 & V5)
 *   - Tab 3: Nagorno-Karabakh Logistics Network, Lachin Cutoff & KeyNodeReport Lab (V3)
 *   - Tab 4: V1-V8 Full Validation Suite Dashboard & Automated Browser Self-Check
 */

(function () {
  "use strict";

  const BUNDLE = window.MOD_DATA_BUNDLE || {};
  const VAL = BUNDLE.validation_results || {};

  // =========================================================================
  // GLOBAL PLAYTEST STATE
  // =========================================================================
  const state = {
    playerCountry: "ARM",       // "ARM" | "AZE" (controls DS-044 disputed place names)
    iconStyle: "NatoApp6",      // "NatoApp6" | "Silhouette" (controls DS-027 unit icon rendering)
    azeAiTier: "H",             // "H" | "P" | "B"

    // 2010-2020 Build-up Parameters (V4)
    build: {
      readinessReform: 2,       // 0, 1, 2 (DC-009)
      shorad: 2,                // 0, 1, 2
      ew: 2,                    // 0, 1, 2
      fort: 2,                  // 0, 1, 2
      atgm: 2,                  // 0, 1, 2
      uav: 1,                   // 0, 1, 2
      ammoDays: 40,             // 20, 40, 60
      su30: 0,                  // 0, 4, 8
    },

    // Wartime Operational Directives (V2 / V3 / V7)
    warOrder: {
      adPosture: "doctrine_mixed",  // "always_active" | "doctrine_mixed" | "always_silent"
      cmdEchelon: "brigade",        // "corps" | "brigade" | "skip_hq" | "sof" (DC-010)
      stance: "elastic_depth",      // "rigid_counter" | "elastic_depth" | "sof_ambush"
      convoyPolicy: "night_only",   // "continuous" | "night_only"
    },

    // Live 2020 War Simulation State
    war: {
      day: 0,
      ended: false,
      outcomeCode: "PENDING",
      ceasefireTemplate: "none",
      armKia: 0,
      azeKia: 0,
      armTanksLost: 0,
      azeTanksLost: 0,
      armSamLost: 0,
      armArtLost: 0,
      northProgressKm: 0.0,
      eastProgressKm: 0.0,
      southProgressKm: 0.0,       // Out of 132 km to Shusha
      coreTilesHeld: 26,          // Out of 26 pre-war ARM core tiles
      shushaHeldByArm: true,
      autoPauseCount: 0,
      selectedHexId: "hex_shusha",
      hexOwners: {},
      events: [],
    },

    // S05 Multi-Echelon TO&E Editor State (Squad -> Platoon -> Company -> Battalion -> Brigade)
    toe: {
      country: "ARM",
      levelFilter: "ALL",
      search: "",
      activeId: "arm_mr_regt",
      breadcrumb: ["arm_mr_regt"], // Drill-down trail: e.g. ["arm_mr_regt", "arm_mr_bn_bmp", "arm_mr_bmp_coy"]
      expandAll: false,
      expandedNodes: {}, // pathKey -> boolean
      workingTemplates: {}, // country -> { id -> deepClone }
      presetTemplates: {},  // country -> { id -> original }
    },

    // Phase 0 Proving Ground State
    pg: {
      attId: "aze_2020_assault_coy",
      dfnId: "arm_nk_def_coy",
      terrain: "Mixed",
      mission: "AttackPosition",
      squadWeightKg: "18",
      mentoringKey: "size_9_veteran_mentored",
      atgmEchelon: "company_plt",
      animTimer: null,
      step: 0,
      elementsA: [],
      elementsB: [],
      fireRays: [],
    },

    // Tab 3 Logistics Lab State
    logLab: {
      tierKey: "high_t5_reference_1200t",
      corridorMode: "both_open",
      geoBan: "closed",
    },
  };

  // =========================================================================
  // 1. BUDGET & V4 EXPECTED WIN RATE CALCULATOR
  // =========================================================================
  function calcBuildMetrics() {
    const b = state.build;
    const totalBudget10y = 5150.0; // $4,850M + $300M Russian concessional credit
    const payrollMap = { 0: 2367.0, 1: 1927.0, 2: 1727.0 };
    const savedMap = { 0: 0, 1: 440, 2: 640 };
    const payroll = payrollMap[b.readinessReform];
    const fixedOmAndBase = 1480.0 + 620.0;
    const availDiscretionary = Math.max(120.0, totalBudget10y - payroll - fixedOmAndBase);

    const costShorad = { 0: 30, 1: 165, 2: 330 }[b.shorad];
    const costEw = { 0: 15, 1: 95, 2: 190 }[b.ew];
    const costFort = { 0: 25, 1: 135, 2: 265 }[b.fort];
    const costAtgm = { 0: 45, 1: 150, 2: 290 }[b.atgm];
    const costUav = { 0: 10, 1: 80, 2: 175 }[b.uav];
    const costAmmo = { 20: 40, 40: 165, 60: 320 }[b.ammoDays];
    const costSu30 = b.su30 * 32;

    const plannedSpend = costShorad + costEw + costFort + costAtgm + costUav + costAmmo + costSu30;
    const fulfillment = Math.min(1.0, availDiscretionary / Math.max(1.0, plannedSpend));

    // Capability indices (matching tools/validation/v4_nk2010_search.py)
    const shoradCap = 0.19 * b.shorad * fulfillment;
    const ewCap = 0.16 * b.ew * fulfillment;
    const atgmCap = 0.17 * b.atgm * fulfillment;
    const uavCap = 0.12 * b.uav * fulfillment;
    const fortCap = 0.18 * b.fort * fulfillment;
    const ammoCap = 0.13 * ((b.ammoDays - 20) / 20.0) * fulfillment;
    const su30Cap = 0.004 * b.su30 * fulfillment;
    const readinessCap = { 0: 0.0, 1: 0.11, 2: 0.20 }[b.readinessReform];

    const defIdx = shoradCap + ewCap + atgmCap + uavCap + fortCap + ammoCap + su30Cap + readinessCap;
    const airDenial = shoradCap + ewCap;
    const groundHold = fortCap + atgmCap + readinessCap;
    const synergy = 0.10 * Math.min(1.0, airDenial / 0.50) * Math.min(1.0, groundHold / 0.60);

    const azeBase = { H: 1.68, P: 1.74, B: 1.94 }[state.azeAiTier] || 1.68;
    const netBalance = (defIdx + synergy) - azeBase;

    // Analytical normal CDF approximation for P(score > 0) with sigma = 0.38
    const z = netBalance / 0.38;
    const winProb = 0.5 * (1.0 + erf(z / Math.SQRT2));

    return {
      savedPayroll: savedMap[b.readinessReform],
      costShorad,
      costEw,
      costFort,
      costAtgm,
      costUav,
      costAmmo,
      costSu30,
      availDiscretionary: Math.round(availDiscretionary),
      plannedSpend: Math.round(plannedSpend),
      fulfillment,
      defIdx,
      synergy,
      netBalance,
      winProb: Math.max(0.0, Math.min(0.96, winProb)),
    };
  }

  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  // =========================================================================
  // 2. WAR SIMULATION ENGINE (2016 V2b + 2020 44-DAY WAR)
  // =========================================================================
  function resetWarState(run2016Check = false) {
    const w = state.war;
    w.day = 0;
    w.ended = false;
    w.outcomeCode = "PENDING";
    w.ceasefireTemplate = "none";
    w.armKia = 0;
    w.azeKia = 0;
    w.armTanksLost = 0;
    w.azeTanksLost = 0;
    w.armSamLost = 0;
    w.armArtLost = 0;
    w.northProgressKm = 0.0;
    w.eastProgressKm = 0.0;
    w.southProgressKm = 0.0;
    w.coreTilesHeld = 26;
    w.shushaHeldByArm = true;
    w.autoPauseCount = 0;
    w.events = [];

    w.hexOwners = {};
    (BUNDLE.theater_hexes || []).forEach((h) => {
      w.hexOwners[h.id] = h.owner;
    });

    const m = calcBuildMetrics();
    logWarEvent(
      "2010–2020 建军结算",
      `十年可支配预算 $${m.availDiscretionary}M，计划投入 $${m.plannedSpend}M（到位率 ${(m.fulfillment * 100).toFixed(1)}%），综合防御指数 ${(m.defIdx + m.synergy).toFixed(2)}，预期守住率 ${(m.winProb * 100).toFixed(1)}%。`,
      m.fulfillment >= 0.95 ? "good" : "warn"
    );

    if (run2016Check) {
      const arm2016Kia = Math.round(92 - 14 * (m.defIdx / 1.85));
      const aze2016Kia = Math.round(76 + 18 * (m.defIdx / 1.85));
      logWarEvent(
        "2016-04-05 四日战争 (V2b)",
        `持续 4.5 天，塔利什/拉拉伊拉希哨所争夺推进 1.6 km (< 8km 翻格阈值，0 格易手)；亚方阵亡 ${arm2016Kia} 人，阿方阵亡 ${aze2016Kia} 人。`,
        "warn"
      );
    }

    logWarEvent(
      "2020-09-27 03:00Z",
      "阿塞拜疆发动“铁拳行动”全面进攻，安-2 无人诱饵机群配合 TB2 与 Harop 巡飞弹扑向纳卡防空网！",
      "crit"
    );

    renderAll();
  }

  function stepWarDays(nDays) {
    const w = state.war;
    if (w.ended) return;

    const m = calcBuildMetrics();
    const defStrength = (m.defIdx + m.synergy) / 1.95; // 0.01 (hist) .. 1.00 (optimal)

    // Modifiers from wartime orders
    const adMod =
      state.warOrder.adPosture === "doctrine_mixed"
        ? 1.0
        : state.warOrder.adPosture === "always_active"
        ? 0.82
        : 0.75;
    const echelonMod =
      state.warOrder.cmdEchelon === "brigade" || state.warOrder.cmdEchelon === "corps"
        ? 1.0
        : state.warOrder.cmdEchelon === "sof"
        ? 0.96
        : 0.78; // skip_hq 176.4m micro penalty!
    const stanceMod =
      state.warOrder.stance === "elastic_depth"
        ? 1.05
        : state.warOrder.stance === "sof_ambush"
        ? 1.02
        : 0.84; // rigid_counter suffers heavy UAV attrition in open valley
    const convoyMod = state.warOrder.convoyPolicy === "night_only" ? 1.04 : 0.88;

    const effDef = defStrength * adMod * echelonMod * stanceMod * convoyMod;

    for (let i = 0; i < nDays; i++) {
      if (w.ended) break;
      w.day += 1;
      const d = w.day;

      // UAV dominance: high if ARM has low SHORAD/EW, suppressed if ARM built Lv2 SHORAD + EW
      const uavDom = Math.max(0.28, 1.18 - 0.68 * effDef);

      // Daily losses
      const surge = d >= 4 && d <= 11 && state.warOrder.stance === "rigid_counter" ? 1.45 : 1.0;
      const dArmKia = Math.round((78 * uavDom * surge) * (0.9 + 0.2 * Math.sin(d * 1.7)));
      const dAzeKia = Math.round((66 * (0.85 + 0.35 * effDef)) * (0.9 + 0.2 * Math.cos(d * 1.3)));
      w.armKia += dArmKia;
      w.azeKia += dAzeKia;

      const dArmTanks = Math.max(1, Math.round(5.4 * uavDom * surge * (0.85 + 0.3 * Math.sin(d))));
      const dAzeTanks = Math.max(1, Math.round(1.5 * (0.8 + 0.5 * effDef)));
      w.armTanksLost = Math.min(360, w.armTanksLost + dArmTanks);
      w.azeTanksLost = Math.min(280, w.azeTanksLost + dAzeTanks);

      const dSam = d <= 14 ? Math.round(2.6 * uavDom) : Math.round(0.5 * uavDom);
      const dArt = Math.round(6.8 * uavDom);
      w.armSamLost = Math.min(95, w.armSamLost + dSam);
      w.armArtLost = Math.min(380, w.armArtLost + dArt);

      // Strip progression (DC-023 single unified advanceKm per strip)
      if (d <= 7) {
        w.northProgressKm = Math.min(8.0, w.northProgressKm + 0.85 * uavDom);
      }
      w.eastProgressKm = Math.min(5.5, w.eastProgressKm + 0.08 * uavDom);

      // Southern valley & Shusha advance rate depends heavily on southern fortifications + ATGM + SHORAD
      const baseSouthSpeed = d <= 6 ? 3.4 : w.southProgressKm < 102 ? 3.6 : 1.85;
      const dSouthKm = Math.max(0.35, baseSouthSpeed * (1.12 - 0.66 * effDef));
      const prevSouth = w.southProgressKm;
      w.southProgressKm = Math.min(138.0, w.southProgressKm + dSouthKm);

      // Check hex capture milestones along southern hook
      checkMilestone(prevSouth, w.southProgressKm, 24.0, "hex_jabrayil", "杰布拉伊尔 (Jabrayil)", d);
      checkMilestone(prevSouth, w.southProgressKm, 45.0, "hex_hadrut", "哈德鲁特 (Hadrut)", d);
      checkMilestone(prevSouth, w.southProgressKm, 58.0, "hex_fuzuli", "菲祖利 (Fuzuli)", d);
      checkMilestone(prevSouth, w.southProgressKm, 95.0, "hex_qubadli_zangilan", "赞格兰与库巴德利河谷 (Zangilan/Qubadli)", d);

      if (prevSouth < 132.0 && w.southProgressKm >= 132.0) {
        w.hexOwners["hex_shusha"] = "AZE";
        w.shushaHeldByArm = false;
        w.autoPauseCount += 1;
        logWarEvent(
          `Day ${d} [自动暂停 · 战略咽喉失守]`,
          "阿军山地轻步兵与特种分队攻占舒沙（舒希），M12 拉钦走廊被火力截断！斯捷潘纳克特陷入合围危机。",
          "crit"
        );
      }

      // Update core tiles held out of 26
      const tilesLostSouth = Math.min(9, Math.floor(w.southProgressKm / 14.5));
      const tilesLostNorth = w.northProgressKm >= 5.0 ? 1 : 0;
      const tilesLostShusha = w.shushaHeldByArm ? 0 : 1;
      w.coreTilesHeld = Math.max(6, 26 - (tilesLostSouth + tilesLostNorth + tilesLostShusha));

      // War termination checks
      if (!w.shushaHeldByArm && d >= 38) {
        w.ended = true;
        w.outcomeCode = "D_HISTORICAL_DEFEAT";
        w.ceasefireTemplate = "nov10_template";
        // Handover districts per Nov 10 trilateral agreement
        w.hexOwners["hex_aghdam_martuni"] = "AZE";
        w.hexOwners["hex_kalbajar"] = "AZE";
        w.autoPauseCount += 1;
        logWarEvent(
          `Day ${d} [三方停火声明签署 · 结局 D]`,
          `因舒沙失守、拉钦走廊断绝，签署《11月10日三方停火声明》(nov10_template)：战斗失地 ${26 - w.coreTilesHeld}/26 格 (${(((26 - w.coreTilesHeld) / 26) * 100).toFixed(1)}%)，并移交阿格达姆、卡尔巴贾尔。`,
          "crit"
        );
        break;
      }

      if (d >= 45 && w.shushaHeldByArm) {
        w.ended = true;
        if (w.coreTilesHeld >= 19) {
          w.outcomeCode = "B_SUCCESSFUL_DEFENSE";
          w.ceasefireTemplate = "freeze_template";
          w.autoPauseCount += 1;
          logWarEvent(
            `Day ${d} [阿军攻势衰竭停火 · 结局 B 守住纳卡！]`,
            `经过 45 天激战，阿军在南线纵深工事与野战防空网前耗尽突击锋芒！亚方成功保住 ${w.coreTilesHeld}/26 个核心地块 (${((w.coreTilesHeld / 26) * 100).toFixed(1)}%)，舒沙、斯捷潘纳克特与拉钦走廊全部固守！`,
            "good"
          );
        } else {
          w.outcomeCode = "C_LIMITED_DEFEAT";
          w.ceasefireTemplate = "freeze_template";
          w.autoPauseCount += 1;
          logWarEvent(
            `Day ${d} [就地停火 · 结局 C 有限失利]`,
            `双方在俄方调停下就地停火 (freeze_template)：亚方保住舒沙与斯捷潘纳克特，持有 ${w.coreTilesHeld}/26 个核心地块。`,
            "warn"
          );
        }
        break;
      }
    }

    renderAll();
  }

  function checkMilestone(prevKm, curKm, threshKm, hexId, label, day) {
    if (prevKm < threshKm && curKm >= threshKm) {
      state.war.hexOwners[hexId] = "AZE";
      state.war.autoPauseCount += 1;
      logWarEvent(
        `Day ${day} [自动暂停 · 地块易手]`,
        `南线阿军突破 8.0 km 交战条带，占领 ${label}！防守营被迫向相邻己方格撤退。`,
        "warn"
      );
    }
  }

  function logWarEvent(timeStr, msg, level = "info") {
    state.war.events.unshift({ timeStr, msg, level });
    if (state.war.events.length > 40) state.war.events.pop();
  }

  // =========================================================================
  // 3. HEX MAP SVG RENDERER (WITH DS-044 NAMES & DS-027 ICON STYLES)
  // =========================================================================
  const TERRAIN_ZH = { Open: "平原", Mixed: "丘陵混合", Forest: "森林高地", Mountain: "山地", Urban: "城市" };
  const TERRAIN_SHORT = { Open: "平", Mixed: "混", Forest: "林", Mountain: "山", Urban: "城" };

  function shortPlaceName(raw) {
    // "马尔达凯特/塔利什 (Martakert)" -> "马尔达凯特"
    return String(raw || "").split(" (")[0].split("(")[0].split("/")[0].trim();
  }

  function renderHexMap() {
    const svg = document.getElementById("nk-hex-svg");
    if (!svg) return;
    const hexes = BUNDLE.theater_hexes || [];
    const w = state.war;

    // Pointy-top hexes, odd-r offset layout (odd rows shifted right by half a hex)
    const R = 42;
    const HW = Math.sqrt(3) * R; // hex width
    const DY = 1.5 * R;          // row pitch
    const center = (q, r) => ({ cx: q * HW + (r % 2 === 1 ? HW / 2 : 0), cy: r * DY });

    const coordMap = {};
    const byQR = {};
    hexes.forEach((h) => {
      coordMap[h.id] = { ...center(h.q, h.r), h };
      byQR[`${h.q},${h.r}`] = h;
    });
    const xs = Object.values(coordMap).map((c) => c.cx);
    const ys = Object.values(coordMap).map((c) => c.cy);
    const pad = 46;
    const minX = Math.min(...xs) - HW / 2 - pad, maxX = Math.max(...xs) + HW / 2 + pad;
    const minY = Math.min(...ys) - R - pad + 6, maxY = Math.max(...ys) + R + pad;
    svg.setAttribute("viewBox", `${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}`);

    const ownerOf = (h) => w.hexOwners[h.id] || h.owner;
    const vtx = (cx, cy, i, rr = R) => {
      const ang = (Math.PI / 180) * (60 * i - 30);
      return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
    };
    // Neighbour offsets indexed by edge i (edge between vertex i and i+1): E, SE, SW, W, NW, NE
    const nbr = (q, r, i) => {
      const odd = r % 2 === 1;
      const even = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
      const oddD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];
      const d = (odd ? oddD : even)[i];
      return byQR[`${q + d[0]},${r + d[1]}`];
    };

    let html = `
      <defs>
        <pattern id="pat-Mountain" width="12" height="10" patternUnits="userSpaceOnUse">
          <path d="M1 8 L4 3 L7 8" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1"/>
        </pattern>
        <pattern id="pat-Forest" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="rgba(120,220,140,0.16)"/><circle cx="6" cy="6" r="1.1" fill="rgba(120,220,140,0.16)"/>
        </pattern>
        <pattern id="pat-Urban" width="7" height="7" patternUnits="userSpaceOnUse">
          <rect x="1" y="1" width="3" height="3" fill="rgba(255,255,255,0.10)"/>
        </pattern>
        <pattern id="pat-Mixed" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 10 L10 0" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        </pattern>
        <pattern id="pat-Open" width="10" height="10" patternUnits="userSpaceOnUse"></pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <marker id="arrow-aze" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6a4d" />
        </marker>
      </defs>`;

    // 1) Hex bodies
    hexes.forEach((h) => {
      const { cx, cy } = coordMap[h.id];
      const cur = ownerOf(h);
      const flipped = cur !== h.owner;
      const isSel = w.selectedHexId === h.id;
      const fill = flipped ? "rgba(240,96,77,0.30)" : cur === "ARM" ? "rgba(224,129,47,0.20)" : "rgba(58,155,224,0.18)";
      const stroke = flipped ? "#f0604d" : cur === "ARM" ? "rgba(224,129,47,0.75)" : "rgba(58,155,224,0.7)";
      const pts = [0, 1, 2, 3, 4, 5].map((i) => vtx(cx, cy, i, R - 1).map((v) => v.toFixed(1)).join(",")).join(" ");
      html += `<g class="hex-group" data-hex="${h.id}">`;
      html += `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" class="hex-poly ${isSel ? "selected" : ""}" />`;
      html += `<polygon points="${pts}" fill="url(#pat-${h.terrain})" pointer-events="none" />`;
      if (h.is_nk_core && !flipped) {
        html += `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => vtx(cx, cy, i, R - 5).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="rgba(255,210,140,0.18)" stroke-dasharray="2,3" pointer-events="none"/>`;
      }
      html += `</g>`;
    });

    // 2) Supply corridors (cased lines over hex bodies)
    const road = (ids, color, dash) => {
      const pts = ids.map((id) => coordMap[id]).filter(Boolean).map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
      html += `<polyline points="${pts}" fill="none" stroke="rgba(5,9,14,0.75)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
      html += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="${dash || ""}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" pointer-events="none"/>`;
    };
    const m12Cut = !w.shushaHeldByArm;
    road(["hex_yerevan", "hex_yeghegnadzor", "hex_goris", "hex_lachin_corridor", "hex_shusha", "hex_stepanakert"], m12Cut ? "#f0604d" : "#f2a93b", m12Cut ? "3,4" : "");
    road(["hex_vardenis_sotk", "hex_kalbajar", "hex_martakert_talysh", "hex_stepanakert"], "#3cc8e4", "5,4");

    // 3) Front line: every edge between hexes held by different sides
    hexes.forEach((h) => {
      const { cx, cy } = coordMap[h.id];
      for (let i = 0; i < 6; i++) {
        const n = nbr(h.q, h.r, i);
        if (!n || n.id < h.id) continue;
        if (ownerOf(n) === ownerOf(h)) continue;
        const [x1, y1] = vtx(cx, cy, i);
        const [x2, y2] = vtx(cx, cy, (i + 1) % 6);
        const contact = h.is_nk_core || n.is_nk_core || ownerOf(h) !== h.owner || ownerOf(n) !== n.owner;
        if (!contact) {
          html += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(233,241,251,0.35)" stroke-width="1.2" stroke-dasharray="4,3" pointer-events="none"/>`;
          continue;
        }
        html += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ff6a4d" stroke-width="2.4" stroke-linecap="round" filter="url(#glow)" opacity="0.9" pointer-events="none"/>`;
      }
    });

    // 4) Azerbaijani axes of advance, length proportional to progress
    const axis = (ids, frac) => {
      const cs = ids.map((id) => coordMap[id]).filter(Boolean);
      if (cs.length < 2 || frac <= 0) return;
      const segs = [];
      let total = 0;
      for (let i = 1; i < cs.length; i++) {
        const L = Math.hypot(cs[i].cx - cs[i - 1].cx, cs[i].cy - cs[i - 1].cy);
        segs.push(L); total += L;
      }
      let remain = Math.max(0.12, Math.min(1, frac)) * total;
      const pts = [[cs[0].cx, cs[0].cy]];
      for (let i = 1; i < cs.length && remain > 0; i++) {
        const L = segs[i - 1];
        const t = Math.min(1, remain / L);
        pts.push([cs[i - 1].cx + (cs[i].cx - cs[i - 1].cx) * t, cs[i - 1].cy + (cs[i].cy - cs[i - 1].cy) * t]);
        remain -= L;
      }
      const d = pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
      html += `<polyline points="${d}" fill="none" stroke="rgba(255,106,77,0.25)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
      html += `<polyline points="${d}" fill="none" stroke="#ff6a4d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-aze)" pointer-events="none"/>`;
    };
    if (w.day > 0) {
      axis(["hex_beylagan_horadiz", "hex_fuzuli", "hex_hadrut", "hex_shusha"], w.southProgressKm / 132);
      axis(["hex_barda_tartar", "hex_martakert_talysh"], w.northProgressKm / 8);
      axis(["hex_kurdamir", "hex_aghdam_martuni"], w.eastProgressKm / 8);
    }

    // 5) Unit icons, labels, glyphs
    hexes.forEach((h) => {
      const { cx, cy } = coordMap[h.id];
      const cur = ownerOf(h);
      const unitColor = cur === "ARM" ? "#ffb066" : "#6cc3ff";
      const name = shortPlaceName(state.playerCountry === "ARM" ? h.name_arm : h.name_aze);
      const iy = cy - 13;
      html += `<g pointer-events="none">`;
      if (state.iconStyle === "NatoApp6") {
        html += `<rect x="${cx - 10}" y="${iy - 6}" width="20" height="12" fill="#0a1019" stroke="${unitColor}" stroke-width="1.3" rx="1"/>`;
        if (h.terrain === "Open") {
          html += `<ellipse cx="${cx}" cy="${iy}" rx="6" ry="3.2" fill="none" stroke="${unitColor}" stroke-width="1.2"/>`;
        } else {
          html += `<path d="M${cx - 10} ${iy - 6} L${cx + 10} ${iy + 6} M${cx + 10} ${iy - 6} L${cx - 10} ${iy + 6}" stroke="${unitColor}" stroke-width="1.1"/>`;
        }
      } else {
        html += `<path d="M ${cx - 10} ${iy + 4} L ${cx + 10} ${iy + 4} L ${cx + 7} ${iy} L ${cx + 3} ${iy} L ${cx + 2} ${iy - 4} L ${cx - 5} ${iy - 4} L ${cx - 6} ${iy} L ${cx - 8} ${iy} Z" fill="${unitColor}"/>`;
        html += `<line x1="${cx + 2}" y1="${iy - 2}" x2="${cx + 12}" y2="${iy - 2}" stroke="${unitColor}" stroke-width="1.6"/>`;
      }
      html += `<text x="${cx}" y="${cy + 7}" text-anchor="middle" class="hex-label">${name}</text>`;
      html += `<text x="${cx}" y="${cy + 18}" text-anchor="middle" class="hex-sub">${TERRAIN_SHORT[h.terrain] || ""} · 筑${h.fort.toFixed(2).slice(1)}</text>`;
      if (h.key_value >= 10) html += `<text x="${cx + 15}" y="${cy - 15}" font-size="9" fill="#ffd28c">★</text>`;
      if (h.airbase) html += `<text x="${cx - 22}" y="${cy - 14}" font-size="8.5" fill="#9fb4cf">✈</text>`;
      html += `</g>`;
    });

    // Compass + scale
    html += `<g transform="translate(${(maxX - 30).toFixed(0)},${(minY + 26).toFixed(0)})" pointer-events="none">
      <circle r="13" fill="rgba(10,16,24,0.8)" stroke="#34506f"/><path d="M0 -10 L3.5 2 L0 0 L-3.5 2 Z" fill="#f2a93b"/>
      <text y="-15" text-anchor="middle" font-size="8" fill="#6f849e">N</text></g>`;
    html += `<g transform="translate(${(minX + 18).toFixed(0)},${(maxY - 16).toFixed(0)})" pointer-events="none">
      <line x1="0" y1="0" x2="${HW.toFixed(0)}" y2="0" stroke="#6f849e" stroke-width="1.5"/>
      <line x1="0" y1="-3" x2="0" y2="3" stroke="#6f849e"/><line x1="${HW.toFixed(0)}" y1="-3" x2="${HW.toFixed(0)}" y2="3" stroke="#6f849e"/>
      <text x="${(HW / 2).toFixed(0)}" y="-5" text-anchor="middle" font-size="8.5" fill="#6f849e" font-family="monospace">≈ 1 战役格</text></g>`;

    svg.innerHTML = html;

    // Interactions: click to select, hover card
    const tip = document.getElementById("map-tip");
    const stage = document.getElementById("map-stage");
    svg.querySelectorAll(".hex-group").forEach((g) => {
      const h = coordMap[g.getAttribute("data-hex")].h;
      g.addEventListener("click", () => {
        state.war.selectedHexId = h.id;
        renderAll();
      });
      if (!tip || !stage) return;
      g.addEventListener("mouseenter", () => {
        const cur = ownerOf(h);
        const ownerTxt = cur === "ARM" ? "亚美尼亚 / 阿尔察赫" : "阿塞拜疆";
        const flipped = cur !== h.owner ? ` <span class="badge-fail">战时易手</span>` : "";
        const extras = [h.depot ? "后勤仓库" : "", h.airbase ? "空军基地" : "", h.corridor ? (h.corridor.startsWith("m12") ? "M12 拉钦走廊" : "M11 北线") : "", h.gateway ? "口岸" : ""].filter(Boolean).join(" · ");
        tip.innerHTML = `
          <div class="tip-title">${state.playerCountry === "ARM" ? h.name_arm : h.name_aze}</div>
          <div style="margin-bottom:5px;color:var(--text-2);font-size:10.5px;">${state.playerCountry === "ARM" ? h.name_aze : h.name_arm}</div>
          <div class="tip-row"><span>控制方</span><span style="color:${cur === "ARM" ? "var(--arm-color)" : "var(--aze-color)"};">${ownerTxt}</span></div>
          <div class="tip-row"><span>地形</span><span>${TERRAIN_ZH[h.terrain] || h.terrain}</span></div>
          <div class="tip-row"><span>工事等级</span><span>${h.fort.toFixed(2)}</span></div>
          <div class="tip-row"><span>战略价值</span><span>${"★".repeat(Math.round(h.key_value / 2))}</span></div>
          ${extras ? `<div style="margin-top:5px;color:var(--accent-cyan);font-size:11px;">${extras}</div>` : ""}${flipped}`;
        tip.classList.add("show");
      });
      g.addEventListener("mousemove", (e) => {
        const rect = stage.getBoundingClientRect();
        let x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
        if (x + 250 > rect.width) x = e.clientX - rect.left - 250;
        if (y + 170 > rect.height) y = e.clientY - rect.top - 170;
        tip.style.left = `${x}px`; tip.style.top = `${y}px`;
      });
      g.addEventListener("mouseleave", () => tip.classList.remove("show"));
    });
  }

  // =========================================================================
  // 4. RENDER ALL PANELS
  // =========================================================================
  function renderAll() {
    const m = calcBuildMetrics();
    const w = state.war;

    // Left panel build KPIs
    setText("lbl-payroll-saved", `十年省 $${m.savedPayroll}M`);
    setText("lbl-cost-shorad", `$${m.costShorad}M`);
    setText("lbl-cost-ew", `$${m.costEw}M`);
    setText("lbl-cost-fort", `$${m.costFort}M`);
    setText("lbl-cost-atgm", `$${m.costAtgm}M`);
    setText("lbl-cost-uav", `$${m.costUav}M`);
    setText("lbl-cost-ammo", `$${m.costAmmo}M`);
    setText("lbl-cost-su30", `$${m.costSu30}M`);

    setText("kpi-avail-budget", `$${m.availDiscretionary}M`);
    setText("kpi-planned-spend", `$${m.plannedSpend}M`);
    const fulEl = document.getElementById("kpi-fulfillment-sub");
    if (fulEl) {
      fulEl.textContent = `资金到位率 ${(m.fulfillment * 100).toFixed(1)}%`;
      fulEl.style.color = m.fulfillment >= 0.98 ? "var(--accent-green)" : "var(--accent-amber)";
    }

    const winEl = document.getElementById("kpi-expected-winrate");
    if (winEl) {
      winEl.textContent = `${(m.winProb * 100).toFixed(1)}%`;
      winEl.style.color = m.winProb >= 0.5 ? "var(--accent-green)" : m.winProb >= 0.25 ? "var(--accent-amber)" : "var(--accent-red)";
    }

    // Center Map & Header
    renderHexMap();
    setText("map-date-label", `2020-09-27 + Day ${w.day} (${w.ended ? "已停火" : w.day === 0 ? "开战前夕" : "交战中"})`);
    const badge = document.getElementById("map-status-badge");
    if (badge) {
      if (w.outcomeCode === "B_SUCCESSFUL_DEFENSE") {
        badge.className = "badge-pass";
        badge.textContent = "结局 B：成功守住纳卡与舒沙！";
      } else if (w.outcomeCode === "D_HISTORICAL_DEFEAT") {
        badge.className = "badge-fail";
        badge.textContent = "结局 D：舒沙失守 · 11月10日停火";
      } else if (w.outcomeCode === "C_LIMITED_DEFEAT") {
        badge.className = "badge-warn";
        badge.textContent = "结局 C：保住舒沙 · 局部失利";
      } else {
        badge.className = "badge-warn";
        badge.textContent = w.day === 0 ? "准备就绪" : `第 ${w.day} 天作战进行中`;
      }
    }

    setText("lbl-core-tiles-held", `${w.coreTilesHeld} / 26 (${((w.coreTilesHeld / 26) * 100).toFixed(1)}%)`);
    const shushaEl = document.getElementById("lbl-shusha-status");
    if (shushaEl) {
      shushaEl.textContent = w.shushaHeldByArm ? "亚方固守 (M12 畅通)" : "阿方占领 (M12 切断!)";
      shushaEl.style.color = w.shushaHeldByArm ? "var(--accent-green)" : "var(--accent-red)";
    }

    // Selected Hex & 5-Phase Strip Inspector
    const hexes = BUNDLE.theater_hexes || [];
    const selHex = hexes.find((h) => h.id === w.selectedHexId) || hexes[0];
    if (selHex) {
      const dispName = state.playerCountry === "ARM" ? selHex.name_arm : selHex.name_aze;
      setText("sel-hex-name", dispName);
      setText("sel-hex-terrain", selHex.terrain);
      const fortBonus = selHex.sector && selHex.sector.startsWith("south") ? 0.12 * state.build.fort : 0;
      setText("sel-hex-fort", Math.min(0.95, selHex.fort + fortBonus).toFixed(2));

      // Compute local 8km strip progress for selected hex
      let localAdvKm = 0.0;
      if (selHex.id === "hex_martakert_talysh") {
        localAdvKm = Math.min(8.0, w.northProgressKm);
      } else if (selHex.id === "hex_aghdam_martuni") {
        localAdvKm = Math.min(8.0, w.eastProgressKm);
      } else if (w.hexOwners[selHex.id] !== selHex.owner) {
        localAdvKm = 8.0;
      } else if (selHex.sector && selHex.sector.startsWith("south")) {
        localAdvKm = Math.min(8.0, (w.southProgressKm % 24.0) / 3.0);
      } else if (selHex.id === "hex_shusha") {
        localAdvKm = Math.max(0.0, Math.min(8.0, (w.southProgressKm - 102.0) / 3.75));
      }

      const pct = Math.min(100, (localAdvKm / 8.0) * 100);
      setText("sel-strip-adv-km", `${localAdvKm.toFixed(1)} / 8.0 km (${pct.toFixed(0)}%)`);
      const bar = document.getElementById("bar-strip-progress");
      if (bar) bar.style.width = `${pct}%`;
    }

    setText("lbl-north-axis", `塔利什前推 ${w.northProgressKm.toFixed(1)} km`);
    setText("lbl-south-axis", `推进 ${w.southProgressKm.toFixed(1)} / 132.0 km`);

    // Right Column KPIs & DC-010 Latency
    const delayMap = {
      corps: "初始 29.4 min (军部统筹)",
      brigade: "98.0 min (建制旅->营)",
      skip_hq: "176.4 min (越级手操惩罚!)",
      sof: "14.7 min (特种卫星直通)",
    };
    setText("lbl-order-delay", delayMap[state.warOrder.cmdEchelon] || "98.0 min");
    setText(
      "lbl-convoy-loss",
      state.warOrder.convoyPolicy === "night_only" ? "NightOnly: 车损 -77.2%" : "Continuous: 白昼高战损!"
    );

    setText("war-arm-kia", w.armKia.toLocaleString());
    setText("war-aze-kia", w.azeKia.toLocaleString());
    setText("war-tank-loss", `${w.armTanksLost} : ${w.azeTanksLost}`);
    setText("war-sam-art-loss", `${w.armSamLost} / ${w.armArtLost}`);
    setText("lbl-autopause-count", `自动暂停 ${w.autoPauseCount} 次`);

    // Event feed
    const feedEl = document.getElementById("war-event-feed");
    if (feedEl) {
      feedEl.innerHTML = w.events
        .map(
          (ev) => `
          <div class="event-item ${ev.level}">
            <span class="event-time">[${ev.timeStr}]</span>
            <span>${ev.msg}</span>
          </div>`
        )
        .join("");
    }
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  // Spec identifiers are written as `foo` throughout the copy; render them as <code>.
  function enhanceCodeTicks(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue || n.nodeValue.indexOf("`") < 0) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|CODE|TEXTAREA)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const p = n.parentNode;
      if (p.nodeName === "OPTION" || p.namespaceURI === "http://www.w3.org/2000/svg") {
        n.nodeValue = n.nodeValue.replace(/`/g, "");
        return;
      }
      const parts = n.nodeValue.split("`");
      if (parts.length < 3) { n.nodeValue = n.nodeValue.replace(/`/g, ""); return; }
      const frag = document.createDocumentFragment();
      parts.forEach((part, i) => {
        if (!part) return;
        if (i % 2 === 1) {
          const c = document.createElement("code");
          c.textContent = part;
          frag.appendChild(c);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      p.replaceChild(frag, n);
    });
  }

  function toast(msg, kind = "") {
    const host = document.getElementById("toast-host");
    if (!host) return;
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.innerHTML = msg;
    host.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  function fitCanvasToDpr(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 680, cssH = canvas.clientHeight || 360;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: cssW, H: cssH };
  }

  // =========================================================================
  // 5. TAB 2: PHASE 0 PROVING GROUND & 60-STEP SQUAD COMBAT CANVAS
  // =========================================================================
  function initProvingGround() {
    const v5 = VAL.v5 || {};
    const templates = v5.templates || {};
    const attSel = document.getElementById("pg-select-att");
    const dfnSel = document.getElementById("pg-select-dfn");
    if (!attSel || !dfnSel) return;

    const entries = Object.entries(templates);
    attSel.innerHTML = entries
      .map(([id, t]) => `<option value="${id}" ${id === state.pg.attId ? "selected" : ""}>${t.name} (总胜率 ${t.overall_win_rate_pct}%)</option>`)
      .join("");
    dfnSel.innerHTML = entries
      .filter(([, t]) => t.is_historical)
      .map(([id, t]) => `<option value="${id}" ${id === state.pg.dfnId ? "selected" : ""}>${t.name}</option>`)
      .join("");

    const v5Badge = document.getElementById("v5-status-badge");
    if (v5Badge) {
      const ok = v5.all_pass === true;
      v5Badge.className = ok ? "badge-pass" : "badge-fail";
      const failed = Object.entries(v5.criteria_checks || {}).filter(([, c]) => c && c.pass === false).map(([k]) => k.split("_")[0]);
      v5Badge.textContent = ok ? "✓ ALL PASS" : `✗ 未通过 ${failed.join(", ")}`;
      v5Badge.title = ok ? "" : "见 tools/validation/v5_results.json criteria_checks";
    }

    // Populate V5 table
    const tbody = document.querySelector("#tbl-v5-templates tbody");
    if (tbody) {
      tbody.innerHTML = entries
        .map(([id, t]) => {
          const badge = t.is_historical ? "color:#fff;" : "color:#ff867a;";
          return `
            <tr>
              <td style="${badge}">${t.name}</td>
              <td class="num"><strong>${t.overall_win_rate_pct}%</strong></td>
              <td class="num">${t.win_rate_by_terrain_pct.Open}%</td>
              <td class="num">${t.win_rate_by_terrain_pct.Urban}%</td>
              <td class="num">${t.win_rate_by_terrain_pct.Mountain}%</td>
            </tr>`;
        })
        .join("");
    }

    updateProvingGroundStats();
    startSquadCanvasAnimation();
  }

  function updateProvingGroundStats() {
    const v1 = VAL.v1 || {};
    const v5 = VAL.v5 || {};
    const tMap = v5.templates || {};
    const att = tMap[state.pg.attId];
    const terrain = state.pg.terrain;

    if (att) {
      const wr = att.win_rate_by_terrain_pct[terrain] || att.overall_win_rate_pct;
      setText("pg-win-prob", `${wr}%`);
      setText("pg-matchup-sub", `在 ${terrain} 地形平均胜率 ${wr}% (全地形 ${att.overall_win_rate_pct}%)`);
    }

    const atgmData =
      v1.V1_a_atgm_echelon &&
      v1.V1_a_atgm_echelon.by_terrain &&
      v1.V1_a_atgm_echelon.by_terrain[terrain] &&
      v1.V1_a_atgm_echelon.by_terrain[terrain][state.pg.atgmEchelon];
    if (atgmData) {
      setText("pg-atgm-kills", `${atgmData.mean_afv_kills} 辆 AFV`);
      setText("pg-atgm-exch", `交换比 ${atgmData.exchange_index} · 响应 ${atgmData.mean_response_s}s`);
    }

    const wCurve =
      v1.V1_d_weight_and_mentoring &&
      v1.V1_d_weight_and_mentoring.weight_curve &&
      v1.V1_d_weight_and_mentoring.weight_curve[state.pg.squadWeightKg];
    const mCurve =
      v1.V1_d_weight_and_mentoring &&
      v1.V1_d_weight_and_mentoring.mentoring_and_squad_size &&
      v1.V1_d_weight_and_mentoring.mentoring_and_squad_size[state.pg.mentoringKey];
    if (wCurve && mCurve) {
      setText("pg-weight-eff", `${wCurve.net_combat_effectiveness} (负荷 ${wCurve.gunner_load_kg}kg)`);
      setText(
        "pg-mentor-eff",
        `有效熟练度 ${mCurve.initial_mean_eff_skill} (+${mCurve.mentoring_skill_boost_pct}%) · 伤亡后战力 ${mCurve.retained_combat_power_after_3_cas}`
      );
    }
  }

  function startSquadCanvasAnimation() {
    const canvas = document.getElementById("squad-battle-canvas");
    if (!canvas) return;

    if (state.pg.animTimer) clearInterval(state.pg.animTimer);
    state.pg.step = 0;

    // Initialize 18 Blue (Attacker) & 18 Red (Defender) SpatialElements across 6 frontal slots
    state.pg.elementsA = Array.from({ length: 18 }, (_, i) => ({
      slot: i % 6,
      y: -1500 + (i * 65) % 1100,
      supp: 0.1,
      org: 0.9,
      isArmor: i % 3 === 0,
    }));
    state.pg.elementsB = Array.from({ length: 18 }, (_, i) => ({
      slot: i % 6,
      y: 120 + (i * 55) % 850,
      supp: 0.08,
      org: 0.92,
      isArmor: i % 4 === 0,
    }));

    const drawStep = () => {
      state.pg.step = (state.pg.step % 60) + 1;
      setText("pg-battle-step-tag", `T+${state.pg.step} min / 60`);

      const { ctx, W, H } = fitCanvasToDpr(canvas);
      ctx.clearRect(0, 0, W, H);

      // Background: attacker zone (bottom) and defender zone (top) tint
      const yZero = H * 0.42;
      const gTop = ctx.createLinearGradient(0, 0, 0, yZero);
      gTop.addColorStop(0, "rgba(224,129,47,0.07)"); gTop.addColorStop(1, "rgba(224,129,47,0.0)");
      ctx.fillStyle = gTop; ctx.fillRect(0, 0, W, yZero);
      const gBot = ctx.createLinearGradient(0, yZero, 0, H);
      gBot.addColorStop(0, "rgba(58,155,224,0.0)"); gBot.addColorStop(1, "rgba(58,155,224,0.08)");
      ctx.fillStyle = gBot; ctx.fillRect(0, yZero, W, H - yZero);

      // 6 frontal slot lanes
      const slotW = W / 6;
      ctx.font = "10px ui-monospace, Menlo, monospace";
      for (let s = 0; s < 6; s++) {
        if (s > 0) {
          ctx.strokeStyle = "rgba(52, 80, 111, 0.35)";
          ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(s * slotW, 0); ctx.lineTo(s * slotW, H); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = "#56708f";
        ctx.fillText(`槽 ${s + 1}`, s * slotW + 8, 15);
      }

      // Depth ruler
      ctx.fillStyle = "#56708f";
      [[1200, "+1200m"], [0, "0"], [-900, "−900m"], [-1800, "−1800m"]].forEach(([m, lbl]) => {
        const y = yZero - (m / 1800) * (H * 0.52);
        ctx.fillText(lbl, W - 46, Math.max(12, Math.min(H - 4, y - 3)));
      });

      // Contact line
      ctx.strokeStyle = "rgba(242,169,59,0.85)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, yZero); ctx.lineTo(W, yZero); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f2a93b";
      ctx.fillText("接触线 · 夺占距离 50m", 8, yZero - 6);

      const mapY = (yMeters) => yZero - (yMeters / 1800) * (H * 0.52);

      const drawUnit = (x, y, color, isArmor, supp) => {
        ctx.fillStyle = "#0a1019";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.fillRect(x - 9, y - 6, 18, 12);
        ctx.strokeRect(x - 9, y - 6, 18, 12);
        ctx.beginPath();
        if (isArmor) {
          ctx.ellipse(x, y, 5.5, 3, 0, 0, Math.PI * 2);
        } else {
          ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 9, y + 6);
          ctx.moveTo(x + 9, y - 6); ctx.lineTo(x - 9, y + 6);
        }
        ctx.stroke();
        // suppression bar
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x - 9, y + 8, 18, 2.5);
        ctx.fillStyle = supp > 0.6 ? "#f0604d" : supp > 0.35 ? "#f2a93b" : "#3ddc84";
        ctx.fillRect(x - 9, y + 8, 18 * supp, 2.5);
      };

      // Attackers: advance unless suppressed; draw tracers to the same-slot defender
      state.pg.elementsA.forEach((el, idx) => {
        if (el.supp < 0.5) el.y = Math.min(-45, el.y + 18);
        el.supp = Math.max(0.05, Math.min(0.95, el.supp + (Math.random() - 0.52) * 0.18));
        const x = el.slot * slotW + slotW * 0.32 + (idx % 2) * 22;
        const y = mapY(el.y);
        const target = state.pg.elementsB[idx];
        if (target && Math.random() < 0.45) {
          const tx = target.slot * slotW + slotW * 0.6 - (idx % 2) * 18;
          const ty = mapY(target.y);
          const g = ctx.createLinearGradient(x, y, tx, ty);
          g.addColorStop(0, el.isArmor ? "rgba(60,200,228,0.0)" : "rgba(61,220,132,0.0)");
          g.addColorStop(1, el.isArmor ? "rgba(60,200,228,0.75)" : "rgba(61,220,132,0.6)");
          ctx.strokeStyle = g;
          ctx.lineWidth = el.isArmor ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.fillStyle = "rgba(255,230,180,0.8)";
          ctx.beginPath(); ctx.arc(tx, ty, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        drawUnit(x, y, "#6cc3ff", el.isArmor, el.supp);
      });

      state.pg.elementsB.forEach((el, idx) => {
        el.supp = Math.max(0.05, Math.min(0.95, el.supp + (Math.random() - 0.48) * 0.18));
        const x = el.slot * slotW + slotW * 0.6 - (idx % 2) * 18;
        drawUnit(x, mapY(el.y), "#ffb066", el.isArmor, el.supp);
      });

      // Legend
      ctx.font = "10px ui-sans-serif, -apple-system, sans-serif";
      ctx.fillStyle = "#6cc3ff"; ctx.fillText("■ 蓝方进攻", 8, H - 8);
      ctx.fillStyle = "#ffb066"; ctx.fillText("■ 红方防守", 78, H - 8);
      ctx.fillStyle = "#8ea3be"; ctx.fillText("底部色条 = 压制度", 148, H - 8);
    };

    drawStep();
    state.pg.animTimer = setInterval(drawStep, 450);
  }

  // =========================================================================
  // 5B. S05 MULTI-ECHELON TO&E TEMPLATE EDITOR (班 → 排 → 连 → 营 → 旅/团)
  // =========================================================================
  const LEVEL_ORDER = { squad: 1, platoon: 2, company: 3, battalion: 4, brigade: 5 };
  const LEVEL_LABEL_ZH = {
    squad: "班 (Squad)",
    platoon: "排 (Platoon)",
    company: "连 (Company)",
    battalion: "营 (Battalion)",
    brigade: "旅/团 (Brigade)",
  };
  const LEVEL_BADGE_COLOR = {
    brigade: "#f5a623",
    battalion: "#2ac3de",
    company: "#2ecc71",
    platoon: "#9b59b6",
    squad: "#95a5a6",
  };
  const SPECIALTY_NAMES_ZH = {
    squad_leader: "班长 (Squad Leader)",
    vehicle_gunner: "车载炮长 (Vehicle Gunner)",
    vehicle_driver: "装甲驾驶员 (Vehicle Driver)",
    automatic_rifleman: "轻机枪手 (Auto Rifleman)",
    mg_gunner: "通用机枪手 (GPMG Gunner)",
    at_gunner: "反坦射手 (AT/ATGM Gunner)",
    assistant_gunner: "副射手/装填手 (Asst Gunner)",
    rifleman: "步枪手 (Rifleman)",
    marksman: "精确射手 (DMR Marksman)",
    sniper: "狙击手 (Sniper)",
    officer: "指挥军官 (Officer)",
    nco_senior: "高级士官/排副 (Senior NCO)",
    signaler: "通信兵 (Signaler)",
    medic: "卫生员 (Combat Medic)",
    driver: "轮式驾驶员 (Truck Driver)",
    mortar_gunner: "迫击炮手 (Mortar Crew)",
    artilleryman: "身管火炮手 (Artilleryman)",
    rocket_artilleryman: "火箭炮手 (MRL Crew)",
    air_defense_crew: "防空导弹/高炮手 (AD Crew)",
    engineer: "战斗工兵 (Combat Engineer)",
    recon_scout: "侦察兵 (Recon Scout)",
    uav_operator: "无人机操作手 (UAV Operator)",
    staff: "参谋人员 (HQ Staff)",
    intel: "情报参谋 (Intel)",
    supply: "军需补给兵 (Supply)",
    mechanic: "装甲维修技师 (Mechanic)",
  };
  const SLOT_NAMES_ZH = {
    ifv: "步兵战车 (IFV: BMP-1/2)",
    apc: "装甲输送车 (APC: BTR/MT-LB)",
    mbt: "主战坦克 (MBT: T-72/T-90)",
    rifle: "突击步枪 (AK-74/AK-74M)",
    lmg: "班用轻机枪 (RPK-74)",
    gpmg: "通用机枪 (PKM)",
    hmg: "重机枪 (NSV/Kord)",
    dmr: "精确射手步枪 (SVD)",
    sniper_rifle: "反器材/狙击步枪",
    reusable_launcher: "重用火箭筒 (RPG-7)",
    disposable_launcher: "一次性火箭筒 (RPG-26)",
    atgm_light: "轻型反坦克导弹 (Fagot/Metis)",
    atgm_heavy: "重型反坦克导弹 (Kornet/Konkurs/Spike)",
    agl: "自动榴弹发射器 (AGS-17)",
    manpads: "便携防空导弹 (Igla/Strela)",
    mortar_medium: "82mm 迫击炮",
    mortar_heavy: "120mm 重迫击炮 (2B11)",
    howitzer_light_sp: "122mm 自行榴炮 (2S1)",
    howitzer_heavy_sp: "152mm 自行加榴炮 (2S3/2S19)",
    howitzer_heavy_truck: "152mm 卡车炮 (DANA)",
    howitzer_light_towed: "122mm 牵引榴炮 (D-30)",
    howitzer_heavy_towed: "152mm 牵引加榴炮 (D-20)",
    mrl_light: "122mm 火箭炮 (BM-21 Grad)",
    mrl_long_range: "300mm 远程火箭炮 (BM-30 Smerch)",
    sam_short: "近程防空系统 (Osa-AKM/Strela-10/Tor)",
    spaag: "自行高炮 (ZSU-23-4)",
    uav_tactical: "战术侦察无人机",
    loitering_launcher: "巡飞弹发射单元 (Harop/HRESH)",
    tbm_launcher: "战术弹道导弹发射车",
    radio_handheld: "便携战术电台",
    truck_medium: "中型军用卡车 (Ural-4320)",
    truck_heavy: "重型军用卡车 (KamAZ)",
    armored_command_vehicle: "装甲指挥车 (BTR-60PU)",
    engineer_vehicle: "装甲工程车",
    mine_clearing_vehicle: "扫雷破障车 (UR-77)",
  };

  function initToeEditor() {
    const rawOrg = BUNDLE.org_templates || { ARM: [], AZE: [] };
    ["ARM", "AZE"].forEach((c) => {
      state.toe.workingTemplates[c] = {};
      state.toe.presetTemplates[c] = {};
      (rawOrg[c] || []).forEach((t) => {
        state.toe.presetTemplates[c][t.id] = JSON.parse(JSON.stringify(t));
        state.toe.workingTemplates[c][t.id] = JSON.parse(JSON.stringify(t));
      });
    });

    // Expose drill-down & editing helpers on window for inline onclick handlers
    window.__toeSelectTemplate = (id, pushBreadcrumb) => {
      if (!state.toe.workingTemplates[state.toe.country]?.[id]) return;
      state.toe.activeId = id;
      if (pushBreadcrumb) {
        const idx = state.toe.breadcrumb.indexOf(id);
        if (idx >= 0) {
          state.toe.breadcrumb = state.toe.breadcrumb.slice(0, idx + 1);
        } else {
          state.toe.breadcrumb.push(id);
        }
      } else {
        state.toe.breadcrumb = [id];
      }
      renderToeAll();
    };

    window.__toeToggleNode = (pathKey) => {
      state.toe.expandedNodes[pathKey] = !state.toe.expandedNodes[pathKey];
      renderToeActiveEditor();
    };

    window.__toeChangeChildCount = (childIdx, delta) => {
      const t = getActiveToeTemplate();
      if (!t || !t.children || !t.children[childIdx]) return;
      const nextCount = t.children[childIdx].count + delta;
      if (nextCount <= 0) {
        t.children.splice(childIdx, 1);
      } else {
        t.children[childIdx].count = nextCount;
      }
      renderToeAll();
    };

    window.__toeAddChildTemplate = () => {
      const sel = document.getElementById("toe-add-child-select");
      const t = getActiveToeTemplate();
      if (!sel || !sel.value || !t) return;
      const childId = sel.value;
      t.children = t.children || [];
      const existing = t.children.find((c) => c.template === childId);
      if (existing) {
        existing.count += 1;
      } else {
        t.children.push({ template: childId, count: 1 });
      }
      renderToeAll();
    };

    window.__toeChangeSpecialty = (specKey, delta) => {
      const t = getActiveToeTemplate();
      if (!t || t.level !== "squad") return;
      t.personnel = t.personnel || {};
      const next = (t.personnel[specKey] || 0) + delta;
      if (next <= 0) {
        delete t.personnel[specKey];
      } else {
        t.personnel[specKey] = next;
      }
      renderToeAll();
    };

    window.__toeAddSpecialty = () => {
      const sel = document.getElementById("toe-add-spec-select");
      const t = getActiveToeTemplate();
      if (!sel || !sel.value || !t) return;
      t.personnel = t.personnel || {};
      t.personnel[sel.value] = (t.personnel[sel.value] || 0) + 1;
      renderToeAll();
    };

    window.__toeChangeSlot = (slotKey, delta) => {
      const t = getActiveToeTemplate();
      if (!t || t.level !== "squad") return;
      t.slots = t.slots || {};
      const next = (t.slots[slotKey] || 0) + delta;
      if (next <= 0) {
        delete t.slots[slotKey];
      } else {
        t.slots[slotKey] = next;
      }
      renderToeAll();
    };

    window.__toeAddSlot = () => {
      const sel = document.getElementById("toe-add-slot-select");
      const t = getActiveToeTemplate();
      if (!sel || !sel.value || !t) return;
      t.slots = t.slots || {};
      t.slots[sel.value] = (t.slots[sel.value] || 0) + 1;
      renderToeAll();
    };

    renderToeAll();
  }

  function getActiveToeTemplate() {
    return state.toe.workingTemplates[state.toe.country]?.[state.toe.activeId] || null;
  }

  // Recursively expands a template down to its squads.
  // Model bindings inherit top-down: a squad slot uses the nearest ancestor's default_bindings (01 §4.6).
  function computeRecursiveTotals(country, templateId, visited = new Set(), inherited = {}) {
    const map = state.toe.workingTemplates[country] || {};
    const t = map[templateId];
    const res = { men: 0, leafSquads: 0, personnelBySpec: {}, slotsByCat: {}, modelsByCat: {} };
    if (!t || visited.has(templateId)) return res;
    const nextVisited = new Set(visited);
    nextVisited.add(templateId);
    const bindings = { ...inherited, ...(t.default_bindings || {}) };

    const addSlot = (cat, n) => {
      res.slotsByCat[cat] = (res.slotsByCat[cat] || 0) + n;
      const model = bindings[cat] || "—";
      res.modelsByCat[cat] = res.modelsByCat[cat] || {};
      res.modelsByCat[cat][model] = (res.modelsByCat[cat][model] || 0) + n;
    };

    if (t.level === "squad" || !t.children || t.children.length === 0) {
      res.leafSquads = 1;
      Object.entries(t.personnel || {}).forEach(([k, v]) => {
        res.men += v;
        res.personnelBySpec[k] = (res.personnelBySpec[k] || 0) + v;
      });
      Object.entries(t.slots || {}).forEach(([k, v]) => addSlot(k, v));
      Object.entries(t.slots_unassigned || {}).forEach(([k, v]) => addSlot(k, v));
      return res;
    }

    (t.children || []).forEach((ch) => {
      const sub = computeRecursiveTotals(country, ch.template, nextVisited, bindings);
      const mult = ch.count || 0;
      res.men += sub.men * mult;
      res.leafSquads += sub.leafSquads * mult;
      Object.entries(sub.personnelBySpec).forEach(([k, v]) => {
        res.personnelBySpec[k] = (res.personnelBySpec[k] || 0) + v * mult;
      });
      Object.entries(sub.slotsByCat).forEach(([k, v]) => {
        res.slotsByCat[k] = (res.slotsByCat[k] || 0) + v * mult;
      });
      Object.entries(sub.modelsByCat).forEach(([cat, models]) => {
        res.modelsByCat[cat] = res.modelsByCat[cat] || {};
        Object.entries(models).forEach(([m, v]) => {
          res.modelsByCat[cat][m] = (res.modelsByCat[cat][m] || 0) + v * mult;
        });
      });
    });
    return res;
  }

  function computePresetTotals(country, templateId, visited = new Set()) {
    const map = state.toe.presetTemplates[country] || {};
    const t = map[templateId];
    let men = 0;
    if (!t || visited.has(templateId)) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(templateId);
    if (t.level === "squad" || !t.children || t.children.length === 0) {
      Object.values(t.personnel || {}).forEach((v) => { men += v; });
      return men;
    }
    (t.children || []).forEach((ch) => {
      men += computePresetTotals(country, ch.template, nextVisited) * (ch.count || 0);
    });
    return men;
  }

  function findAncestorTemplates(country, targetId) {
    const map = state.toe.workingTemplates[country] || {};
    const all = Object.values(map);
    // Check if template A transitively references targetId
    function usesTarget(curId, target, seen = new Set()) {
      if (seen.has(curId)) return 0;
      seen.add(curId);
      const node = map[curId];
      if (!node || !node.children) return 0;
      let totalRefs = 0;
      for (const ch of node.children) {
        if (ch.template === target) {
          totalRefs += ch.count;
        } else {
          totalRefs += ch.count * usesTarget(ch.template, target, new Set(seen));
        }
      }
      return totalRefs;
    }

    return all
      .filter((t) => t.id !== targetId)
      .map((t) => ({ template: t, refCount: usesTarget(t.id, targetId) }))
      .filter((x) => x.refCount > 0)
      .sort((a, b) => (LEVEL_ORDER[b.template.level] || 0) - (LEVEL_ORDER[a.template.level] || 0));
  }

  function renderToeLibrary() {
    const country = state.toe.country;
    const map = state.toe.workingTemplates[country] || {};
    const allList = Object.values(map);
    const filtered = allList.filter((t) => {
      if (state.toe.levelFilter !== "ALL" && t.level !== state.toe.levelFilter) return false;
      if (state.toe.search) {
        const q = state.toe.search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Sort Brigade -> Battalion -> Company -> Platoon -> Squad
    filtered.sort((a, b) => (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0));
    setText("toe-lib-count", `${filtered.length} / ${allList.length} 模板`);

    const listEl = document.getElementById("toe-template-list");
    if (!listEl) return;

    listEl.innerHTML = filtered
      .map((t) => {
        const isSel = t.id === state.toe.activeId;
        const tot = computeRecursiveTotals(country, t.id);
        const badgeColor = LEVEL_BADGE_COLOR[t.level] || "#95a5a6";
        return `
        <div onclick="window.__toeSelectTemplate('${t.id}', false)" class="toe-item ${isSel ? "active" : ""}">
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:600;color:${isSel ? "var(--accent-cyan)" : "var(--text-0)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
            <div style="font-size:10.5px;color:var(--text-2);font-family:var(--font-mono);">${tot.men.toLocaleString()} 人 · ${tot.leafSquads} 班</div>
          </div>
          <span class="lvl-chip" style="background:${badgeColor}1f;color:${badgeColor};border:1px solid ${badgeColor}55;">${LEVEL_LABEL_ZH[t.level]?.split(" ")[0] || t.level}</span>
        </div>`;
      })
      .join("");
  }

  function renderRecursiveSubtreeHtml(country, templateId, multCount, depth, pathKey) {
    const map = state.toe.workingTemplates[country] || {};
    const t = map[templateId];
    if (!t || depth > 6) return "";
    const tot = computeRecursiveTotals(country, templateId);
    const badgeColor = LEVEL_BADGE_COLOR[t.level] || "#95a5a6";
    const isExpanded = state.toe.expandAll || !!state.toe.expandedNodes[pathKey];
    const hasSub = t.level !== "squad" && t.children && t.children.length > 0;

    let leafDetailHtml = "";
    if (t.level === "squad") {
      const specSummary = Object.entries(t.personnel || {})
        .map(([k, v]) => `${SPECIALTY_NAMES_ZH[k]?.split(" ")[0] || k}×${v}`)
        .join("、");
      const slotSummary = Object.entries(t.slots || {})
        .map(([k, v]) => `${SLOT_NAMES_ZH[k]?.split(" ")[0] || k}×${v}`)
        .join("、");
      leafDetailHtml = `
        <div style="margin-top:4px;padding:4px 8px;background:var(--bg-1);border-radius:3px;font-size:11px;color:var(--text-1);">
          <div>👤 <strong>班人员编成 (${tot.men}人/班)</strong>：${specSummary || "无"}</div>
          <div>🔫 <strong>班武器/载具槽</strong>：${slotSummary || "无"}</div>
        </div>`;
    }

    let childrenHtml = "";
    if (hasSub && isExpanded) {
      childrenHtml = `<div style="margin-left:16px;padding-left:10px;border-left:1px dashed var(--border);margin-top:4px;">
        ${t.children
          .map((ch, idx) =>
            renderRecursiveSubtreeHtml(country, ch.template, ch.count, depth + 1, `${pathKey}_${idx}_${ch.template}`)
          )
          .join("")}
      </div>`;
    }

    return `
      <div style="margin-top:5px;padding:6px 8px;background:var(--bg-2);border:1px solid var(--border);border-radius:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            ${
              hasSub
                ? `<button class="btn" onclick="window.__toeToggleNode('${pathKey}')" style="padding:1px 6px;font-size:11px;">${isExpanded ? "▾ 收起下级" : "▸ 展开下级"}</button>`
                : `<span style="font-size:11px;color:var(--text-2);padding:0 4px;">● 底层班</span>`
            }
            <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}66;">
              ${LEVEL_LABEL_ZH[t.level]?.split(" ")[0] || t.level}
            </span>
            <strong style="font-size:12px;color:var(--text-0);">${t.name}</strong>
            <span style="font-family:var(--font-mono);font-size:11.5px;color:var(--accent-amber);">× ${multCount}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;color:var(--text-2);font-family:var(--font-mono);">
              单建制 ${tot.men}人 (共 ${tot.men * multCount}人)
            </span>
            <button class="btn btn-cyan" onclick="window.__toeSelectTemplate('${t.id}', true)" style="padding:2px 7px;font-size:11px;">
              🔍 钻取编辑此${LEVEL_LABEL_ZH[t.level]?.split(" ")[0] || "模板"}
            </button>
          </div>
        </div>
        ${leafDetailHtml}
        ${childrenHtml}
      </div>`;
  }

  function renderToeActiveEditor() {
    const country = state.toe.country;
    const map = state.toe.workingTemplates[country] || {};
    const t = getActiveToeTemplate();
    if (!t) return;

    setText("toe-editor-badge", `${t.level.toUpperCase()} · ${LEVEL_LABEL_ZH[t.level] || t.level}`);
    setText("toe-cur-name", `${t.name}`);
    setText("toe-cur-meta", `ID: ${t.id} · 层级: ${LEVEL_LABEL_ZH[t.level]} · 兵种: ${t.branch || "general"} · 角色: ${t.role || "line"}`);

    // 1. Render Breadcrumb Trail
    const bcEl = document.getElementById("toe-breadcrumb");
    if (bcEl) {
      bcEl.innerHTML =
        `<span style="color:var(--text-2);margin-right:4px;">钻取路径 (点击任意上级可返回)：</span>` +
        state.toe.breadcrumb
          .map((bid, idx) => {
            const bt = map[bid];
            if (!bt) return "";
            const isLast = idx === state.toe.breadcrumb.length - 1;
            const badgeColor = LEVEL_BADGE_COLOR[bt.level] || "#95a5a6";
            return `
              <span onclick="window.__toeSelectTemplate('${bid}', true)"
                    style="cursor:pointer;padding:2px 7px;border-radius:3px;background:${isLast ? "rgba(42,195,222,0.2)" : "var(--bg-1)"};border:1px solid ${isLast ? "var(--accent-cyan)" : "var(--border)"};color:${isLast ? "var(--accent-cyan)" : "var(--text-0)"};font-weight:${isLast ? "700" : "400"};">
                [${LEVEL_LABEL_ZH[bt.level]?.split(" ")[0]}] ${bt.name}
              </span>
              ${!isLast ? `<span style="color:var(--text-2);">▸</span>` : ""}`;
          })
          .join("");
    }

    const mainEl = document.getElementById("toe-editor-main");
    if (!mainEl) return;

    // 2. If active template is Platoon / Company / Battalion / Brigade -> Show Direct Children Editor + Add Lower Echelon + Full Recursive Tree
    if (t.level !== "squad") {
      const curLvlNum = LEVEL_ORDER[t.level] || 2;
      const lowerTemplates = Object.values(map)
        .filter((cand) => (LEVEL_ORDER[cand.level] || 0) < curLvlNum)
        .sort((a, b) => (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0));

      const directRowsHtml = (t.children || [])
        .map((ch, idx) => {
          const ct = map[ch.template];
          const cName = ct ? ct.name : ch.template;
          const cLvl = ct ? LEVEL_LABEL_ZH[ct.level]?.split(" ")[0] : "?";
          const cTot = computeRecursiveTotals(country, ch.template);
          return `
            <tr>
              <td>
                <span class="tag" style="margin-right:4px;">${cLvl}</span>
                <strong>${cName}</strong>
                <div style="font-size:10.5px;color:var(--text-2);font-family:var(--font-mono);">${ch.template} (单建制 ${cTot.men}人 / ${cTot.leafSquads}班)</div>
              </td>
              <td class="num" style="white-space:nowrap;">
                <button class="btn" onclick="window.__toeChangeChildCount(${idx}, -1)" style="padding:1px 7px;">-</button>
                <strong style="margin:0 8px;font-family:var(--font-mono);font-size:13px;color:var(--accent-amber);">${ch.count}</strong>
                <button class="btn" onclick="window.__toeChangeChildCount(${idx}, 1)" style="padding:1px 7px;">+</button>
              </td>
              <td class="num" style="font-family:var(--font-mono);">${cTot.men * ch.count} 人</td>
              <td style="text-align:right;">
                <button class="btn btn-cyan" onclick="window.__toeSelectTemplate('${ch.template}', true)" style="padding:2px 8px;font-size:11px;">
                  🔍 查看/编辑该${cLvl}模板
                </button>
              </td>
            </tr>`;
        })
        .join("");

      const subtreeHtml = (t.children || [])
        .map((ch, idx) => renderRecursiveSubtreeHtml(country, ch.template, ch.count, 1, `root_${idx}_${ch.template}`))
        .join("");

      mainEl.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--accent-cyan);margin-bottom:6px;">
            ① 本级直属下级单位编成 (` + "`children: 子模板 × 数量`" + `，支持跨级直属配属)
          </div>
          <table class="data-table" style="margin-bottom:8px;">
            <thead>
              <tr>
                <th>下属低层级模板名称</th>
                <th class="num">建制数量</th>
                <th class="num">小计人数</th>
                <th style="text-align:right;">向下钻取</th>
              </tr>
            </thead>
            <tbody>${directRowsHtml || `<tr><td colspan="4" style="text-align:center;color:var(--text-2);">暂无下属分队，请从下方添加</td></tr>`}</tbody>
          </table>

          <div style="display:flex;gap:6px;align-items:center;background:var(--bg-2);padding:6px 8px;border-radius:4px;border:1px solid var(--border);">
            <span style="font-size:11.5px;color:var(--text-1);white-space:nowrap;">+ 添加低层级模板：</span>
            <select id="toe-add-child-select" style="flex:1;padding:4px 6px;font-size:11.5px;">
              ${lowerTemplates
                .map((lt) => `<option value="${lt.id}">[${LEVEL_LABEL_ZH[lt.level]?.split(" ")[0]}] ${lt.name} (${lt.id})</option>`)
                .join("")}
            </select>
            <button class="btn btn-primary" onclick="window.__toeAddChildTemplate()" style="padding:4px 10px;font-size:11.5px;white-space:nowrap;">
              + 编入本级部队
            </button>
          </div>
        </div>

        <div>
          <div style="font-size:12px;font-weight:700;color:var(--accent-amber);margin-bottom:4px;">
            ② 全层级递归编制树透视 (` + "`旅/团 → 营 → 连 → 排 → 班`" + `，可直接展开看到每一个底层班模板)
          </div>
          <div style="font-size:11px;color:var(--text-2);margin-bottom:6px;">
            提示：点击任意下级节点的 <strong>「▾ 展开下级」</strong> 可原地逐层拆解直至底层步兵班/车组；点击 <strong>「🔍 钻取编辑」</strong> 可进入该下级模板修改，并通过顶部面包屑随时返回上级。
          </div>
          ${subtreeHtml}
        </div>
      `;
    } else {
      // 3. Active template is a Leaf Squad -> Show Personnel Specialties + Equipment Slots Editor
      const specRows = Object.entries(t.personnel || {})
        .map(
          ([k, v]) => `
          <tr>
            <td><strong>${SPECIALTY_NAMES_ZH[k] || k}</strong> <code style="color:var(--text-2);">${k}</code></td>
            <td class="num">
              <button class="btn" onclick="window.__toeChangeSpecialty('${k}', -1)" style="padding:1px 7px;">-</button>
              <strong style="margin:0 8px;font-family:var(--font-mono);color:var(--accent-cyan);">${v}</strong>
              <button class="btn" onclick="window.__toeChangeSpecialty('${k}', 1)" style="padding:1px 7px;">+</button>
            </td>
          </tr>`
        )
        .join("");

      const slotRows = Object.entries(t.slots || {})
        .map(
          ([k, v]) => `
          <tr>
            <td><strong>${SLOT_NAMES_ZH[k] || k}</strong> <code style="color:var(--text-2);">${k}</code></td>
            <td class="num">
              <button class="btn" onclick="window.__toeChangeSlot('${k}', -1)" style="padding:1px 7px;">-</button>
              <strong style="margin:0 8px;font-family:var(--font-mono);color:var(--accent-amber);">${v}</strong>
              <button class="btn" onclick="window.__toeChangeSlot('${k}', 1)" style="padding:1px 7px;">+</button>
            </td>
          </tr>`
        )
        .join("");

      mainEl.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--accent-cyan);margin-bottom:6px;">
            ① 底层班人员专业配置 (` + "`SquadTemplate.personnel`" + `)
          </div>
          <table class="data-table" style="margin-bottom:6px;">
            <thead><tr><th>兵种专业 (` + "`Specialty`" + `)</th><th class="num">在编人数</th></tr></thead>
            <tbody>${specRows || `<tr><td colspan="2">无人员</td></tr>`}</tbody>
          </table>
          <div style="display:flex;gap:6px;">
            <select id="toe-add-spec-select" style="flex:1;padding:4px 6px;font-size:11.5px;">
              ${Object.entries(SPECIALTY_NAMES_ZH)
                .map(([k, lbl]) => `<option value="${k}">${lbl} (${k})</option>`)
                .join("")}
            </select>
            <button class="btn btn-primary" onclick="window.__toeAddSpecialty()" style="padding:4px 10px;font-size:11.5px;">+ 添加专业</button>
          </div>
        </div>

        <div>
          <div style="font-size:12px;font-weight:700;color:var(--accent-amber);margin-bottom:6px;">
            ② 底层班武器与载具槽位 (` + "`SquadTemplate.slots`" + ` · 模板只定类别，由营/旅绑定具体型号)
          </div>
          <table class="data-table" style="margin-bottom:6px;">
            <thead><tr><th>装备类别 (` + "`EquipmentCategory`" + `)</th><th class="num">槽位数量</th></tr></thead>
            <tbody>${slotRows || `<tr><td colspan="2">无武器/车辆槽位</td></tr>`}</tbody>
          </table>
          <div style="display:flex;gap:6px;">
            <select id="toe-add-slot-select" style="flex:1;padding:4px 6px;font-size:11.5px;">
              ${Object.entries(SLOT_NAMES_ZH)
                .map(([k, lbl]) => `<option value="${k}">${lbl} (${k})</option>`)
                .join("")}
            </select>
            <button class="btn btn-primary" onclick="window.__toeAddSlot()" style="padding:4px 10px;font-size:11.5px;">+ 添加装备槽</button>
          </div>
        </div>
      `;
    }
  }

  function renderToeRightPanel() {
    const country = state.toe.country;
    const t = getActiveToeTemplate();
    if (!t) return;

    const tot = computeRecursiveTotals(country, t.id);
    const presetMen = computePresetTotals(country, t.id);
    const diffMen = tot.men - presetMen;

    setText("toe-total-men", `${tot.men} 人`);
    setText(
      "toe-total-men-diff",
      diffMen === 0
        ? `与预设一致 (${presetMen} 人)`
        : `${diffMen > 0 ? "+" : ""}${diffMen} 人 (预设 ${presetMen} 人)`
    );
    setText("toe-total-squads", `${tot.leafSquads} 班`);

    const childCount = (t.children || []).reduce((acc, c) => acc + c.count, 0);
    setText("toe-cmd-load", t.level === "squad" ? "末端战斗班" : `直属下级 ${childCount} 个单位`);

    // DC-005 Reorg organization cost: Δorg = -0.60 * changedFraction, 0 weapon skill loss
    const changedRatio = presetMen > 0 ? Math.min(1.0, Math.abs(diffMen) / presetMen) : 0;
    const orgPenaltyPct = (0.60 * changedRatio * 100).toFixed(1);
    setText("toe-reorg-cost", orgPenaltyPct === "0.0" ? "0%" : `−${orgPenaltyPct}%`);

    // 1. Automated Checks (RunChecks F3)
    const checks = [];
    const ifvCount = (tot.slotsByCat.ifv || 0) + (tot.slotsByCat.apc || 0);
    if (t.level === "squad" && ifvCount > 0 && tot.men > ifvCount * 10) {
      checks.push({
        sev: "WARN",
        color: "var(--accent-amber)",
        msg: `⚠ [W40 乘车载员超限] 当前班 ${tot.men} 人，但 ${ifvCount} 辆步战/装甲车最多容纳 ${ifvCount * 10} 人（车组3+载员7）。`,
      });
    }
    const heavyWpns = (tot.slotsByCat.gpmg || 0) + (tot.slotsByCat.reusable_launcher || 0) + (tot.slotsByCat.atgm_heavy || 0) * 2 + (tot.slotsByCat.agl || 0) * 2;
    if (t.level === "squad" && heavyWpns >= 4) {
      checks.push({
        sev: "WARN",
        color: "var(--accent-amber)",
        msg: `⚠ [W10 步兵下车负重超 18kg 拐点] 班组携带过多重火器，下车冲锋速度与压制恢复将显著下降 (V1-d)。`,
      });
    }
    if ((t.level === "battalion" || t.level === "brigade") && !(tot.slotsByCat.manpads || tot.slotsByCat.sam_short || tot.slotsByCat.spaag)) {
      checks.push({
        sev: "WARN",
        color: "var(--accent-red)",
        msg: `⚠ [W30 伴随防空缺口] 该${LEVEL_LABEL_ZH[t.level]?.split(" ")[0]}无任何便携防空/近程防空槽位，在 TB2/Harop 威胁下暴露度极高。`,
      });
    }
    if (t.level !== "squad" && childCount > 9) {
      checks.push({
        sev: "WARN",
        color: "var(--accent-amber)",
        msg: `⚠ [W50 指挥跨度过载] 本级直辖 ${childCount} 个下级单位（超过推荐跨度 7），将放大命令传导延迟 (DC-010)。`,
      });
    }
    if (checks.length === 0) {
      checks.push({
        sev: "PASS",
        color: "var(--accent-green)",
        msg: `✔ 全部编制规则检查通过（载员匹配、负重拐点、指挥跨度、伴随火力均在合理区间）。`,
      });
    }

    const checksBox = document.getElementById("toe-checks-box");
    if (checksBox) {
      checksBox.innerHTML = checks
        .map(
          (c) => `
          <div style="padding:5px 8px;border-radius:4px;background:var(--bg-2);border-left:3px solid ${c.color};color:var(--text-0);">
            ${c.msg}
          </div>`
        )
        .join("");
    }

    // 2. Upward Propagation (F2: Which higher-echelon templates reference this template)
    const ancestors = findAncestorTemplates(country, t.id);
    const ancBox = document.getElementById("toe-ancestors-box");
    if (ancBox) {
      if (ancestors.length === 0) {
        ancBox.innerHTML = `<div style="color:var(--text-2);">当前模板已是最高层级（或未被其他上级模板引用）。</div>`;
      } else {
        ancBox.innerHTML =
          `<div style="font-size:11px;color:var(--accent-amber);margin-bottom:4px;">修改本模板将自动向上传导影响以下 <strong>${ancestors.length}</strong> 个上级编制模板（点击可直接跳往该上级模板）：</div>` +
          ancestors
            .map((a) => {
              const badgeColor = LEVEL_BADGE_COLOR[a.template.level] || "#95a5a6";
              return `
                <div onclick="window.__toeSelectTemplate('${a.template.id}', true)"
                     style="cursor:pointer;padding:4px 8px;border-radius:3px;background:var(--bg-2);border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                  <span>
                    <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${badgeColor}22;color:${badgeColor};margin-right:4px;">
                      ${LEVEL_LABEL_ZH[a.template.level]?.split(" ")[0]}
                    </span>
                    <strong>${a.template.name}</strong>
                  </span>
                  <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent-cyan);">
                    含 ${a.refCount} 个本模板 ${diffMen !== 0 ? `(总人数 ${diffMen * a.refCount > 0 ? "+" : ""}${diffMen * a.refCount})` : ""} ▸
                  </span>
                </div>`;
            })
            .join("");
      }
    }

    // 3. Rolled-up equipment by category, with models resolved through the binding chain
    const slotsEl = document.getElementById("toe-slots-summary");
    if (slotsEl) {
      const catalog = BUNDLE.equipment_catalog || {};
      const entries = Object.entries(tot.slotsByCat).sort((a, b) => b[1] - a[1]);
            slotsEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>装备类别</th><th>型号（按绑定链解析）</th><th class="num">总数</th></tr></thead>
          <tbody>
            ${entries
              .map(([cat, cnt]) => {
                const models = Object.entries(tot.modelsByCat[cat] || {}).sort((a, b) => b[1] - a[1]);
                const modelHtml = models
                  .map(([m, n]) => {
                    if (m === "—") return `<span style="color:var(--text-2);">未绑定·用国家默认${models.length > 1 ? ` ×${n}` : ""}</span>`;
                    const nm = catalog[m] ? catalog[m].name : m;
                    return `<span style="color:var(--accent-cyan);">${nm}</span>${models.length > 1 ? `<span style="color:var(--text-2);"> ×${n}</span>` : ""}`;
                  })
                  .join("<br/>");
                return `
                  <tr>
                    <td style="white-space:nowrap;">${(SLOT_NAMES_ZH[cat] || cat).split(" (")[0]}</td>
                    <td style="font-size:11px;">${modelHtml}</td>
                    <td class="num" style="font-weight:700;">${cnt.toLocaleString()}</td>
                  </tr>`;
              })
              .join("")}
          </tbody>
        </table>`;
    }
  }

  function renderToeAll() {
    renderToeLibrary();
    renderToeActiveEditor();
    renderToeRightPanel();
  }

  // =========================================================================
  // 6. TAB 3: LOGISTICS & LACHIN CORRIDOR LAB (V3)
  // =========================================================================
  function renderLogisticsLab() {
    const v3 = VAL.v3 || {};
    const lachin = v3.V3_1_lachin_steady_state || {};
    const cutoff = v3.V3_2_cutoff_and_second_corridor || {};
    const keyNodes = v3.V3_4_key_node_analysis || {};

    const tier = (lachin.tiers || {})[state.logLab.tierKey] || {
      trucks_required: 54,
      arc_utilization_pct: 10.42,
    };
    setText("log-kpi-trucks", `${tier.trucks_required} 辆`);
    setText("log-kpi-util", `道路容量利用率 ${tier.arc_utilization_pct}% (< 40% 非道路瓶颈)`);

    const endEl = document.getElementById("log-kpi-endurance");
    const endSub = document.getElementById("log-kpi-endurance-sub");
    if (endEl && endSub) {
      if (state.logLab.corridorMode === "both_open") {
        endEl.textContent = "持续畅通 (∞ 天)";
        endEl.style.color = "var(--accent-green)";
        endSub.textContent = "M12 (480 t/h) + M11 (150 t/h) 双通道供货";
      } else if (state.logLab.corridorMode === "m12_cut_m11_open") {
        endEl.textContent = `${cutoff.nk_cutoff_with_m11_endurance_days || 10.14} 天`;
        endEl.style.color = "var(--accent-amber)";
        endSub.textContent = `北线 M11 日输 ${cutoff.nk_cutoff_with_m11_vardenis_delivered_t_day || 560.8} t/d (延寿 +87.8%)`;
      } else {
        endEl.textContent = `${cutoff.nk_cutoff_m12_only_endurance_days || 5.4} 天 (危急!)`;
        endEl.style.color = "var(--accent-red)";
        endSub.textContent = "双通道全断，仅靠斯捷潘纳克特圈内 6,480 t 库存";
      }
    }

    // T6 Cutoff Curve Table
    const t6Body = document.querySelector("#tbl-v3-cutoff tbody");
    if (t6Body && cutoff.t6_daily_curve) {
      t6Body.innerHTML = cutoff.t6_daily_curve
        .map(
          (r) => `
          <tr>
            <td>第 ${r.day} 天</td>
            <td class="num">${r.ammo_remaining_t.toFixed(1)} t</td>
            <td class="num">${r.days_without_general.toFixed(1)} 天</td>
            <td class="num">${r.fatigue_floor.toFixed(2)}</td>
            <td class="num">${r.cum_starvation_casualties_per_bn.toFixed(1)} 人/营</td>
          </tr>`
        )
        .join("");
    }

    renderCutoffChart(cutoff.t6_daily_curve || []);

    // KeyNodeReport Tables
    const armBody = document.querySelector("#tbl-v3-keynodes-arm tbody");
    if (armBody && keyNodes.arm_top5_key_nodes) {
      armBody.innerHTML = keyNodes.arm_top5_key_nodes
        .map(
          (n) => `
          <tr>
            <td>#${n.rank}</td>
            <td><code>${n.id}</code></td>
            <td class="num"><div class="bar-cell" style="color:var(--accent-red);"><span style="font-weight:700;">−${(n.drop_nk_direction * 100).toFixed(0)}%</span><span class="bar-bg"><span class="bar" style="width:${(n.drop_nk_direction * 100).toFixed(0)}%;"></span></span></div></td>
            <td class="num" style="color:var(--text-1);">−${(n.drop_total_national * 100).toFixed(0)}%</td>
          </tr>`
        )
        .join("");
    }

    const azeBody = document.querySelector("#tbl-v3-keynodes-aze tbody");
    if (azeBody && keyNodes.aze_top5_key_nodes) {
      azeBody.innerHTML = keyNodes.aze_top5_key_nodes
        .map(
          (n) => `
          <tr>
            <td>#${n.rank}</td>
            <td><code>${n.id}</code></td>
            <td class="num"><div class="bar-cell" style="color:var(--accent-cyan);"><span style="font-weight:700;">−${(n.drop_total_national * 100).toFixed(0)}%</span><span class="bar-bg"><span class="bar" style="width:${(n.drop_total_national * 100).toFixed(0)}%;"></span></span></div></td>
            <td class="num">${n.affected_formations} 个军</td>
          </tr>`
        )
        .join("");
    }
  }

  function renderCutoffChart(rows) {
    const svg = document.getElementById("chart-v3-cutoff");
    if (!svg || !rows.length) return;
    const W = 560, H = 230, L = 44, Rp = 48, T = 26, B = 26;
    const pw = W - L - Rp, ph = H - T - B;
    const maxDay = Math.max(...rows.map((r) => r.day));
    const maxAmmo = Math.max(1, ...rows.map((r) => r.ammo_remaining_t));
    const maxCas = Math.max(1, ...rows.map((r) => r.cum_starvation_casualties_per_bn));
    const x = (d) => L + ((d - 1) / Math.max(1, maxDay - 1)) * pw;
    const yA = (v) => T + ph - (v / maxAmmo) * ph;
    const yC = (v) => T + ph - (v / maxCas) * ph;
    let h = `<defs><linearGradient id="g-ammo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3cc8e4" stop-opacity="0.45"/><stop offset="1" stop-color="#3cc8e4" stop-opacity="0.02"/></linearGradient></defs>`;
    for (let i = 0; i <= 4; i++) {
      const yy = T + (ph * i) / 4;
      h += `<line x1="${L}" x2="${W - Rp}" y1="${yy}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
      h += `<text x="${L - 6}" y="${yy + 3}" text-anchor="end">${(maxAmmo * (1 - i / 4)).toFixed(0)}</text>`;
      h += `<text x="${W - Rp + 6}" y="${yy + 3}">${(maxCas * (1 - i / 4)).toFixed(1)}</text>`;
    }
    rows.forEach((r) => { h += `<text x="${x(r.day)}" y="${H - 10}" text-anchor="middle">D${r.day}</text>`; });
    const area = `M${x(rows[0].day)},${T + ph} ` + rows.map((r) => `L${x(r.day).toFixed(1)},${yA(r.ammo_remaining_t).toFixed(1)}`).join(" ") + ` L${x(rows[rows.length - 1].day)},${T + ph} Z`;
    h += `<path d="${area}" fill="url(#g-ammo)"/>`;
    h += `<polyline points="${rows.map((r) => `${x(r.day).toFixed(1)},${yA(r.ammo_remaining_t).toFixed(1)}`).join(" ")}" fill="none" stroke="#3cc8e4" stroke-width="2"/>`;
    h += `<polyline points="${rows.map((r) => `${x(r.day).toFixed(1)},${(T + ph - r.fatigue_floor * ph).toFixed(1)}`).join(" ")}" fill="none" stroke="#f2a93b" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    h += `<polyline points="${rows.map((r) => `${x(r.day).toFixed(1)},${yC(r.cum_starvation_casualties_per_bn).toFixed(1)}`).join(" ")}" fill="none" stroke="#f0604d" stroke-width="2.2"/>`;
    rows.forEach((r) => { h += `<circle cx="${x(r.day).toFixed(1)}" cy="${yC(r.cum_starvation_casualties_per_bn).toFixed(1)}" r="2.6" fill="#f0604d"/>`; });
    const firstHungry = rows.find((r) => r.days_without_general > 0);
    if (firstHungry) {
      const xx = x(firstHungry.day);
      h += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${T + ph}" stroke="rgba(240,96,77,0.5)" stroke-dasharray="2,3"/>`;
      h += `<text x="${xx + 4}" y="${T + 10}" style="fill:#ff8f80;">断粮开始 D${firstHungry.day}</text>`;
    }
    h += `<text x="${L - 6}" y="${T - 12}" text-anchor="end" style="fill:#3cc8e4;">弹药 t</text>`;
    h += `<text x="${W - Rp + 6}" y="${T - 12}" style="fill:#f0604d;">人/营</text>`;
    svg.innerHTML = h;
  }

  // =========================================================================
  // 7. TAB 4: V1-V8 VALIDATION SUITE DASHBOARD
  // =========================================================================
  function renderValidationSuite() {
    const rows = [
      {
        code: "V1",
        name: "编制层级自然涌现 (02 / 03)",
        target: "ATGM 开阔/山地集中 >1.3x 班属；60/82/120迫分工；18kg 负重拐点；DC-001 老兵传帮带；历史模板 Top 1%",
        metric: "开阔地营连 ATGM 2.45x 班属 · 120迫毁伤 69.5x · 18kg 峰值 2.675 · 老兵传帮带 +24%",
        pass: true,
      },
      {
        code: "V2",
        name: "2020 纳卡 44 日战争历史校准 (04 / 08 / 14)",
        target: "持续天数、双方阵亡、7类Oryx装备损失、南线节点易手日、A+C线占比、前两周防空损失、V2b 四日战争",
        metric: "中位 45.0 天 · 阵亡 3900/3076 · 7/7 装备损失全在 Oryx 区间 · 舒沙 Day 45 · A+C 线占 73.1%",
        pass: true,
      },
      {
        code: "V3",
        name: "纳卡后勤网络与切断耐久 (06)",
        target: "拉钦走廊 T5 对标 (54辆卡车)、切断耐久 T6 对标、NightOnly 降损、KeyNodeReport、700格性能 <20ms",
        metric: "1200t/d 精确 54 辆车 · 仅M12耐久 5.4d vs 加M11 10.14d · NightOnly 车损 -77.2% · C# 0.17ms",
        pass: true,
      },
      {
        code: "V4",
        name: "2010–2020 十年战役可玩性搜索 (11 / 14 / DC-009)",
        target: "存在 ≥50% 胜率路线、随机基线胜率 ∈ [1%, 15%]、对 B 档 ≥25%、无单项贡献 >50% 银弹",
        metric: "最优综合防御胜率 73.0% (对B档 51.0%) · 随机基线 3.2% · 最大单项消融贡献 45.2% ≤ 50%",
        pass: true,
      },
      {
        code: "V5",
        name: "反无脑流派 (Anti-Cheese) 搜索 (03)",
        target: "无模板全地形胜率 >90%、纯坦克巷战 <50%、单武器性价比 <3x、未压制夺占 <10%、RPS 克制环成立",
        metric: `最高胜率 57.9% · 纯坦克巷战 0.8% · 邪道最高 15.2% · 武器性价比极值 ${(((VAL.v5 || {}).criteria_checks || {}).C2_weapon_cost_ratio_under_3x || {}).max_ratio_overall ?? "?"}x（判据 <3x）· 未压制夺占 1.36%`,
        pass: true,
      },
      {
        code: "V6",
        name: "战术交战循环与缓存性能基准 (03 / 09)",
        target: "空间剪枝保留对数 ≤40%、C# 单活跃边 ≤0.30s/游戏小时、单 OutcomeCache Key ≤30s",
        metric: "剪枝保留 33.3% · C# 单边 0.012s/h (余量25倍) · 100边战区 0.076s/h · Cache Key 0.31s",
        pass: true,
      },
      {
        code: "V7",
        name: "和平/战时决策密度与命令延迟反置 (09 / DC-010)",
        target: "平时月均 ≥3 次决策且无 >3月空窗；战时日均 5–40 次决策、自动暂停 ≤6 次/天；DC-010 越级惩罚",
        metric: "平时 3.79 次/月 (0空窗) · 战时 13.55 次/天 · 自动暂停 2.59 次/天 · 旅->营 98m vs 越级单营 176.4m",
        pass: true,
      },
      {
        code: "V8",
        name: "交互式网页原型试玩验证 (Web Playtest Prototype)",
        target: "支持十年建军采办 (DC-009)、2016四日战争、2020逐日六角格与五阶段条带指挥、DS-027/DS-044 实时切换",
        metric: "4 大交互工作台全功能就绪 · 决策反馈清晰可解释 · 支持导出完整 JSON 战报",
        pass: true,
      },
    ];

    const SHORT = { V1: "编制层级涌现", V2: "2020 战争校准", V3: "后勤与切断", V4: "十年战役可玩性", V5: "反无脑流派", V6: "性能基准", V7: "决策密度", V8: "网页试玩原型" };
    // Status is read from the bundled tools/validation/vN_results.json flags, not hard-coded.
    rows.forEach((r) => {
      const res = VAL[r.code.toLowerCase()];
      const flag = res ? (res.all_pass !== undefined ? res.all_pass : res.pass) : undefined;
      if (r.code === "V8") r.status = "manual";
      else if (flag === true) r.status = "pass";
      else if (flag === false) r.status = "fail";
      else r.status = "missing";
    });
    const badgeFor = (st) =>
      st === "pass" ? `<span class="badge-pass">✓ PASS</span>`
      : st === "fail" ? `<span class="badge-fail">✗ FAIL</span>`
      : st === "manual" ? `<span class="badge-info">人工评估</span>`
      : `<span class="badge-warn">无结果文件</span>`;

    const summaryEl = document.getElementById("val-summary-cards");
    if (summaryEl) {
      summaryEl.innerHTML = rows
        .map(
          (r) => `
          <div class="kpi-card val-card">
            <div class="kpi-label">${r.code}</div>
            <div class="val-name">${SHORT[r.code] || r.name}</div>
            <div style="margin-top:6px;">${badgeFor(r.status)}</div>
          </div>`
        )
        .join("");
    }

    const tbody = document.querySelector("#tbl-val-overview tbody");
    if (tbody) {
      tbody.innerHTML = rows
        .map(
          (r) => `
          <tr>
            <td><strong style="font-family:var(--font-mono);color:var(--accent-amber);">${r.code}</strong></td>
            <td style="min-width:160px;">${r.name}</td>
            <td style="color:var(--text-1);">${r.target}</td>
            <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--accent-cyan);">${r.metric}</td>
            <td>${badgeFor(r.status)}</td>
          </tr>`
        )
        .join("");
    }
  }

  // Runs both presets through the in-browser war model and shows the actual outcomes.
  function runSelfCheck() {
    const OUTCOME_ZH = {
      B_SUCCESSFUL_DEFENSE: ["结局 B · 守住舒沙与纳卡", "badge-pass"],
      C_LIMITED_DEFEAT: ["结局 C · 保住舒沙，局部失利", "badge-warn"],
      D_HISTORICAL_DEFEAT: ["结局 D · 舒沙失守，11 月 10 日停火", "badge-fail"],
      PENDING: ["未分出结局", "badge-warn"],
    };
    const runOne = (preset) => {
      applyBuildPreset(preset);
      stepWarDays(60);
      const w = state.war;
      return { preset, outcome: w.outcomeCode, day: w.day, armKia: w.armKia, azeKia: w.azeKia, core: w.coreTilesHeld, win: calcBuildMetrics().winProb };
    };
    const hist = runOne("historical");
    const opt = runOne("optimal");
    const expectOk = hist.outcome === "D_HISTORICAL_DEFEAT" && opt.outcome !== "D_HISTORICAL_DEFEAT";
    const card = (title, r) => {
      const [txt, cls] = OUTCOME_ZH[r.outcome] || [r.outcome, "badge-warn"];
      return `<div class="kpi-card">
        <div class="kpi-label">${title}</div>
        <div style="margin:6px 0;"><span class="${cls}">${txt}</span></div>
        <div class="kpi-sub">停火于 Day ${r.day} · 核心地块 ${r.core}/26 · 阵亡 亚 ${r.armKia.toLocaleString()} / 阿 ${r.azeKia.toLocaleString()} · 模型守住率 ${(r.win * 100).toFixed(1)}%</div>
      </div>`;
    };
    const box = document.getElementById("selfcheck-box");
    if (box) {
      box.innerHTML = `
        <div class="control-title" style="margin-bottom:8px;"><span>网页自检结果（本次在浏览器中实际推演）</span>
          ${expectOk ? `<span class="badge-pass">✓ 符合预期</span>` : `<span class="badge-fail">✗ 与预期不符</span>`}</div>
        <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">${card("史实路线", hist)}${card("V4 最优综合防御", opt)}</div>
        <div class="kpi-sub">预期：史实路线应得到结局 D，最优路线不应得到结局 D。自检后战局停留在“最优路线”的终局，可回到 Tab 1 查看地图。</div>`;
      box.classList.add("show");
    }
    toast(expectOk ? "自检完成：结果符合预期" : "自检完成：结果与预期不符，请查看详情", expectOk ? "good" : "warn");
  }

  // =========================================================================
  // 8. EVENT BINDINGS & INITIALIZATION
  // =========================================================================
  function bindRadioGroup(groupId, onSelect) {
    const grp = document.getElementById(groupId);
    if (!grp) return;
    grp.querySelectorAll(".radio-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        grp.querySelectorAll(".radio-pill").forEach((p) => p.classList.remove("selected"));
        pill.classList.add("selected");
        onSelect(pill.getAttribute("data-val"));
      });
    });
  }

  function setRadioGroupValue(groupId, val) {
    const grp = document.getElementById(groupId);
    if (!grp) return;
    grp.querySelectorAll(".radio-pill").forEach((p) => {
      p.classList.toggle("selected", p.getAttribute("data-val") === String(val));
    });
  }

  function applyBuildPreset(preset) {
    if (preset === "historical") {
      Object.assign(state.build, { readinessReform: 0, shorad: 0, ew: 0, fort: 0, atgm: 0, uav: 0, ammoDays: 20, su30: 4 });
      Object.assign(state.warOrder, { adPosture: "always_active", cmdEchelon: "skip_hq", stance: "rigid_counter", convoyPolicy: "continuous" });
    } else if (preset === "optimal") {
      Object.assign(state.build, { readinessReform: 2, shorad: 2, ew: 2, fort: 2, atgm: 2, uav: 1, ammoDays: 40, su30: 0 });
      Object.assign(state.warOrder, { adPosture: "doctrine_mixed", cmdEchelon: "brigade", stance: "elastic_depth", convoyPolicy: "night_only" });
    } else if (preset === "armor_heavy") {
      Object.assign(state.build, { readinessReform: 1, shorad: 0, ew: 0, fort: 1, atgm: 2, uav: 0, ammoDays: 40, su30: 0 });
      Object.assign(state.warOrder, { adPosture: "always_active", cmdEchelon: "brigade", stance: "rigid_counter", convoyPolicy: "continuous" });
    } else if (preset === "su30_trap") {
      Object.assign(state.build, { readinessReform: 1, shorad: 1, ew: 0, fort: 0, atgm: 1, uav: 0, ammoDays: 20, su30: 8 });
      Object.assign(state.warOrder, { adPosture: "doctrine_mixed", cmdEchelon: "brigade", stance: "rigid_counter", convoyPolicy: "continuous" });
    }

    setRadioGroupValue("grp-readiness-reform", state.build.readinessReform);
    setRadioGroupValue("grp-shorad", state.build.shorad);
    setRadioGroupValue("grp-ew", state.build.ew);
    setRadioGroupValue("grp-fort", state.build.fort);
    setRadioGroupValue("grp-atgm", state.build.atgm);
    setRadioGroupValue("grp-uav", state.build.uav);
    setRadioGroupValue("grp-ammo", state.build.ammoDays);
    setRadioGroupValue("grp-su30", state.build.su30);

    setRadioGroupValue("grp-ad-posture", state.warOrder.adPosture);
    setRadioGroupValue("grp-cmd-echelon", state.warOrder.cmdEchelon);
    setRadioGroupValue("grp-war-stance", state.warOrder.stance);
    setRadioGroupValue("grp-convoy-policy", state.warOrder.convoyPolicy);

    resetWarState(true);
  }

  function initEvents() {
    // Top bar selectors
    document.getElementById("select-player-country")?.addEventListener("change", (e) => {
      state.playerCountry = e.target.value;
      renderAll();
    });
    document.getElementById("select-icon-style")?.addEventListener("change", (e) => {
      state.iconStyle = e.target.value;
      renderAll();
    });
    document.getElementById("select-aze-ai-tier")?.addEventListener("change", (e) => {
      state.azeAiTier = e.target.value;
      renderAll();
    });

    // Navigation Tabs
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-view").forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        document.getElementById(targetId)?.classList.add("active");
        history.replaceState(null, "", `#${targetId}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    // Preset buttons
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyBuildPreset(btn.getAttribute("data-preset"));
        toast(`已套用建军路线：<strong>${btn.textContent.trim().split("\n")[0]}</strong>，战局已重置到 Day 0`);
      });
    });

    // Left column build radio groups
    bindRadioGroup("grp-readiness-reform", (v) => { state.build.readinessReform = Number(v); renderAll(); });
    bindRadioGroup("grp-shorad", (v) => { state.build.shorad = Number(v); renderAll(); });
    bindRadioGroup("grp-ew", (v) => { state.build.ew = Number(v); renderAll(); });
    bindRadioGroup("grp-fort", (v) => { state.build.fort = Number(v); renderAll(); });
    bindRadioGroup("grp-atgm", (v) => { state.build.atgm = Number(v); renderAll(); });
    bindRadioGroup("grp-uav", (v) => { state.build.uav = Number(v); renderAll(); });
    bindRadioGroup("grp-ammo", (v) => { state.build.ammoDays = Number(v); renderAll(); });
    bindRadioGroup("grp-su30", (v) => { state.build.su30 = Number(v); renderAll(); });

    // Right column wartime radio groups
    bindRadioGroup("grp-ad-posture", (v) => { state.warOrder.adPosture = v; renderAll(); });
    bindRadioGroup("grp-cmd-echelon", (v) => { state.warOrder.cmdEchelon = v; renderAll(); });
    bindRadioGroup("grp-war-stance", (v) => { state.warOrder.stance = v; renderAll(); });
    bindRadioGroup("grp-convoy-policy", (v) => { state.warOrder.convoyPolicy = v; renderAll(); });

    // War execution buttons
    document.getElementById("btn-apply-peacetime")?.addEventListener("click", () => resetWarState(true));
    document.getElementById("btn-step-1d")?.addEventListener("click", () => stepWarDays(1));
    document.getElementById("btn-step-5d")?.addEventListener("click", () => stepWarDays(5));
    document.getElementById("btn-run-full-war")?.addEventListener("click", () => stepWarDays(60));
    document.getElementById("btn-reset-war")?.addEventListener("click", () => resetWarState(false));

    // Tab 2 S05 Multi-Echelon TO&E Editor controls
    document.getElementById("toe-select-country")?.addEventListener("change", (e) => {
      state.toe.country = e.target.value;
      const defaultId = state.toe.country === "ARM" ? "arm_mr_regt" : "aze_mr_bde";
      state.toe.activeId = defaultId;
      state.toe.breadcrumb = [defaultId];
      renderToeAll();
    });
    document.getElementById("toe-select-level")?.addEventListener("change", (e) => {
      state.toe.levelFilter = e.target.value;
      renderToeLibrary();
    });
    document.getElementById("toe-search-input")?.addEventListener("input", (e) => {
      state.toe.search = e.target.value.trim();
      renderToeLibrary();
    });
    document.getElementById("btn-toe-expand-all")?.addEventListener("click", (e) => {
      state.toe.expandAll = !state.toe.expandAll;
      e.target.textContent = state.toe.expandAll ? "收起全部低层级树" : "展开全部低层级树";
      renderToeActiveEditor();
    });
    document.getElementById("btn-toe-reset")?.addEventListener("click", () => {
      const c = state.toe.country;
      const id = state.toe.activeId;
      if (state.toe.presetTemplates[c]?.[id]) {
        state.toe.workingTemplates[c][id] = JSON.parse(JSON.stringify(state.toe.presetTemplates[c][id]));
        renderToeAll();
      }
    });

    // Tab 2 Proving Ground controls
    document.getElementById("pg-select-att")?.addEventListener("change", (e) => {
      state.pg.attId = e.target.value;
      updateProvingGroundStats();
    });
    document.getElementById("pg-select-dfn")?.addEventListener("change", (e) => {
      state.pg.dfnId = e.target.value;
      updateProvingGroundStats();
    });
    document.getElementById("pg-select-terrain")?.addEventListener("change", (e) => {
      state.pg.terrain = e.target.value;
      updateProvingGroundStats();
    });
    document.getElementById("pg-select-mission")?.addEventListener("change", (e) => {
      state.pg.mission = e.target.value;
      updateProvingGroundStats();
    });
    document.getElementById("pg-squad-weight")?.addEventListener("change", (e) => {
      state.pg.squadWeightKg = e.target.value;
      updateProvingGroundStats();
    });
    document.getElementById("pg-squad-mentoring")?.addEventListener("change", (e) => {
      state.pg.mentoringKey = e.target.value;
      updateProvingGroundStats();
    });
    bindRadioGroup("grp-pg-atgm-echelon", (v) => {
      state.pg.atgmEchelon = v;
      updateProvingGroundStats();
    });
    document.getElementById("btn-pg-run-battle")?.addEventListener("click", () => startSquadCanvasAnimation());

    // Tab 3 Logistics Lab controls
    document.getElementById("log-select-tier")?.addEventListener("change", (e) => {
      state.logLab.tierKey = e.target.value;
      renderLogisticsLab();
    });
    bindRadioGroup("grp-log-corridor", (v) => {
      state.logLab.corridorMode = v;
      renderLogisticsLab();
    });
    bindRadioGroup("grp-log-geo-ban", (v) => {
      state.logLab.geoBan = v;
      renderLogisticsLab();
    });

    // Export AAR JSON
    document.getElementById("btn-export-aar")?.addEventListener("click", () => {
      const payload = {
        exported_at: new Date().toISOString(),
        player_country: state.playerCountry,
        icon_style: state.iconStyle,
        aze_ai_tier: state.azeAiTier,
        build_decisions_2010_2020: state.build,
        build_metrics: calcBuildMetrics(),
        wartime_directives: state.warOrder,
        war_state_2020: state.war,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mod_v8_playtest_aar_day${state.war.day}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Tab 4 Self-Check button
    document.getElementById("btn-run-v8-selfcheck")?.addEventListener("click", runSelfCheck);
  }

  // Boot
  window.addEventListener("DOMContentLoaded", () => {
    initEvents();
    resetWarState(true);
    initToeEditor();
    initProvingGround();
    renderLogisticsLab();
    renderValidationSuite();
    // Deep link: index.html#tab-proving-ground opens that tab directly
    const hashTab = (location.hash || "").slice(1);
    if (hashTab) document.querySelector(`.nav-tab[data-tab="${hashTab}"]`)?.click();
    window.scrollTo(0, 0);

    // Render `identifiers` as <code>, now and after every re-render
    enhanceCodeTicks(document.body);
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; enhanceCodeTicks(document.body); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
