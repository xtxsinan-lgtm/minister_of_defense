// Trace where and when AZE captures ARM-zone hexes (one seed)
var ROOT = arguments[0], SEED = parseInt(arguments[1] || "1000", 10);
load(ROOT + "/web/commander/sim_data.js");
load(ROOT + "/web/commander/sim_core.js");
var w = MoDSim.createWorld(MOD_SIM_DATA, { seed: SEED, armAi: "historical", aiTier: "H", convoy: "continuous" });
var H = w.map.hexes, prevOwner = H.map(function (h) { return h.owner; });
function sector(h) {
  if (h.region !== "arm_zone") return "other";
  if (h.lat < 39.6 && h.lon > 46.55) return "south";
  if (h.lon < 46.55) return h.lat > 39.75 ? "kalbajar" : "lachin_qubadli";
  if (h.lon > 46.95) return "east";
  if (h.lat > 40.05) return "north";
  return "center";
}
var bySector = {}, log = [];
while (!w.ended) {
  MoDSim.tick(w);
  H.forEach(function (h, i) {
    if (h.owner !== prevOwner[i]) {
      var s = sector(h);
      if (h.owner === "AZE") { bySector[s] = (bySector[s] || 0) + 1; }
      var defs = MoDSim.unitsAt(w, i, "ARM").length;
      log.push("d" + w.day + " " + h.owner + " takes " + (h.place || h.q + "," + h.r) + " [" + s + " " + h.terrain + " fort " + h.fort.toFixed(2) + "]");
      prevOwner[i] = h.owner;
    }
  });
}
var tot = {}; H.forEach(function (h) { var s = sector(h); if (h.region === "arm_zone") tot[s] = (tot[s] || 0) + 1; });
print(JSON.stringify(w.outcome));
print("captured by sector: " + JSON.stringify(bySector) + "  totals: " + JSON.stringify(tot));
log.slice(0, 120).forEach(function (l) { print(l); });
var armAlive = w.units.filter(function (u) { return u.side === "ARM" && MoDSim.alive(u); }).length;
var azeAlive = w.units.filter(function (u) { return u.side === "AZE" && MoDSim.alive(u); }).length;
print("alive units ARM " + armAlive + " AZE " + azeAlive);
