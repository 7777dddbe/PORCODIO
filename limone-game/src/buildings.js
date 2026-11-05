// Edifici: centro storico, alberghi, ville. Tutto fuso in poche mesh per cella.
import * as THREE from 'three';
import { frame, shoreX, LANDMARKS } from './map.js';
import { Grid, RNG, clamp, lerp } from './util.js';

const PAL = [[0.95, 0.88, 0.7], [0.94, 0.74, 0.56], [0.96, 0.92, 0.8], [0.88, 0.7, 0.5], [0.93, 0.85, 0.56], [0.8, 0.86, 0.72], [0.96, 0.96, 0.94], [0.88, 0.64, 0.54], [0.85, 0.8, 0.7], [0.97, 0.82, 0.66], [0.78, 0.82, 0.86]];
const CELL = 192;

export function obbCorners(cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]);
}
export function obbOverlap(a, b, m = 0) {
  // SAT con margine
  for (const o of [a, b]) {
    for (const ax of [[o.c, o.s], [-o.s, o.c]]) {
      const pa = a.cx * ax[0] + a.cz * ax[1], pb = b.cx * ax[0] + b.cz * ax[1];
      const ra = a.hx * Math.abs(a.c * ax[0] + a.s * ax[1]) + a.hz * Math.abs(-a.s * ax[0] + a.c * ax[1]);
      const rb = b.hx * Math.abs(b.c * ax[0] + b.s * ax[1]) + b.hz * Math.abs(-b.s * ax[0] + b.c * ax[1]);
      if (Math.abs(pa - pb) > ra + rb + m) return false;
    }
  }
  return true;
}

