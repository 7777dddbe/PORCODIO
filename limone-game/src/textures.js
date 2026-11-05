// Texture procedurali (albedo + normal) generate al volo: niente file esterni
import * as THREE from 'three';
import { Noise, clamp, smooth, lerp, mulberry32 } from './util.js';

const NZ = new Noise(2024);
let ANISO = 8;
export const setAniso = (a) => { ANISO = a; };

function h2(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
function worley(px, py, N, seed = 0) {
  const x = px * N, y = py * N, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
    const dx = cx + h2(wx, wy, seed) - x, dy = cy + h2(wx, wy, seed + 17) - y, d = dx * dx + dy * dy;
    if (d < f1) { f2 = f1; f1 = d; id = h2(wx, wy, seed + 3); bx = dx; by = dy; } else if (d < f2) f2 = d;
  }
  W.f1 = Math.sqrt(f1); W.f2 = Math.sqrt(f2); W.id = id; W.dx = bx; W.dy = by;
  return W;
}

export function mkTex(data, w, h, o = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = o.nomip ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !o.nomip;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}
function normalData(hgt, w, h, str) {
  const n = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
    const d = hgt[((y - 1 + h) % h) * w + x], u = hgt[((y + 1) % h) * w + x];
    const dx = (l - r) * str, dy = (d - u) * str, len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    n[i] = (dx / len * 0.5 + 0.5) * 255; n[i + 1] = (dy / len * 0.5 + 0.5) * 255; n[i + 2] = (1 / len * 0.5 + 0.5) * 255; n[i + 3] = 255;
  }
  return n;
}
const normTex = (hgt, w, h, str) => mkTex(normalData(hgt, w, h, str), w, h, { linear: true });

