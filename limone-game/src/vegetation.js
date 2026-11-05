// Vegetazione: ulivi, cipressi, lecci, pini, palme, arbusti, rocce - tutto instanced a celle
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { frame, inland, BOUNDS } from './map.js';
import { RNG, Noise, clamp, smooth, lerp } from './util.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const nz = new Noise(909);
const CELL = 192;

function blob(rx, ry, rz, x, y, z, jit, seed, detail = 1, uvRep = 2) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-3); const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + nz.n(vx * 1.7 + seed, vz * 1.7 + vy * 1.3) * jit;
    p.setXYZ(i, vx * rx * k + x, vy * ry * k + y, vz * rz * k + z);
    uv.setXY(i, uv.getX(i) * uvRep, uv.getY(i) * uvRep);
  }
  g.computeVertexNormals();
  return g;
}
function trunk(r0, r1, h, bend, seed, x = 0, z = 0, segs = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 4, false); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h;
    p.setX(i, p.getX(i) + Math.sin(y * 2.4 + seed) * bend * y + x * y);
    p.setZ(i, p.getZ(i) + Math.cos(y * 2.0 + seed * 1.3) * bend * y * 0.7 + z * y);
  }
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * Math.max(1, h / 2));
  g.computeVertexNormals();
  return g;
}

export class Vegetation {
  constructor(ctx) { Object.assign(this, ctx); this.rng = new RNG(31337); this.cells = new Map(); this.count = 0; }