class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.l = []; this.i = []; this.count = 0; }
  build(mat, withLit) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (withLit) g.setAttribute('aLit', new THREE.Float32BufferAttribute(this.l, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

function addFace(B, pts, o) {
  const n = pts.length;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const d = o.dir;
  let P = pts;
  if (nx * d[0] + ny * d[1] + nz * d[2] < 0) { P = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
  const p0 = P[0], p1 = P[1];
  let ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2]; const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
  let sx = ny * ez - nz * ey, sy = nz * ex - nx * ez, sz = nx * ey - ny * ex;
  if (sy < 0) { sx = -sx; sy = -sy; sz = -sz; }
  const base = B.count;
  for (const p of P) {
    const dx = p[0] - p0[0], dy = p[1] - p0[1], dz = p[2] - p0[2];
    B.p.push(p[0], p[1], p[2]); B.n.push(nx, ny, nz);
    B.uv.push((dx * ex + dy * ey + dz * ez) * o.su + (o.u0 || 0), (dx * sx + dy * sy + dz * sz) * o.sv + (o.v0 || 0));
    B.c.push(o.col[0], o.col[1], o.col[2]); B.l.push(o.lit || 0);
  }
  for (let i = 1; i < P.length - 1; i++) B.i.push(base, base + i, base + i + 1);
  B.count += P.length;
}

export class Buildings {
  constructor(ctx) {
    Object.assign(this, ctx); // terrain, roads, T, colliders, nightU, q
    this.list = []; this.grid = new Grid(16);
    this.rng = new RNG(8081);
    this.batches = new Map();
    this.sigs = [];
  }
  batch(key) { let b = this.batches.get(key); if (!b) { b = new Batch(); this.batches.set(key, b); } return b; }

  // verifica di una posizione possibile
  canPlace(cx, cz, hx, hz, yaw, o = {}) {
    const t = this.terrain, ob = { cx, cz, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw) };
    const cs = obbCorners(cx, cz, hx, hz, yaw);
    let mn = 1e9, mx = -1e9;
    const pts = [...cs, [cx, cz]];
    for (let k = 0; k < 4; k++) { const a = cs[k], b = cs[(k + 1) % 4]; pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
    for (const p of pts) { const h = t.heightAt(p[0], p[1]); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mn < (o.minY ?? 2.0)) return null;
    if (mx - mn > (o.maxStep ?? 5.5)) return null;
    // distanza dalle strade
    const rc = o.roadClear ?? 3;
    const R = Math.hypot(hx, hz) + 14;
    const near = this.roads.hash.query(cx - R, cz - R, cx + R, cz + R);
    const samples = [...pts];
    for (let k = 0; k < 4; k++) { const a = cs[k], b = cs[(k + 1) % 4]; for (const q of [0.25, 0.75]) samples.push([lerp(a[0], b[0], q), lerp(a[1], b[1], q)]); }
    for (const sm of samples) for (const r of near) { const d = Math.hypot(r.x - sm[0], r.z - sm[1]); if (d < r.r.hw + (r.r.sidewalk ? 1.7 : 0) + rc) return null; }
    // sovrapposizione con altri edifici
    const nb = this.grid.query(cx - R, cz - R, cx + R, cz + R);
    for (const b of nb) if (obbOverlap(ob, b, o.margin ?? 3)) return null;
    ob.mn = mn; ob.mx = mx;
    return ob;
  }

  place(cx, cz, w, l, yaw, o = {}) {
    const hx = w / 2, hz = l / 2;
    const ob = this.canPlace(cx, cz, hx, hz, yaw, o);
    if (!ob) return null;
    const y0 = lerp(ob.mn, ob.mx, o.pad ?? 0.45) + 0.15;
    this.terrain.stampPad(cx, cz, hx + 1.0, hz + 1.0, yaw, y0 - 0.15, 3.0, o.kind ?? 2);
    const floors = o.floors ?? 3;
    const b = Object.assign(ob, { y0, w, l, yaw, floors, h: floors * 3.0, type: o.type || 'house', roof: o.roof || 'gable', rh: 0, col: o.col, v: o.v, lit: o.lit });
    b.top = y0 + b.h;
    this.grid.insert(b, cx - hx - hz, cz - hx - hz, cx + hx + hz, cz + hx + hz);
    this.list.push(b);
    this.colliders.addObb(b);
    return b;
  }

  // ---------- generazione ----------
  generate() {
    const rng = this.rng, t = this.terrain;
    const shoreAng = () => { return Math.atan2(1, -0.24); }; // direzione della costa (verso sud)
    const SA = shoreAng();
    const palPick = () => rng.pick(PAL);
    const bays = (n) => n * 3.2;

    // riserve di spazio per i luoghi speciali (le costruiamo in specials())
    this.reserved = [];
    const reserve = (x, z, r) => this.reserved.push({ x, z, r });
    for (const k of ['chiesa', 'comune', 'campo', 'tennis', 'castel', 'porto']) { const L = LANDMARKS[k]; reserve(L.x, L.z, k === 'campo' ? 55 : k === 'comune' ? 40 : k === 'porto' ? 38 : 26); }
    const isReserved = (x, z) => this.reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.r);

    // 1) centro storico: case addossate, vicoli stretti
    for (let z = -862; z < -622; z += 8.5) for (let d = 22; d < 128; d += 8.5) {
      if (rng.f() < 0.12) continue;
      const jz = z + rng.range(-3, 3), jd = d + rng.range(-3, 3);
      const [x, zz] = frame(jz, jd);
      if (isReserved(x, zz)) continue;
      const bw = bays(rng.int(2, 3)), bl = bays(rng.int(2, 4)) + (rng.f() < 0.3 ? 1.6 : 0);
      const yaw = SA + (rng.f() < 0.5 ? 0 : Math.PI / 2) + rng.range(-0.1, 0.1);
      const floors = rng.pick([3, 3, 4, 4, 4, 5]);
      this.place(x, zz, bw, bl, yaw, { floors, type: 'old', col: palPick(), v: rng.int(0, 1), margin: 1.6, roadClear: 2.2, maxStep: 7, kind: 1, minY: 1.6, pad: 0.5 });
    }
    // 2) alberghi lungo la costa
    const hotelZones = [[-300, 420, 22, 60], [-300, 420, 90, 138]];
    let nh = 0;
    for (let k = 0; k < 900 && nh < 34; k++) {
      const [z0, z1, d0, d1] = hotelZones[k % 2];
      const jz = rng.range(z0, z1), jd = rng.range(d0, d1);
      const [x, zz] = frame(jz, jd);
      if (isReserved(x, zz)) continue;
      const bw = bays(rng.int(3, 7)), bl = bays(rng.int(3, 4));
      const yaw = SA + (rng.f() < 0.8 ? 0 : Math.PI / 2) + rng.range(-0.05, 0.05);
      const floors = rng.pick([3, 4, 4, 5]);
      const b = this.place(x, zz, bw, bl, yaw, { floors, type: 'hotel', roof: rng.f() < 0.55 ? 'hip' : rng.f() < 0.5 ? 'gable' : 'flat', col: palPick(), v: rng.int(0, 2), margin: 12, roadClear: 4.5, maxStep: 6, kind: 1 });
      if (b) nh++;
    }
    // 3) ville e case lungo le strade
    for (const r of this.roads.roads) {
      if (r.closed) continue;
      const step = r.kind === 'lane' ? 24 : 21;
      for (let s = 10; s < r.len - 10; s += step * rng.range(0.7, 1.4)) {
        const P = r.path[Math.min(r.path.length - 1, Math.round(s / 1.5))];
        for (const side of [-1, 1]) {
          if (rng.f() < (r.id === 'R1a' || r.id === 'R1b' ? 0.55 : 0.4)) continue;
          const off = r.hw + rng.range(8, 17), nx = -P.tz * side, nz = P.tx * side;
          const x = P.x + nx * off, zz = P.z + nz * off;
          if (isReserved(x, zz)) continue;
          const yaw = Math.atan2(P.tz, P.tx) + rng.range(-0.2, 0.2);
          const bw = bays(rng.int(2, 4)), bl = bays(rng.int(2, 3));
          this.place(x, zz, bw, bl, yaw, { floors: rng.pick([1, 2, 2, 2, 3]), type: 'villa', roof: rng.f() < 0.45 ? 'hip' : 'gable', col: palPick(), v: rng.int(0, 2), margin: 5, roadClear: 3.5, maxStep: 5 });
        }
      }
    }
    // 4) case sparse nell'uliveto
    for (let k = 0; k < 500 && this.list.length < 520; k++) {
      const jz = rng.range(-700, 900), jd = rng.range(60, 280);
      const [x, zz] = frame(jz, jd);
      if (isReserved(x, zz)) continue;
      const nr = this.roads.nearest(x, zz, 55); if (!nr) continue;
      this.place(x, zz, bays(rng.int(2, 3)), bays(rng.int(2, 3)), SA + rng.range(-0.4, 0.4), { floors: rng.pick([1, 2, 2]), type: 'villa', roof: 'gable', col: palPick(), v: rng.int(0, 2), margin: 8, roadClear: 4, maxStep: 4.5 });
    }
  }

  // ---------- mesh ----------
  addGeometry(b) {
    const rng = this.rng, T = this.T;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const W = (x, y, z) => [b.cx + x * c - z * s, y, b.cz + x * s + z * c];
    const hx = b.w / 2, hz = b.l / 2, yb = b.y0 - 0.9, yt = b.y0 + b.h;
    const col = b.col || [0.9, 0.85, 0.75];
    const lit = b.lit ?? (rng.f() < 0.55 ? 1 : 0);
    const cellKey = Math.floor(b.cx / CELL) + '_' + Math.floor(b.cz / CELL);
    const v = b.v ?? 0;
    const wallB = this.batch(`w${v}_${cellKey}`), roofB = this.batch(`r_${cellKey}`), flatB = this.batch(`f_${cellKey}`);
    const wc = [col[0] * rng.range(0.7, 0.8), col[1] * rng.range(0.7, 0.8), col[2] * rng.range(0.7, 0.8)];
    const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let k = 0; k < 4; k++) {
      const a = corners[k], d = corners[(k + 1) % 4];
      const len = Math.hypot(d[0] - a[0], d[1] - a[1]);
      const mid = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
      const dir = [mid[0] * c - mid[1] * s, 0, mid[0] * s + mid[1] * c];
      addFace(wallB, [W(a[0], yb, a[1]), W(d[0], yb, d[1]), W(d[0], yt, d[1]), W(a[0], yt, a[1])], { col: wc, lit, su: 1 / 3.2, sv: 1 / 3.0, v0: -0.9 / 3.0, dir });
    }
    // tetto
    const rcol = [rng.range(0.85, 1.1), rng.range(0.85, 1.05), rng.range(0.85, 1.05)];
    const oh = 0.55;
    const alongX = hx >= hz;
    if (b.roof === 'flat') {
      const ph = 0.9;
      for (let k = 0; k < 4; k++) {
        const a = corners[k], d = corners[(k + 1) % 4];
        const mid = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2], dir = [mid[0] * c - mid[1] * s, 0, mid[0] * s + mid[1] * c];
        addFace(wallB, [W(a[0], yt, a[1]), W(d[0], yt, d[1]), W(d[0], yt + ph, d[1]), W(a[0], yt + ph, a[1])], { col: wc, lit: 0, su: 1 / 3.2, sv: 1 / 3.0, dir });
      }
      addFace(flatB, [W(-hx, yt + ph * 0.9, -hz), W(hx, yt + ph * 0.9, -hz), W(hx, yt + ph * 0.9, hz), W(-hx, yt + ph * 0.9, hz)], { col: [0.55, 0.55, 0.55], lit: 0, su: 1 / 3, sv: 1 / 3, dir: [0, 1, 0] });
      b.top = yt + ph;
      // piccolo volume tecnico
      if (rng.f() < 0.6) { const bx = rng.range(-hx * 0.5, hx * 0.5), bz = rng.range(-hz * 0.4, hz * 0.4), sw = 2.2, sh = 2.4; const top = yt + ph * 0.9;
        const cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let k = 0; k < 4; k++) { const a = cc[k], d = cc[(k + 1) % 4]; addFace(wallB, [W(bx + a[0] * sw, top, bz + a[1] * sw), W(bx + d[0] * sw, top, bz + d[1] * sw), W(bx + d[0] * sw, top + sh, bz + d[1] * sw), W(bx + a[0] * sw, top + sh, bz + a[1] * sw)], { col: [0.8, 0.78, 0.74], lit: 0, su: 1 / 3.2, sv: 1 / 3.0, dir: [(a[0] + d[0]) * c - (a[1] + d[1]) * s, 0, (a[0] + d[0]) * s + (a[1] + d[1]) * c] }); }
        addFace(flatB, [W(bx - sw, top + sh, bz - sw), W(bx + sw, top + sh, bz - sw), W(bx + sw, top + sh, bz + sw), W(bx - sw, top + sh, bz + sw)], { col: [0.5, 0.5, 0.5], su: 1 / 3, sv: 1 / 3, dir: [0, 1, 0] });
      }
    } else {
      const span = alongX ? hz : hx;
      const rh = clamp(span * (b.type === 'old' ? 0.34 : 0.3), 1.2, 3.4);
      b.rh = rh;
      const rf = { col: rcol, lit: 0, su: 1 / 2, sv: 1 / 2, dir: [0, 1, 0] };
      if (b.roof === 'gable' || b.type === 'old') {
        const drop = oh * (rh / span);
        if (alongX) {
          for (const sg of [-1, 1]) addFace(roofB, [W(-hx - oh, yt - drop, sg * (hz + oh)), W(hx + oh, yt - drop, sg * (hz + oh)), W(hx + oh, yt + rh, 0), W(-hx - oh, yt + rh, 0)], rf);
          for (const sg of [-1, 1]) addFace(wallB, [W(sg * hx, yt, -hz), W(sg * hx, yt, hz), W(sg * hx, yt + rh, 0)], { col: wc, lit, su: 1 / 3.2, sv: 1 / 3.0, v0: 0, dir: [sg * c, 0, sg * s] });
        } else {
          for (const sg of [-1, 1]) addFace(roofB, [W(sg * (hx + oh), yt - drop, -hz - oh), W(sg * (hx + oh), yt - drop, hz + oh), W(0, yt + rh, hz + oh), W(0, yt + rh, -hz - oh)], rf);
          for (const sg of [-1, 1]) addFace(wallB, [W(-hx, yt, sg * hz), W(hx, yt, sg * hz), W(0, yt + rh, sg * hz)], { col: wc, lit, su: 1 / 3.2, sv: 1 / 3.0, v0: 0, dir: [-sg * s, 0, sg * c] });
        }
      } else { // padiglione (a quattro falde)
        const lo = Math.max(hx, hz), sh = Math.min(hx, hz), rl = lo - sh, hrh = sh * 0.42; b.rh = hrh;
        const drop = oh * (hrh / sh);
        if (alongX) {
          addFace(roofB, [W(-hx - oh, yt - drop, -hz - oh), W(hx + oh, yt - drop, -hz - oh), W(rl, yt + hrh, 0), W(-rl, yt + hrh, 0)], rf);
          addFace(roofB, [W(-hx - oh, yt - drop, hz + oh), W(hx + oh, yt - drop, hz + oh), W(rl, yt + hrh, 0), W(-rl, yt + hrh, 0)], rf);
          addFace(roofB, [W(-hx - oh, yt - drop, -hz - oh), W(-hx - oh, yt - drop, hz + oh), W(-rl, yt + hrh, 0)], rf);
          addFace(roofB, [W(hx + oh, yt - drop, -hz - oh), W(hx + oh, yt - drop, hz + oh), W(rl, yt + hrh, 0)], rf);
        } else {
          addFace(roofB, [W(-hx - oh, yt - drop, -hz - oh), W(-hx - oh, yt - drop, hz + oh), W(0, yt + hrh, rl), W(0, yt + hrh, -rl)], rf);
          addFace(roofB, [W(hx + oh, yt - drop, -hz - oh), W(hx + oh, yt - drop, hz + oh), W(0, yt + hrh, rl), W(0, yt + hrh, -rl)], rf);
          addFace(roofB, [W(-hx - oh, yt - drop, -hz - oh), W(hx + oh, yt - drop, -hz - oh), W(0, yt + hrh, -rl)], rf);
          addFace(roofB, [W(-hx - oh, yt - drop, hz + oh), W(hx + oh, yt - drop, hz + oh), W(0, yt + hrh, rl)], rf);
        }
      }
      b.top = yt + b.rh;
      // comignolo
      if (rng.f() < 0.5) {
        const px = rng.range(-hx * 0.5, hx * 0.5), pz = rng.range(-hz * 0.5, hz * 0.5), cw = 0.45, ch = b.rh + 1.2;
        const base = yt + (alongX ? (1 - Math.abs(pz) / hz) : (1 - Math.abs(px) / hx)) * b.rh - 0.2;
        const cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let k = 0; k < 4; k++) { const a = cc[k], d = cc[(k + 1) % 4]; addFace(wallB, [W(px + a[0] * cw, base, pz + a[1] * cw), W(px + d[0] * cw, base, pz + d[1] * cw), W(px + d[0] * cw, base + 1.5, pz + d[1] * cw), W(px + a[0] * cw, base + 1.5, pz + a[1] * cw)], { col: [0.75, 0.7, 0.62], su: 1 / 3.2, sv: 1 / 3, dir: [(a[0] + d[0]) * c - (a[1] + d[1]) * s, 0, (a[0] + d[0]) * s + (a[1] + d[1]) * c] }); }
        addFace(wallB, [W(px - cw, base + 1.5, pz - cw), W(px + cw, base + 1.5, pz - cw), W(px + cw, base + 1.5, pz + cw), W(px - cw, base + 1.5, pz + cw)], { col: [0.3, 0.28, 0.26], su: 0.3, sv: 0.3, dir: [0, 1, 0] });
      }
    }
  }

  buildMeshes() {
    const T = this.T, nightU = this.nightU, envI = 0.5;
    const group = new THREE.Group(); group.name = 'buildings';
    for (const b of this.list) this.addGeometry(b);
    const wallMats = [0, 1, 2].map((i) => {
      const t = T['facade' + i];
      const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.nor, normalScale: new THREE.Vector2(1.0, 1.0), vertexColors: true, roughness: 0.93, metalness: 0, emissive: 0xffffff, emissiveMap: t.emi, envMapIntensity: envI });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = nightU;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit; uniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLit * uNight * 2.2;');
      };
      return m;
    });
    const roofMat = new THREE.MeshStandardMaterial({ map: T.roof.map, normalMap: T.roof.nor, normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 0.85, envMapIntensity: envI });
    const flatMat = new THREE.MeshStandardMaterial({ map: T.asphalt.map, normalMap: T.asphalt.nor, vertexColors: true, roughness: 0.95, envMapIntensity: envI * 0.5 });
    for (const [key, B] of this.batches) {
      if (!B.count) continue;
      let m;
      if (key[0] === 'w') m = B.build(wallMats[+key[1]], true);
      else if (key[0] === 'r') m = B.build(roofMat, false);
      else m = B.build(flatMat, false);
      group.add(m);
    }
    this.batches.clear();
    return group;
  }
}
