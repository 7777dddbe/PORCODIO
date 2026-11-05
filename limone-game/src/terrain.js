// Terreno: griglia di altezze 2 m, strade appiattite, piazzali, chunk con LOD, shader PBR a strati
import * as THREE from 'three';
import { BOUNDS, CELL, baseHeight, beachMask, shoreX, harborMask } from './map.js';
import { clamp, lerp, smooth, Noise } from './util.js';

export const CHUNK = 128;
export const NX = (BOUNDS.x1 - BOUNDS.x0) / CELL;
export const NZ = (BOUNDS.z1 - BOUNDS.z0) / CELL;
const STRIDE = NX + 1;
const nz = new Noise(555);
const tick = () => new Promise((r) => setTimeout(r, 0));

export class Terrain {
  constructor() {
    this.H = new Float32Array((NX + 1) * (NZ + 1));
    this.rd = new Float32Array((NX + 1) * (NZ + 1)).fill(1e9); // distanza dalla strada
    this.pad = new Float32Array((NX + 1) * (NZ + 1)); // piazzali (0..1)
    this.padKind = new Uint8Array((NX + 1) * (NZ + 1)); // 1 = pavimentato, 2 = ghiaia/terra, 3 = prato curato
    this.geoCache = new Map();
    this.chunks = [];
  }

  async bake(roadNet, progress) {
    const { H } = this;
    for (let j = 0; j <= NZ; j++) {
      const z = BOUNDS.z0 + j * CELL;
      for (let i = 0; i <= NX; i++) H[j * STRIDE + i] = baseHeight(BOUNDS.x0 + i * CELL, z);
      if (j % 96 === 0) { progress && progress(j / NZ * 0.7); await tick(); }
    }
    // strade: il terreno si appiattisce al livello stradale con scarpate
    const rdY = new Float32Array(H.length), rdW = new Float32Array(H.length);
    for (const r of roadNet.roads) {
      const hw = r.hw + (r.sidewalk ? 1.6 : 0), sh = r.kind === 'lane' ? 7 : 11, R = hw + sh;
      const P = r.path;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        const i0 = Math.max(0, Math.floor((p.x - R - BOUNDS.x0) / CELL)), i1 = Math.min(NX, Math.ceil((p.x + R - BOUNDS.x0) / CELL));
        const j0 = Math.max(0, Math.floor((p.z - R - BOUNDS.z0) / CELL)), j1 = Math.min(NZ, Math.ceil((p.z + R - BOUNDS.z0) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = BOUNDS.x0 + i * CELL - p.x, dz = BOUNDS.z0 + j * CELL - p.z, d = Math.hypot(dx, dz);
          const idx = j * STRIDE + i;
          if (d < this.rd[idx]) { this.rd[idx] = d; rdY[idx] = p.y; rdW[idx] = hw; }
        }
      }
    }
    for (let idx = 0; idx < H.length; idx++) {
      const d = this.rd[idx]; if (d > 40) continue;
      const hw = rdW[idx]; if (!hw) continue;
      const sh = hw > 5.5 ? 11 : 8;
      if (d < hw + sh) {
        const t = smooth(hw + 0.4, hw + sh, d);
        H[idx] = lerp(rdY[idx] - 0.02 * (d > hw ? 1 : 0), H[idx], t);
      }
    }
    progress && progress(0.9);
    await tick();
  }

