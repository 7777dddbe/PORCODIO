// Veicoli: modelli procedurali + fisica arcade (auto, Vespa, moto d'acqua, motoscafo) + guida AI
import * as THREE from 'three';
import { bodyGeo } from './character.js';
import { mkCanvas } from './textures.js';
import { clamp, lerp, damp, wrapAngle, smooth } from './util.js';
import { waveH } from './water.js';

const PAINTS = [0xf4f4f2, 0xc9ccd0, 0x1b1d21, 0xb3262b, 0x1f4e8c, 0x2d6a4a, 0xe0b32a, 0xd86a1f, 0x7b7f86, 0x5b2a6a];
export const CAR_DEFS = {
  panda: { kind: 'car', body: 'hatch', L: 3.7, W: 1.66, H: 1.55, wb: 2.3, max: 33, accel: 9.5, brake: 17, grip: 7.5, hp: 220, cruise: 13, label: 'Cinquino' },
  sedan: { kind: 'car', body: 'sedan', L: 4.6, W: 1.8, H: 1.44, wb: 2.8, max: 44, accel: 11.5, brake: 20, grip: 8, hp: 260, cruise: 16, label: 'Berlina' },
  suv: { kind: 'car', body: 'suv', L: 4.5, W: 1.9, H: 1.72, wb: 2.7, max: 40, accel: 10, brake: 18, grip: 7, hp: 330, cruise: 14, label: 'SUV' },
  sport: { kind: 'car', body: 'sport', L: 4.3, W: 1.86, H: 1.22, wb: 2.6, max: 58, accel: 15, brake: 24, grip: 9, hp: 220, cruise: 18, label: 'Sportiva' },
  cop: { kind: 'car', body: 'sedan', L: 4.6, W: 1.82, H: 1.45, wb: 2.8, max: 50, accel: 14, brake: 22, grip: 9, hp: 360, cruise: 20, label: 'Carabinieri', cop: true, color: 0x14213d },
  scooter: { kind: 'bike', L: 1.85, W: 0.7, H: 1.15, wb: 1.3, max: 24, accel: 8, brake: 14, grip: 6, hp: 90, cruise: 9, label: 'Vespa' },
  jetski: { kind: 'jet', L: 2.9, W: 1.1, H: 1.0, wb: 1.8, max: 31, accel: 11, brake: 10, grip: 3, hp: 160, cruise: 14, label: 'Moto d\'acqua' },
  boat: { kind: 'boat', L: 6.0, W: 2.2, H: 1.6, wb: 4, max: 27, accel: 7, brake: 6, grip: 2.2, hp: 240, cruise: 14, label: 'Motoscafo' },
};

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.04, metalness: 0.0, envMapIntensity: 2.0, transparent: true, opacity: 0.82 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.6, metalness: 0.3 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.95 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.2, metalness: 1.0 });
export const HEAD = new THREE.MeshStandardMaterial({ color: 0xf5f5ee, emissive: 0xfff2c8, emissiveIntensity: 0.15, roughness: 0.2 });
export const TAIL = new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.2, roughness: 0.3 });
const paint = (c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.35, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.75 });

let copTex = null;
function copDecal() {
  if (copTex) return copTex;
  const cv = mkCanvas(512, 128), c = cv.getContext('2d'); c.clearRect(0, 0, 512, 128);
  c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, 512, 128);
  c.fillStyle = '#b11a1a'; c.fillRect(0, 100, 512, 28);
  c.fillStyle = '#0c1a38'; c.font = '700 70px "Barlow Condensed", Arial Narrow, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CARABINIERI', 256, 50);
  copTex = new THREE.CanvasTexture(cv); copTex.colorSpace = THREE.SRGBColorSpace; copTex.anisotropy = 4; return copTex;
}

function wheelMesh(r, w) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true; g.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w + 0.01, 16), rimMat); rim.rotation.z = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, r * 0.11, r * 1.05), darkMat); s.rotation.x = (i / 5) * Math.PI; g.add(s); }
  return g;
}

