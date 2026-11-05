// Geografia di Limone sul Garda (ricostruita a mano dalle foto satellitari)
// Assi: +X = verso il lago (est), -Z = nord. Unità: metri. Livello del lago = 0.
import { Noise, curve1D, clamp, lerp, smooth, resample } from './util.js';

export const BOUNDS = { x0: -1000, x1: 1304, z0: -1536, z1: 1536 };
export const CELL = 2;
export const WATER_Y = 0;

const noise = new Noise(1337);
const noise2 = new Noise(77);
const noise3 = new Noise(4242);

const shoreCurve = curve1D([[-7000, 1500], [-5500, 1250], [-4500, 1000], [-3000, 700], [-1536, 430], [-1100, 385], [-900, 355], [-760, 330], [-600, 290], [-400, 240], [-200, 205], [0, 165], [150, 150], [300, 105], [450, 45], [600, -15], [800, -90], [1000, -150], [1536, -290], [3000, -520], [6000, -1100], [8000, -1500]]);
const eastW = curve1D([[-7500, 0], [-6000, 300], [-5000, 1100], [-3500, 2800], [-2000, 3300], [0, 3400], [2000, 3600], [4000, 4200], [8000, 5200]]);
const landW = curve1D([[0, 1.4], [6, 1.9], [25, 3.0], [60, 9], [120, 21], [200, 46], [300, 96], [420, 190], [560, 340], [720, 520], [900, 690], [1100, 830], [1400, 960], [2000, 1150], [3000, 1500], [6000, 1900]]);
const landE = curve1D([[0, 1.4], [40, 4], [150, 30], [400, 200], [800, 700], [1300, 1350], [2000, 1850], [3000, 2100], [6000, 2250]]);

let _lz = NaN, _ls = 0;
export function shoreX(z) {
  if (z === _lz) return _ls;
  _lz = z;
  _ls = shoreCurve(z) + noise.n(z * 0.006, 3.1) * 12 + noise.n(z * 0.03, 9.7) * 3;
  return _ls;
}
export const frame = (z, d) => [shoreX(z) - d, z];
export const inland = (x, z) => shoreX(z) - x;

const BEACHES = [[-5, 70], [500, 80], [790, 60], [-330, 26], [235, 34], [1100, 45], [-1000, 40], [1350, 50]];
export function beachMask(z) {
  let m = 0;
  for (const [c, h] of BEACHES) m = Math.max(m, 1 - smooth(h * 0.55, h, Math.abs(z - c)));
  return m;
}
export const harborMask = (z) => smooth(-850, -820, z) * (1 - smooth(-700, -680, z));

function lakeY(t, bm, hm) {
  const steep = t < 8 ? 1.4 - 0.9 * t : -5.8 - 0.55 * (t - 8);
  const gentle = t < 30 ? 1.4 - 0.12 * t : -2.2 - 0.3 * (t - 30);
  let y = lerp(steep, gentle, bm);
  if (hm > 0) {
    const wall = t < 1.5 ? 1.4 - 2.6 * t : t < 20 ? -2.5 - 0.05 * (t - 1.5) : -3.4 - 0.35 * (t - 20);
    y = lerp(y, wall, hm);
  }
  if (y < 0) y = -230 * Math.tanh(-y / 230);
  return y;
}

function westY(d, x, z, bm, hm) {
  if (d <= 0) return lakeY(-d, bm, hm);
  let y = landW(d);
  if (hm > 0) y = lerp(y, 1.45, hm * (1 - smooth(14, 28, d)));
  const mid = smooth(8, 70, d);
  // rumore a grande scala + canaloni che scendono dalla montagna
  let n = noise.fbm(x * 0.0055, z * 0.0055, 5) * (1.0 + 0.13 * y) * mid;
  n += (noise2.ridge(z * 0.0075, d * 0.0013, 3) - 0.55) * 0.34 * y * smooth(70, 260, d);
  n += noise3.fbm(x * 0.03, z * 0.03, 3) * (0.5 + 0.02 * y) * mid;
  y += n;
  // terrazzamenti degli uliveti
  const olive = smooth(14, 44, d) * (1 - smooth(260, 330, d)) * (1 - smooth(70, 120, y)) * (0.5 + 0.5 * smooth(-0.3, 0.3, noise3.n(x * 0.004, z * 0.004)));
  if (olive > 0.01) {
    const st = 2.3, t = y / st, f = t - Math.floor(t);
    y = lerp(y, (Math.floor(t) + smooth(0.55, 0.97, f)) * st, olive * 0.85);
  }
  // fasce di roccia verticali (stratificazione calcarea)
  if (y > 110) {
    const t = y / 22, f = t - Math.floor(t);
    y = lerp(y, (Math.floor(t) + smooth(0.45, 0.8, f)) * 22, 0.55 * smooth(110, 220, y) * smooth(0.3, 0.7, noise2.n(x * 0.006, z * 0.006) + 0.5));
  }
  return y;
}