  // piazzale piano (rettangolo orientato) a quota y, con raccordo
  stampPad(cx, cz, hx, hz, yaw, y, margin = 3.5, kind = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw), R = Math.hypot(hx, hz) + margin + 1;
    const i0 = Math.max(0, Math.floor((cx - R - BOUNDS.x0) / CELL)), i1 = Math.min(NX, Math.ceil((cx + R - BOUNDS.x0) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R - BOUNDS.z0) / CELL)), j1 = Math.min(NZ, Math.ceil((cz + R - BOUNDS.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = BOUNDS.x0 + i * CELL - cx, wz = BOUNDS.z0 + j * CELL - cz;
      const lx = wx * c + wz * s, lz = -wx * s + wz * c;
      const dx = Math.abs(lx) - hx, dz = Math.abs(lz) - hz;
      const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
      if (d > margin) continue;
      const idx = j * STRIDE + i;
      if (this.rd[idx] < 5.5) continue;
      const w = d <= 0 ? 1 : 1 - smooth(0, margin, d);
      this.H[idx] = lerp(this.H[idx], y, w);
      if (w > this.pad[idx]) { this.pad[idx] = w; if (w > 0.5) this.padKind[idx] = kind; }
    }
  }
  stampCircle(cx, cz, r, y, margin = 4, kind = 1) {
    const R = r + margin;
    const i0 = Math.max(0, Math.floor((cx - R - BOUNDS.x0) / CELL)), i1 = Math.min(NX, Math.ceil((cx + R - BOUNDS.x0) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R - BOUNDS.z0) / CELL)), j1 = Math.min(NZ, Math.ceil((cz + R - BOUNDS.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(BOUNDS.x0 + i * CELL - cx, BOUNDS.z0 + j * CELL - cz) - r;
      if (d > margin) continue;
      const idx = j * STRIDE + i;
      if (this.rd[idx] < 5.5) continue;
      const w = d <= 0 ? 1 : 1 - smooth(0, margin, d);
      this.H[idx] = lerp(this.H[idx], y, w);
      if (w > this.pad[idx]) { this.pad[idx] = w; if (w > 0.5) this.padKind[idx] = kind; }
    }
  }
  // striscia rialzata (molo, banchina)
  stampStrip(pts, width, y, kind = 1) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(L / 1.0);
      for (let q = 0; q <= n; q++) {
        const x = lerp(a.x, b.x, q / n), z = lerp(a.z, b.z, q / n), R = width / 2 + 1.5;
        const i0 = Math.floor((x - R - BOUNDS.x0) / CELL), i1 = Math.ceil((x + R - BOUNDS.x0) / CELL), j0 = Math.floor((z - R - BOUNDS.z0) / CELL), j1 = Math.ceil((z + R - BOUNDS.z0) / CELL);
        for (let j = Math.max(0, j0); j <= Math.min(NZ, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NX, i1); i++) {
          const d = Math.hypot(BOUNDS.x0 + i * CELL - x, BOUNDS.z0 + j * CELL - z);
          if (d < width / 2 + 0.8) { const idx = j * STRIDE + i; this.H[idx] = Math.max(this.H[idx], y); this.pad[idx] = 1; this.padKind[idx] = kind; this.rd[idx] = Math.min(this.rd[idx], 99); }
        }
      }
    }
  }

  // ---------- query ----------
  heightAt(x, z) {
    const fx = (x - BOUNDS.x0) / CELL, fz = (z - BOUNDS.z0) / CELL;
    if (fx < 0 || fz < 0 || fx >= NX || fz >= NZ) return baseHeight(x, z);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * STRIDE + i, H = this.H;
    if (tx + tz <= 1) return H[k] + (H[k + 1] - H[k]) * tx + (H[k + STRIDE] - H[k]) * tz;
    return H[k + STRIDE + 1] + (H[k + STRIDE] - H[k + STRIDE + 1]) * (1 - tx) + (H[k + 1] - H[k + STRIDE + 1]) * (1 - tz);
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) { const e = 1.5; return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e); }
  nodeNormal(i, j, out) {
    const H = this.H, il = Math.max(0, i - 1), ir = Math.min(NX, i + 1), jl = Math.max(0, j - 1), jr = Math.min(NZ, j + 1);
    const hx = (H[j * STRIDE + ir] - H[j * STRIDE + il]) / ((ir - il) * CELL), hz = (H[jr * STRIDE + i] - H[jl * STRIDE + i]) / ((jr - jl) * CELL);
    const l = Math.hypot(hx, 1, hz); out[0] = -hx / l; out[1] = 1 / l; out[2] = -hz / l;
  }

  // ---------- texture di supporto (splat + profondità) ----------
  buildMasks() {
    const SW = NX / 2, SH = NZ / 2;
    const splat = new Uint8Array(SW * SH * 4), depth = new Uint8Array(SW * SH * 4);
    const H = this.H;
    for (let j = 0; j < SH; j++) {
      const z = BOUNDS.z0 + (j + 0.5) * 4, bm = beachMask(z), sx = shoreX(z), hm = harborMask(z);
      for (let i = 0; i < SW; i++) {
        const x = BOUNDS.x0 + (i + 0.5) * 4, ii = i * 2, jj = j * 2, idx = jj * STRIDE + ii;
        const y = (H[idx] + H[idx + 1] + H[idx + STRIDE] + H[idx + STRIDE + 1]) * 0.25;
        const d = sx - x, o = (j * SW + i) * 4;
        // sassi/ghiaia: spiagge e fondale basso
        let r = Math.max(bm * smooth(4.5, 1.0, y) * smooth(-30, 0, d + 40), smooth(1.2, -0.2, y));
        if (d < 0) r = Math.max(r, 0.7);
        // pavimentazione: lungolago, centro storico, piazzali
        let g = 0;
        const oldTown = smooth(-875, -845, z) * (1 - smooth(-625, -600, z)) * smooth(-2, 6, d) * (1 - smooth(95, 130, d));
        g = Math.max(g, oldTown * 0.95);
        const promen = smooth(-880, -850, z) * (1 - smooth(-420, -400, z)) * smooth(-1, 1.2, d) * (1 - smooth(5, 10, d)) * (1 - bm);
        g = Math.max(g, promen, hm * smooth(-1, 1, d) * (1 - smooth(14, 26, d)));
        const pk = this.pad[idx];
        if (pk > 0) { const kind = this.padKind[idx]; if (kind === 1) g = Math.max(g, pk * 0.5); }
        // coltivato / uliveto
        const farm = smooth(18, 50, d) * (1 - smooth(280, 340, d)) * smooth(0.0, 0.5, nz.fbm(x * 0.006, z * 0.006, 3) + 0.15);
        let b = farm;
        if (pk > 0 && this.padKind[idx] === 2) b = Math.max(b, pk);
        // bosco in alto
        const forest = smooth(150, 300, d) * (1 - smooth(900, 1300, y)) * smooth(-0.1, 0.4, nz.fbm(x * 0.004 + 9, z * 0.004, 3));
        const a = forest;
        splat[o] = r * 255; splat[o + 1] = g * 255; splat[o + 2] = b * 255; splat[o + 3] = a * 255;
        depth[o] = clamp(-y / 14, 0, 1) * 255; depth[o + 1] = pk * 255; depth[o + 2] = 0; depth[o + 3] = 255;
      }
    }
    const mk = (data) => { const t = new THREE.DataTexture(data, SW, SH, THREE.RGBAFormat, THREE.UnsignedByteType); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t; };
    this.splatTex = mk(splat); this.depthTex = mk(depth);
  }

  // ---------- geometria chunk ----------
  chunkGeo(cx, cz, lod) {
    const key = cx + ',' + cz + ',' + lod;
    let g = this.geoCache.get(key); if (g) return g;
    const segs = CHUNK / CELL >> lod, step = CELL << lod, vN = segs + 1;
    const i0 = cx * (CHUNK / CELL), j0 = cz * (CHUNK / CELL);
    const total = vN * vN + 4 * vN;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), nv = [0, 0, 0];
    let p = 0;
    const put = (i, j, drop) => {
      const gi = Math.min(NX, i0 + i * (1 << lod)), gj = Math.min(NZ, j0 + j * (1 << lod));
      this.nodeNormal(gi, gj, nv);
      pos[p * 3] = i * step; pos[p * 3 + 1] = this.H[gj * STRIDE + gi] - drop; pos[p * 3 + 2] = j * step;
      nor[p * 3] = nv[0]; nor[p * 3 + 1] = nv[1]; nor[p * 3 + 2] = nv[2]; p++;
    };
    for (let j = 0; j < vN; j++) for (let i = 0; i < vN; i++) put(i, j, 0);
    const skirt = 14;
    const sk = [];
    for (let i = 0; i < vN; i++) { sk.push(p); put(i, 0, skirt); }
    for (let i = 0; i < vN; i++) { sk.push(p); put(i, segs, skirt); }
    for (let j = 0; j < vN; j++) { sk.push(p); put(0, j, skirt); }
    for (let j = 0; j < vN; j++) { sk.push(p); put(segs, j, skirt); }
    const idx = [];
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a = j * vN + i, b = a + 1, c = a + vN, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // gonne (nascondono le fessure tra LOD diversi)
    const sA = sk[0], sB = sk[vN], sC = sk[2 * vN], sD = sk[3 * vN];
    for (let i = 0; i < segs; i++) {
      idx.push(i, sA + i, i + 1, i + 1, sA + i, sA + i + 1);
      const t0 = segs * vN + i; idx.push(t0, t0 + 1, sB + i, t0 + 1, sB + i + 1, sB + i);
      const l0 = i * vN; idx.push(l0, l0 + vN, sC + i, l0 + vN, sC + i + 1, sC + i);
      const r0 = i * vN + segs; idx.push(r0, sD + i, r0 + vN, r0 + vN, sD + i, sD + i + 1);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    this.geoCache.set(key, g);
    return g;
  }

  buildMeshes(material) {
    const group = new THREE.Group(); group.name = 'terrain';
    const cxN = (BOUNDS.x1 - BOUNDS.x0) / CHUNK, czN = (BOUNDS.z1 - BOUNDS.z0) / CHUNK;
    for (let cz = 0; cz < czN; cz++) for (let cx = 0; cx < cxN; cx++) {
      const m = new THREE.Mesh(this.chunkGeo(cx, cz, 3), material);
      m.position.set(BOUNDS.x0 + cx * CHUNK, 0, BOUNDS.z0 + cz * CHUNK);
      m.receiveShadow = true; m.castShadow = false;
      m.userData = { cx, cz, lod: 3, mx: m.position.x + CHUNK / 2, mz: m.position.z + CHUNK / 2 };
      this.chunks.push(m); group.add(m);
    }
    this.group = group;
    return group;
  }

  updateLOD(px, pz, lodScale = 1) {
    let built = 0;
    for (const m of this.chunks) {
      const u = m.userData, d = Math.hypot(u.mx - px, u.mz - pz) - CHUNK * 0.7;
      const s = lodScale;
      const lod = d < 170 * s ? 0 : d < 400 * s ? 1 : d < 850 * s ? 2 : 3;
      if (lod !== u.lod) {
        if (built > 3 && lod < u.lod) continue; // limita lavoro per frame
        m.geometry = this.chunkGeo(u.cx, u.cz, lod); u.lod = lod; built++;
      }
    }
  }
}