export function buildCar(def, color) {
  const { L, W, H, wb } = def, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pm = paint(color ?? def.color ?? PAINTS[0]);
  const Wb = W * 0.93, g = 0.2;
  const f = L / 2, r = -L / 2, kind = def.body;
  const cabF = kind === 'suv' ? L * 0.2 : kind === 'sport' ? L * 0.04 : L * 0.17;
  const cabR = kind === 'hatch' ? -L * 0.44 : kind === 'suv' ? -L * 0.46 : kind === 'sport' ? -L * 0.2 : -L * 0.24;
  const beltY = kind === 'sport' ? 0.7 : 0.82;
  const ext = (pts, depth, bevel) => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2); return geo;
  };
  const lower = [[r + 0.12, g + 0.12], [r + 0.02, 0.5], [r + 0.04, 0.68], [r + 0.3, beltY - 0.02], [cabR, beltY], [cabF + 0.05, beltY], [f - 0.45, beltY - 0.1], [f - 0.12, 0.66], [f - 0.02, 0.5], [f - 0.05, g + 0.14], [f - 0.3, g + 0.02], [r + 0.4, g + 0.02]];
  const m1 = new THREE.Mesh(ext(lower, Wb - 0.2, 0.1), pm); m1.castShadow = true; m1.receiveShadow = true; body.add(m1);
  const roofY = H - 0.04;
  const rearTop = cabR + (kind === 'hatch' ? 0.28 : kind === 'suv' ? 0.18 : kind === 'sport' ? 0.7 : 0.75), frontTop = cabF - (kind === 'suv' ? 0.5 : kind === 'sport' ? 0.7 : 0.62);
  const cabin = [[cabR, beltY - 0.02], [rearTop, roofY], [frontTop, roofY], [cabF, beltY - 0.02]];
  const m2 = new THREE.Mesh(ext(cabin, Wb * 0.84 - 0.1, 0.05), glassMat); m2.castShadow = true; body.add(m2);
  const roof = [[rearTop - 0.04, roofY - 0.02], [rearTop + 0.0, roofY + 0.03], [frontTop, roofY + 0.03], [frontTop + 0.04, roofY - 0.02]];
  const m3 = new THREE.Mesh(ext([[rearTop - 0.06, roofY - 0.05], [rearTop - 0.02, roofY + 0.02], [frontTop + 0.02, roofY + 0.02], [frontTop + 0.06, roofY - 0.05]], Wb * 0.84 - 0.05, 0.04), pm); m3.castShadow = true; body.add(m3);
  // montanti
  const pil = (z, y0, y1, tilt, w = 0.09) => { const m = new THREE.Mesh(new THREE.BoxGeometry(Wb * 0.84 + 0.04, y1 - y0, w), pm); m.position.set(0, (y0 + y1) / 2, z); m.rotation.x = tilt; body.add(m); return m; };
  pil((cabF + cabR) / 2 + 0.1, beltY, roofY, 0, 0.07);
  // fari e luci
  const hl = (s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), HEAD); m.position.set(s * (W / 2 - 0.3), 0.64, f - 0.02); body.add(m); };
  hl(-1); hl(1);
  const tl = (s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), TAIL); m.position.set(s * (W / 2 - 0.26), 0.68, r + 0.03); body.add(m); };
  tl(-1); tl(1);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.04), darkMat); grille.position.set(0, 0.55, f - 0.01); body.add(grille);
  const bump = (z, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.18, 0.22), darkMat); m.position.set(0, 0.3, z); body.add(m); };
  bump(f - 0.04); bump(r + 0.04);
  for (const s of [-1, 1]) { const mir = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.16), pm); mir.position.set(s * (Wb / 2 + 0.08), beltY + 0.12, cabF - 0.1); body.add(mir); }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.11, 0.02), new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4 })); plate.position.set(0, 0.46, r - 0.01); body.add(plate);
  // ruote
  const wr = kind === 'suv' ? 0.37 : 0.32, ww = 0.22, wheels = [];
  for (const [sx, sz, front] of [[-1, wb / 2, true], [1, wb / 2, true], [-1, -wb / 2, false], [1, -wb / 2, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * (Wb / 2 - 0.04), wr, sz); const w = wheelMesh(wr, ww); pivot.add(w); body.add(pivot); wheels.push({ pivot, spin: w, front, r: wr });
    const arch = new THREE.Mesh(new THREE.CircleGeometry(wr + 0.07, 18), new THREE.MeshBasicMaterial({ color: 0x040404, side: THREE.DoubleSide })); arch.rotation.y = Math.PI / 2; arch.position.set(sx * (Wb / 2 + 0.003), wr + 0.04, sz); body.add(arch);
  }
  const swh = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 18), darkMat); swh.position.set(0.38, 0.88, (cabF + cabR) / 2 + 0.38); swh.rotation.x = -1.05; body.add(swh);
  let bar = null;
  if (def.cop) {
    // livrea: porte bianche con scritta + barra luminosa
    const dec = new THREE.MeshStandardMaterial({ map: copDecal(), roughness: 0.4 });
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), dec); d.position.set(s * (Wb / 2 + 0.055), 0.62, 0.1); d.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; body.add(d); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(Wb + 0.02, 0.06, L * 0.5), new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.4 })); stripe.position.set(0, 0.76, 0.1); stripe.scale.x = 1.0; // sottile fascia rossa
    bar = new THREE.Group(); bar.position.set(0, roofY + 0.07, (frontTop + rearTop) / 2);
    const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0000, emissiveIntensity: 0, roughness: 0.3 }), blue = new THREE.MeshStandardMaterial({ color: 0x00083a, emissive: 0x1a40ff, emissiveIntensity: 0, roughness: 0.3 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), red); a.position.x = -0.28; const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), blue); b.position.x = 0.28; bar.add(a, b); body.add(bar);
    bar.userData = { red, blue };
    const lp = new THREE.PointLight(0xff2020, 0, 14, 2); lp.position.set(-0.3, 0.2, 0); bar.add(lp); const lp2 = new THREE.PointLight(0x2050ff, 0, 14, 2); lp2.position.set(0.3, 0.2, 0); bar.add(lp2); bar.userData.l1 = lp; bar.userData.l2 = lp2;
  }
  const seat = new THREE.Vector3(-W * 0.2 * 0 + 0.0, 0.38, -0.05 + (kind === 'sport' ? 0.0 : 0.0));
  return { root, body, wheels, bar, seat: new THREE.Vector3(0.38, 0.1, (cabF + cabR) / 2 - 0.1), pose: 'car', hx: W / 2 + 0.05, hz: L / 2, top: H };
}