function canvasData(cv) {
  const w = cv.width, h = cv.height, src = cv.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const set = (d, i, r, g, b, a = 255) => { d[i] = clamp(r, 0, 1) * 255; d[i + 1] = clamp(g, 0, 1) * 255; d[i + 2] = clamp(b, 0, 1) * 255; d[i + 3] = a; };

// ---------- terreno ----------
function grass() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const a = NZ.tfbm(u * 4, v * 4, 4, 4) * 0.5 + 0.5;
    const dry = smooth(0.35, 0.7, NZ.tfbm(u * 3 + 9, v * 3 + 4, 3, 3) * 0.5 + 0.5);
    const bl = NZ.t(u * 96, v * 24, 96) * 0.5 + 0.5, bl2 = NZ.t(u * 180 + 3, v * 60, 180) * 0.5 + 0.5;
    const f = 0.7 + 0.5 * bl * 0.6 + 0.35 * bl2;
    let r = lerp(0.18, 0.34, a), gg = lerp(0.26, 0.45, a), b = lerp(0.08, 0.14, a);
    r = lerp(r, 0.46, dry * 0.6); gg = lerp(gg, 0.40, dry * 0.5); b = lerp(b, 0.18, dry * 0.4);
    set(d, (y * S + x) * 4, r * f, gg * f, b * f);
    hg[y * S + x] = bl * 0.7 + bl2 * 0.3;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 1.6) };
}
function rock() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = NZ.tfbm(u * 6, v * 6, 6, 5) * 0.5 + 0.5;
    const band = Math.sin((v * 7 + NZ.tfbm(u * 2, v * 2, 2, 3) * 0.7) * Math.PI * 2) * 0.5 + 0.5;
    const wl = worley(u, v, 9, 5);
    const crack = 1 - smooth(0.0, 0.07, wl.f2 - wl.f1);
    const wl2 = worley(u, v, 22, 9);
    const crack2 = 1 - smooth(0.0, 0.05, wl2.f2 - wl2.f1);
    const lichen = smooth(0.62, 0.8, NZ.tfbm(u * 8 + 3, v * 8, 8, 3) * 0.5 + 0.5);
    let c = 0.48 + 0.2 * f + 0.06 * band;
    let r = c * 1.0, g = c * 0.97, b = c * 0.92;
    r = lerp(r, 0.4, lichen * 0.25); g = lerp(g, 0.41, lichen * 0.25); b = lerp(b, 0.34, lichen * 0.25);
    const k = 1 - crack * 0.6 - crack2 * 0.25;
    set(d, (y * S + x) * 4, r * k, g * k, b * k);
    hg[y * S + x] = f * 0.6 + band * 0.1 - crack * 0.7 - crack2 * 0.2 + wl.id * 0.1;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 3.2) };
}
function pebble() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  const pal = [[0.78, 0.76, 0.7], [0.7, 0.64, 0.54], [0.52, 0.52, 0.52], [0.34, 0.34, 0.36], [0.62, 0.5, 0.4], [0.86, 0.84, 0.8]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const w = worley(u, v, 26, 11);
    const c = pal[Math.floor(w.id * pal.length) % pal.length];
    const rr = 0.55 / 26 * 1.1;
    const dome = Math.sqrt(Math.max(0, 1 - (w.f1 / rr) * (w.f1 / rr)));
    const gap = 1 - smooth(0.0, 0.035, (w.f2 - w.f1));
    const n = NZ.tfbm(u * 40, v * 40, 40, 3) * 0.1;
    const k = (0.65 + 0.4 * dome + n) * (1 - gap * 0.55);
    set(d, (y * S + x) * 4, c[0] * k, c[1] * k, c[2] * k);
    hg[y * S + x] = dome * 1.0 - gap * 0.6;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 2.6) };
}
function dirt() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = NZ.tfbm(u * 5, v * 5, 5, 5) * 0.5 + 0.5, fine = NZ.t(u * 120, v * 120, 120) * 0.5 + 0.5;
    const w = worley(u, v, 30, 21);
    const st = smooth(0.18, 0.03, w.f1) * (w.id > 0.7 ? 1 : 0);
    const k = 0.7 + 0.5 * f + 0.2 * fine + st * 0.3;
    set(d, (y * S + x) * 4, 0.39 * k, 0.3 * k, 0.21 * k);
    hg[y * S + x] = f * 0.5 + fine * 0.35 + st * 0.5;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 2.0) };
}
function cobble() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S), rows = 8, cols = 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / (S / rows)); const off = (row % 2) * 0.5;
    const cx = (x / (S / cols) + off); const col = Math.floor(cx);
    const fx = cx - col, fy = (y % (S / rows)) / (S / rows);
    const id = h2(col & 3, row, 77);
    const e = Math.min(fx, 1 - fx, fy * 0.5, (1 - fy) * 0.5) * 2;
    const joint = 1 - smooth(0.0, 0.07, e);
    const n = NZ.tfbm(x / S * 18, y / S * 18, 18, 3) * 0.5 + 0.5;
    const tone = 0.52 + id * 0.22 + n * 0.14;
    const k = tone * (1 - joint * 0.55);
    set(d, (y * S + x) * 4, k * 1.0, k * 0.96, k * 0.88);
    hg[y * S + x] = smooth(0, 0.14, e) * (0.7 + 0.3 * n) - joint * 0.3;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 3.0) };
}
function stoneWall() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const w = worley(u, v, 8, 31);
    // celle allungate in orizzontale
    const w2 = worley((u * 2) % 1, (v) % 1, 8, 33);
    const e = w2.f2 - w2.f1;
    const joint = 1 - smooth(0.0, 0.08, e);
    const n = NZ.tfbm(u * 12, v * 12, 12, 4) * 0.5 + 0.5;
    const t = 0.5 + w2.id * 0.25 + n * 0.12;
    const k = t * (1 - joint * 0.6);
    set(d, (y * S + x) * 4, k * 1.0, k * 0.93, k * 0.82);
    hg[y * S + x] = smooth(0, 0.12, e) * (0.6 + 0.4 * n) - joint * 0.4;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 3.4) };
}
function asphaltBase(S) {
  const d = new Float32Array(S * S * 3), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = NZ.tfbm(u * 6, v * 6, 6, 4) * 0.5 + 0.5, sp = NZ.t(u * 160, v * 160, 160) * 0.5 + 0.5, sp2 = h2(x, y, 5);
    const k = 0.17 + 0.05 * f + 0.05 * sp + (sp2 > 0.985 ? 0.12 : 0);
    const i = (y * S + x) * 3; d[i] = k; d[i + 1] = k; d[i + 2] = k * 1.04;
    hg[y * S + x] = sp * 0.6 + f * 0.4;
  }
  return { d, hg };
}
function asphalt() {
  const S = 512, { d, hg } = asphaltBase(S), o = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) set(o, i * 4, d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
  return { map: mkTex(o, S, S), nor: normTex(hg, S, S, 1.2) };
}
// strisce stradali: u = traverso (0..1), v = lungo (12 m per tile)
function roadTex(kind) {
  const S = 512, { d, hg } = asphaltBase(S), o = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    let r = d[(y * S + x) * 3], g = d[(y * S + x) * 3 + 1], b = d[(y * S + x) * 3 + 2];
    let paint = 0, yel = 0;
    const wear = 0.65 + 0.35 * (NZ.t(u * 30, v * 60, 30) * 0.5 + 0.5);
    if (kind === 'main') {
      if ((u > 0.055 && u < 0.075) || (u > 0.925 && u < 0.945)) paint = 1;
      if (Math.abs(u - 0.5) < 0.012 && v < 0.34) paint = 1;
    } else if (kind === 'local') {
      if (Math.abs(u - 0.5) < 0.012 && v < 0.34) paint = 1;
      if ((u > 0.04 && u < 0.055) || (u > 0.945 && u < 0.96)) paint = 0.9;
    }
    // bordo scuro/cordolo
    const edge = smooth(0.0, 0.03, Math.min(u, 1 - u));
    if (paint > 0) { const p = paint * wear; r = lerp(r, 0.8, p); g = lerp(g, 0.8, p); b = lerp(b, 0.78, p); }
    const kk = 0.7 + 0.3 * edge;
    set(o, i, r * kk, g * kk, b * kk);
  }
  return { map: mkTex(o, S, S), nor: normTex(hg, S, S, 1.0) };
}
function wood() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, pl = Math.floor(u * 8), fu = u * 8 - pl;
    const id = h2(pl, 3, 9), gr = NZ.t(u * 16 + id * 30, v * 3, 16) * 0.5 + 0.5, gr2 = NZ.t(u * 90, v * 4, 90) * 0.5 + 0.5;
    const gap = 1 - smooth(0.0, 0.05, Math.min(fu, 1 - fu));
    const k = (0.7 + 0.35 * gr + 0.2 * gr2 + id * 0.2) * (1 - gap * 0.7);
    set(d, (y * S + x) * 4, 0.45 * k, 0.3 * k, 0.18 * k);
    hg[y * S + x] = gr2 * 0.4 - gap;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 1.6) };
}
function waterNormal() {
  const S = 512, hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    hg[y * S + x] = NZ.tfbm(u * 8, v * 8, 8, 5) + 0.35 * NZ.t(u * 40, v * 40, 40);
  }
  return normTex(hg, S, S, 6);
}
function roofTile() {
  const S = 512, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S), cols = 12, rows = 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const cu = u * cols, ci = Math.floor(cu), fu = cu - ci;
    const rv = v * rows, ri = Math.floor(rv), fv = rv - ri;
    const prof = 0.5 + 0.5 * Math.cos((fu - 0.5) * Math.PI * 2); // cresta al centro delle colonne alterne
    const ridge = (ci % 2 === 0) ? prof : 1 - prof;
    const id = h2(ci, ri, 41), id2 = h2(ci, ri + 7, 43);
    const over = 0.55 + 0.45 * fv;
    const patch = smooth(0.5, 0.8, NZ.tfbm(u * 5, v * 5, 5, 3) * 0.5 + 0.5);
    const grime = NZ.tfbm(u * 30, v * 30, 30, 3) * 0.5 + 0.5;
    let r = 0.58 + id * 0.12 - 0.1, g = 0.27 + id * 0.06 + id2 * 0.03, b = 0.17 + id2 * 0.04;
    const ao = 0.55 + 0.45 * ridge, k = ao * (0.75 + 0.25 * over) * (0.85 + 0.2 * grime);
    r = lerp(r, 0.42, patch * 0.35); g = lerp(g, 0.32, patch * 0.4); b = lerp(b, 0.22, patch * 0.35);
    const edgeDark = smooth(0.0, 0.1, fv) * 0.4 + 0.6;
    set(d, (y * S + x) * 4, r * k * edgeDark * 1.25, g * k * edgeDark * 1.25, b * k * edgeDark * 1.25);
    hg[y * S + x] = ridge * 0.8 * over + (1 - edgeDark) * -0.3;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 4.0) };
}

