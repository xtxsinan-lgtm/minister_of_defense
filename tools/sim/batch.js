// Headless batch runner for MoDSim (JavaScriptCore `jsc`).
// usage: jsc tools/sim/batch.js -- <root> <scenarioJson> <nSeeds> [seed0]
// prints one JSON line per run: {"seed":..,"summary":{...}}
var args = typeof arguments !== "undefined" ? arguments : scriptArgs;
var ROOT = args[0];
var SCEN = JSON.parse(args[1] || "{}");
var N = parseInt(args[2] || "10", 10);
var SEED0 = parseInt(args[3] || "1000", 10);
load(ROOT + "/web/commander/sim_data.js");
load(ROOT + "/web/commander/sim_core.js");
if (SCEN.params) { for (var k in SCEN.params) MoDSim.P[k] = SCEN.params[k]; }
var t0 = Date.now();
for (var i = 0; i < N; i++) {
  var opts = JSON.parse(JSON.stringify(SCEN.opts || {}));
  opts.seed = SEED0 + i;
  var w = MoDSim.createWorld(MOD_SIM_DATA, opts);
  MoDSim.runToEnd(w);
  print(JSON.stringify({ seed: opts.seed, summary: MoDSim.summarize(w) }));
}
print(JSON.stringify({ done: true, ms: Date.now() - t0 }));