export function buildScooter(color = 0x9fd5c3) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pm = paint(color), wheels = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; body.add(m); return m; };
  const e = (rx, ry, rz) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(rx, ry, rz); return g; };
  add(e(0.27, 0.33, 0.55), pm, 0, 0.62, -0.38);
  const shield = add(new THREE.BoxGeometry(0.42, 0.78, 0.07), pm, 0, 0.7, 0.42); shield.rotation.x = 0.28;
  add(new THREE.BoxGeometry(0.4, 0.06, 0.75), pm, 0, 0.29, 0.05);
  add(e(0.2, 0.09, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7 }), 0, 0.98, -0.45);
  const fork = add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), chromeMat, 0, 0.55, 0.72); fork.rotation.x = 0.1;
  const bars = add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), chromeMat, 0, 1.1, 0.5); bars.rotation.z = Math.PI / 2;
  add(new THREE.SphereGeometry(0.08, 10, 8), HEAD, 0, 1.0, 0.62);
  add(new THREE.BoxGeometry(0.1, 0.06, 0.03), TAIL, 0, 0.82, -0.9);
  const steerG = new THREE.Group(); steerG.position.set(0, 0.0, 0.72); body.add(steerG);
  for (const [z, front] of [[0.72, true], [-0.55, false]]) { const pivot = new THREE.Group(); pivot.position.set(0, 0.22, z); const w = wheelMesh(0.22, 0.1); pivot.add(w); body.add(pivot); wheels.push({ pivot, spin: w, front, r: 0.22 }); }
  return { root, body, wheels, bar: null, seat: new THREE.Vector3(0, 0.36, -0.32), pose: 'bike', hx: 0.4, hz: 0.95, top: 1.2 };
}

function horizBody(secs, mat, o = {}) { const g = bodyGeo(secs, { radial: 16, sub: 3, n: o.n || 2.4 }); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m; }

