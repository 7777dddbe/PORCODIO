// Rete stradale: profilo altimetrico, grafo per il traffico, mesh asfalto + marciapiedi
import * as THREE from 'three';
import { buildRoadDefs, baseHeight } from './map.js';
import { Grid } from './util.js';

const ORDER = ['RING', 'R1a', 'R1b', 'R2b', 'R2', 'R2c', 'R3a', 'R3b', 'R4', 'R5', 'R5b', 'R6', 'L1', 'L2', 'L3', 'L4', 'L5'];
const SIDEWALK = new Set(['RING', 'R2', 'R2b', 'R2c', 'R3a', 'R3b', 'R4', 'R5', 'R5b']);

export class RoadNet {
  constructor() {
    this.roads = buildRoadDefs().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    this.hash = new Grid(8);
    for (const r of this.roads) {
      if (r.id === 'RING') r.path.reverse(); // senso antiorario (guida a destra)
      r.oneway = r.id === 'RING';
      r.sidewalk = SIDEWALK.has(r.id);
      r.hw = r.w / 2;
      this.elevate(r);
    }
    this.buildGraph();
  }

  elevate(r) {
    const P = r.path, n = P.length, y = new Float32Array(n);
    const base = P.map((p) => baseHeight(p.x, p.z));
    if (r.closed) {
      let a = 0; for (const b of base) a += b; a /= n; y.fill(a);
    } else {
      const R = r.kind === 'main' ? 30 : r.kind === 'lane' ? 14 : 20;
      const pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + base[i];
      for (let i = 0; i < n; i++) { const lo = Math.max(0, i - R), hi = Math.min(n - 1, i + R); y[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1); }
      const g = (r.kind === 'main' ? 0.10 : 0.13) * 1.5;
      for (let k = 0; k < 2; k++) {
        for (let i = 1; i < n; i++) y[i] = Math.min(Math.max(y[i], y[i - 1] - g), y[i - 1] + g);
        for (let i = n - 2; i >= 0; i--) y[i] = Math.min(Math.max(y[i], y[i + 1] - g), y[i + 1] + g);
      }
      // ancoraggio agli incroci con strade già elaborate
      const pin = (p) => {
        let best = null, bd = 36;
        for (const o of this.hash.query(p.x - 6, p.z - 6, p.x + 6, p.z + 6)) { const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2; if (d < bd) { bd = d; best = o; } }
        return best;
      };
      const s0 = pin(P[0]), s1 = pin(P[n - 1]);
      if (s0) { const dy = s0.y - y[0]; for (let i = 0; i < n; i++) y[i] += dy * Math.exp(-i * 1.5 / 45); }
      if (s1) { const dy = s1.y - y[n - 1]; for (let i = 0; i < n; i++) y[i] += dy * Math.exp(-(n - 1 - i) * 1.5 / 45); }
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      P[i].y = Math.max(y[i], 1.4); P[i].s = s; P[i].r = r; P[i].i = i;
      this.hash.insert(P[i], P[i].x, P[i].z, P[i].x, P[i].z);
    }
    r.len = s;
    // tangenti
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; if (r.closed) { const aa = P[(i - 1 + n) % n], bb = P[(i + 1) % n]; tx = bb.x - aa.x; tz = bb.z - aa.z; }
      const l = Math.hypot(tx, tz) || 1; P[i].tx = tx / l; P[i].tz = tz / l;
    }
  }

  nearest(x, z, maxD = 20) {
    let best = null, bd = maxD * maxD;
    for (const o of this.hash.query(x - maxD, z - maxD, x + maxD, z + maxD)) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < bd) { bd = d; best = o; } }
    return best ? { s: best, d: Math.sqrt(bd) } : null;
  }

  buildGraph() {
    const nodes = []; this.nodes = nodes;
    const ng = new Grid(16);
    for (const r of this.roads) {
      r.nodes = [];
      const P = r.path;
      for (let i = 0; i < P.length; i += 4) {
        const node = { id: nodes.length, x: P[i].x, z: P[i].z, y: P[i].y, r, i, links: [] };
        nodes.push(node); r.nodes.push(node); ng.insert(node, node.x, node.z, node.x, node.z);
      }
      if (!r.closed) {
        const last = P[P.length - 1];
        if (Math.hypot(last.x - r.nodes[r.nodes.length - 1].x, last.z - r.nodes[r.nodes.length - 1].z) > 2) {
          const node = { id: nodes.length, x: last.x, z: last.z, y: last.y, r, i: P.length - 1, links: [] }; nodes.push(node); r.nodes.push(node); ng.insert(node, node.x, node.z, node.x, node.z);
        }
      }
    }
    const link = (a, b) => { if (a !== b && !a.links.includes(b)) a.links.push(b); };
    for (const r of this.roads) {
      const N = r.nodes;
      for (let i = 0; i < N.length - 1; i++) { link(N[i], N[i + 1]); if (!r.oneway) link(N[i + 1], N[i]); }
      if (r.closed) { link(N[N.length - 1], N[0]); if (!r.oneway) link(N[0], N[N.length - 1]); }
    }
    for (const a of nodes) {
      const best = new Map();
      for (const b of ng.query(a.x - 8, a.z - 8, a.x + 8, a.z + 8)) {
        if (b.r === a.r) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 8 && (!best.has(b.r) || best.get(b.r).d > d)) best.set(b.r, { b, d });
      }
      for (const { b } of best.values()) { link(a, b); link(b, a); }
    }
    this.ng = ng;
  }

  randomNode(rng, filter) {
    for (let k = 0; k < 40; k++) { const n = this.nodes[Math.floor(rng.f() * this.nodes.length)]; if (!filter || filter(n)) return n; }
    return this.nodes[0];
  }

  // ---------- mesh ----------
  buildMeshes(T, envI = 0.5) {
    const group = new THREE.Group(); group.name = 'roads';
    const matFor = (kind) => {
      const t = kind === 'main' ? T.roadMain : kind === 'lane' ? T.roadLane : T.roadLocal;
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.nor, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88, metalness: 0, envMapIntensity: envI * 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    };
    const mats = { main: matFor('main'), local: matFor('local'), lane: matFor('lane') };
    const swMat = new THREE.MeshStandardMaterial({ map: T.cobble.map, normalMap: T.cobble.nor, roughness: 0.85, envMapIntensity: envI * 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const PIECE = 90;
    for (const r of this.roads) {
      const P = r.path, n = P.length;
      T.roadMain.map.repeat.set(1, 1);
      for (let a = 0; a < n - 1; a += PIECE) {
        const b = Math.min(n - 1, a + PIECE);
        const cnt = b - a + 1; if (cnt < 2) continue;
        const pos = new Float32Array(cnt * 2 * 3), uv = new Float32Array(cnt * 2 * 2), idx = [];
        for (let k = 0; k < cnt; k++) {
          const p = P[a + k], nx = -p.tz, nz = p.tx, hw = r.hw;
          pos.set([p.x + nx * hw, p.y + 0.04, p.z + nz * hw, p.x - nx * hw, p.y + 0.04, p.z - nz * hw], k * 6);
          uv.set([0, p.s / 12, 1, p.s / 12], k * 4);
          if (k < cnt - 1) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        // normali verso l'alto
        const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) { if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i)); }
        const m = new THREE.Mesh(geo, mats[r.kind === 'main' ? 'main' : r.kind === 'lane' ? 'lane' : 'local']);
        m.receiveShadow = true; m.frustumCulled = true; group.add(m);
        if (r.sidewalk) {
          const swW = 1.5, hw = r.hw;
          const sp = new Float32Array(cnt * 4 * 3), su = new Float32Array(cnt * 4 * 2), si = [];
          for (let k = 0; k < cnt; k++) {
            const p = P[a + k], nx = -p.tz, nz = p.tx, y0 = p.y + 0.04, y1 = p.y + 0.16;
            sp.set([p.x + nx * hw, y1, p.z + nz * hw, p.x + nx * (hw + swW), y1, p.z + nz * (hw + swW), p.x - nx * hw, y1, p.z - nz * hw, p.x - nx * (hw + swW), y1, p.z - nz * (hw + swW)], k * 12);
            su.set([0, p.s / 2, 1, p.s / 2, 0, p.s / 2, 1, p.s / 2], k * 8);
            if (k < cnt - 1) { const o = k * 4, q = o + 4; si.push(o, q, o + 1, o + 1, q, q + 1, o + 2, o + 3, q + 2, o + 3, q + 3, q + 2); }
          }
          const g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(sp, 3)); g2.setAttribute('uv', new THREE.BufferAttribute(su, 2));
          g2.setIndex(si); g2.computeVertexNormals();
          const nn = g2.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
          const m2 = new THREE.Mesh(g2, swMat); m2.receiveShadow = true; group.add(m2);
        }
      }
    }
    return group;
  }
}