// ---------- terreno lontano (montagne all'orizzonte) ----------
export function buildFarTerrain(material) {
  const X0 = -3200, X1 = 5600, Z0 = -6000, Z1 = 6500, S = 28;
  const nx = Math.ceil((X1 - X0) / S), nzz = Math.ceil((Z1 - Z0) / S), vN = nx + 1;
  const pos = new Float32Array(vN * (nzz + 1) * 3), nor = new Float32Array(vN * (nzz + 1) * 3);
  const hs = new Float32Array(vN * (nzz + 1));
  for (let j = 0; j <= nzz; j++) for (let i = 0; i <= nx; i++) hs[j * vN + i] = baseHeight(X0 + i * S, Z0 + j * S);
  for (let j = 0; j <= nzz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * vN + i, hx = (hs[j * vN + Math.min(nx, i + 1)] - hs[j * vN + Math.max(0, i - 1)]) / (2 * S), hz = (hs[Math.min(nzz, j + 1) * vN + i] - hs[Math.max(0, j - 1) * vN + i]) / (2 * S);
    const l = Math.hypot(hx, 1, hz);
    pos[k * 3] = X0 + i * S; pos[k * 3 + 1] = hs[k] - 1.2; pos[k * 3 + 2] = Z0 + j * S;
    nor[k * 3] = -hx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -hz / l;
  }
  const idx = [];
  const hx0 = BOUNDS.x0 - 40, hx1 = BOUNDS.x1 + 40, hz0 = BOUNDS.z0 - 40, hz1 = BOUNDS.z1 + 40;
  for (let j = 0; j < nzz; j++) for (let i = 0; i < nx; i++) {
    const cx = X0 + (i + 0.5) * S, cz = Z0 + (j + 0.5) * S;
    if (cx > hx0 && cx < hx1 && cz > hz0 && cz < hz1) continue; // buco dove c'è il terreno vicino
    const a = j * vN + i, b = a + 1, c = a + vN, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material); m.frustumCulled = false; m.name = 'far-terrain';
  return m;
}

