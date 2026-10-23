// Diagnostics: front coverage and side strengths at t=0
var ROOT = arguments[0];
load(ROOT + "/web/commander/sim_data.js");
load(ROOT + "/web/commander/sim_core.js");
var w = MoDSim.createWorld(MOD_SIM_DATA, { seed: 1, armAi: "historical" });
var H = w.map.hexes;
function front(side) { return H.filter(function (h) { return h.owner === side && h.nb.some(function (j) { return H[j].owner !== side; }) && !(side === "ARM" && h.region === "armenia"); }); }
["ARM", "AZE"].forEach(function (s) {
  var f = front(s), occ = f.filter(function (h) { return MoDSim.unitsAt(w, h.i, s).length; }).length;
  var units = w.units.filter(function (u) { return u.side === s && u.hex >= 0; });
  var tot = { men: 0, tanks: 0, ifv: 0, apc: 0, art: 0, sp: 0, mrl: 0, mrl_lr: 0, atgm: 0, sam: 0, tor: 0, samLong: 0, aaa: 0, trucks: 0 };
  units.forEach(function (u) { u.bns.forEach(function (b) { for (var k in tot) tot[k] += b.cls[k]; }); });
  print(s + " units on map=" + units.length + " front hexes=" + f.length + " occupied=" + occ + " offmap=" + w.units.filter(function (u) { return u.side === s && u.hex < 0; }).length);
  print("  totals " + JSON.stringify(tot));
  units.slice(0, 40).forEach(function (u) {
    var att = 0, def = 0, h = H[u.hex];
    u.bns.forEach(function (b) { att += MoDSim.bnAttack(b, h.terrain); def += MoDSim.bnDefense(b, h.terrain); });
    print("  " + u.id + " " + u.name.slice(0, 26) + " @" + (h.place || h.q + "," + h.r) + " " + h.terrain + " bns=" + u.bns.length + " men=" + MoDSim.unitMen(u) + " att=" + att.toFixed(0) + " def=" + def.toFixed(0) + " fort=" + h.fort);
  });
});