export function buildJetski(color = 0xf5c21b) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pm = paint(color), white = paint(0xf2f2f0);
  const hull = horizBody([{ y: -1.45, w: 0.02, d: 0.04 }, { y: -1.1, w: 0.2, d: 0.15, cz: 0.0 }, { y: -0.4, w: 0.45, d: 0.2 }, { y: 0.5, w: 0.52, d: 0.22 }, { y: 1.2, w: 0.5, d: 0.2 }, { y: 1.45, w: 0.4, d: 0.12 }], white); hull.position.y = 0.3; body.add(hull);
  const deck = horizBody([{ y: -1.2, w: 0.01, d: 0.02 }, { y: -0.9, w: 0.26, d: 0.12 }, { y: -0.2, w: 0.5, d: 0.2 }, { y: 0.6, w: 0.54, d: 0.2 }, { y: 1.25, w: 0.46, d: 0.12 }, { y: 1.35, w: 0.3, d: 0.05 }], pm); deck.position.y = 0.52; body.add(deck);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.9), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 })); seat.position.set(0, 0.76, -0.4); seat.castShadow = true; body.add(seat);
  const cowl = horizBody([{ y: -0.2, w: 0.08, d: 0.05 }, { y: 0.2, w: 0.3, d: 0.18 }, { y: 0.9, w: 0.34, d: 0.12 }, { y: 1.1, w: 0.2, d: 0.03 }], pm); cowl.position.set(0, 0.78, 0.25); cowl.scale.set(1, 1, 0.8); body.add(cowl);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), darkMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.12, 0.55); body.add(bar);
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide })); sw.position.set(0, 1.1, 0.72); sw.rotation.x = -0.9; body.add(sw);
  return { root, body, wheels: [], bar: null, seat: new THREE.Vector3(0, 0.2, -0.45), pose: 'jet', hx: 0.62, hz: 1.45, top: 1.3 };
}

export function buildBoat(color = 0x1f4e8c) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const white = paint(0xf4f4f1), pm = paint(color);
  const hull = horizBody([{ y: -3.0, w: 0.02, d: 0.05 }, { y: -2.4, w: 0.45, d: 0.35 }, { y: -1.0, w: 0.98, d: 0.5 }, { y: 1.2, w: 1.05, d: 0.52 }, { y: 2.9, w: 0.95, d: 0.4 }, { y: 3.05, w: 0.9, d: 0.1 }], white); hull.position.y = 0.45; body.add(hull);
  const stripe = horizBody([{ y: -2.6, w: 0.01, d: 0.02 }, { y: -1.6, w: 0.75, d: 0.07 }, { y: 1.2, w: 1.07, d: 0.07 }, { y: 2.95, w: 0.97, d: 0.04 }], pm); stripe.position.y = 0.72; body.add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 3.6), new THREE.MeshStandardMaterial({ color: 0xc9b28a, roughness: 0.8 })); deck.position.set(0, 0.9, -0.1); deck.receiveShadow = true; body.add(deck);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.05), new THREE.MeshPhysicalMaterial({ color: 0x9fc2d6, transparent: true, opacity: 0.35, roughness: 0.05 })); ws.position.set(0, 1.28, 0.65); ws.rotation.x = -0.5; body.add(ws);
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.5), white); console_.position.set(0, 1.15, 0.5); console_.castShadow = true; body.add(console_);
  const sb = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.7 })); sb.position.set(0, 1.1, -1.4); body.add(sb);
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.3), darkMat); eng.position.set(0, 0.8, -3.1); body.add(eng);
  return { root, body, wheels: [], bar: null, seat: new THREE.Vector3(-0.3, 0.55, -0.9), pose: 'car', hx: 1.1, hz: 3.0, top: 1.6 };
}