// ---------- facciate (1 tile = 1 finestra: 3.2 m x 3.0 m) ----------
function facade(variant) {
  const S = 512, cv = mkCanvas(S, S), c = cv.getContext('2d'), hv = mkCanvas(S, S), hc = hv.getContext('2d');
  c.fillStyle = '#ece8e0'; c.fillRect(0, 0, S, S);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
  const rnd = mulberry32(100 + variant);
  // intonaco: macchie e grana
  for (let i = 0; i < 700; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 26;
    c.fillStyle = `rgba(${150 + rnd() * 60},${140 + rnd() * 60},${120 + rnd() * 50},${0.03 + rnd() * 0.05})`;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // colature sotto la finestra
  const winW = 168, winH = 258, wx = (S - winW) / 2, wy = 96;
  const g0 = c.createLinearGradient(0, wy + winH, 0, S);
  g0.addColorStop(0, 'rgba(90,80,70,0.22)'); g0.addColorStop(1, 'rgba(90,80,70,0)');
  c.fillStyle = g0; c.fillRect(wx - 6, wy + winH, winW + 12, S - wy - winH);
  // vano
  const frame = 12;
  c.fillStyle = '#f4f1ea'; c.fillRect(wx - frame, wy - frame, winW + frame * 2, winH + frame * 2);
  hc.fillStyle = '#a0a0a0'; hc.fillRect(wx - frame, wy - frame, winW + frame * 2, winH + frame * 2);
  // vetro
  const gl = c.createLinearGradient(wx, wy, wx + winW, wy + winH);
  gl.addColorStop(0, '#2d3d52'); gl.addColorStop(0.45, '#5f7a94'); gl.addColorStop(0.55, '#34465b'); gl.addColorStop(1, '#1e2a3a');
  c.fillStyle = gl; c.fillRect(wx, wy, winW, winH);
  hc.fillStyle = '#505050'; hc.fillRect(wx, wy, winW, winH);
  // infissi
  c.fillStyle = '#f6f4ee';
  c.fillRect(wx + winW / 2 - 4, wy, 8, winH); c.fillRect(wx, wy + winH * 0.38, winW, 7);
  hc.fillStyle = '#b8b8b8'; hc.fillRect(wx + winW / 2 - 4, wy, 8, winH); hc.fillRect(wx, wy + winH * 0.38, winW, 7);
  // davanzale
  c.fillStyle = '#d9d4c8'; c.fillRect(wx - 20, wy + winH + frame - 2, winW + 40, 14);
  hc.fillStyle = '#c8c8c8'; hc.fillRect(wx - 20, wy + winH + frame - 2, winW + 40, 14);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(wx - 20, wy + winH + frame + 12, winW + 40, 5);
  if (variant < 2) {
    // persiane aperte ai lati
    const cols = variant === 0 ? ['#4f6f4a', '#5c7d55'] : ['#7a5236', '#8a6040'];
    const sw = 78, sx = [wx - frame - sw - 4, wx + winW + frame + 4];
    for (const x0 of sx) {
      c.fillStyle = cols[0]; c.fillRect(x0, wy - frame, sw, winH + frame * 2);
      hc.fillStyle = '#9a9a9a'; hc.fillRect(x0, wy - frame, sw, winH + frame * 2);
      for (let y = wy - frame + 4; y < wy + winH + frame - 4; y += 11) {
        c.fillStyle = cols[1]; c.fillRect(x0 + 5, y, sw - 10, 5);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0 + 5, y + 5, sw - 10, 2);
        hc.fillStyle = '#6a6a6a'; hc.fillRect(x0 + 5, y, sw - 10, 6);
      }
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3; c.strokeRect(x0, wy - frame, sw, winH + frame * 2);
    }
  } else {
    // balconcino con ringhiera in ferro
    c.fillStyle = '#c9c3b6'; c.fillRect(wx - 50, wy + winH + 14, winW + 100, 18);
    hc.fillStyle = '#d0d0d0'; hc.fillRect(wx - 50, wy + winH + 14, winW + 100, 18);
    c.strokeStyle = '#1e1e22'; c.lineWidth = 4;
    const by = wy + winH + 14;
    c.beginPath(); c.moveTo(wx - 46, by - 80); c.lineTo(wx + winW + 46, by - 80); c.stroke();
    for (let x = wx - 44; x <= wx + winW + 46; x += 18) { c.beginPath(); c.moveTo(x, by - 80); c.lineTo(x, by); c.stroke(); }
    hc.strokeStyle = '#d8d8d8'; hc.lineWidth = 4; hc.beginPath(); hc.moveTo(wx - 46, by - 80); hc.lineTo(wx + winW + 46, by - 80); hc.stroke();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(wx - 50, by + 18, winW + 100, 8);
  }
  // cornice orizzontale di piano
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, S - 6, S, 6);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, S, 3);
  // grana
  const id = c.getImageData(0, 0, S, S), px = id.data;
  for (let i = 0; i < S * S; i++) { const n = (h2(i % S, (i / S) | 0, 3) - 0.5) * 16; px[i * 4] += n; px[i * 4 + 1] += n; px[i * 4 + 2] += n; }
  c.putImageData(id, 0, 0);
  const albedo = canvasData(cv);
  // altezza -> normale
  const hd = hc.getImageData(0, 0, S, S).data, hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hg[y * S + x] = hd[((S - 1 - y) * S + x) * 4] / 255 + (h2(x, y, 8) - 0.5) * 0.05;
  // emissivo: vetro illuminato
  const em = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cy = S - 1 - y; const inside = x > wx + 4 && x < wx + winW - 4 && cy > wy + 4 && cy < wy + winH - 4;
    const bar = Math.abs(x - (wx + winW / 2)) < 6 || Math.abs(cy - (wy + winH * 0.38 + 3)) < 6;
    const i = (y * S + x) * 4;
    if (inside && !bar) { const k = 0.8 + 0.2 * (1 - (cy - wy) / winH); em[i] = 255 * k; em[i + 1] = 190 * k; em[i + 2] = 110 * k; }
    em[i + 3] = 255;
  }
  return { map: mkTex(albedo, S, S), nor: normTex(hg, S, S, 3.0), emi: mkTex(em, S, S) };
}

