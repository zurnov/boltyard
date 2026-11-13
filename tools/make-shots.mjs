// Writes tools/shots.json: candidate shots across the dressed maps; the best are picked later.
import { writeFileSync } from 'node:fs';
const L = {
  boomer: {"name":"Boomer","chassis":{"frame":"grinder","engine":"hauler"},"body":{"shell":"keg","batteries":["cell"]},"head":"bucket","weapons":[{"mechanism":"brute","barrels":["volley"]},{"mechanism":"brute","barrels":["volley"]}],"devices":["bulkhead",null]},
  gatling: {"name":"Gatling","chassis":{"frame":"roller","engine":"hauler"},"body":{"shell":"citadel","batteries":["tank","cell"]},"head":"beacon","weapons":[{"mechanism":"ram","barrels":["churn"]},{"mechanism":"yoke","barrels":["scatterpack"]}],"devices":["bulkhead",null]},
  quadgun: {"name":"Quadgun","chassis":{"frame":"colossus","engine":"hauler"},"body":{"shell":"quad","batteries":["cell","cell"]},"head":"periscope","weapons":[{"mechanism":"clamp","barrels":["hammer"]},{"mechanism":"clamp","barrels":["hammer"]},{"mechanism":"clamp","barrels":["lancet"]},{"mechanism":"brute","barrels":["furnace"]}],"devices":["pal",null]},
  warden: {"name":"Warden","chassis":{"frame":"bulwark","engine":"hauler"},"body":{"shell":"vault","batteries":["tank"]},"head":"visor","weapons":[{"mechanism":"yoke","barrels":["haymaker"]},{"mechanism":"sling","barrels":["longshot"]}],"devices":["lob",null]},
  mauler: {"name":"Mauler","chassis":{"frame":"grinder","engine":"stocker"},"body":{"shell":"keg","batteries":["cell"]},"head":"lantern","weapons":[{"mechanism":"brute","barrels":["furnace"]},{"mechanism":"brute","barrels":["volley"]}],"devices":["tarmine","bulkhead"]},
  octopus: {"name":"Octopus","chassis":{"frame":"strut","engine":"hauler"},"body":{"shell":"octo","batteries":["cell","dynamo"]},"head":"lantern","weapons":[{"mechanism":"grip","barrels":["rivet"]},{"mechanism":"grip","barrels":["spritz"]},{"mechanism":"grip","barrels":["fizz"]},{"mechanism":"grip","barrels":["pepper"]}],"devices":["mine",null]},
  lighthouse: {"name":"Lighthouse","chassis":{"frame":"raft","engine":"hauler"},"body":{"shell":"citadel","batteries":["cell","cell"]},"head":"beacon","weapons":[{"mechanism":"ram","barrels":["sunbeam"]},{"mechanism":"sling","barrels":["scatterpack"]}],"devices":["ping",null]},
  mortar: {"name":"Mortarman","chassis":{"frame":"skimmer","engine":"hauler"},"body":{"shell":"boiler","batteries":["tank"]},"head":"beacon","weapons":[{"mechanism":"clamp","barrels":["thumper"]},{"mechanism":"brute","barrels":["slugger"]}],"devices":["ping",null]},
};
const pool = Object.keys(L);
const maps = { foundry2: [100, 72], gulch2: [102, 70], drydock2: [104, 72], frostworks2: [98, 74], wrenfield2: [100, 72] };
const shots = [];
let k = 0;
const lo = () => L[pool[k++ % pool.length]];
for (const [map, [X, Z]] of Object.entries(maps)) {
  const base = { map, still: 0.5 };
  const st = (pair, dmin = 10, dmax = 17) => ({ dmin, dmax, pair, clear: 24 });
  const S = [11, 23, 37, 41, 53, 67, 71, 83, 97, 109];
  const add = (o) => shots.push({ ...base, maxD: 32, search: 25, ...o });
  add({ name: `${map}-chase-a`, seed: S[0], type: 'chase', seconds: 5, stage: st(2, 12, 18), loadout: lo() });
  add({ name: `${map}-chase-b`, seed: S[1], type: 'chase', side: -1, height: 1.2, seconds: 5, stage: st(7, 12, 18), loadout: lo() });
  add({ name: `${map}-duel`, seed: S[2], type: 'duel', seconds: 5, height: 2.2, stage: st(0), loadout: lo() });
  add({ name: `${map}-orbit`, seed: S[3], type: 'orbit', radius: 7.5, height: 2.2, speed: 0.3, fov: 42, seconds: 6, stage: st(8, 13, 18), loadout: lo() });
  add({ name: `${map}-hero`, seed: S[4], type: 'hero', dist: 5.5, off: 2.4, height: 1.0, push: 1.2, fov: 38, seconds: 5, stage: st(3, 13, 18), loadout: lo() });
  add({ name: `${map}-hero2`, seed: S[5], type: 'hero', dist: 6, off: -2.2, height: 1.4, push: 1.0, fov: 36, seconds: 5, stage: st(5, 13, 18), loadout: lo() });
  add({ name: `${map}-slow`, seed: S[6], type: 'duel', seconds: 2.5, slow: 4, k: 0.7, height: 1.6, stage: st(1, 8, 13), lead: 0.6, loadout: lo() });
  add({ name: `${map}-hud`, seed: S[7], type: 'chase', hud: true, fps: 30, seconds: 10, stage: st(4, 14, 22), lead: 0.3, loadout: lo() });
  shots.push({ ...base, name: `${map}-crane`, seed: 5, type: 'path', skip: 8, seconds: 7, fov: 48, from: [[-X * 0.95, 66, -Z * 1.1], [-6, 0, 0]], to: [[X * 0.35, 56, -Z * 1.08], [8, 0, 6]] });
  shots.push({ ...base, name: `${map}-dive`, seed: 6, type: 'path', skip: 10, seconds: 6, fov: 50, from: [[-X * 0.62, 62, -Z * 0.95], [0, 0, 0]], to: [[-X * 0.3, 18, -Z * 0.35], [X * 0.1, 2, 0]] });
}
writeFileSync(new URL('./shots.json', import.meta.url), JSON.stringify(shots, null, 1));
writeFileSync(new URL('./shots-a.json', import.meta.url), JSON.stringify(shots.filter((_, i) => i % 2 === 0), null, 1));
writeFileSync(new URL('./shots-b.json', import.meta.url), JSON.stringify(shots.filter((_, i) => i % 2 === 1), null, 1));
console.log(shots.length, 'shots');