function eastY(e, x, z) {
  if (e <= 0) return lakeY(-e, 0.2, 0);
  let y = landE(e);
  const n = noise.fbm(x * 0.0022, z * 0.0022, 5) * (6 + 0.22 * y) + (noise2.ridge(z * 0.004, e * 0.0009, 3) - 0.55) * 0.3 * y;
  return y + n * smooth(0, 120, e);
}

export function baseHeight(x, z) {
  const s = shoreX(z);
  const d = s - x;
  const bm = beachMask(z), hm = harborMask(z);
  const yw = westY(d, x, z, bm, hm);
  let y = yw;
  const e = x - (s + eastW(z));
  if (!(e < -600 && d > -600)) y = Math.max(yw, eastY(e, x, z));
  if (z < -3800) y = Math.max(y, (-3800 - z) * 0.32 + noise.fbm(x * 0.002, z * 0.002, 3) * 60);
  return y;
}

// ---------- STRADE ----------
// punti in (z, d): d = metri dalla riva verso la montagna
const RING_C = (() => { const [x, z] = frame(-640, 78); return { x, z, r: 14 }; })();
export const ROUNDABOUT = RING_C;

function ringPoint(toX, toZ) {
  const a = Math.atan2(toZ - RING_C.z, toX - RING_C.x);
  return [RING_C.x + Math.cos(a) * RING_C.r, RING_C.z + Math.sin(a) * RING_C.r];
}
const W = (z, d) => frame(z, d);