let UID = 1;
export class Vehicle {
  constructor(G, name, x, z, yaw, opt = {}) {
    this.G = G; this.id = UID++; this.name = name; const def = this.def = CAR_DEFS[name]; this.kind = def.kind;
    const color = opt.color ?? def.color ?? PAINTS[Math.floor(Math.random() * PAINTS.length)];
    this.model = def.kind === 'car' ? buildCar(def, color) : def.kind === 'bike' ? buildScooter(opt.color ?? [0x9fd5c3, 0xf4efe0, 0xc9463d, 0x4b86c4][Math.floor(Math.random() * 4)]) : def.kind === 'jet' ? buildJetski(opt.color ?? [0xf5c21b, 0x2a8de0, 0xe0412d][Math.floor(Math.random() * 3)]) : buildBoat(opt.color);
    this.root = this.model.root; this.body = this.model.body;
    G.scene.add(this.root);
    this.pos = new THREE.Vector3(x, 0, z); this.yaw = yaw; this.vx = 0; this.vz = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.air = false;
    this.fwdSpeed = 0; this.steer = 0; this.in = { throttle: 0, steer: 0, brake: 0, hand: 0 };
    this.hp = def.hp; this.dead = false; this.driver = null; this.ai = opt.ai || null; this.cop = !!def.cop; this.sinkT = 0; this.burnT = 0; this.age = 0; this.parked = !!opt.parked;
    this.water = def.kind === 'jet' || def.kind === 'boat';
    const wy = this.water ? 0 : G.terrain.heightAt(x, z);
    this.pos.y = wy; this.lastG = wy; this.lastDamager = null;
    this.lightsOn = false;
    this.radius = def.kind === 'bike' ? 0.5 : def.kind === 'jet' ? 0.65 : def.W / 2 + 0.08;
    this.updateTransform(0);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  seatWorld(out) { const s = this.model.seat, c = Math.cos(this.yaw), sn = Math.sin(this.yaw); return out.set(this.pos.x + s.x * c + s.z * sn, this.pos.y + s.y, this.pos.z - s.x * sn + s.z * c); }

  damage(n, src) { if (this.dead) return; this.hp -= n; if (src) this.lastDamager = src; if (this.hp <= 0) this.explode(); }
  explode() {
    this.dead = true; this.burnT = 25; const G = this.G; G.fx.explosion(this.pos.clone().setY(this.pos.y + 1)); G.audio.boom();
    // danni a chi sta vicino
    G.explosionAt(this.pos.x, this.pos.y, this.pos.z, 9, 90, this);
    if (this.driver) G.ejectDriver(this, true);
    this.body.traverse((o) => { if (o.isMesh && o.material && o.material.color && !o.userData.keep) { o.userData.orig = o.userData.orig || o.material; o.material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }); } });
    this.vx *= 0.3; this.vz *= 0.3; this.vy = 5; this.air = true; this.in.throttle = 0;
    this.pos.y += 0.1;
  }

  update(dt) {
    const G = this.G, T = G.terrain, def = this.def;
    this.age += dt;
    if (this.dead) {
      this.burnT -= dt; this.in.throttle = 0; this.in.steer = 0;
      if (this.burnT > 0 && G.dist2Cam(this.pos) < 6400) G.fx.burn(this.pos.clone().setY(this.pos.y + 0.8));
      if (this.burnT < -10) return 'remove';
    }
    if (this.sinkT > 0 || (!this.water && T.heightAt(this.pos.x, this.pos.z) < -0.55 && !this.dead)) {
      this.sinkT += dt; this.vx *= 0.97; this.vz *= 0.97;
      if (this.sinkT < dt * 2 + 0.0001 || this.sinkT === dt) { if (this.driver) G.ejectDriver(this, false); G.fx.splash(this.pos, 22, 1.4); G.audio.splash(); }
      this.pos.y -= dt * (0.4 + this.sinkT * 0.5); this.updateTransform(dt);
      if (this.sinkT > 9) return 'remove';
      return;
    }
    const inp = this.in;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx; // destra = (-fz, fx)
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    const onWater = this.water;
    const groundY = onWater ? 0 : T.heightAt(this.pos.x, this.pos.z);
    if (onWater) {
      // moto d'acqua / barca: spinta, resistenza forte, sterzo solo se c'è velocità
      const depthC = -T.heightAt(this.pos.x, this.pos.z);
      const beached = depthC < 0.25;
      let thr = inp.throttle;
      const drive = beached ? 0.15 : 1;
      if (thr > 0) vF += def.accel * drive * thr * (1 - clamp(vF / def.max, 0, 1)) * dt * (this.dead ? 0 : 1);
      else if (thr < 0) vF += (vF > 0.5 ? -def.brake * 0.5 : def.accel * 0.35 * thr) * dt * (-thr);
      vF -= vF * (beached ? 3.2 : 0.22) * dt + Math.sign(vF) * 0.4 * dt;
      const steerPow = clamp(Math.abs(vF) / 5, 0.25, 1);
      const yawRate = -inp.steer * (def.kind === 'jet' ? 1.5 : 0.9) * steerPow * Math.sign(vF || 1) * (1 - clamp(Math.abs(vF) / def.max, 0, 0.5));
      this.yaw += yawRate * dt;
      vR *= Math.exp(-def.grip * dt);
      this.rollTarget = -inp.steer * clamp(vF / 18, 0, 1) * 0.5;
    } else if (!this.air) {
      const maxV = def.max;
      if (inp.throttle > 0) { if (vF < -0.6) vF += def.brake * dt; else vF += def.accel * inp.throttle * (1 - clamp(Math.abs(vF) / maxV, 0, 1) ** 1.6) * dt; }
      else if (inp.throttle < 0) { if (vF > 0.6) vF -= def.brake * -inp.throttle * dt; else vF += def.accel * 0.55 * inp.throttle * (1 - clamp(-vF / (maxV * 0.28), 0, 1)) * dt; }
      else vF -= Math.sign(vF) * Math.min(Math.abs(vF), (1.4 + 0.0035 * vF * vF) * dt);
      if (inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), def.brake * 0.9 * dt);
      // pendenza
      const sl = T.heightAt(this.pos.x + fx * 1.5, this.pos.z + fz * 1.5) - T.heightAt(this.pos.x - fx * 1.5, this.pos.z - fz * 1.5);
      vF -= (sl / 3) * 9.8 * dt * 0.55;
      const maxSteer = (def.kind === 'bike' ? 0.6 : 0.55) / (1 + Math.abs(vF) * 0.075);
      const sa = inp.steer * maxSteer;
      this.yaw += -(vF * Math.tan(sa) / def.wb) * dt;
      this.steerAngle = sa;
      const grip = inp.hand ? def.grip * 0.1 : def.grip * (1 + clamp(Math.abs(vF) / 30, 0, 0.4));
      if (inp.hand) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 8 * dt); this.yaw += -inp.steer * Math.min(Math.abs(vF), 12) * 0.05 * dt * 20 * 0.1; }
      // spinta laterale nelle curve (drift leggero)
      vR *= Math.exp(-grip * dt);
      this.rollTarget = this.kind === 'bike' ? -inp.steer * clamp(vF / 14, 0, 1) * 0.55 : 0;
      // ruote che slittano → fumo
      if (inp.hand && Math.abs(vF) > 6 && G.dist2Cam(this.pos) < 2500) G.fx.dust(this.pos.clone().setY(this.pos.y + 0.1), 1, [0.8, 0.8, 0.8]);
    } else { this.rollTarget = 0; }
    // integrazione
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw);
    this.vx = nfx * vF + (-nfz) * vR; this.vz = nfz * vF + nfx * vR;
    if (this.air) { this.vx *= 1 - 0.1 * dt; this.vz *= 1 - 0.1 * dt; }
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    // collisioni statiche
    this.collide(dt);
    // quota
    if (onWater) {
      const wy = waveH(this.pos.x, this.pos.z, G.timeU.value) * 0.7;
      const gnd = T.heightAt(this.pos.x, this.pos.z);
      this.pos.y = damp(this.pos.y, Math.max(wy, gnd - 0.02) + (gnd > -0.1 ? 0 : 0), 14, dt);
      const wf = waveH(this.pos.x + nfx * 1.3, this.pos.z + nfz * 1.3, G.timeU.value) * 0.7, wb = waveH(this.pos.x - nfx * 1.3, this.pos.z - nfz * 1.3, G.timeU.value) * 0.7;
      this.pitchT = Math.atan2(wf - wb, 2.6) - clamp(Math.abs(vF) / def.max, 0, 1) * (this.kind === 'jet' ? 0.2 : 0.1) * (inp.throttle > 0 ? 1.2 : 0.4);
      this.rollT2 = this.rollTarget;
      if (Math.abs(vF) > 3 && G.dist2Cam(this.pos) < 6400) { const sx = this.pos.x - nfx * this.def.L * 0.45, sz = this.pos.z - nfz * this.def.L * 0.45; G.fx.wake({ x: sx, y: this.pos.y, z: sz }, this.vx, this.vz, vF > 12 ? 3 : 1); }
      if (this.driver && this.kind === 'jet' && vF > 2) { const g2 = T.heightAt(this.pos.x, this.pos.z); if (g2 > 0.4 && vF > 8) { /* spiaggia: rallenta */ this.vx *= 0.9; this.vz *= 0.9; } }
    } else {
      const wb = def.wb / 2, wh = def.W * 0.4;
      const hF = T.heightAt(this.pos.x + nfx * wb, this.pos.z + nfz * wb), hB = T.heightAt(this.pos.x - nfx * wb, this.pos.z - nfz * wb);
      const hL = T.heightAt(this.pos.x + nfz * wh, this.pos.z - nfx * wh), hRt = T.heightAt(this.pos.x - nfz * wh, this.pos.z + nfx * wh);
      const g = (hF + hB + hL + hRt) / 4;
      if (this.air) {
        this.vy -= 22 * dt; this.pos.y += this.vy * dt;
        if (this.pos.y <= g) { const impact = -this.vy; this.pos.y = g; this.air = false; if (impact > 7) { this.damage((impact - 7) * 14); G.audio.crash(Math.min(1, impact / 18)); G.fx.dust(this.pos, 8); } this.vy = 0; }
      } else {
        const vg = (g - this.lastG) / Math.max(dt, 1e-3);
        if (g < this.pos.y - 0.35 && vg < -3) { this.air = true; this.vy = clamp(vg, -4, 8); }
        else this.pos.y = damp(this.pos.y, g, 30, dt);
      }
      this.lastG = g;
      this.pitchT = -Math.atan2(hF - hB, wb * 2) * 0.95; this.rollT2 = Math.atan2(hL - hRt, wh * 2) * 0.9 + (this.rollTarget || 0);
    }
    this.pitch = damp(this.pitch, this.pitchT || 0, 10, dt); this.roll = damp(this.roll, this.rollT2 || 0, 10, dt);
    this.fwdSpeed = vF;
    this.updateTransform(dt);
    // luci
    if (this.model.bar && !this.dead) { const on = this.sirenOn; const ph = (this.age * 6) % 2 < 1; const u = this.model.bar.userData; u.red.emissiveIntensity = on && ph ? 6 : 0; u.blue.emissiveIntensity = on && !ph ? 6 : 0; u.l1.intensity = on && ph ? 8 : 0; u.l2.intensity = on && !ph ? 8 : 0; }
  }

  collide(dt) {
    const G = this.G, col = G.colliders, def = this.def; if (this.air && this.pos.y > G.terrain.heightAt(this.pos.x, this.pos.z) + 1.5) return;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), L = def.L / 2 - this.radius * 0.9, tmp = { x: 0, z: 0 }, out = { nx: 0, nz: 0, depth: 0, obj: null };
    let ox = 0, oz = 0, hitN = null;
    for (const s of this.kind === 'bike' ? [0.5, -0.5] : this.kind === 'boat' ? [2.2, 0, -2.0] : [1, -1]) {
      const off = this.kind === 'bike' || this.kind === 'boat' ? s : L * s;
      tmp.x = this.pos.x + fx * off + ox; tmp.z = this.pos.z + fz * off + oz;
      const sx = tmp.x, sz = tmp.z;
      if (col.resolve(tmp, this.radius, out, this.pos.y - 0.5)) { ox += tmp.x - sx; oz += tmp.z - sz; hitN = { x: out.nx, z: out.nz }; }
    }
    if (hitN) {
      this.pos.x += ox; this.pos.z += oz;
      const vN = this.vx * hitN.x + this.vz * hitN.z;
      if (vN < -0.5) {
        this.vx -= 1.25 * vN * hitN.x; this.vz -= 1.25 * vN * hitN.z; this.vx *= 0.85; this.vz *= 0.85;
        const imp = -vN; if (imp > 4) { this.damage((imp - 4) * 4.2, this.driver ? 'crash' : null); G.audio.crash(Math.min(1, imp / 15)); G.fx.sparks(this.pos.clone().setY(this.pos.y + 0.6), 5); if (this.driver === G.player && imp > 6) G.player.hurt(Math.min(25, (imp - 6) * 2), 'crash'); G.noise(this.pos.x, this.pos.z, 30); }
      }
    }
  }

  updateTransform(dt) {
    const r = this.root; r.position.copy(this.pos); r.rotation.set(0, this.yaw, 0, 'YXZ'); this.body.rotation.set(this.pitch, 0, this.roll, 'ZXY');
    const sp = this.fwdSpeed || 0;
    for (const w of this.model.wheels) { w.spin.rotation.x += sp * dt / w.r; if (w.front) w.pivot.rotation.y = -(this.steerAngle || 0) * (this.kind === 'bike' ? 1 : 1.15); }
    if (this.kind === 'bike' && this.model.wheels[0]) { /* sterzo visibile via ruota anteriore */ }
    if (this.dead) { this.body.rotation.z = 0.05; }
  }
  dispose() { this.G.scene.remove(this.root); this.root.traverse((o) => { if (o.isMesh && o.userData.orig) { o.material.dispose(); } }); }
}