// ---------- materiale ----------
export function makeTerrainMaterial(T, terrain, uniforms, envI = 0.5) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: envI });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, {
      tGrass: { value: T.grass.map }, nGrass: { value: T.grass.nor }, tRock: { value: T.rock.map }, nRock: { value: T.rock.nor },
      tPebble: { value: T.pebble.map }, nPebble: { value: T.pebble.nor }, tDirt: { value: T.dirt.map }, tCobble: { value: T.cobble.map }, nCobble: { value: T.cobble.nor },
      tSplat: { value: terrain.splatTex }, tDepth: { value: terrain.depthTex },
      uBounds: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN;
uniform sampler2D tGrass, nGrass, tRock, nRock, tPebble, nPebble, tDirt, tCobble, nCobble, tSplat, tDepth;
uniform vec4 uBounds; uniform float uWet;
vec3 gWorldN; vec3 gDetail;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
vec3 sampleTri(sampler2D t, vec3 p, vec3 w, float s){ return texture2D(t, p.zy*s).rgb*w.x + texture2D(t, p.xz*s).rgb*w.y + texture2D(t, p.xy*s).rgb*w.z; }
`)
      .replace('#include <map_fragment>', `
      vec3 N0 = normalize(vWN);
      vec2 suv = (vWP.xz - uBounds.xy) / uBounds.zw;
      float inB = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
      vec4 sp = texture2D(tSplat, clamp(suv, 0.0, 1.0)) * inB;
      float nlow = vnoise(vWP.xz * 0.03), nmid = vnoise(vWP.xz * 0.2), nhi = vnoise(vWP.xz * 1.3);
      float slope = 1.0 - N0.y;
      float h = vWP.y;
      // roccia: pendenza + quota, bordo rotto dal rumore
      float rockAmt = smoothstep(0.17, 0.36, slope + (nmid - 0.5) * 0.12 + (nlow-0.5) * 0.1) + smoothstep(550.0, 900.0, h + nlow * 160.0) * 0.8;
      rockAmt = clamp(rockAmt, 0.0, 1.0);
      vec3 tw = pow(abs(N0), vec3(6.0)); tw /= (tw.x + tw.y + tw.z);
      vec3 rk = sampleTri(tRock, vWP, tw, 0.11) * sampleTri(tRock, vWP, tw, 0.021) * 2.6;
      float streak = vnoise(vec2((vWP.x + vWP.z) * 0.05, vWP.y * 0.014)) * 0.6 + vnoise(vec2((vWP.x - vWP.z) * 0.17, vWP.y * 0.05)) * 0.4;
      rk *= mix(0.55, 1.25, streak);
      rk = mix(rk, vec3(dot(rk, vec3(0.333))) * vec3(1.0, 0.98, 0.95), 0.5);
      float moss = smoothstep(0.5, 0.78, vnoise(vWP.xz * 0.02 + vWP.y * 0.012)) * (1.0 - smoothstep(0.28, 0.55, slope));
      rk = mix(rk, vec3(0.2, 0.27, 0.13) * (0.7 + 0.6 * nhi), moss * 0.75);
      vec3 gr1 = texture2D(tGrass, vWP.xz * 0.35).rgb, gr2 = texture2D(tGrass, vWP.xz * 0.05).rgb;
      vec3 gr = gr1 * (0.55 + gr2 * 1.5);
      vec3 dt = texture2D(tDirt, vWP.xz * 0.25).rgb * texture2D(tDirt, vWP.xz * 0.04).rgb * 2.4;
      vec3 pb = texture2D(tPebble, vWP.xz * 0.9).rgb * (0.8 + 0.4 * texture2D(tPebble, vWP.xz * 0.07).r);
      vec3 cb = texture2D(tCobble, vWP.xz * 0.45).rgb * 0.8;
      // tinte mediterranee: erba più secca in basso e a sud, uliveto, bosco scuro
      float glum = dot(gr, vec3(0.333));
      vec3 dryC = glum * vec3(1.9, 1.6, 0.95);
      vec3 base = mix(gr * vec3(1.0, 1.1, 0.85), dryC, smoothstep(0.35, 0.8, nlow));
      base = mix(base, dt * vec3(1.0, 0.95, 0.85), sp.b * 0.55 * smoothstep(0.2, 0.6, nmid));
      base = mix(base, gr * vec3(0.32, 0.45, 0.28), sp.a * 0.8);
      base = mix(base, rk, rockAmt);
      // neve in quota
      float snow = smoothstep(1650.0, 2150.0, h + (nlow - 0.5) * 260.0) * smoothstep(0.55, 0.15, slope + (nmid-0.5)*0.2);
      base = mix(base, vec3(0.78, 0.82, 0.88), snow);
      base = mix(base, pb, sp.r);
      base = mix(base, cb, sp.g);
      float depthM = texture2D(tDepth, clamp(suv, 0.0, 1.0)).r * 14.0 * inB;
      float under = smoothstep(0.0, 1.0, -vWP.y);
      base *= mix(1.0, 0.55, under * 0.7);
      base *= 0.92 + 0.16 * nhi;
      float nearK = 1.0 - smoothstep(8.0, 55.0, length(vWP - cameraPosition));
      vec3 g3 = texture2D(tGrass, vWP.xz * 2.3).rgb;
      base *= mix(1.0, 0.62 + 1.1 * g3.g, nearK * (1.0 - rockAmt) * (1.0 - sp.g) * (1.0 - sp.r));
      diffuseColor.rgb = base;
      float rg = clamp(rockAmt, 0.0, 1.0);
      `)
      .replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      {
        vec3 dn = vec3(0.0);
        vec3 ng = texture2D(nGrass, vWP.xz * 0.35).rgb * 2.0 - 1.0;
        vec3 ngp = texture2D(nPebble, vWP.xz * 0.9).rgb * 2.0 - 1.0;
        vec3 nc = texture2D(nCobble, vWP.xz * 0.45).rgb * 2.0 - 1.0;
        vec3 ng3 = texture2D(nGrass, vWP.xz * 2.3).rgb * 2.0 - 1.0;
        vec2 gxz = (ng.xy + ng3.xy * nearK * 1.2) * (1.0 - rockAmt) + ngp.xy * sp.r * 1.1 + nc.xy * sp.g * 0.9;
        // roccia triplanare (versione leggera: due piani)
        vec3 nrx = texture2D(nRock, vWP.zy * 0.11).rgb * 2.0 - 1.0;
        vec3 nrz = texture2D(nRock, vWP.xy * 0.11).rgb * 2.0 - 1.0;
        vec3 nry = texture2D(nRock, vWP.xz * 0.11).rgb * 2.0 - 1.0;
        vec3 wn = vec3(0.0);
        wn += vec3(0.0, nrx.y, nrx.x) * tw.x; wn += vec3(nry.x, 0.0, nry.y) * tw.y; wn += vec3(nrz.x, nrz.y, 0.0) * tw.z;
        vec3 wd = vec3(gxz.x, 0.0, gxz.y) * (1.0 - rockAmt) + wn * rockAmt * 1.3;
        vec3 wdv = (viewMatrix * vec4(wd, 0.0)).xyz;
        normal = normalize(normal + wdv * 0.9);
      }
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.95, 0.75, sp.g) * mix(1.0, 0.65, sp.r);`);
  };
  return mat;
}