// ---------- fogliame ----------
function leafCanvas(kind) {
  const S = 512, cv = mkCanvas(S, S), c = cv.getContext('2d'), rnd = mulberry32(kind === 'olive' ? 5 : 9);
  c.fillStyle = kind === 'olive' ? '#6c8060' : kind === 'oak' ? '#27411f' : '#223d22'; c.fillRect(0, 0, S, S);
  const N = kind === 'olive' ? 1300 : kind === 'oak' ? 560 : 800;
  const wrap = (x, y, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -60 || x + ox > S + 60 || y + oy < -60 || y + oy > S + 60) continue; c.save(); c.translate(x + ox, y + oy); fn(); c.restore(); } };
  for (let i = 0; i < N; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
    let col, len, wid;
    if (kind === 'olive') { const t = rnd(); col = `rgb(${88 + t * 70},${108 + t * 55},${82 + t * 45})`; len = 22 + rnd() * 16; wid = 3.6 + rnd() * 1.6; }
    else if (kind === 'oak') { const t = rnd(); col = `rgb(${26 + t * 36},${56 + t * 46},${26 + t * 24})`; len = 24 + rnd() * 14; wid = 10 + rnd() * 5; }
    else { const t = rnd(); col = `rgb(${22 + t * 26},${52 + t * 38},${26 + t * 20})`; len = 28 + rnd() * 18; wid = 2.6 + rnd() * 1.2; }
    wrap(x, y, () => { c.rotate(a); c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, len / 2, wid / 2, 0, 0, 7); c.fill(); });
  }
  // fori nella chioma (poca trasparenza: resta visibile anche con i mipmap)
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 150; i++) { const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 8; wrap(x, y, () => { c.fillStyle = '#000'; c.beginPath(); c.ellipse(0, 0, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, 7); c.fill(); }); }
  c.globalCompositeOperation = 'source-over';
  const id = c.getImageData(0, 0, S, S), p = id.data;
  for (let i = 0; i < S * S; i++) { if (p[i * 4 + 3] > 40) { p[i * 4 + 3] = 255; const k = 0.8 + 0.3 * h2(i % S, (i / S) | 0, 1); p[i * 4] *= k; p[i * 4 + 1] *= k; p[i * 4 + 2] *= k; } else p[i * 4 + 3] = 0; }
  c.putImageData(id, 0, 0);
  return cv;
}
function leafTex(kind) {
  const cv = leafCanvas(kind), t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.generateMipmaps = true;
  return t;
}
function bark() {
  const S = 256, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n = NZ.t(u * 10, v * 2, 10) * 0.5 + 0.5, n2 = NZ.t(u * 30, v * 6, 30) * 0.5 + 0.5;
    const k = 0.55 + 0.5 * n + 0.2 * n2;
    set(d, (y * S + x) * 4, 0.32 * k, 0.25 * k, 0.19 * k);
    hg[y * S + x] = n * 0.7 + n2 * 0.4;
  }
  return { map: mkTex(d, S, S), nor: normTex(hg, S, S, 2) };
}
function sprite(kind) {
  const S = 128, cv = mkCanvas(S, S), c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === 'glow') { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  else if (kind === 'smoke') { g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  if (kind === 'smoke') { for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; c.beginPath(); c.arc(S / 2 + (Math.random() - 0.5) * S * 0.6, S / 2 + (Math.random() - 0.5) * S * 0.6, Math.random() * 20, 0, 7); c.fill(); } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function knit() {
  const S = 256, hg = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x % 8) - 3.5, cy = (y % 8) - 3.5, dd = Math.hypot(cx, cy);
    hg[y * S + x] = Math.max(0, 1 - dd / 3.2) + (h2(x, y, 4) - 0.5) * 0.1;
  }
  return normTex(hg, S, S, 2.2);
}
function noiseRGBA() {
  const S = 256, d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { d[i * 4] = h2(i % S, (i / S) | 0, 1) * 255; d[i * 4 + 1] = h2(i % S, (i / S) | 0, 2) * 255; d[i * 4 + 2] = h2(i % S, (i / S) | 0, 3) * 255; d[i * 4 + 3] = 255; }
  return mkTex(d, S, S, { linear: true });
}

export function buildTextures(onStep) {
  const T = {};
  const steps = [
    ['grass', () => grass()], ['rock', () => rock()], ['pebble', () => pebble()], ['dirt', () => dirt()], ['cobble', () => cobble()],
    ['stone', () => stoneWall()], ['asphalt', () => asphalt()], ['roadMain', () => roadTex('main')], ['roadLocal', () => roadTex('local')], ['roadLane', () => roadTex('lane')],
    ['wood', () => wood()], ['roof', () => roofTile()], ['facade0', () => facade(0)], ['facade1', () => facade(1)], ['facade2', () => facade(2)],
    ['bark', () => bark()],
  ];
  return { T, steps, run(i) { const [k, f] = steps[i]; T[k] = f(); }, finish() {
    T.waterNormal = waterNormal(); T.leafOlive = leafTex('olive'); T.leafOak = leafTex('oak'); T.leafNeedle = leafTex('needle');
    T.glow = sprite('glow'); T.smoke = sprite('smoke'); T.puff = sprite('puff'); T.knit = knit(); T.noise = noiseRGBA();
    return T;
  } };
}
export { h2, worley, normalData, mkCanvas, canvasData, normTex };
