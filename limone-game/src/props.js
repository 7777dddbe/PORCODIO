// Luoghi e arredi: porto, faro, chiesa, comune, limonaia, campo sportivo, tennis, piscine, lampioni, campeggio, barche, gabbiani, cascata
import * as THREE from 'three';
import { frame, shoreX, LANDMARKS, BOUNDS } from './map.js';
import { RNG, clamp, lerp, smooth } from './util.js';
import { mkCanvas } from './textures.js';
import { waveH } from './water.js';

const SA = Math.atan2(1, -0.24);
const std = (o) => new THREE.MeshStandardMaterial(o);

function boxUV(g, w, h, d, k = 1 / 2.4) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    let su, sv;
    if (f < 2) { su = d; sv = h; } else if (f < 4) { su = w; sv = d; } else { su = w; sv = h; }
    uv.setXY(i, uv.getX(i) * su * k, uv.getY(i) * sv * k);
  }
  return g;
}
export function makeSign(text, w, h, bg = '#12384a', fg = '#fff', sub = '') {
  const S = 512, cv = mkCanvas(S, Math.round(S * h / w)), c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let fs = cv.height * (sub ? 0.4 : 0.55); c.font = `700 ${fs}px "Barlow Condensed", Arial Narrow, Arial, sans-serif`;
  while (c.measureText(text).width > cv.width - 40 && fs > 10) { fs -= 2; c.font = `700 ${fs}px "Barlow Condensed", Arial Narrow, Arial, sans-serif`; }
  c.fillText(text, cv.width / 2, cv.height * (sub ? 0.38 : 0.52));
  if (sub) { c.font = `600 ${cv.height * 0.22}px "Barlow Condensed", Arial, sans-serif`; c.fillText(sub, cv.width / 2, cv.height * 0.74); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }));
}
function pitchTexture(kind) {
  const W = 1024, H = kind === 'foot' ? 640 : 560, cv = mkCanvas(W, H), c = cv.getContext('2d');
  if (kind === 'foot') {
    for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? '#3d7f35' : '#468a3b'; c.fillRect(i * W / 14, 0, W / 14 + 1, H); }
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(${40 + Math.random() * 40},${90 + Math.random() * 50},${30},0.12)`; c.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    c.strokeStyle = '#f2f2f2'; c.lineWidth = 5; c.strokeRect(24, 24, W - 48, H - 48);
    c.beginPath(); c.moveTo(W / 2, 24); c.lineTo(W / 2, H - 24); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 70, 0, 7); c.stroke();
    c.strokeRect(24, H / 2 - 130, 150, 260); c.strokeRect(W - 174, H / 2 - 130, 150, 260); c.strokeRect(24, H / 2 - 60, 55, 120); c.strokeRect(W - 79, H / 2 - 60, 55, 120);
  } else {
    c.fillStyle = '#a24a30'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { const v = Math.random(); c.fillStyle = `rgba(${150 + v * 50},${60 + v * 30},${40},0.18)`; c.fillRect(Math.random() * W, Math.random() * H, 4, 4); }
    c.fillStyle = '#8f8f8f'; c.fillRect(0, 0, 40, H); c.fillRect(W - 40, 0, 40, H);
    c.strokeStyle = '#f2f2f2'; c.lineWidth = 5;
    c.strokeRect(90, 70, W - 180, H - 140); c.strokeRect(90, 150, W - 180, H - 300);
    c.beginPath(); c.moveTo(W / 2, 70); c.lineTo(W / 2, H - 70); c.stroke(); c.beginPath(); c.moveTo(330, H / 2); c.lineTo(W - 330, H / 2); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function fenceTexture() {
  const S = 128, cv = mkCanvas(S, S), c = cv.getContext('2d'); c.clearRect(0, 0, S, S);
  c.strokeStyle = 'rgba(40,60,50,0.95)'; c.lineWidth = 3;
  for (let i = -S; i < S * 2; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + S, S); c.stroke(); c.beginPath(); c.moveTo(i, S); c.lineTo(i + S, 0); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class Props {
  constructor(ctx) {
    Object.assign(this, ctx); // terrain, roads, T, colliders, buildings, nightU, timeU, q, sky
    this.group = new THREE.Group(); this.group.name = 'props';
    this.rng = new RNG(555);
    this.updaters = []; this.pools = []; this.lamps = [];
    this.mats = {
      stone: std({ map: this.T.stone.map, normalMap: this.T.stone.nor, color: 0xf0e6d0, roughness: 0.92, envMapIntensity: 0.4 }),
      white: std({ color: 0xf1efe8, roughness: 0.85, envMapIntensity: 0.4 }),
      wood: std({ map: this.T.wood.map, normalMap: this.T.wood.nor, roughness: 0.8, envMapIntensity: 0.4 }),
      cobble: std({ map: this.T.cobble.map, normalMap: this.T.cobble.nor, color: 0xd8d4c8, roughness: 0.9, envMapIntensity: 0.4 }),
      roof: std({ map: this.T.roof.map, normalMap: this.T.roof.nor, roughness: 0.85, envMapIntensity: 0.5 }),
      dark: std({ color: 0x23272b, roughness: 0.6, metalness: 0.4 }),
      glass: std({ color: 0x223344, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.2 }),
      green: std({ color: 0x4a7a46, roughness: 0.8 }),
    };
  }
  add(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; this.group.add(m); return m; }
  box(w, h, d, x, y, z, yaw, mat, uvk) { const g = new THREE.BoxGeometry(w, h, d); if (uvk) boxUV(g, w, h, d, uvk); const m = new THREE.Mesh(g, mat); m.position.set(x, y + h / 2, z); m.rotation.y = -yaw; return this.add(m); }
  obbCollider(x, z, hx, hz, yaw, y0, top) { this.colliders.addObb({ cx: x, cz: z, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw), y0, top }); }
  // posizione locale (lx,lz) relativa a un centro/yaw -> mondo
  loc(cx, cz, yaw, lx, lz) { const c = Math.cos(yaw), s = Math.sin(yaw); return [cx + lx * c - lz * s, cz + lx * s + lz * c]; }

  // ====== 1) forme del terreno (prima di buildMasks) ======
  shapeTerrain() {
    const t = this.terrain, rng = this.rng;
    const P = (z, d) => { const [x, zz] = frame(z, d); return { x, z: zz }; };
    // molo e banchine del porto
    t.stampStrip([P(-806, -1), P(-808, -45), P(-802, -92), P(-776, -116), P(-738, -122)].map((p) => p), 5.5, 1.75, 1);
    t.stampStrip([P(-688, 1), P(-690, -36), P(-686, -52)], 4.5, 1.6, 1);
    for (const z of [-786, -768, -750, -732]) t.stampStrip([P(z, 2), P(z, -34)], 2.1, 1.12, 1);
    // chiesa
    const ch = LANDMARKS.chiesa; this.church = { x: ch.x, z: ch.z, yaw: Math.PI * 0, y: t.heightAt(ch.x, ch.z) + 0.1 };
    t.stampPad(ch.x, ch.z, 15, 10, 0, this.church.y - 0.1, 3, 1);
    // campo sportivo e tennis
    const cp = LANDMARKS.campo; this.field = { x: cp.x, z: cp.z, y: this.avgHeight(cp.x, cp.z, 30, 20, SA) };
    t.stampPad(cp.x, cp.z, 36, 23, SA, this.field.y, 5, 3);
    const tn = LANDMARKS.tennis; this.tennis = { x: tn.x, z: tn.z, y: this.avgHeight(tn.x, tn.z, 20, 14, SA) };
    t.stampPad(tn.x, tn.z, 19, 18, SA, this.tennis.y, 4, 2);
    // comune + parco
    const cm = LANDMARKS.comune;
    const b = this.buildings.place(cm.x, cm.z, 28.8, 12.8, SA, { floors: 3, type: 'hotel', roof: 'hip', col: [0.98, 0.93, 0.78], v: 0, margin: 0, roadClear: 2, maxStep: 9, minY: 1, kind: 1, lit: 1 });
    this.comuneB = b;
    if (b) t.stampCircle(cm.x, cm.z, 26, b.y0 - 0.15, 8, 3);
    // limonaia a terrazze
    const lm = LANDMARKS.castel; this.limonaia = [];
    for (let k = 0; k < 3; k++) {
      const [x, z] = frame(-772, 46 + k * 12.5);
      const y = k === 0 ? t.heightAt(x, z) + 0.3 : this.limonaia[k - 1].y + 2.7;
      this.limonaia.push({ x, z, y });
      t.stampPad(x, z, 22, 5.5, SA, y, 1.5, 2);
    }
    // campeggio
    const cn = LANDMARKS.nanzel; this.camp = { x: cn.x, z: cn.z, y: this.avgHeight(cn.x, cn.z, 30, 22, SA) };
    t.stampPad(cn.x, cn.z, 34, 26, SA, this.camp.y, 6, 3);
    // piscine degli alberghi e di alcune ville
    for (const hb of this.buildings.list.slice()) {
      if (hb.type === 'old') continue;
      const p = hb.type === 'hotel' ? 0.55 : hb.floors >= 2 ? 0.3 : 0.12;
      if (rng.f() > p) continue;
      const pw = hb.type === 'hotel' ? 12 : 8, pl = hb.type === 'hotel' ? 6 : 4;
      for (const sgn of [1, -1, 2, -2]) {
        const lz = (Math.sign(sgn)) * (Math.abs(sgn) === 1 ? hb.hz + pl / 2 + 3.5 : 0), lx = Math.abs(sgn) === 2 ? Math.sign(sgn) * (hb.hx + pw / 2 + 3.5) : 0;
        const [x, z] = this.loc(hb.cx, hb.cz, hb.yaw, lx, lz);
        const ob = this.buildings.canPlace(x, z, (pw + 4) / 2, (pl + 4) / 2, hb.yaw, { margin: 1.5, roadClear: 3, maxStep: 2.6, minY: 2 });
        if (!ob) continue;
        ob.type = 'pool'; ob.top = -10; this.buildings.grid.insert(ob, x - 12, z - 12, x + 12, z + 12);
        const y = hb.y0 - 0.1;
        t.stampPad(x, z, pw / 2 + 2, pl / 2 + 2, hb.yaw, y, 2.5, 1);
        this.pools.push({ x, z, y, w: pw, l: pl, yaw: hb.yaw });
        break;
      }
    }
  }
  avgHeight(x, z, hx, hz, yaw) { let s = 0, n = 0; for (const [a, b] of [[0, 0], [hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]]) { const [px, pz] = this.loc(x, z, yaw, a, b); s += this.terrain.heightAt(px, pz); n++; } return s / n; }

  // ====== 2) mesh ======
  build() {
    this.buildHarbor(); this.buildChurch(); this.buildComune(); this.buildLimonaia(); this.buildSports(); this.buildPools(); this.buildLamps();
    this.buildCamp(); this.buildKite(); this.buildBoats(); this.buildGulls(); this.buildStream(); this.buildSigns();
    return this.group;
  }

  buildHarbor() {
    const t = this.terrain, M = this.mats;
    // faro
    const [lx, lz] = frame(-738, -122), ly = 1.75;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 1.2, 12), M.stone); base.position.set(lx, ly + 0.6, lz); this.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 7, 14), M.white); tower.position.set(lx, ly + 4.7, lz); this.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1.4, 14), std({ color: 0xb3342b, roughness: 0.7 })); band.position.set(lx, ly + 3.5, lz); this.add(band);
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12), this.lightMat); lamp.position.set(lx, ly + 8.8, lz); this.add(lamp, false);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.9, 12), M.dark); cap.position.set(lx, ly + 9.85, lz); this.add(cap);
    this.colliders.addCircle(lx, lz, 1.9, ly + 11, ly - 1);
    this.lighthouse = { x: lx, z: lz };
    this.updaters.push((dt, time) => { const on = Math.sin(time * 1.8) > 0.2; this.lightMat.color.setRGB(on ? 1 : 0.15, on ? 0.2 : 0.03, on ? 0.15 : 0.02).multiplyScalar(on ? 2.5 : 1); });
    // molo e banchine (mesh fisiche: sempre visibili anche a LOD basso)
    const seg = (a, b, w, yTop, mat) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
      const g = new THREE.BoxGeometry(L + w * 0.5, yTop + 6, w); boxUV(g, L + w * 0.5, yTop + 6, w, 1 / 2.2);
      const m = new THREE.Mesh(g, mat); m.position.set((a[0] + b[0]) / 2, (yTop - 6) / 2, (a[1] + b[1]) / 2); m.rotation.y = -ang; this.add(m);
      const top = new THREE.Mesh(new THREE.BoxGeometry(L + w * 0.5, 0.08, w - 0.4), M.cobble); top.position.set((a[0] + b[0]) / 2, yTop + 0.01, (a[1] + b[1]) / 2); top.rotation.y = -ang; top.receiveShadow = true; this.group.add(top);
    };
    const mole = [[-806, -1], [-808, -45], [-802, -92], [-776, -116], [-738, -122]].map(([z, d]) => frame(z, d));
    for (let i = 0; i < mole.length - 1; i++) seg(mole[i], mole[i + 1], 5.5, 1.75, M.stone);
    seg(frame(-688, 1), frame(-690, -36), 4.5, 1.6, M.stone); seg(frame(-690, -36), frame(-686, -52), 4.5, 1.6, M.stone);
    for (const z of [-786, -768, -750, -732]) seg(frame(z, 2), frame(z, -34), 2.1, 1.12, M.wood);
    // bitte e parapetto sul molo
    const bg = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), bm = new THREE.InstancedMesh(bg, M.dark, 60); let bi = 0; const m4 = new THREE.Matrix4();
    for (const [z0, d0, z1, d1, y] of [[-806, -1, -808, -45, 1.75], [-808, -45, -802, -92, 1.75], [-802, -92, -776, -116, 1.75], [-776, -116, -738, -122, 1.75]]) {
      const a = frame(z0, d0), b2 = frame(z1, d1), n = Math.floor(Math.hypot(b2[0] - a[0], b2[1] - a[1]) / 8);
      for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; m4.makeTranslation(lerp(a[0], b2[0], f), y + 0.25, lerp(a[1], b2[1], f)); bm.setMatrixAt(bi++, m4); }
    }
    bm.count = bi; bm.castShadow = true; this.group.add(bm);
  }

  buildChurch() {
    const c = this.church, M = this.mats; if (!c) return;
    const yaw = c.yaw, y = c.y; // asse lungo x (verso il lago)
    const wall = (w, h, d, lx, lz, yy, mat = M.stone) => { const [x, z] = this.loc(c.x, c.z, yaw, lx, lz); return this.box(w, h, d, x, yy, z, yaw, mat, 1 / 2.6); };
    wall(22, 9, 10.5, 0, 0, y);
    // tetto a due falde
    const rg = new THREE.BufferGeometry(); const hx = 11.6, hz = 5.9, ry = y + 9, rh = 3.6;
    const v = [[-hx, ry, -hz], [hx, ry, -hz], [hx, ry + rh, 0], [-hx, ry + rh, 0], [-hx, ry, hz], [hx, ry, hz]];
    const pos = [], uv = [], idx = [];
    const quad = (a, b, c2, d) => { const o = pos.length / 3; for (const p of [a, b, c2, d]) { const [x, z] = this.loc(c.x, c.z, yaw, p[0], p[2]); pos.push(x, p[1], z); } uv.push(0, 0, 8, 0, 8, 2.4, 0, 2.4); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); };
    quad(v[0], v[1], v[2], v[3]); quad(v[5], v[4], v[3], v[2]);
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    const rm = new THREE.Mesh(rg, std({ map: this.T.roof.map, normalMap: this.T.roof.nor, roughness: 0.85, side: THREE.DoubleSide })); this.add(rm);
    // campanile
    const tx = -9.5, tz = -8;
    wall(5.2, 22, 5.2, tx, tz, y);
    wall(5.6, 5.5, 5.6, tx, tz, y + 22, M.stone);
    for (const [ox, oz, w, d] of [[2.81, 0, 0.1, 2.2], [-2.81, 0, 0.1, 2.2], [0, 2.81, 2.2, 0.1], [0, -2.81, 2.2, 0.1]]) wall(w, 3.4, d, tx + ox, tz + oz, y + 23.2, M.dark);
    const [px, pz] = this.loc(c.x, c.z, yaw, tx, tz);
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(4.2, 6.5, 4), std({ color: 0x5a7468, roughness: 0.6, metalness: 0.2 })); pyr.position.set(px, y + 27.5 + 3.25, pz); pyr.rotation.y = -yaw + Math.PI / 4; this.add(pyr);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), std({ color: 0xf4efe0, roughness: 0.5 })); const [cx2, cz2] = this.loc(c.x, c.z, yaw, tx + 2.65, tz); clock.position.set(cx2, y + 18, cz2); clock.rotation.y = -yaw + Math.PI / 2; this.add(clock, false);
    this.obbCollider(c.x, c.z, 11, 5.25, yaw, y - 1, y + 12.6);
    this.obbCollider(px, pz, 2.6, 2.6, yaw, y - 1, y + 30);
    // gradini + sagrato
    wall(3, 0.5, 11, 12.2, 0, y - 0.1, M.cobble);
  }

  buildComune() {
    const b = this.comuneB, M = this.mats; if (!b) return;
    // bandiere
    const flagTex = (cols, dir) => { const cv = mkCanvas(96, 64), c = cv.getContext('2d'); if (dir === 'v') cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * 32, 0, 32, 64); }); else { c.fillStyle = '#1b3fa0'; c.fillRect(0, 0, 96, 64); c.fillStyle = '#ffd93a'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(48 + Math.cos(i / 12 * 6.28) * 18, 32 + Math.sin(i / 12 * 6.28) * 18, 3, 0, 7); c.fill(); } } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const flags = [];
    [[-4, flagTex(['#1f9d46', '#f4f4f4', '#d32f2f'], 'v')], [0, flagTex([], 'e')], [4, flagTex(['#1f9d46', '#f4f4f4', '#d32f2f'], 'v')]].forEach(([off, tex]) => {
      const [x, z] = this.loc(b.cx, b.cz, b.yaw, off * 2.2, b.hz + 4.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 8), M.white); pole.position.set(x, b.y0 + 4.5, z); this.add(pole);
      const fg = new THREE.PlaneGeometry(2.4, 1.6, 12, 4); const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
      fm.position.set(x + Math.cos(b.yaw + Math.PI / 2) * 1.2 * 0, b.y0 + 8.1, z); fm.rotation.y = -b.yaw; fm.castShadow = true; this.group.add(fm);
      const p = fg.attributes.position, base = p.array.slice();
      flags.push({ fm, p, base, ph: Math.random() * 6, ox: x, oz: z });
    });
    this.updaters.push((dt, time) => { for (const f of flags) { for (let i = 0; i < f.p.count; i++) { const x = f.base[i * 3], k = (x + 1.2) / 2.4; f.p.setZ(i, Math.sin(time * 4 + f.ph + k * 7) * 0.22 * k); f.p.setY(i, f.base[i * 3 + 1] + Math.sin(time * 3 + f.ph + k * 5) * 0.04 * k); } f.p.needsUpdate = true; f.fm.position.x = f.ox + Math.cos(b.yaw) * 1.2; f.fm.position.z = f.oz + Math.sin(b.yaw) * 1.2; } });
    // fontana nel parco
    const [fx, fz] = this.loc(b.cx, b.cz, b.yaw, 0, b.hz + 14);
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.9, 20), M.stone); fb.position.set(fx, b.y0 + 0.45, fz); this.add(fb);
    const fw = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.05, 20), std({ color: 0x3fb7c8, roughness: 0.05, emissive: 0x0a4a5a })); fw.position.set(fx, b.y0 + 0.85, fz); this.add(fw, false);
    const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 10), M.stone); fc.position.set(fx, b.y0 + 1.6, fz); this.add(fc);
    this.colliders.addCircle(fx, fz, 3.4, b.y0 + 3, b.y0 - 1);
  }

  buildLimonaia() {
    const M = this.mats, T = this.limonaia; if (!T) return;
    const pil = new THREE.BoxGeometry(0.55, 5.8, 0.55), pm = new THREE.InstancedMesh(pil, std({ color: 0xf2efe6, roughness: 0.9 }), 120);
    const beamA = new THREE.BoxGeometry(1, 0.28, 0.28), bmA = new THREE.InstancedMesh(beamA, M.wood, 120);
    const lem = new THREE.IcosahedronGeometry(0.9, 1), lm = new THREE.InstancedMesh(lem, std({ map: this.T.leafOak, color: 0xa6d46a, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 80);
    const fru = new THREE.IcosahedronGeometry(0.1, 1), fm = new THREE.InstancedMesh(fru, std({ color: 0xf5d52a, roughness: 0.5 }), 400);
    let pi = 0, bi = 0, li = 0, fi = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), rng = this.rng;
    T.forEach((tr, k) => {
      // muro di sostegno sul lato lago
      const [wx, wz] = this.loc(tr.x, tr.z, SA, 0, -6.0);
      const wall = this.box(44, 3.2, 0.9, wx, tr.y - 2.9, wz, SA, M.stone, 1 / 2.2);
      this.obbCollider(wx, wz, 22, 0.5, SA, tr.y - 4, tr.y + 0.3);
      for (let i = -5; i <= 5; i++) for (const side of [-4.2, 4.2]) {
        const [px, pz] = this.loc(tr.x, tr.z, SA, i * 4, side);
        e.set(0, -SA, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(px, tr.y + 2.9, pz), q, new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(pi++, m4);
        this.colliders.addCircle(px, pz, 0.35, tr.y + 6, tr.y - 1);
      }
      for (const side of [-4.2, 4.2]) { const [bx, bz] = this.loc(tr.x, tr.z, SA, 0, side); e.set(0, -SA, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(bx, tr.y + 5.9, bz), q, new THREE.Vector3(44, 1, 1)); bmA.setMatrixAt(bi++, m4); }
      for (let i = -5; i <= 5; i++) { const [bx, bz] = this.loc(tr.x, tr.z, SA, i * 4, 0); e.set(0, -SA + Math.PI / 2, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(bx, tr.y + 6.05, bz), q, new THREE.Vector3(9, 1, 1)); bmA.setMatrixAt(bi++, m4); }
      for (let i = -9; i <= 9; i++) { // limoni nel filare
        if (li >= 78) break;
        const [lx, lz] = this.loc(tr.x, tr.z, SA, i * 2.2 + rng.range(-0.3, 0.3), rng.range(-2.6, 2.6));
        e.set(0, rng.f() * 6, 0); q.setFromEuler(e); const s = rng.range(0.8, 1.2); m4.compose(new THREE.Vector3(lx, tr.y + 1.0, lz), q, new THREE.Vector3(s, s * 0.9, s)); lm.setMatrixAt(li++, m4);
        for (let f = 0; f < 4 && fi < 396; f++) { m4.makeTranslation(lx + rng.range(-0.8, 0.8), tr.y + rng.range(0.6, 1.7), lz + rng.range(-0.8, 0.8)); fm.setMatrixAt(fi++, m4); }
      }
    });
    pm.count = pi; bmA.count = bi; lm.count = li; fm.count = fi;
    for (const m of [pm, bmA, lm, fm]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    this.limonCount = fi;
  }

  buildSports() {
    const M = this.mats;
    // campo da calcio
    const f = this.field; if (f) {
      const g = new THREE.Group(); g.position.set(f.x, f.y, f.z); g.rotation.y = -SA; this.group.add(g);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), std({ map: pitchTexture('foot'), roughness: 0.9 }));
      pl.rotation.x = -Math.PI / 2; pl.position.y = 0.06; pl.receiveShadow = true; g.add(pl);
      for (const sgn of [-1, 1]) {
        const goal = new THREE.Group(); goal.position.set(sgn * 35, 0, 0); g.add(goal);
        for (const dz of [-3.66, 3.66]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 6), M.white); m.position.set(0, 1.28, dz); m.castShadow = true; goal.add(m); }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 6), M.white); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.5, 0); bar.castShadow = true; goal.add(bar);
      }
      for (let i = 0; i < 4; i++) { const [bx, bz] = this.loc(f.x, f.z, SA, 0, 26.5 + i * 1.1); this.box(40, 0.45 + i * 0.45, 1.1, bx, f.y - 0.1, bz, SA, M.cobble, 1 / 2); }
      const [cx, cz] = this.loc(f.x, f.z, SA, 0, 28.5); this.obbCollider(cx, cz, 20, 2.4, SA, f.y - 1, f.y + 1.9);
    }
    // tennis: due campi in rosso con recinzione (un lato aperto)
    const tn = this.tennis; if (tn) {
      const tex = pitchTexture('tennis'), fenceT = fenceTexture();
      const g = new THREE.Group(); g.position.set(tn.x, tn.y, tn.z); g.rotation.y = -SA; this.group.add(g);
      for (const oz of [-7.8, 7.8]) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), std({ map: tex, roughness: 0.95 })); pl.rotation.x = -Math.PI / 2; pl.position.set(0, 0.06, oz); pl.receiveShadow = true; g.add(pl);
        const net = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 0.9), std({ color: 0xe8e8e8, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); net.position.set(0, 0.6, oz); net.rotation.y = Math.PI / 2; g.add(net);
      }
      const fm = new THREE.MeshBasicMaterial({ map: fenceT, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
      const fence = (w, x, z, rot) => { const geo = new THREE.PlaneGeometry(w, 3.5); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.35, uv.getY(i) * 10); const m = new THREE.Mesh(geo, fm); m.position.set(x, 1.75, z); m.rotation.y = rot; g.add(m); };
      fence(31.5, 0, 16, 0); fence(31.5, 0, -16, 0); fence(32, 15.75, 0, Math.PI / 2);
      for (const sz of [-1, 1]) { const [fx, fz] = this.loc(tn.x, tn.z, SA, 0, sz * 16); this.obbCollider(fx, fz, 15.75, 0.15, SA, tn.y - 1, tn.y + 3.5); }
      const [fx2, fz2] = this.loc(tn.x, tn.z, SA, 15.75, 0); this.obbCollider(fx2, fz2, 0.15, 16, SA, tn.y - 1, tn.y + 3.5);
    }
  }

  buildPools() {
    const M = this.mats;
    const water = std({ color: 0x2fb9d6, roughness: 0.04, metalness: 0, emissive: 0x0b6f8c, emissiveIntensity: 0.55, normalMap: this.T.waterNormal, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.3 });
    water.normalMap.repeat.set(2, 2); this.poolWater = water;
    this.updaters.push((dt, time) => { water.normalMap.offset.set(time * 0.01, time * 0.007); });
    const umbr = new THREE.ConeGeometry(1.2, 0.45, 8), um = new THREE.InstancedMesh(umbr, std({ color: 0xf0e8d0, roughness: 0.8, side: THREE.DoubleSide }), 120);
    const bed = new THREE.BoxGeometry(0.7, 0.28, 1.9), bm = new THREE.InstancedMesh(bed, std({ color: 0xf6f6f2, roughness: 0.9 }), 400);
    let ui = 0, bi = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), rng = this.rng;
    for (const p of this.pools) {
      const [x, z] = [p.x, p.z];
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(p.w + 3.2, p.l + 3.2), std({ map: this.T.cobble.map, normalMap: this.T.cobble.nor, color: 0xeeeadc, roughness: 0.9 }));
      deck.rotation.x = -Math.PI / 2; deck.rotation.z = p.yaw; deck.position.set(x, p.y + 0.05, z); deck.receiveShadow = true; deck.material.map.repeat.set(1, 1);
      deck.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 3; }); this.group.add(deck);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.l), water); w.rotation.x = -Math.PI / 2; w.rotation.z = p.yaw; w.position.set(x, p.y - 0.06, z); w.receiveShadow = true; this.group.add(w);
      const n = rng.int(2, 5);
      for (let k = 0; k < n && bi < 400; k++) { const side = k % 2 ? 1 : -1, [bx, bz] = this.loc(x, z, p.yaw, -p.w / 2 + 1.5 + (k >> 1) * 2.1, side * (p.l / 2 + 1.1)); e.set(0, -p.yaw + Math.PI / 2, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(bx, p.y + 0.2, bz), q, new THREE.Vector3(1, 1, 1)); bm.setMatrixAt(bi++, m4); if (rng.f() < 0.5 && ui < 120) { const [ux, uz] = this.loc(bx, bz, p.yaw, 0, side * 1.5); m4.compose(new THREE.Vector3(ux, p.y + 2.3, uz), q, new THREE.Vector3(1, 1, 1)); um.setMatrixAt(ui++, m4); } }
      this.colliders.addObb({ cx: x, cz: z, hx: p.w / 2, hz: p.l / 2, c: Math.cos(p.yaw), s: Math.sin(p.yaw), y0: p.y - 1, top: p.y - 0.2 }); // si può camminare ma non è un ostacolo alto
    }
    um.count = ui; bm.count = bi; um.castShadow = true; bm.castShadow = true; this.group.add(um, bm);
  }

  buildLamps() {
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6); pole.translate(0, 2.6, 0);
    const arm = new THREE.BoxGeometry(1.2, 0.1, 0.1); arm.translate(0.5, 5.2, 0);
    const pm = [pole, arm], tmp = []; // un unico mesh
    const merged = new THREE.BufferGeometry();
    const g1 = pole.toNonIndexed(), g2 = arm.toNonIndexed();
    const pos = new Float32Array(g1.attributes.position.array.length + g2.attributes.position.array.length); pos.set(g1.attributes.position.array); pos.set(g2.attributes.position.array, g1.attributes.position.array.length);
    const nor = new Float32Array(pos.length); nor.set(g1.attributes.normal.array); nor.set(g2.attributes.normal.array, g1.attributes.normal.array.length);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const head = new THREE.BoxGeometry(0.55, 0.14, 0.28); head.translate(1.0, 5.15, 0);
    const lampsRoads = ['R2', 'R2b', 'R2c', 'R3b', 'R4', 'R5', 'R5b', 'RING', 'R3a'];
    const spots = [];
    for (const r of this.roads.roads) {
      if (!lampsRoads.includes(r.id)) continue;
      let side = 1;
      for (let s = 12; s < r.len - 6; s += 30) {
        const P = r.path[Math.min(r.path.length - 1, Math.round(s / 1.5))];
        const off = r.hw + (r.sidewalk ? 1.1 : 0.9), nx = -P.tz * side, nz = P.tx * side;
        spots.push({ x: P.x + nx * off, z: P.z + nz * off, y: P.y + (r.sidewalk ? 0.14 : 0.0), ang: Math.atan2(-nz, -nx) });
        side = -side;
      }
    }
    const N = spots.length;
    const pm_ = new THREE.InstancedMesh(merged, std({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 }), N);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd58a, emissiveIntensity: 0, roughness: 0.5 });
    const hm = new THREE.InstancedMesh(head, this.headMat, N);
    const glowG = new THREE.PlaneGeometry(1, 1); glowG.rotateX(-Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({ map: this.T.glow, color: 0xffc67a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const gm = new THREE.InstancedMesh(glowG, this.glowMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    spots.forEach((s, i) => {
      e.set(0, -s.ang, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1)); pm_.setMatrixAt(i, m4); hm.setMatrixAt(i, m4);
      const lx = s.x + Math.cos(s.ang + Math.PI) * 1.0 * 0, lz = s.z; q.identity(); m4.compose(new THREE.Vector3(s.x + Math.cos(s.ang) * 0.0, s.y + 0.1, s.z), q, new THREE.Vector3(13, 1, 13)); gm.setMatrixAt(i, m4);
      this.colliders.addCircle(s.x, s.z, 0.18, s.y + 5, s.y - 1);
    });
    pm_.castShadow = true; hm.castShadow = false;
    for (const m of [pm_, hm, gm]) { m.frustumCulled = true; m.computeBoundingSphere(); this.group.add(m); }
    gm.frustumCulled = false;
    this.lampsCount = N;
    this.updaters.push(() => { const n = this.nightU.value; this.headMat.emissiveIntensity = n * 4; this.glowMat.opacity = n * 0.55; });
  }

  buildCamp() {
    const c = this.camp; if (!c) return; const rng = this.rng;
    const tentG = new THREE.CylinderGeometry(0, 1.6, 1.5, 3, 1); tentG.rotateY(Math.PI / 2); tentG.scale(1.5, 1, 1); tentG.translate(0, 0.75, 0);
    const tm = new THREE.InstancedMesh(tentG, std({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }), 20);
    const van = new THREE.BoxGeometry(6.5, 2.6, 2.4); van.translate(0, 1.5, 0);
    const vm = new THREE.InstancedMesh(van, std({ color: 0xf2f0ea, roughness: 0.55 }), 10);
    const cols = [0xd9482e, 0x2f7fd0, 0xf2b52c, 0x39a368, 0xe0e0e0, 0x8e4fc0]; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let ti = 0, vi = 0;
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
      if (rng.f() < 0.35) continue;
      const [x, z] = this.loc(c.x, c.z, SA, i * 8 + rng.range(-1.5, 1.5), j * 9 + rng.range(-1.5, 1.5));
      const y = c.y;
      e.set(0, rng.range(0, 6.28), 0); q.setFromEuler(e);
      if (rng.f() < 0.65 && ti < 20) { m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); tm.setMatrixAt(ti, m4); tm.setColorAt(ti++, new THREE.Color(cols[rng.int(0, 5)])); this.colliders.addCircle(x, z, 1.5, y + 1.5, y - 1); }
      else if (vi < 10) { m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); vm.setMatrixAt(vi++, m4); this.colliders.addObb({ cx: x, cz: z, hx: 3.2, hz: 1.2, c: Math.cos(e.y), s: Math.sin(e.y), y0: y - 1, top: y + 2.8 }); }
    }
    tm.count = ti; vm.count = vi; tm.instanceColor.needsUpdate = true; tm.castShadow = vm.castShadow = true; tm.receiveShadow = vm.receiveShadow = true; this.group.add(tm, vm);
    // ingresso
    const [gx, gz] = this.loc(c.x, c.z, SA, 0, -29);
    const s = makeSign('CAMPING NANZEL', 6, 1.6, '#1d5a3a', '#fff', 'LIMONE SUL GARDA'); s.position.set(gx, c.y + 3.2, gz); s.rotation.y = -SA; this.add(s, false);
    for (const dz of [-3.2, 3.2]) { const [px, pz] = this.loc(gx, gz, SA, 0, dz); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.4, 8), this.mats.wood); p.position.set(px, c.y + 1.7, pz); this.add(p); }
  }

  buildKite() {
    const L = LANDMARKS.kite, M = this.mats;
    const [hx, hz] = [L.x - 2, L.z]; const y = this.terrain.heightAt(hx, hz);
    this.box(6, 2.6, 4, hx - 8, y, hz - 6, SA, M.wood, 1 / 2); this.box(5, 2.4, 3.6, hx - 8, y, hz + 8, SA, M.wood, 1 / 2);
    this.obbCollider(hx - 8, hz - 6, 3, 2, SA, y - 1, y + 3); this.obbCollider(hx - 8, hz + 8, 2.5, 1.8, SA, y - 1, y + 3);
    const s1 = makeSign('WIND RIDERS', 4.6, 1.2, '#103a5c', '#fff', 'KITESURF SCHOOL'); s1.position.set(hx - 4.9, y + 3.2, hz - 6); s1.rotation.y = -SA - Math.PI / 2; this.add(s1, false);
    const s2 = makeSign('MASELLI', 4.2, 1.2, '#7a1f1f', '#fff', 'KITE SCHOOL'); s2.position.set(hx - 5.6, y + 3.0, hz + 8); s2.rotation.y = -SA - Math.PI / 2; this.add(s2, false);
    // aquiloni nel cielo, animati
    const kites = [];
    const kg = new THREE.PlaneGeometry(5, 1.6, 12, 3), kcols = [0xff3d6e, 0xffd23d, 0x37b6ff, 0xff8a1e];
    for (let i = 0; i < 4; i++) {
      const p = kg.clone(); const pos = p.attributes.position; for (let k = 0; k < pos.count; k++) { const x = pos.getX(k); pos.setZ(k, -x * x * 0.16 + 0.0); }
      const m = new THREE.Mesh(p, std({ color: kcols[i], side: THREE.DoubleSide, roughness: 0.6, emissive: kcols[i], emissiveIntensity: 0.15 })); m.castShadow = true; this.group.add(m);
      kites.push({ m, ph: i * 1.7, cx: L.x + 140 + i * 40, cz: L.z + (i - 1.5) * 70 });
    }
    this.updaters.push((dt, time) => { for (const k of kites) { const a = time * 0.4 + k.ph; k.m.position.set(k.cx + Math.sin(a) * 60, 32 + Math.sin(a * 2) * 9, k.cz + Math.cos(a * 0.7) * 30); k.m.rotation.set(0.5 + Math.cos(a * 2) * 0.2, Math.cos(a) * 0.9 + 1.3, Math.sin(a) * 0.4); } });
  }

  buildBoats() {
    const M = this.mats, rng = this.rng, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    // barche ormeggiate nel porto
    const hullG = new THREE.CapsuleGeometry(0.9, 3.4, 4, 10); hullG.rotateZ(Math.PI / 2); hullG.scale(1, 0.55, 1);
    const cabG = new THREE.BoxGeometry(2.2, 0.9, 1.3); cabG.translate(0.2, 0.9, 0);
    const N = 20, hm = new THREE.InstancedMesh(hullG, std({ color: 0xffffff, roughness: 0.35, metalness: 0.1, envMapIntensity: 1 }), N), cm = new THREE.InstancedMesh(cabG, std({ color: 0xe8ecef, roughness: 0.3 }), N);
    const mastG = new THREE.CylinderGeometry(0.05, 0.06, 9, 6); mastG.translate(0, 5, 0);
    const mm = new THREE.InstancedMesh(mastG, std({ color: 0xcfd3d6, roughness: 0.4, metalness: 0.6 }), N);
    const sailG = new THREE.BufferGeometry(); sailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, 0, 8.5, 0, -3.6, 0.8, 0], 3)); sailG.computeVertexNormals();
    const sm = new THREE.InstancedMesh(sailG, std({ color: 0xfafaf6, roughness: 0.9, side: THREE.DoubleSide }), N);
    let hi = 0, ci = 0, mi = 0, si = 0; const hcols = [0xfafafa, 0x1f4e8c, 0xd8d8d8, 0xb3342b, 0x2d2d2d];
    for (const z of [-786, -768, -750, -732]) for (const s of [-1, 1]) {
      if (rng.f() < 0.2) continue;
      const [x, zz] = frame(z + s * 3.1, -17 + rng.range(-8, 8));
      e.set(0, Math.PI / 2 + rng.range(-0.03, 0.03), 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.15, zz), q, new THREE.Vector3(1, 1, 1));
      hm.setMatrixAt(hi, m4); hm.setColorAt(hi++, new THREE.Color(hcols[rng.int(0, 4)]));
      if (rng.f() < 0.5) { cm.setMatrixAt(ci++, m4); } else { mm.setMatrixAt(mi++, m4); sm.setMatrixAt(si++, m4); }
    }
    hm.count = hi; cm.count = ci; mm.count = mi; sm.count = si; hm.instanceColor.needsUpdate = true;
    for (const m of [hm, cm, mm, sm]) { m.castShadow = true; this.group.add(m); }
    // barche a vela e traghetto in navigazione
    this.sailers = [];
    const mkSail = (scale) => {
      const g = new THREE.Group(); const hull = new THREE.Mesh(hullG, std({ color: 0xfafafa, roughness: 0.35 })); hull.scale.set(2.4, 1, 1.4); g.add(hull);
      const mast = new THREE.Mesh(mastG, mm.material); mast.scale.setScalar(1.6); g.add(mast);
      const s1 = new THREE.Mesh(sailG, sm.material); s1.scale.setScalar(1.8); s1.rotation.y = Math.PI / 2 - 0.2; g.add(s1);
      g.scale.setScalar(scale); g.traverse((o) => { o.castShadow = true; }); return g;
    };
    const mkFerry = () => {
      const g = new THREE.Group(); const sh = new THREE.Shape(); sh.moveTo(-22, 0); sh.lineTo(24, 0); sh.lineTo(28, 2.6); sh.lineTo(-22, 2.6); sh.closePath();
      const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 8, bevelEnabled: false }), std({ color: 0xf2f2f2, roughness: 0.4 })); hull.position.set(0, -0.8, -4); g.add(hull);
      const band = new THREE.Mesh(new THREE.BoxGeometry(50, 0.8, 8.1), std({ color: 0x1c4f8f, roughness: 0.4 })); band.position.set(1, 0.4, 0); g.add(band);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 3.2, 6.6), std({ color: 0xf6f6f6, roughness: 0.4 })); deck.position.set(-3, 3.7, 0); g.add(deck);
      const win = new THREE.Mesh(new THREE.BoxGeometry(33, 1.0, 6.7), M.glass); win.position.set(-3, 4.1, 0); g.add(win);
      const top = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 5), std({ color: 0xf6f6f6, roughness: 0.4 })); top.position.set(-8, 6.9, 0); g.add(top);
      const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 10), std({ color: 0x1c4f8f, roughness: 0.5 })); fun.position.set(-14, 8.8, 0); g.add(fun);
      g.traverse((o) => { o.castShadow = true; }); g.scale.setScalar(0.9); return g;
    };
    const mk = (obj, cx, cz, rx, rz, sp, ph, y = 0.1) => { this.group.add(obj); this.sailers.push({ obj, cx, cz, rx, rz, sp, ph, y }); };
    const [bx, bz] = frame(-150, -700); mk(mkSail(1.4), bx, bz, 420, 220, 0.025, 0.5); mk(mkSail(1.2), bx - 200, bz + 300, 380, 260, -0.02, 2.2); mk(mkSail(1.3), bx + 300, bz - 400, 300, 280, 0.03, 4.1);
    const [fx, fz] = frame(0, -520); mk(mkFerry(), fx, fz, 90, 900, 0.018, 1.0, 0.7);
    this.updaters.push((dt, time) => {
      for (const b of this.sailers) {
        const a = b.ph + time * b.sp, x = b.cx + Math.cos(a) * b.rx, z = b.cz + Math.sin(a) * b.rz;
        const dx = -Math.sin(a) * b.rx * Math.sign(b.sp), dz = Math.cos(a) * b.rz * Math.sign(b.sp);
        b.obj.position.set(x, b.y + waveH(x, z, time) * 0.8, z); b.obj.rotation.set(Math.sin(time * 0.8 + b.ph) * 0.03, -Math.atan2(dz, dx), Math.sin(time * 0.6 + b.ph) * 0.05 - (b.obj.children.length < 6 ? 0.08 : 0));
        b.x = x; b.z = z;
      }
    });
  }

  buildGulls() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, -1.2, 0, -0.1, 1.2, 0, -0.1, 0, 0, 0.35, 1.2, 0, -0.1, 0, 0, -0.6, 0, 0, 0.35, 0, 0, -0.6, -1.2, 0, -0.1], 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f6f8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.timeU; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph = instanceMatrix[3].x * 0.37; transformed.y += sin(uTime * 7.0 + ph) * abs(position.x) * 0.45;'); };
    const N = 14, im = new THREE.InstancedMesh(g, mat, N); im.frustumCulled = false; this.group.add(im);
    const [cx, cz] = frame(-200, -150);
    const birds = Array.from({ length: N }, (_, i) => ({ cx: cx + this.rng.range(-300, 200), cz: cz + this.rng.range(-600, 500), r: this.rng.range(40, 160), sp: this.rng.range(0.12, 0.3) * (i % 2 ? 1 : -1), ph: this.rng.range(0, 6), h: this.rng.range(14, 55) }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.updaters.push((dt, time) => { birds.forEach((b, i) => { const a = b.ph + time * b.sp; e.set(0.12 * Math.sign(b.sp), -a * Math.sign(b.sp) + Math.PI, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(b.cx + Math.cos(a) * b.r, b.h + Math.sin(time * 0.5 + b.ph) * 3, b.cz + Math.sin(a) * b.r), q, new THREE.Vector3(1.1, 1.1, 1.1)); im.setMatrixAt(i, m4); }); im.instanceMatrix.needsUpdate = true; });
  }

  buildStream() {
    // ruscello della cascata di Sopino: nastro d'acqua che segue il pendio
    const L = LANDMARKS.sopino, t = this.terrain;
    const pts = []; for (let d = 345; d > 176; d -= 3) { const jitter = Math.sin(d * 0.05) * 6; const [x, z] = frame(640 + jitter + (345 - d) * 0.05, d); pts.push([x, z]); }
    const n = pts.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), slope = new Float32Array(n * 2), idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const w = 1.2 + (345 - 176 - (pts.length - i) * 3 + 169) * 0 + 1.1;
      const y = t.heightAt(pts[i][0], pts[i][1]) + 0.25;
      pos.set([pts[i][0] - tz * w, y, pts[i][1] + tx * w, pts[i][0] + tz * w, y, pts[i][1] - tx * w], i * 6);
      if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      uv.set([0, s / 6, 1, s / 6], i * 4);
      const sl = i ? clamp((t.heightAt(pts[i - 1][0], pts[i - 1][1]) - t.heightAt(pts[i][0], pts[i][1])) / 3, 0, 1.5) : 0.3; slope[i * 2] = slope[i * 2 + 1] = sl;
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: this.timeU, tN: { value: this.T.waterNormal }, uDay: { value: 1 } }]),
      vertexShader: 'attribute float aSlope; varying vec2 vUv; varying float vS;\n#include <fog_pars_vertex>\nvoid main(){ vUv = uv; vS = aSlope; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: 'varying vec2 vUv; varying float vS; uniform float uTime, uDay; uniform sampler2D tN;\n#include <fog_pars_fragment>\nvoid main(){ vec2 p = vec2(vUv.x * 1.5, vUv.y - uTime * (0.6 + vS * 2.5)); vec3 n = texture2D(tN, p * vec2(0.8, 0.6)).xyz; float f = smoothstep(0.35, 0.95, n.x * 0.6 + n.y * 0.5 + vS * 0.6); float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x); vec3 col = mix(vec3(0.25, 0.52, 0.58), vec3(0.95), f * (0.4 + vS)); col *= 0.25 + 0.75 * uDay; gl_FragColor = vec4(col, edge * (0.65 + 0.3 * f));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}',
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 3; m.frustumCulled = false; this.group.add(m);
    this.streamMat = mat; this.waterfall = { x: pts[0][0], z: pts[0][1] };
    this.updaters.push(() => { mat.uniforms.uDay.value = this.sky.state.dayF; });
  }

  buildSigns() {
    // insegne dei luoghi principali
    const find = (L, filter) => { let best = null, bd = 1e9; for (const b of this.buildings.list) { if (filter && !filter(b)) continue; const d = Math.hypot(b.cx - L.x, b.cz - L.z); if (d < bd) { bd = d; best = b; } } return best; };
    const sign = (b, text, sub, bg, w = 5.6) => { if (!b) return; const s = makeSign(text, w, 1.5, bg, '#fff', sub); const [x, z] = this.loc(b.cx, b.cz, b.yaw, 0, b.hz + 0.12); s.position.set(x, b.y0 + 3.6, z); s.rotation.y = -b.yaw; this.add(s, false); const s2 = s.clone(); const [x2, z2] = this.loc(b.cx, b.cz, b.yaw, 0, -b.hz - 0.12); s2.position.set(x2, b.y0 + 3.6, z2); s2.rotation.y = -b.yaw + Math.PI; this.add(s2, false); };
    if (this.comuneB) { sign(this.comuneB, 'COMUNE DI LIMONE', 'SUL GARDA', '#7a1f1f', 9); }
    const pz = find(LANDMARKS.pizza, (b) => b.type === 'old'); this.pizzaB = pz; if (pz) { sign(pz, 'PIZZERIA', 'AL PORTO', '#b3342b', 4.6); LANDMARKS.pizza.x = pz.cx; LANDMARKS.pizza.z = pz.cz; }
    const hp = find(LANDMARKS.panorama, (b) => b.type === 'hotel'); this.panoramaB = hp; if (hp) { sign(hp, 'HOTEL PANORAMA', '★★★★', '#12384a', 8); LANDMARKS.panorama.x = hp.cx; LANDMARKS.panorama.z = hp.cz; }
    const cb = find(LANDMARKS.carabinieri, (b) => b.type === 'villa' || b.type === 'hotel'); if (cb) { sign(cb, 'CARABINIERI', 'STAZIONE', '#0f2a55', 6); LANDMARKS.carabinieri.x = cb.cx; LANDMARKS.carabinieri.z = cb.cz; }
    const gm = find(LANDMARKS.guardia, (b) => b.type === 'old' || b.type === 'villa'); if (gm) { sign(gm, 'GUARDIA MEDICA', '+', '#1f7a4d', 6.4); LANDMARKS.guardia.x = gm.cx; LANDMARKS.guardia.z = gm.cz; }
    const sc = makeSign('SPIAGGIA COLA', 5, 1.3, '#0f5d70', '#fff', 'LIMONE SUL GARDA'); const [sx, sz] = frame(-5, 14); sc.position.set(sx, this.terrain.heightAt(sx, sz) + 2.4, sz); sc.rotation.y = -SA; this.add(sc, false);
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), this.mats.dark); p1.position.set(sx, this.terrain.heightAt(sx, sz) + 1.2, sz); this.add(p1);
  }

  update(dt, time) { for (const f of this.updaters) f(dt, time); }
}
