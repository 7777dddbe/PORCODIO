// Collisioni 2D (cerchi/OBB) + raggi (proiettili, camera)
import { Grid } from './util.js';

export class Colliders {
  constructor() { this.grid = new Grid(16); this.buf = []; }
  addObb(b) { const R = b.hx + b.hz; b.kind = 'obb'; if (b.y0 === undefined) b.y0 = -5; this.grid.insert(b, b.cx - R, b.cz - R, b.cx + R, b.cz + R); return b; }
  addCircle(x, z, r, top = 9, y0 = -5) { const o = { kind: 'c', x, z, r, top, y0 }; this.grid.insert(o, x - r, z - r, x + r, z + r); return o; }
  // spinge fuori un cerchio (pos.x, pos.z). Ritorna l'ultima normale d'urto o null.
  resolve(pos, r, out = { nx: 0, nz: 0, depth: 0, obj: null }, yLow = -1e9) {
    let hit = false;
    const list = this.grid.query(pos.x - r - 1, pos.z - r - 1, pos.x + r + 1, pos.z + r + 1);
    for (const o of list) {
      if (o.top !== undefined && o.top < yLow) continue;
      if (o.kind === 'c') {
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
        if (d < m) { const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0; pos.x += nx * (m - d); pos.z += nz * (m - d); out.nx = nx; out.nz = nz; out.depth = m - d; out.obj = o; hit = true; }
      } else {
        const dx = pos.x - o.cx, dz = pos.z - o.cz;
        const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
        const px = Math.max(-o.hx, Math.min(o.hx, lx)), pz = Math.max(-o.hz, Math.min(o.hz, lz));
        let ddx = lx - px, ddz = lz - pz, d = Math.hypot(ddx, ddz);
        let nlx, nlz, pen;
        if (d > 1e-5) { if (d >= r) continue; nlx = ddx / d; nlz = ddz / d; pen = r - d; }
        else { // centro dentro: esci dall'asse più vicino
          const ex = o.hx - Math.abs(lx), ez = o.hz - Math.abs(lz);
          if (ex < ez) { nlx = Math.sign(lx) || 1; nlz = 0; pen = ex + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = ez + r; }
        }
        const nx = nlx * o.c - nlz * o.s, nz = nlx * o.s + nlz * o.c;
        pos.x += nx * pen; pos.z += nz * pen; out.nx = nx; out.nz = nz; out.depth = pen; out.obj = o; hit = true;
      }
    }
    return hit ? out : null;
  }
  // raggio contro collider (ritorna distanza t o -1)
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, bo = null;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.grid.query(Math.min(ox, ex) - 2, Math.min(oz, ez) - 2, Math.max(ox, ex) + 2, Math.max(oz, ez) + 2);
    for (const o of list) {
      let t = -1;
      if (o.kind === 'c') {
        const fx = ox - o.x, fz = oz - o.z, a = dx * dx + dz * dz; if (a < 1e-9) continue;
        const b = fx * dx + fz * dz, c = fx * fx + fz * fz - o.r * o.r, disc = b * b - a * c;
        if (disc < 0) continue; const tt = (-b - Math.sqrt(disc)) / a; if (tt < 0 || tt > best) continue;
        const y = oy + dy * tt; if (y < o.y0 || y > o.top) continue; t = tt;
      } else {
        const lox = (ox - o.cx) * o.c + (oz - o.cz) * o.s, loz = -(ox - o.cx) * o.s + (oz - o.cz) * o.c;
        const ldx = dx * o.c + dz * o.s, ldz = -dx * o.s + dz * o.c;
        let t0 = 0, t1 = best;
        const slab = (p, d, lo, hi) => {
          if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
          let a = (lo - p) / d, b = (hi - p) / d; if (a > b) { const x = a; a = b; b = x; }
          if (a > t0) t0 = a; if (b < t1) t1 = b; return t0 <= t1;
        };
        if (!slab(lox, ldx, -o.hx, o.hx) || !slab(loz, ldz, -o.hz, o.hz) || !slab(oy, dy, o.y0, o.top)) continue;
        t = t0;
      }
      if (t >= 0 && t < best) { best = t; bo = o; }
    }
    return bo ? { t: best, obj: bo } : null;
  }
}

// raggio contro il terreno (marching + bisezione)
export function rayTerrain(terrain, ox, oy, oz, dx, dy, dz, maxT) {
  let t = 0, prevT = 0, step = 1.5;
  let prevAbove = oy - terrain.heightAt(ox, oz) > 0;
  if (!prevAbove) return { t: 0 };
  while (t < maxT) {
    t += step; if (t > maxT) t = maxT;
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y < terrain.heightAt(x, z)) {
      let a = prevT, b = t;
      for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (oy + dy * m < terrain.heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m; }
      return { t: (a + b) / 2 };
    }
    prevT = t; step = Math.min(8, step * 1.12);
    if (t >= maxT) break;
  }
  return null;
}
