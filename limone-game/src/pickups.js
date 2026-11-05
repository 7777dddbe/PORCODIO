// Oggetti da raccogliere: limoni, soldi, gelati (salute), giubbotto, armi, munizioni
import * as THREE from 'three';
import { frame, LANDMARKS } from './map.js';
import { RNG } from './util.js';
import { buildWeaponModel, WEAPONS } from './weapons.js';

export class Pickups {
  constructor(G) {
    this.G = G; this.list = []; this.group = new THREE.Group(); G.scene.add(this.group); this.t = 0;
    const glowMap = G.T.glow;
    this.glowMats = {};
    const gm = (c) => this.glowMats[c] || (this.glowMats[c] = new THREE.SpriteMaterial({ map: glowMap, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    this.gm = gm;
    // geometrie
    this.lemonGeo = new THREE.SphereGeometry(0.17, 12, 8); this.lemonGeo.scale(1.15, 0.9, 0.9);
    this.lemonMat = new THREE.MeshStandardMaterial({ color: 0xf6dc2e, roughness: 0.45, emissive: 0x6a5a00, emissiveIntensity: 0.4 });
    this.leafGeo = new THREE.PlaneGeometry(0.2, 0.1); this.leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, side: THREE.DoubleSide });
    this.cashMat = new THREE.MeshStandardMaterial({ color: 0x4caf62, roughness: 0.6, emissive: 0x0e3a18, emissiveIntensity: 0.5 });
    this.cashGeo = new THREE.BoxGeometry(0.34, 0.05, 0.18);
  }
  add(type, x, z, o = {}) {
    const G = this.G, y = (o.y ?? G.terrain.heightAt(x, z)) + (o.lift ?? 0.9);
    const g = new THREE.Group(); g.position.set(x, y, z);
    let glow = 0xffee66, size = 1.2;
    if (type === 'lemon') { const m = new THREE.Mesh(this.lemonGeo, this.lemonMat); m.castShadow = true; g.add(m); const l = new THREE.Mesh(this.leafGeo, this.leafMat); l.position.set(0.1, 0.16, 0); l.rotation.set(-0.5, 0, 0.5); g.add(l); size = 1.5; }
    else if (type === 'cash') { for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(this.cashGeo, this.cashMat); b.position.y = i * 0.055; b.rotation.y = i * 0.5; g.add(b); } glow = 0x66ff88; }
    else if (type === 'health') { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 10), new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 0.7 })); cone.rotation.x = Math.PI; cone.position.y = -0.12; g.add(cone); const a = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf6a7c1, roughness: 0.5 })); a.position.y = 0.08; g.add(a); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c9, roughness: 0.5 })); b.position.y = 0.22; g.add(b); glow = 0xff9fc0; }
    else if (type === 'armor') { const v = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a4f8a, roughness: 0.6, emissive: 0x0a1a3a, emissiveIntensity: 0.5 })); g.add(v); glow = 0x66aaff; }
    else if (type === 'weapon') { const w = buildWeaponModel(o.weapon); w.rotation.x = -Math.PI / 2; w.scale.setScalar(1.8); g.add(w); glow = 0xff8844; size = 1.6; }
    else if (type === 'ammo') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.6 })); g.add(b); glow = 0xffc040; }
    const sp = new THREE.Sprite(this.gm(glow)); sp.scale.setScalar(size); g.add(sp);
    g.userData = { spr: sp };
    this.group.add(g);
    const p = { type, x, z, y, g, amount: o.amount || 0, weapon: o.weapon, respawn: o.respawn || 0, taken: false, tt: 0, life: o.life || 0, ph: Math.random() * 6 };
    this.list.push(p); return p;
  }
  dropCash(x, z, amt) { this.add('cash', x, z, { amount: amt, life: 60, lift: 0.5 }); }
  dropAmmo(x, z) { this.add('ammo', x, z, { amount: 18, life: 60, lift: 0.4 }); }
  populate() {
    const G = this.G, rng = new RNG(4242), T = G.terrain;
    // limoni: luoghi scelti + sparsi lungo le strade e sulle colline
    const spots = [[-772, 44], [-772, 56], [-772, 69], [-750, -10], [-738, -105], [-806, -60], [-5, 6], [30, 10], [505, 8], [530, 6], [790, 40], [740, 24], [-160, 40], [-95, 45], [-20, 118], [306, 342], [330, 335], [640, 330], [660, 300], [-640, 40], [-720, 36], [-590, 20], [60, 100], [200, 85], [400, 85], [-300, 200], [-380, 150], [100, 190], [240, 258], [286, 300], [-560, 20], [880, 130], [1000, 125], [-930, 66], [-1100, 85], [620, 150], [470, 40], [230, 27], [-230, 60]];
    for (const [z, d] of spots) { const [x, zz] = frame(z, d); if (T.heightAt(x, zz) > 0.8) this.add('lemon', x, zz); }
    G.totalLemons = this.list.filter((p) => p.type === 'lemon').length;
    // gelati (salute)
    for (const [z, d] of [[-745, 10], [-640, 24], [-5, 26], [500, 24], [790, 36], [-170, 76], [200, 100], [-415, 22], [306, 350], [-20, 100]]) { const [x, zz] = frame(z, d); this.add('health', x, zz, { respawn: 90 }); }
    for (const [z, d] of [[-700, 36], [60, 85], [-300, 160], [620, 30]]) { const [x, zz] = frame(z, d); this.add('armor', x, zz, { respawn: 150 }); }
    // armi
    const bel = LANDMARKS.belvedere, nz = LANDMARKS.nanzel;
    this.add('weapon', bel.x + 3, bel.z + 3, { weapon: 'smg', respawn: 0 }); this.add('weapon', nz.x + 5, nz.z - 8, { weapon: 'shotgun', respawn: 0 });
    for (const [z, d] of [[-740, 22], [-30, 30], [450, 30], [-420, 30]]) { const [x, zz] = frame(z, d); this.add('ammo', x, zz, { amount: 24, respawn: 120 }); }
    // soldi sparsi
    for (let i = 0; i < 18; i++) { const r = G.roads.roads[rng.int(0, G.roads.roads.length - 1)], P = r.path[rng.int(0, r.path.length - 1)]; this.add('cash', P.x + 2, P.z + 2, { amount: rng.int(30, 120), respawn: 200, lift: 0.5 }); }
  }
  update(dt) {
    const G = this.G, pl = G.player; this.t += dt;
    const px = pl.pos.x, pz = pl.pos.z, reach = pl.vehicle ? 3.2 : 1.7;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.taken) { if (p.respawn) { p.tt -= dt; if (p.tt <= 0) { p.taken = false; p.g.visible = true; } } continue; }
      if (p.life) { p.life -= dt; if (p.life <= 0) { this.group.remove(p.g); this.list.splice(i, 1); continue; } }
      const dx = p.x - px, dz = p.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > 90000) { p.g.visible = false; continue; } p.g.visible = true;
      if (d2 < 22500) { p.g.rotation.y += dt * 2; p.g.position.y = p.y + Math.sin(this.t * 2 + p.ph) * 0.07; }
      if (d2 < reach * reach && Math.abs(pl.pos.y - (p.y - 0.8)) < 3.2 && !pl.dead) this.collect(p);
    }
  }
  collect(p) {
    const G = this.G, pl = G.player; let ok = true;
    if (p.type === 'lemon') { G.stats.lemons++; pl.money += 10; G.hud.toast(`🍋 Limone ${G.stats.lemons}/${G.totalLemons}`); G.audio.pickup(); if (G.stats.lemons === G.totalLemons) { pl.money += 1000; G.hud.toast('Tutti i limoni! +€1000', true); } }
    else if (p.type === 'cash') { pl.money += p.amount; G.hud.toast('+€' + p.amount); G.audio.money(); }
    else if (p.type === 'health') { if (pl.hp >= 100) ok = false; else { pl.hp = Math.min(100, pl.hp + 45); G.hud.toast('🍦 Gelato! +45 salute'); G.audio.pickup(); } }
    else if (p.type === 'armor') { if (pl.armor >= 100) ok = false; else { pl.armor = 100; G.hud.toast('Giubbotto antiproiettile'); G.audio.pickup(); } }
    else if (p.type === 'weapon') { pl.giveWeapon(p.weapon); G.hud.toast(`Nuova arma: ${WEAPONS[p.weapon].name}`, true); G.audio.pickup(); }
    else if (p.type === 'ammo') { pl.addAmmo(p.amount); G.hud.toast('Munizioni +' + p.amount); G.audio.pickup(); }
    if (!ok) return;
    p.taken = true; p.g.visible = false; p.tt = p.respawn || 0;
    if (!p.respawn) { this.group.remove(p.g); const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); }
  }
}
