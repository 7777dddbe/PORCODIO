// Utilità: matematica, rumore, spline, griglia spaziale
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  f() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  gauss() { return (this.r() + this.r() + this.r() + this.r() - 2) * 0.8660254; }
  chance(p) { return this.r() < p; }
}

function g(h, x, y) {
  switch (h & 7) {
    case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
}
export class Noise {
  constructor(seed = 1) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }
  n(x, y) {
    const p = this.p;
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = p[xi] + yi, b = p[xi + 1] + yi;
    const x1 = g(p[a], xf, yf) + u * (g(p[b], xf - 1, yf) - g(p[a], xf, yf));
    const x2 = g(p[a + 1], xf, yf - 1) + u * (g(p[b + 1], xf - 1, yf - 1) - g(p[a + 1], xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.9;
  }
  // rumore periodico (per texture tileable). period = intero
  t(x, y, per) {
    const p = this.p;
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const m = (v) => ((v % per) + per) % per;
    const xi = m(X) & 255, yi = m(Y) & 255, xj = m(X + 1) & 255, yj = m(Y + 1) & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = p[p[xi] + yi], ba = p[p[xj] + yi], ab = p[p[xi] + yj], bb = p[p[xj] + yj];
    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.9;
  }
  fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.n(x, y); n += a; x *= lac; y *= lac; a *= gain; }
    return s / n;
  }
  tfbm(x, y, per, oct = 5) {
    let a = 1, s = 0, n = 0, pp = per;
    for (let i = 0; i < oct; i++) { s += a * this.t(x, y, pp); n += a; x *= 2; y *= 2; pp *= 2; a *= 0.5; }
    return s / n;
  }
  ridge(x, y, oct = 4) {
    let a = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(this.n(x, y))); n += a; x *= 2.03; y *= 2.03; a *= 0.5; }
    return s / n;
  }
}

// interpolazione cubica (Catmull-Rom con tangenti finite) su punti ordinati [x,y]
export function curve1D(pts) {
  const n = pts.length, m = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    m[i] = (b[1] - a[1]) / (b[0] - a[0]);
  }
  let last = 0;
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1] + m[0] * (x - pts[0][0]);
    if (x >= pts[n - 1][0]) return pts[n - 1][1] + m[n - 1] * (x - pts[n - 1][0]);
    let i = last;
    if (x < pts[i][0] || x > pts[i + 1][0]) { i = 0; while (pts[i + 1][0] < x) i++; }
    last = i;
    const x0 = pts[i][0], x1 = pts[i + 1][0], h = x1 - x0, t = (x - x0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

// Catmull-Rom 2D -> polilinea con passo costante
export function resample(pts, step, closed = false) {
  const P = pts.map((p) => ({ x: p[0], z: p[1] }));
  const n = P.length;
  const get = (i) => closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
  const dense = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const k = Math.max(4, Math.ceil(len / 2));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  if (!closed) dense.push({ ...P[n - 1] });
  // ripartizione a distanza costante
  const out = [dense[0]];
  let acc = 0, prev = dense[0];
  for (let i = 1; i < dense.length; i++) {
    const c = dense[i];
    let d = Math.hypot(c.x - prev.x, c.z - prev.z);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: prev.x + (c.x - prev.x) * t, z: prev.z + (c.z - prev.z) * t };
      out.push(q); prev = q; d = Math.hypot(c.x - prev.x, c.z - prev.z); acc = 0;
    }
    acc += d; prev = c;
  }
  if (!closed) { const l = out[out.length - 1]; if (Math.hypot(l.x - dense[dense.length - 1].x, l.z - dense[dense.length - 1].z) > step * 0.3) out.push(dense[dense.length - 1]); }
  return out;
}

// griglia spaziale per collisioni / ricerche
export class Grid {
  constructor(cell = 16) { this.cell = cell; this.m = new Map(); this.stamp = 0; }
  key(ix, iz) { return (ix + 8192) * 16384 + (iz + 8192); }
  insert(o, x0, z0, x1, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++)
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this.key(ix, iz); let a = this.m.get(k);
        if (!a) { a = []; this.m.set(k, a); }
        a.push(o);
      }
  }
  remove(o, x0, z0, x1, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++)
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const a = this.m.get(this.key(ix, iz)); if (!a) continue;
        const i = a.indexOf(o); if (i >= 0) a.splice(i, 1);
      }
  }
  query(x0, z0, x1, z1, out = []) {
    const c = this.cell; this.stamp++;
    out.length = 0;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++)
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const a = this.m.get(this.key(ix, iz)); if (!a) continue;
        for (let i = 0; i < a.length; i++) { const o = a[i]; if (o._q !== this.stamp) { o._q = this.stamp; out.push(o); } }
      }
    return out;
  }
}

export const fmtMoney = (n) => '€' + Math.floor(n).toLocaleString('it-IT');