  makeSpecies() {
    const T = this.T, envI = 0.45, S = {};
    const leafMat = (tex, tint = 0xffffff) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, color: tint, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.8, envMapIntensity: envI });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uniforms.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
          float am = max(position.y, 0.0) * 0.010;
          transformed.x += sin(uTime * 1.5 + ph) * am + sin(uTime * 3.1 + ph * 2.0) * am * 0.3; transformed.z += cos(uTime * 1.2 + ph * 1.4) * am;
        #endif`);
      };
      return m;
    };
    const barkMat = new THREE.MeshStandardMaterial({ map: T.bark.map, normalMap: T.bark.nor, roughness: 0.95, envMapIntensity: envI * 0.6 });
    // ulivo
    const oc = mergeGeometries([ni(blob(1.35, 0.85, 1.25, 0, 3.0, 0, 0.35, 1)), ni(blob(1.0, 0.7, 1.0, 1.0, 2.6, 0.5, 0.35, 2)), ni(blob(1.1, 0.75, 1.0, -0.9, 2.8, -0.6, 0.35, 3)), ni(blob(0.9, 0.65, 0.9, 0.2, 3.7, -0.5, 0.35, 4)), ni(blob(0.8, 0.6, 0.8, -0.3, 2.3, 1.0, 0.3, 5))]);
    const ot = mergeGeometries([ni(trunk(0.3, 0.14, 2.2, 0.25, 1)), ni(trunk(0.16, 0.08, 1.8, 0.4, 2, 0.5, 0.2, 5))].map((g, i) => { if (i) g.translate(0.1, 1.2, 0); return g; }));
    S.olive = { canopy: oc, trunk: ot, cm: leafMat(T.leafOlive), tm: barkMat, r: 0.4, h: 4.6 };
    // leccio / bosco
    const kc = mergeGeometries([ni(blob(2.2, 1.7, 2.1, 0, 5.8, 0, 0.3, 11)), ni(blob(1.7, 1.3, 1.6, 1.4, 4.7, 0.8, 0.3, 12)), ni(blob(1.6, 1.3, 1.6, -1.3, 5.0, -0.9, 0.3, 13)), ni(blob(1.4, 1.1, 1.4, 0.2, 7.3, -0.3, 0.3, 14))]);
    const kt = ni(trunk(0.4, 0.2, 5, 0.25, 3, 0, 0, 7));
    S.oak = { canopy: kc, trunk: kt, cm: leafMat(T.leafOak), tm: barkMat, r: 0.5, h: 9 };
    // cipresso
    const cp = []; const prof = [[0.0, 0], [0.7, 0.6], [0.85, 3], [0.8, 6], [0.62, 9], [0.35, 12], [0.12, 14], [0, 15]];
    const cg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 9);
    { const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + nz.n(p.getX(i) * 2 + 5, p.getY(i) * 0.7) * 0.18; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 7); cg.computeVertexNormals(); }
    S.cypress = { canopy: cg, trunk: null, cm: leafMat(T.leafNeedle, 0xb8c8b0), tm: null, r: 0.5, h: 14 };
    // pino marittimo
    const pc = mergeGeometries([ni(blob(3.8, 1.1, 3.6, 0, 8.6, 0, 0.3, 21)), ni(blob(2.6, 0.9, 2.5, 1.6, 7.5, 1.2, 0.3, 22)), ni(blob(2.4, 0.9, 2.3, -1.8, 7.9, -1.0, 0.3, 23))]);
    S.pine = { canopy: pc, trunk: ni(trunk(0.33, 0.17, 8.5, 0.7, 5, 0.3, 0, 7)), cm: leafMat(T.leafNeedle, 0xd4e0c0), tm: barkMat, r: 0.4, h: 10 };
    // palma
    const fr = []; for (let k = 0; k < 11; k++) {
      const f = new THREE.PlaneGeometry(1.1, 4.4, 1, 6); f.translate(0, 2.2, 0); const p = f.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = y / 4.4; p.setZ(i, p.getZ(i) - t * t * 2.0 - 0.0); p.setX(i, p.getX(i) * (1 - t * 0.7)); }
      f.rotateX(-0.9 + (k % 2) * 0.35); f.rotateY(k * (Math.PI * 2 / 11) + (k % 3) * 0.2); f.translate(0, 8.2, 0);
      const uv = f.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
      fr.push(ni(f));
    }
    S.palm = { canopy: mergeGeometries(fr), trunk: ni(trunk(0.3, 0.2, 8.2, 0.5, 7, 0, 0, 8)), cm: leafMat(T.leafNeedle, 0xc7e0a6), tm: barkMat, r: 0.35, h: 10 };
    // arbusto / oleandro
    S.shrub = { canopy: mergeGeometries([ni(blob(0.8, 0.6, 0.8, 0, 0.5, 0, 0.3, 31)), ni(blob(0.6, 0.5, 0.6, 0.6, 0.4, 0.3, 0.3, 32)), ni(blob(0.55, 0.45, 0.55, -0.5, 0.4, -0.3, 0.3, 33))]), trunk: null, cm: leafMat(T.leafOak, 0xcfe0b0), tm: null, r: 0, h: 1.2 };
    // roccia
    const rg = new THREE.IcosahedronGeometry(1, 2), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 1 + nz.fbm(x * 1.3 + 3, z * 1.3 + y, 3) * 0.55; rp.setXYZ(i, x * k, y * k * 0.7, z * k); }
    rg.computeVertexNormals(); const ruv = rg.attributes.uv; for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 3, ruv.getY(i) * 3);
    S.rock = { canopy: null, trunk: null, rock: rg, rm: new THREE.MeshStandardMaterial({ map: T.rock.map, normalMap: T.rock.nor, roughness: 0.95, envMapIntensity: envI }), r: 1, h: 1 };
    return S;
  }

  add(kind, x, y, z, sc, rot, col, collide = true) {
    const key = Math.floor(x / CELL) + '_' + Math.floor(z / CELL);
    let c = this.cells.get(key); if (!c) { c = {}; this.cells.set(key, c); }
    (c[kind] || (c[kind] = [])).push({ x, y, z, sc, rot, col });
    this.count++;
    if (collide) { const s = this.S[kind]; if (s.r > 0) this.colliders.addCircle(x, z, s.r * Math.max(0.8, sc * 0.55), y + s.h * sc, y - 1); }
  }

  generate() {
    const S = this.S = this.makeSpecies(), rng = this.rng, t = this.terrain, B = this.buildings, q = this.q.trees;
    const clear = (x, z, pad = 3.2) => {
      const fx = (x - BOUNDS.x0) / 2, fz = (z - BOUNDS.z0) / 2;
      if (fx < 1 || fz < 1 || fx > 1150 || fz > 1534) return false;
      const idx = (Math.round(fz) * 1153 + Math.round(fx));
      if (t.rd[idx] < 8.5) return false;
      if (t.pad[idx] > 0.35) return false;
      const nb = B.grid.query(x - 6, z - 6, x + 6, z + 6);
      for (const b of nb) { const dx = x - b.cx, dz = z - b.cz, lx = Math.abs(dx * b.c + dz * b.s), lz = Math.abs(-dx * b.s + dz * b.c); if (lx < b.hx + pad && lz < b.hz + pad) return false; }
      return true;
    };
    const col = (r, g, b) => new THREE.Color(r, g, b);
    // --- uliveti e bosco: griglia con jitter ---
    const sp = 11 / Math.sqrt(q);
    for (let z = BOUNDS.z0 + 20; z < BOUNDS.z1 - 20; z += sp) {
      for (let x = BOUNDS.x0 + 20; x < BOUNDS.x1 - 20; x += sp) {
        const px = x + rng.range(-sp * 0.5, sp * 0.5), pz = z + rng.range(-sp * 0.5, sp * 0.5);
        const d = inland(px, pz); if (d < 6) continue;
        const y = t.heightAt(px, pz);
        if (y < 2.2) continue;
        const slope = t.slopeAt(px, pz);
        if (slope > 1.25) continue;
        const patch = nz.fbm(px * 0.012, pz * 0.012, 3);
        if (!clear(px, pz)) continue;
        // ulivi: fasce basse
        if (d > 24 && d < 300 && y < 110 && slope < 0.7 && patch > -0.1 && rng.f() < 0.72) {
          this.add('olive', px, y - 0.1, pz, rng.range(0.8, 1.35), rng.f() * 6.28, col(rng.range(0.9, 1.1), rng.range(0.95, 1.1), rng.range(0.9, 1.05)));
        } else if (d > 120 && d < 560 && y < 620 && slope < 1.2 && patch > -0.3 && rng.f() < 0.78 * smooth(120, 200, d)) {
          const k = rng.f();
          if (k < 0.62) this.add('oak', px, y - 0.2, pz, rng.range(0.8, 1.5), rng.f() * 6.28, col(rng.range(0.8, 1.0), rng.range(0.85, 1.05), rng.range(0.8, 1.0)));
          else if (k < 0.82) this.add('pine', px, y - 0.2, pz, rng.range(0.8, 1.3), rng.f() * 6.28, col(rng.range(0.85, 1), rng.range(0.9, 1.05), rng.range(0.85, 1)));
          else this.add('cypress', px, y - 0.2, pz, rng.range(0.7, 1.2), 0, col(rng.range(0.8, 1), rng.range(0.9, 1), rng.range(0.8, 1)));
        } else if (d > 10 && d < 140 && slope < 0.6 && rng.f() < 0.12) {
          this.add('shrub', px, y, pz, rng.range(0.8, 1.6), rng.f() * 6.28, col(rng.range(0.7, 1), rng.range(0.9, 1.1), rng.range(0.6, 1)), false);
        }
      }
    }
    // --- cipressi e pini vicino alle case ---
    for (const b of B.list) {
      if (b.type === 'old') continue;
      const n = rng.int(0, 3);
      for (let k = 0; k < n; k++) {
        const a = rng.f() * 6.28, r = Math.hypot(b.hx, b.hz) + rng.range(2, 9);
        const px = b.cx + Math.cos(a) * r, pz = b.cz + Math.sin(a) * r;
        if (!clear(px, pz, 1.6)) continue;
        const y = t.heightAt(px, pz); if (y < 2) continue;
        const kk = rng.f();
        this.add(kk < 0.5 ? 'cypress' : kk < 0.75 ? 'pine' : 'olive', px, y, pz, rng.range(0.8, 1.3), rng.f() * 6.28, col(1, 1, 1));
      }
    }
    // --- palme e pini lungo lungolago e strade del centro ---
    for (const r of this.roads.roads) {
      if (!['R2', 'R2b', 'R2c', 'R3b', 'R4', 'R5'].includes(r.id)) continue;
      for (let s = 8; s < r.len - 8; s += rng.range(16, 28)) {
        const P = r.path[Math.min(r.path.length - 1, Math.round(s / 1.5))];
        const side = rng.f() < 0.6 ? -1 : 1;
        const off = r.hw + 3.6, px = P.x + -P.tz * side * off, pz = P.z + P.tx * side * off;
        if (!clear(px, pz, 1.2)) continue;
        const y = t.heightAt(px, pz);
        if (y < 1.2) continue;
        this.add(rng.f() < 0.55 ? 'palm' : 'pine', px, y, pz, rng.range(0.85, 1.3), rng.f() * 6.28, col(1, 1, 1));
      }
    }
    // --- oleandri lungo la riva ---
    for (let k = 0; k < 260 * q; k++) {
      const z = rng.range(BOUNDS.z0 + 40, BOUNDS.z1 - 40), [x] = frame(z, rng.range(5, 22));
      if (!clear(x, z, 1)) continue; const y = t.heightAt(x, z); if (y < 1.6 || y > 6) continue;
      this.add('shrub', x, y, z, rng.range(0.8, 1.5), rng.f() * 6.28, rng.f() < 0.35 ? col(1.4, 0.75, 0.95) : col(0.8, 1, 0.7), false);
    }
    // --- rocce sui pendii ---
    for (let k = 0; k < 2600 * q; k++) {
      const x = rng.range(BOUNDS.x0 + 30, BOUNDS.x1 - 30), z = rng.range(BOUNDS.z0 + 30, BOUNDS.z1 - 30);
      const d = inland(x, z); if (d < 20 || d > 700) continue;
      const y = t.heightAt(x, z), slope = t.slopeAt(x, z);
      if (y < 3 || slope < 0.35) continue;
      if (!clear(x, z, 1)) continue;
      const sc = rng.range(0.8, 3.2) * (0.6 + 0.4 * rng.f());
      this.add('rock', x, y + sc * 0.1, z, sc, rng.f() * 6.28, col(rng.range(0.85, 1.05), rng.range(0.85, 1.05), rng.range(0.85, 1.05)), sc > 1.7);
      this.cells.get(Math.floor(x / CELL) + '_' + Math.floor(z / CELL)).rock.at(-1).tilt = rng.range(-0.3, 0.3);
    }
  }

  buildMeshes() {
    const S = this.S, group = new THREE.Group(); group.name = 'vegetation';
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (const [key, cell] of this.cells) {
      for (const kind in cell) {
        const arr = cell[kind], sp = S[kind];
        const make = (geo, mat, withColor, cast) => {
          const im = new THREE.InstancedMesh(geo, mat, arr.length);
          for (let i = 0; i < arr.length; i++) {
            const a = arr[i];
            e.set(a.tilt || 0, a.rot, a.tilt ? -a.tilt : 0); q4.setFromEuler(e);
            m4.compose(v3.set(a.x, a.y, a.z), q4, s3.set(a.sc, a.sc * (kind === 'rock' ? 0.8 : 1), a.sc));
            im.setMatrixAt(i, m4);
            if (withColor) im.setColorAt(i, a.col);
          }
          im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.computeBoundingSphere(); im.castShadow = cast; im.receiveShadow = true; im.matrixAutoUpdate = false;
          return im;
        };
        if (kind === 'rock') group.add(make(sp.rock, sp.rm, true, true));
        else {
          if (sp.canopy) group.add(make(sp.canopy, sp.cm, true, kind !== 'shrub'));
          if (sp.trunk) group.add(make(sp.trunk, sp.tm, false, true));
        }
      }
    }
    return group;
  }
}