export function buildRoadDefs() {
  const R = [];
  const add = (id, name, w, kind, zd, extra = {}) => R.push({ id, name, w, kind, pts: zd.map(([z, d]) => frame(z, d)), ...extra });

  // Gardesana: tratto sud -> rotonda
  const inPt = ringPoint(...W(-575, 100));
  R.push({ id: 'R1a', name: 'SS45 Gardesana', w: 8, kind: 'main', pts: [[1500, 150], [1300, 135], [1150, 120], [1000, 118], [880, 125], [780, 135], [700, 145], [620, 138], [540, 125], [470, 118], [400, 120], [330, 126], [250, 130], [170, 134], [90, 138], [10, 142], [-70, 146], [-150, 152], [-230, 158], [-310, 160], [-390, 152], [-460, 138], [-520, 122], [-575, 100]].map(([z, d]) => frame(z, d)).concat([inPt]) });
  const outPt = ringPoint(...W(-700, 64));
  R.push({ id: 'R1b', name: 'SS45 Gardesana', w: 8, kind: 'main', pts: [outPt].concat([[-700, 62], [-780, 58], [-900, 68], [-1050, 80], [-1200, 95], [-1350, 110], [-1500, 130]].map(([z, d]) => frame(z, d))) });
  // rotonda
  const ring = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([RING_C.x + Math.cos(a) * RING_C.r, RING_C.z + Math.sin(a) * RING_C.r]); }
  R.push({ id: 'RING', name: 'Rotonda', w: 7, kind: 'main', pts: ring, closed: true });
  const eastPt = ringPoint(...W(-632, 40));
  R.push({ id: 'R2b', name: 'Via Lungolago', w: 6, kind: 'local', pts: [eastPt].concat([[-632, 56], [-622, 34], [-612, 16]].map(([z, d]) => frame(z, d))) });
  add('R2', 'Lungolago Marconi', 6.5, 'local', [[-420, 16], [-480, 14], [-540, 12], [-612, 14], [-660, 15], [-720, 17], [-790, 18], [-830, 20]]);
  add('R2c', 'Lungolago Sud', 6.5, 'local', [[-420, 16], [-380, 22], [-340, 40], [-310, 70], [-296, 100], [-300, 130], [-308, 158]]);
  add('R3a', 'Via Comune', 6, 'local', [[-130, 150], [-105, 128], [-78, 108], [-52, 90], [-34, 66], [-22, 42], [-16, 22]]);
  add('R3b', 'Via Spiaggia', 6, 'local', [[-120, 24], [-60, 19], [0, 17], [60, 19], [100, 24], [128, 55], [132, 95], [124, 125], [120, 137]]);
  add('R4', 'Via degli Alberghi', 6.5, 'local', [[-296, 100], [-250, 76], [-190, 70], [-100, 68], [-30, 72], [50, 72], [150, 76], [250, 80], [340, 82], [400, 92], [408, 108], [404, 120]]);
  add('R5', 'Via Lido Sud', 6, 'local', [[330, 126], [360, 100], [400, 70], [440, 40], [470, 20], [500, 14], [560, 14], [620, 16], [680, 16], [740, 19], [790, 24], [826, 28]]);
  add('R5b', 'Via Campeggio', 5.5, 'local', [[790, 24], [800, 48], [790, 78], [776, 108], [764, 128]]);
  add('R6', 'Strada del Belvedere', 5, 'local', [[240, 131], [214, 156], [226, 184], [256, 200], [286, 190], [296, 220], [270, 246], [236, 258], [214, 284], [238, 308], [276, 322], [306, 342]], { dead: true });
  add('L1', 'Via Oliveti', 4, 'lane', [[-200, 158], [-190, 185], [-206, 212], [-232, 236]]);
  add('L2', 'Via dei Limoni', 4, 'lane', [[120, 136], [110, 165], [126, 192], [152, 216]]);
  add('L3', 'Via Sopino', 4, 'lane', [[550, 124], [546, 150], [560, 182], [584, 205]]);
  add('L4', 'Via Ulivi', 4, 'lane', [[900, 124], [890, 150], [906, 176]]);
  add('L5', 'Via Castèl', 4, 'lane', [[-460, 138], [-440, 170], [-455, 200]]);
  return R.map((r) => ({
    ...r,
    path: resample(r.pts, 1.5, !!r.closed),
  }));
}

// luoghi importanti
export const LANDMARKS = (() => {
  const L = (id, name, z, d, type, extra = {}) => { const [x, zz] = frame(z, d); return { id, name, x, z: zz, d, type, ...extra }; };
  return {
    porto: L('porto', 'Porto di Limone', -745, -22, 'harbor'),
    castel: L('castel', 'Limonaia del Castèl', -772, 46, 'limonaia'),
    chiesa: L('chiesa', 'San Benedetto', -722, 40, 'church'),
    rotonda: { id: 'rotonda', name: 'Rotonda', x: RING_C.x, z: RING_C.z, type: 'roundabout' },
    comune: L('comune', 'Comune di Limone', -20, 120, 'town-hall'),
    campo: L('campo', 'Campo Sportivo', -170, 38, 'sport'),
    tennis: L('tennis', 'Tennis', -105, 46, 'sport'),
    cola: L('cola', 'Spiaggia Cola', -5, -10, 'beach'),
    kite: L('kite', 'Wind Riders Kite School', 505, 10, 'kite'),
    nanzel: L('nanzel', 'Camping Nanzel', 800, 50, 'camp'),
    sopino: L('sopino', 'Cascata di Sopino', 640, 340, 'waterfall'),
    belvedere: L('belvedere', 'Belvedere', 306, 342, 'viewpoint'),
    pizza: L('pizza', 'Pizzeria Al Porto', -705, 22, 'shop'),
    panorama: L('panorama', 'Hotel Panorama', 70, 98, 'hotel'),
    carabinieri: L('carabinieri', 'Carabinieri', -520, 108, 'police'),
    guardia: L('guardia', 'Guardia Medica', -598, 40, 'hospital'),
  };
})();

// il gioco inizia qui
export const SPAWN = (() => { const [x, z] = frame(-634, 12); return { x, z, yaw: Math.PI * 0.5 }; })();