// ---------- guida AI sul grafo stradale ----------
export function routeAStar(roads, a, b, limit = 900) {
  if (a === b) return [a];
  const open = new Map([[a.id, { n: a, g: 0, f: Math.hypot(a.x - b.x, a.z - b.z), p: null }]]), closed = new Set(); let it = 0;
  while (open.size && it++ < limit) {
    let best = null; for (const o of open.values()) if (!best || o.f < best.f) best = o;
    if (best.n === b) { const path = []; for (let c = best; c; c = c.p) path.push(c.n); return path.reverse(); }
    open.delete(best.n.id); closed.add(best.n.id);
    for (const nb of best.n.links) {
      if (closed.has(nb.id)) continue;
      const g = best.g + Math.hypot(nb.x - best.n.x, nb.z - best.n.z), ex = open.get(nb.id);
      if (!ex || g < ex.g) open.set(nb.id, { n: nb, g, f: g + Math.hypot(nb.x - b.x, nb.z - b.z), p: best });
    }
  }
  return null;
}

export class DriverAI {
  constructor(v, G, mode = 'traffic') { this.v = v; this.G = G; this.mode = mode; this.prev = null; this.cur = null; this.route = []; this.wait = 0; this.stuck = 0; this.tgt = null; this.cruise = v.def.cruise * (0.8 + Math.random() * 0.35); }
  setStart(node) { this.cur = node; this.prev = null; }
  nextNode() {
    const c = this.cur; let opts = c.links.filter((n) => n !== this.prev);
    if (this.mode === 'cop' && this.route.length) { const n = this.route.shift(); return n; }
    if (!opts.length) { return null; }
    // preferisci proseguire dritto
    if (this.prev && opts.length > 1) { const dx = c.x - this.prev.x, dz = c.z - this.prev.z, dl = Math.hypot(dx, dz) || 1; opts = opts.map((n) => ({ n, s: ((n.x - c.x) * dx + (n.z - c.z) * dz) / (Math.hypot(n.x - c.x, n.z - c.z) * dl + 1e-6) + Math.random() * 0.7 })).sort((a, b) => b.s - a.s).map((o) => o.n); }
    return opts[0];
  }
  update(dt) {
    const v = this.v, G = this.G; if (v.dead || v.sinkT > 0) return;
    if (!this.cur) return;
    if (!this.tgt) { const n = this.nextNode(); if (!n) { /* fondo cieco: inversione */ this.uturn = true; this.tgt = this.prev || this.cur; const t = this.prev; this.prev = this.cur; this.cur = t || this.cur; } else { this.prev = this.cur; this.cur = n; this.tgt = n; } }
    const t = this.tgt, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    // corsia di destra rispetto alla direzione di marcia
    let dx = t.x - (this.prev ? this.prev.x : v.pos.x), dz = t.z - (this.prev ? this.prev.z : v.pos.z); const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const lane = this.mode === 'cop' ? 0 : (t.r.hw * 0.5);
    const tx = t.x + -dz * lane, tz = t.z + dx * lane;
    let toX = tx - v.pos.x, toZ = tz - v.pos.z; const dist = Math.hypot(toX, toZ);
    if (dist < 6.5) { this.tgt = null; }
    const leftDot = (toX * fz + toZ * -fx) / (dist || 1) * 0 + (toX * Math.cos(v.yaw) + toZ * -Math.sin(v.yaw)) / (dist || 1);
    const fwdDot = (toX * fx + toZ * fz) / (dist || 1);
    let steer = clamp(-leftDot * 2.4, -1, 1); if (fwdDot < 0) steer = Math.sign(-leftDot || 1);
    // velocità obiettivo
    let target = this.mode === 'cop' ? v.def.cruise * 1.7 : this.cruise;
    target *= 1 - 0.55 * clamp(Math.abs(leftDot) * 1.4, 0, 1);
    // ostacoli davanti
    const obs = G.obstacleAhead(v, 15);
    if (obs) target = Math.min(target, obs.dist < 5 ? 0 : Math.max(0, (obs.dist - 5) * 0.9));
    const vF = v.fwdSpeed;
    let thr = clamp((target - vF) * 0.45, -1, 1);
    v.in.throttle = thr; v.in.steer = steer; v.in.brake = thr < -0.5 ? 1 : 0; v.in.hand = 0;
    // inceppato
    if (Math.abs(vF) < 0.4 && target > 2) { this.stuck += dt; if (this.stuck > 4 && !obs) { this.stuck = 0; v.in.throttle = -1; v.yaw += 0.8; } } else this.stuck = 0;
    if (this.uturn && v.speed < 1.2) { v.yaw += Math.PI; this.uturn = false; }
  }
}
