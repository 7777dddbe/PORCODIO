// Personaggi: Max (dalla foto) e pedoni. Rig a giunti con parti morbide (sezioni interpolate).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkCanvas } from './textures.js';
import { mulberry32, clamp, lerp, damp } from './util.js';

const sgnpow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
function cr(a, b, c, d, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }

// corpo morbido: sezioni (superellisse) lungo y
export function bodyGeo(secs, o = {}) {
  const radial = o.radial || 16, sub = o.sub || 3, ex = 2 / (o.n || 2.3);
  const get = (i) => secs[clamp(i, 0, secs.length - 1)];
  const rings = [];
  for (let i = 0; i < secs.length - 1; i++) for (let s = 0; s < sub; s++) {
    const t = s / sub, a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
    const f = (k, def = 0) => cr(a[k] ?? def, b[k] ?? def, c[k] ?? def, d[k] ?? def, t);
    rings.push({ y: lerp(b.y, c.y, t), w: Math.max(0.0005, f('w')), d: Math.max(0.0005, f('d')), cx: f('cx'), cz: f('cz') });
  }
  const L = secs[secs.length - 1]; rings.push({ y: L.y, w: Math.max(0.0005, L.w), d: Math.max(0.0005, L.d), cx: L.cx || 0, cz: L.cz || 0 });
  const R = rings.length, pos = [], uv = [], idx = [];
  const y0 = rings[0].y, y1 = rings[R - 1].y;
  for (let r = 0; r < R; r++) for (let k = 0; k <= radial; k++) {
    const phi = (k / radial) * Math.PI * 2 - Math.PI, ring = rings[r];
    pos.push(ring.cx + ring.w * sgnpow(Math.sin(phi), ex), ring.y, ring.cz + ring.d * sgnpow(Math.cos(phi), ex));
    uv.push(k / radial, (ring.y - Math.min(y0, y1)) / Math.abs(y1 - y0));
  }
  const W = radial + 1;
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < radial; k++) {
    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
    if (y1 > y0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  // tappi
  const cap = (r, up) => { const c0 = pos.length / 3; pos.push(rings[r].cx, rings[r].y, rings[r].cz); uv.push(0.5, up ? 1 : 0); for (let k = 0; k < radial; k++) { const a = r * W + k, b = a + 1; if (up === (y1 > y0)) idx.push(c0, b, a); else idx.push(c0, a, b); } };
  if (o.capEnd !== false) cap(R - 1, y1 > y0); if (o.capStart !== false) cap(0, y1 <= y0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let r = 0; r < R; r++) { const a = r * W, b = r * W + radial; const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1; nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
const colorize = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const ellip = (rx, ry, rz, x, y, z, seg = 10) => { const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2)); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };

// ---------- texture del viso ----------
const faceCache = new Map();
export function faceTexture(o) {
  const key = JSON.stringify([o.skin, o.freckles, o.brow, o.eye, o.lip, o.female]);
  if (faceCache.has(key)) return faceCache.get(key);
  const W = 1024, H = 512, cv = mkCanvas(W, H), c = cv.getContext('2d'), rnd = mulberry32(o.seed || 7);
  const sk = new THREE.Color(o.skin);
  const css = (k, a = 1) => `rgba(${Math.round(sk.r * 255 * k)},${Math.round(sk.g * 255 * k)},${Math.round(sk.b * 255 * k)},${a})`;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(1.0)); g.addColorStop(0.6, css(1.02)); g.addColorStop(1, css(0.9));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // pori e grana
  for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,235,220' : '120,70,50'},${0.02 + rnd() * 0.035})`; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
  const cx = W / 2, eyeY = H * 0.5;
  const blush = (x, y, r, a) => { const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(215,110,100,${a})`); rg.addColorStop(1, 'rgba(215,110,100,0)'); c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2); };
  blush(cx - 90, eyeY + 70, 70, 0.28); blush(cx + 90, eyeY + 70, 70, 0.28);
  // ombre: orbite, narici, bocca
  const shade = (x, y, rx, ry, a) => { c.save(); c.translate(x, y); c.scale(rx, ry); const rg = c.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, `rgba(110,60,45,${a})`); rg.addColorStop(1, 'rgba(110,60,45,0)'); c.fillStyle = rg; c.fillRect(-1, -1, 2, 2); c.restore(); };
  shade(cx - 66, eyeY - 4, 52, 30, 0.22); shade(cx + 66, eyeY - 4, 52, 30, 0.22);
  shade(cx, eyeY + 112, 55, 14, 0.18);
  // occhi
  const eye = (x, flip) => {
    c.save(); c.translate(x, eyeY);
    c.fillStyle = '#f2ebe6'; c.beginPath(); c.ellipse(0, 0, 27, 11.5, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(70,35,25,0.35)'; c.beginPath(); c.ellipse(0, -5, 27, 7, 0, Math.PI, Math.PI * 2); c.fill();
    const ir = c.createRadialGradient(0, 0, 1, 0, 0, 12); ir.addColorStop(0, '#0e0806'); ir.addColorStop(0.4, o.eye || '#4a2f1f'); ir.addColorStop(1, '#22140d');
    c.fillStyle = ir; c.beginPath(); c.arc(flip * 1, 0, 11.5, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(flip * 1 - 4, -4, 2.6, 0, 7); c.fill();
    c.strokeStyle = 'rgba(40,22,16,0.9)'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 27, 11.5, 0, Math.PI * 1.04, Math.PI * 1.96); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(80,40,30,0.5)'; c.beginPath(); c.ellipse(0, 1, 26, 11, 0, 0.1, Math.PI - 0.1); c.stroke();
    c.restore();
  };
  eye(cx - 66, -1); eye(cx + 66, 1);
  // sopracciglia
  const brow = (x, s) => { c.save(); c.translate(x, eyeY - 50); c.fillStyle = o.brow || '#2b1a12'; c.beginPath(); c.moveTo(-34 * s, 8); c.quadraticCurveTo(-4 * s, -9, 38 * s, -2); c.lineTo(38 * s, 5); c.quadraticCurveTo(0, -1, -34 * s, 16); c.closePath(); c.fill(); for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(30,18,12,0.5)'; c.fillRect(-34 * s + rnd() * 72 * s, -4 + rnd() * 14, 1.5, 3); } c.restore(); };
  brow(cx - 66, -1); brow(cx + 66, 1);
  // bocca
  const my = eyeY + 150;
  c.fillStyle = o.lip || '#b4605f'; c.beginPath(); c.moveTo(cx - 48, my); c.quadraticCurveTo(cx - 18, my - 17, cx, my - 10); c.quadraticCurveTo(cx + 18, my - 17, cx + 48, my); c.quadraticCurveTo(cx, my + 7, cx - 48, my); c.fill();
  c.fillStyle = '#c9706c'; c.beginPath(); c.moveTo(cx - 46, my + 1); c.quadraticCurveTo(cx, my + 30, cx + 46, my + 1); c.quadraticCurveTo(cx, my + 8, cx - 46, my + 1); c.fill();
  c.strokeStyle = 'rgba(70,25,25,0.8)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx - 48, my); c.quadraticCurveTo(cx, my + 7, cx + 48, my); c.stroke(); shade(cx - 70, my - 40, 22, 60, 0.12); shade(cx + 70, my - 40, 22, 60, 0.12); shade(cx, my + 42, 50, 12, 0.14);
  // lentiggini
  if (o.freckles) for (let i = 0; i < o.freckles; i++) {
    const side = rnd() < 0.5 ? -1 : 1, x = cx + side * (12 + rnd() * 105), y = eyeY + 18 + rnd() * 95 - Math.abs(x - cx) * 0.1;
    c.fillStyle = `rgba(${150 + rnd() * 30},${88 + rnd() * 25},${58},${0.35 + rnd() * 0.35})`; c.beginPath(); c.arc(x, y, 1.4 + rnd() * 2.6, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  faceCache.set(key, t); return t;
}

// ---------- materiali condivisi ----------
const matCache = new Map();
const M = (key, make) => { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; };
const stdM = (key, o) => M(key, () => new THREE.MeshStandardMaterial(o));

export const MAX = { skin: '#d3a68d', freckles: 95, brow: '#2a1810', eye: '#46301f', lip: '#b8625f', hair: '#2a1a12', hairHi: '#4b3022', jacket: '#16213a', shirt: '#f2f0ec', pants: '#34476e', shoes: '#f0f0f0', glasses: true, curly: true, seed: 11, name: 'Max' };

function curlyHair(color, hi, rnd, o = {}) {
  const parts = [];
  const c1 = new THREE.Color(color), c2 = new THREE.Color(hi);
  const N = o.count || 1150;
  for (let i = 0; i < N; i++) {
    // direzione sulla calotta
    let th, ph, y;
    const front = i < 230; // frangia
    if (front) { th = (rnd() - 0.5) * 2.1; ph = 0.2 + rnd() * 0.5; } else { th = rnd() * Math.PI * 2 - Math.PI; ph = rnd() * 1.55; }
    const dir = new THREE.Vector3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)).normalize();
    // salta la zona del viso (davanti e sotto la linea dei capelli)
    const yy = 0.125 + dir.y * 0.115;
    if (!front && dir.z > 0.45 && yy < 0.178) continue;
    if (yy < 0.07) continue;
    if (!front && Math.abs(Math.sin(th)) > 0.75 && yy < 0.118) continue;
    const r = (front ? 0.013 : 0.0115) + rnd() * 0.009;
    const rad = new THREE.Vector3(0.078, 0.108, 0.1);
    const p = dir.clone().multiply(rad).multiplyScalar(1.03); p.y += 0.125; if (front) { p.z += 0.012; p.y += 0.003; }
    const g = new THREE.SphereGeometry(r, 7, 5); g.scale(1 + rnd() * 0.25, 0.9 + rnd() * 0.3, 1 + rnd() * 0.25); g.translate(p.x, p.y, p.z);
    colorize(g, c1.clone().lerp(c2, rnd() * rnd() * 1.2).multiplyScalar(0.7 + 0.5 * rnd() * (0.4 + dir.y)));
    parts.push(g);
  }
  // calotta di base per coprire la pelle
  const cap = ellip(0.081, 0.115, 0.103, 0, 0.128, -0.004, 12); colorize(cap, c1.clone().multiplyScalar(0.6));
  const pc = cap.attributes.position; for (let i = 0; i < pc.count; i++) { if (pc.getY(i) < 0.11) { pc.setY(i, 0.11 + (pc.getY(i) - 0.11) * 0.0); } }
  parts.push(cap);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
function shortHair(color, rnd, o = {}) {
  const c1 = new THREE.Color(color);
  const g = ellip(0.083, 0.112, 0.104, 0, 0.13, -0.003, 12); colorize(g, c1);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0.118 && p.getZ(i) > 0.0) p.setY(i, 0.118 + (p.getY(i) - 0.118) * 0.1); }
  const parts = [g];
  if (o.long) { const b = ellip(0.088, 0.17, 0.07, 0, 0.04, -0.07, 10); colorize(b, c1.clone().multiplyScalar(0.9)); parts.push(b); }
  if (o.tuft) { const t = ellip(0.05, 0.03, 0.06, 0, 0.225, 0.02, 8); colorize(t, c1); parts.push(t); }
  return mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)));
}

// ---------- costruzione ----------
export function buildHuman(o = {}) {
  o = { ...MAX, ...o };
  const rnd = mulberry32(o.seed || 1);
  const H = { opts: o };
  const root = new THREE.Group(); H.root = root;
  const skinM = M('skin' + o.skin, () => new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.62 }));
  const jacketM = M('jk' + o.jacket + (o.knit ? 'k' : ''), () => { const m = new THREE.MeshPhysicalMaterial({ color: o.jacket, roughness: 0.82, sheen: 0.6, sheenColor: new THREE.Color(0x6a7aa0), sheenRoughness: 0.6 }); if (o.knit) { m.normalMap = o.knit; m.normalScale = new THREE.Vector2(0.7, 0.7); } return m; });
  const pantsM = stdM('pt' + o.pants, { color: o.pants, roughness: 0.85 });
  const shoeM = stdM('sh' + o.shoes, { color: o.shoes, roughness: 0.55 });
  const soleM = stdM('sole', { color: 0xcfcfcf, roughness: 0.8 });
  const shirtM = stdM('st' + o.shirt, { color: o.shirt, roughness: 0.9 });
  const mk = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

  const hips = new THREE.Group(); hips.position.y = 0.93; root.add(hips); H.hips = hips;
  // bacino
  hips.add(mk(bodyGeo([{ y: -0.1, w: 0.15, d: 0.1 }, { y: -0.02, w: 0.18, d: 0.115 }, { y: 0.06, w: 0.172, d: 0.108 }], { radial: 14, sub: 2 }), pantsM));
  // torso
  const torso = new THREE.Group(); hips.add(torso); H.torso = torso;
  const tsecs = [{ y: 0.04, w: 0.17, d: 0.106 }, { y: 0.14, w: 0.18, d: 0.11 }, { y: 0.27, w: 0.19, d: 0.115 }, { y: 0.4, w: 0.208, d: 0.12 }, { y: 0.51, w: 0.216, d: 0.11 }, { y: 0.56, w: 0.12, d: 0.08 }, { y: 0.585, w: 0.07, d: 0.065 }];
  const tg = bodyGeo(tsecs, { radial: 20, sub: 3, n: 2.5 }); const tuv = tg.attributes.uv; for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 18, tuv.getY(i) * 12);
  torso.add(mk(tg, o.jacketMat || jacketM));
  // colletto alto con zip (come nella foto) e maglietta bianca
  const neck = new THREE.Group(); neck.position.y = 0.585; torso.add(neck);
  const collar = mk(new THREE.CylinderGeometry(0.062, 0.07, 0.07, 20, 1, true, Math.PI * 0.3, Math.PI * 1.4), o.jacketMat || jacketM); collar.position.set(0, 0.015, -0.005); collar.material = collar.material.clone(); collar.material.side = THREE.DoubleSide; neck.add(collar);
  const shirtRing = mk(new THREE.CylinderGeometry(0.052, 0.055, 0.03, 16, 1, true), shirtM); shirtRing.material = shirtM.clone(); shirtRing.material.side = THREE.DoubleSide; shirtRing.position.set(0, 0.0, 0.0); neck.add(shirtRing);
  const zip = mk(new THREE.BoxGeometry(0.01, 0.2, 0.004), stdM('zip', { color: 0x8a8d93, roughness: 0.35, metalness: 0.8 })); zip.position.set(0, 0.46, 0.108); torso.add(zip);
  // collo
  neck.add(mk(bodyGeo([{ y: -0.04, w: 0.05, d: 0.05 }, { y: 0.06, w: 0.046, d: 0.047 }], { radial: 10, sub: 1 }), skinM));
  // testa
  const head = new THREE.Group(); head.position.y = 0.02; neck.add(head); H.head = head;
  const headMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(o), roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0xffc9b0), sheenRoughness: 0.5 });
  const hg = bodyGeo([{ y: 0.0, w: 0.022, d: 0.03, cz: 0.05 }, { y: 0.012, w: 0.05, d: 0.06, cz: 0.04 }, { y: 0.035, w: 0.07, d: 0.082, cz: 0.022 }, { y: 0.07, w: 0.078, d: 0.094, cz: 0.004 }, { y: 0.115, w: 0.078, d: 0.098, cz: 0 }, { y: 0.15, w: 0.077, d: 0.098, cz: -0.002 }, { y: 0.19, w: 0.071, d: 0.094, cz: -0.004 }, { y: 0.222, w: 0.05, d: 0.075, cz: -0.004 }, { y: 0.238, w: 0.012, d: 0.02, cz: -0.004 }], { radial: 36, sub: 3, n: 2.15 });
  head.add(mk(hg, headMat));
  // naso, orecchie
  const nose = ellip(0.011, 0.02, 0.014, 0, 0.088, 0.097, 10); head.add(mk(nose, skinM, false));
  const noseTip = ellip(0.015, 0.009, 0.012, 0, 0.073, 0.1, 8); head.add(mk(noseTip, skinM, false));
  for (const s of [-1, 1]) head.add(mk(ellip(0.009, 0.026, 0.017, s * 0.08, 0.115, -0.004, 8), skinM, false));
  H.eyeBall = null;
  // capelli
  const hrnd = mulberry32(o.seed * 3 + 5);
  const hairMat = M('hair' + o.hair, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));
  if (o.curly) head.add(mk(curlyHair(o.hair, o.hairHi || o.hair, hrnd, { count: o.hairCount }), hairMat)); else if (o.hairStyle !== 'bald') head.add(mk(shortHair(o.hair, hrnd, { long: o.long, tuft: o.tuft }), hairMat));
  if (o.hat) { const hatM = stdM('hat' + o.hat, { color: o.hat, roughness: 0.8 }); const br = mk(new THREE.CylinderGeometry(0.17, 0.17, 0.008, 20), hatM); br.position.set(0, 0.185, 0.0); head.add(br); const cr2 = mk(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 16), hatM); cr2.position.set(0, 0.215, -0.002); head.add(cr2); }
  // occhiali neri rettangolari
  if (o.glasses) {
    const fm = stdM('frame', { color: 0x0b0b0d, roughness: 0.35, metalness: 0.15 });
    const lensM = M('lens', () => new THREE.MeshPhysicalMaterial({ color: 0xaad0e8, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 2.5, side: THREE.DoubleSide }));
    const frame = new THREE.Group(); frame.position.set(0, 0.118, 0.108); head.add(frame);
    const lw = 0.054, lh = 0.039, th = 0.0035, dp = 0.0045;
    for (const s of [-1, 1]) {
      const cx = s * 0.0345;
      const bars = [[lw, th, 0, lh / 2], [lw, th, 0, -lh / 2], [th, lh, -lw / 2, 0], [th, lh, lw / 2, 0]];
      for (const [w, h, x, y] of bars) { const b = mk(new THREE.BoxGeometry(w, h, dp), fm, false); b.position.set(cx + x, y, 0); frame.add(b); }
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.002, lh - 0.002), lensM); lens.position.set(cx, 0, 0); frame.add(lens);
      const arm = mk(new THREE.BoxGeometry(0.0035, 0.004, 0.115), fm, false); arm.position.set(s * 0.0625 + s * 0.012 * 0, 0.012, -0.056); arm.rotation.y = s * -0.07; frame.add(arm);
    }
    const bridge = mk(new THREE.BoxGeometry(0.014, 0.004, dp), fm, false); bridge.position.set(0, 0.013, 0); frame.add(bridge);
  }
  // braccia
  const sleeveM = o.jacketMat || jacketM;
  const scaleUV = (g, a, b) => { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * a, u.getY(i) * b); return g; };
  const mkArm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.228, 0.5, 0); torso.add(sh);
    sh.add(mk(scaleUV(ellip(0.066, 0.064, 0.064, 0, 0.0, 0, 10), 8, 5), sleeveM));
    const up = mk(scaleUV(bodyGeo([{ y: 0, w: 0.058, d: 0.058 }, { y: -0.12, w: 0.054, d: 0.054 }, { y: -0.29, w: 0.046, d: 0.046 }], { radial: 12, sub: 2 }), 6, 14), sleeveM); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    el.add(mk(scaleUV(ellip(0.047, 0.047, 0.047, 0, 0, 0, 8), 5, 4), sleeveM));
    const fo = mk(scaleUV(bodyGeo([{ y: 0, w: 0.045, d: 0.045 }, { y: -0.1, w: 0.042, d: 0.042 }, { y: -0.26, w: 0.034, d: 0.036 }], { radial: 12, sub: 2 }), 5, 12), sleeveM); el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
    hand.add(mk(ellip(0.034, 0.05, 0.02, 0, -0.04, 0, 8), skinM));
    hand.add(mk(ellip(0.012, 0.03, 0.012, s * -0.028, -0.03, 0.012, 6), skinM, false));
    return { sh, el, hand };
  };
  H.armL = mkArm(-1); H.armR = mkArm(1);
  // gambe
  const mkLeg = (s) => {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.02, 0); hips.add(hp);
    hp.add(mk(bodyGeo([{ y: 0, w: 0.095, d: 0.1 }, { y: -0.2, w: 0.082, d: 0.088 }, { y: -0.44, w: 0.058, d: 0.062 }], { radial: 12, sub: 2 }), pantsM));
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    kn.add(mk(bodyGeo([{ y: 0, w: 0.058, d: 0.062 }, { y: -0.2, w: 0.052, d: 0.056 }, { y: -0.42, w: 0.04, d: 0.044 }], { radial: 12, sub: 2 }), pantsM));
    const ft = new THREE.Group(); ft.position.y = -0.43; kn.add(ft);
    ft.add(mk(ellip(0.047, 0.04, 0.12, 0, -0.02, 0.04, 10), shoeM));
    ft.add(mk(new THREE.BoxGeometry(0.095, 0.025, 0.25), soleM, false)).position.set(0, -0.052, 0.04);
    return { hp, kn, ft };
  };
  H.legL = mkLeg(-1); H.legR = mkLeg(1);
  H.weaponSlot = new THREE.Group(); H.weaponSlot.position.set(0, -0.06, 0.03); H.armR.hand.add(H.weaponSlot);

  // stato animazione
  H.phase = 0; H.pose = { speed: 0, mode: 'foot' }; H.t = 0; H.aimPitch = 0; H.swing = 0; H.dead = 0;
  H.animate = (dt, st) => animate(H, dt, st);
  root.traverse((m) => { m.frustumCulled = true; });
  return H;
}

// ---------- animazione procedurale ----------
function animate(H, dt, st) {
  H.t += dt;
  const { hips, torso, head, armL, armR, legL, legR } = H;
  const mode = st.mode || 'foot';
  const sp = st.speed || 0;
  const reset = () => { for (const a of [armL, armR]) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); a.hand.rotation.set(0, 0, 0); } for (const l of [legL, legR]) { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); l.ft.rotation.set(0, 0, 0); } torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); H.root.rotation.x = 0; };
  const k = (v, a) => damp(v, a, 14, dt);
  H.root.rotation.z = 0;
  if (mode === 'dead') {
    H.dead = Math.min(1, H.dead + dt * 3);
    H.root.rotation.x = -H.dead * 1.52; hips.position.y = lerp(0.93, 0.12, H.dead);
    armL.sh.rotation.x = -0.4 * H.dead; armR.sh.rotation.x = -0.9 * H.dead; armL.sh.rotation.z = -0.5 * H.dead; armR.sh.rotation.z = 0.7 * H.dead;
    legL.hp.rotation.x = -0.2 * H.dead; legR.hp.rotation.x = 0.3 * H.dead; legR.kn.rotation.x = 0.4 * H.dead;
    return;
  }
  H.dead = 0;
  if (mode === 'foot' || mode === 'air') {
    reset();
    const run = clamp(sp / 7, 0, 1.3), walkF = clamp(sp / 3.5, 0, 1);
    H.phase += dt * (sp * 1.45 + (sp > 0.2 ? 1.2 : 0));
    const p = H.phase;
    const A = (0.34 + 0.5 * run) * walkF, B = (0.25 + 0.9 * run) * walkF;
    const airborne = mode === 'air';
    const thL = airborne ? -0.5 : Math.sin(p) * A, thR = airborne ? 0.5 : -Math.sin(p) * A;
    legL.hp.rotation.x = thL; legR.hp.rotation.x = thR;
    legL.kn.rotation.x = airborne ? 0.9 : Math.max(0, Math.cos(p)) * B * 1.5; legR.kn.rotation.x = airborne ? 0.3 : Math.max(0, -Math.cos(p)) * B * 1.5;
    legL.ft.rotation.x = -legL.kn.rotation.x * 0.3; legR.ft.rotation.x = -legR.kn.rotation.x * 0.3;
    hips.position.y = 0.93 - (airborne ? 0.05 : Math.abs(Math.cos(p)) * 0.035 * walkF * (0.6 + run)) + Math.sin(H.t * 1.6) * 0.002;
    torso.rotation.x = 0.04 + run * 0.22 * walkF; torso.rotation.y = Math.sin(p) * 0.16 * walkF;
    head.rotation.x = -torso.rotation.x * 0.7 + (st.look || 0) * 0.5; head.rotation.y = -torso.rotation.y * 0.6;
    armL.sh.rotation.x = -thL * 0.9 * (0.6 + run * 0.7); armR.sh.rotation.x = -thR * 0.9 * (0.6 + run * 0.7);
    armL.el.rotation.x = -0.25 - run * 0.9 * walkF; armR.el.rotation.x = -0.25 - run * 0.9 * walkF;
    armL.sh.rotation.z = -0.08; armR.sh.rotation.z = 0.08;
    if (airborne) { armL.sh.rotation.z = -0.6; armR.sh.rotation.z = 0.6; }
    // respirazione
    torso.scale.set(1, 1 + Math.sin(H.t * 2.1) * 0.006, 1 + Math.sin(H.t * 2.1) * 0.01);
    if (st.aim) {
      const pa = -(Math.PI / 2 + (st.pitch || 0) * 0.9);
      armR.sh.rotation.set(pa, -0.12, 0.05); armR.el.rotation.x = -0.12;
      armL.sh.rotation.set(pa + 0.15, 0.45, -0.1); armL.el.rotation.x = -0.9;
      torso.rotation.y = -0.2; torso.rotation.x = -0.02; head.rotation.y = 0.25; head.rotation.x = (st.pitch || 0) * 0.5;
    } else if (st.holdWeapon) {
      armR.sh.rotation.x = -0.5; armR.el.rotation.x = -0.9;
    }
    if (st.punch) { armR.sh.rotation.x = -1.3 - Math.sin(st.punch * Math.PI) * 0.7; armR.el.rotation.x = -0.2; torso.rotation.y = 0.3 * Math.sin(st.punch * Math.PI); }
    if (st.hurt) { torso.rotation.x += 0.15 * st.hurt; }
    if (st.flee) { armL.sh.rotation.x -= 0.6; armR.sh.rotation.x -= 0.6; armL.el.rotation.x -= 0.6; armR.el.rotation.x -= 0.6; }
    if (st.wave) { armR.sh.rotation.set(-2.6, 0, -0.3); armR.el.rotation.x = -0.5 + Math.sin(H.t * 8) * 0.4; }
  } else if (mode === 'swim') {
    reset();
    H.phase += dt * (3 + sp * 1.6);
    const p = H.phase;
    H.root.rotation.x = 1.25; hips.position.y = 0.55;
    armL.sh.rotation.x = -Math.PI + Math.sin(p) * 1.1; armR.sh.rotation.x = -Math.PI + Math.sin(p + Math.PI) * 1.1;
    armL.el.rotation.x = -0.5 - Math.max(0, Math.sin(p)) * 0.7; armR.el.rotation.x = -0.5 - Math.max(0, -Math.sin(p)) * 0.7;
    legL.hp.rotation.x = Math.sin(p * 2) * 0.35; legR.hp.rotation.x = -Math.sin(p * 2) * 0.35;
    head.rotation.x = -1.0; torso.rotation.y = Math.sin(p) * 0.18;
    if (sp < 0.3) { H.root.rotation.x = 1.0; armL.sh.rotation.x = -1.6 + Math.sin(H.t * 2) * 0.4; armR.sh.rotation.x = -1.6 - Math.sin(H.t * 2) * 0.4; }
  } else if (mode === 'car') {
    reset(); hips.position.y = 0.5;
    legL.hp.rotation.x = -1.45; legR.hp.rotation.x = -1.4; legL.kn.rotation.x = 1.55; legR.kn.rotation.x = 1.5; legL.ft.rotation.x = -0.1;
    torso.rotation.x = -0.12; torso.rotation.y = -(st.steer || 0) * 0.3;
    armL.sh.rotation.set(-1.1, 0.25 + (st.steer || 0) * 0.5, 0); armR.sh.rotation.set(-1.1, -0.25 + (st.steer || 0) * 0.5, 0); armL.el.rotation.x = -0.65; armR.el.rotation.x = -0.65;
    head.rotation.y = (st.look || 0);
    if (st.aim) { armR.sh.rotation.set(-1.4, -0.5, 0.3); armR.el.rotation.x = -0.1; }
  } else if (mode === 'bike') {
    reset(); hips.position.y = 0.55;
    legL.hp.rotation.x = -1.2; legR.hp.rotation.x = -1.2; legL.hp.rotation.z = -0.15; legR.hp.rotation.z = 0.15; legL.kn.rotation.x = 1.35; legR.kn.rotation.x = 1.35;
    torso.rotation.x = 0.35 + clamp(sp / 25, 0, 0.3); torso.rotation.z = -(st.steer || 0) * 0.15;
    armL.sh.rotation.set(-1.15, 0.15, -0.15); armR.sh.rotation.set(-1.15, -0.15, 0.15); armL.el.rotation.x = -0.35; armR.el.rotation.x = -0.35;
    head.rotation.x = -0.3; head.rotation.y = (st.steer || 0) * -0.3;
  } else if (mode === 'jet') {
    reset(); hips.position.y = 0.58;
    legL.hp.rotation.set(-0.9, 0, -0.35); legR.hp.rotation.set(-0.9, 0, 0.35); legL.kn.rotation.x = 1.1; legR.kn.rotation.x = 1.1;
    torso.rotation.x = 0.4 + clamp(sp / 30, 0, 0.35); torso.rotation.z = -(st.steer || 0) * 0.2;
    armL.sh.rotation.set(-1.25, 0.2, -0.1); armR.sh.rotation.set(-1.25, -0.2, 0.1); armL.el.rotation.x = -0.3; armR.el.rotation.x = -0.3;
    head.rotation.x = -0.35;
  }
}
