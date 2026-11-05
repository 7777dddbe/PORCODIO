// Missioni: gara in moto d'acqua, consegna pizze, fuga dai Carabinieri. Raccolta limoni nel HUD.
import * as THREE from 'three';
import { frame, LANDMARKS } from './map.js';
import { fmtMoney } from './util.js';

export class Missions {
  constructor(G) {
    this.G = G; this.active = null; this.group = new THREE.Group(); G.scene.add(this.group); this.t = 0; this.starts = []; this.cool = 0;
    this.beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }
  makeBeam(color, h = 60, r = 1.6) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true), this.beamMat(color)); beam.position.y = h / 2; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.4, 0.18, 8, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.G.T.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(r * 3); sp.position.y = 1.2; g.add(sp);
    return g;
  }
  init() {
    const G = this.G, P = G.props, T = G.terrain;
    const front = (b, off) => { if (!b) return null; const c = Math.cos(b.yaw), s = Math.sin(b.yaw), lz = b.hz + off; return { x: b.cx - lz * s, z: b.cz + lz * c }; };
    const pz = front(P.pizzaB, 3.0) || { x: LANDMARKS.pizza.x, z: LANDMARKS.pizza.z };
    const hp = front(P.panoramaB, 3.5) || { x: LANDMARKS.panorama.x, z: LANDMARKS.panorama.z };
    const cb = LANDMARKS.carabinieri;
    const [jx, jz] = frame(-750, -33);
    this.starts = [
      { id: 'jet', color: '#ffd93a', hex: 0xffd93a, x: jx, z: jz, name: 'Gara in moto d\'acqua', y: T.heightAt(jx, jz), need: 'jet' },
      { id: 'pizza', color: '#ff7a3a', hex: 0xff7a3a, x: pz.x, z: pz.z, name: 'Consegna pizza', y: T.heightAt(pz.x, pz.z), need: null },
      { id: 'run', color: '#4aa8ff', hex: 0x4aa8ff, x: cb.x + 4, z: cb.z + 12, name: 'Fuga dai Carabinieri', y: T.heightAt(cb.x + 4, cb.z + 12), need: null },
    ];
    for (const s of this.starts) { s.beam = this.makeBeam(s.hex, 40, 1.4); s.beam.position.set(s.x, s.y, s.z); this.group.add(s.beam); }
    this.pizzaTo = hp;
  }
  markers() {
    const out = [];
    if (!this.active) for (const s of this.starts) out.push({ x: s.x, z: s.z, color: s.color });
    else for (const m of this.active.markers()) out.push(m);
    return out;
  }
  update(dt) {
    const G = this.G, pl = G.player; this.t += dt; this.cool -= dt;
    for (const s of this.starts) { s.beam.visible = !this.active; s.beam.rotation.y += dt; }
    if (this.active) {
      const r = this.active.update(dt);
      G.hud.mission(this.active.hud());
      if (r === 'win' || r === 'fail') {
        const m = this.active; this.active = null; this.clearVisuals(m);
        if (r === 'win') { pl.money += m.reward; G.hud.toast('Missione completata! +' + fmtMoney(m.reward), true, 4000); G.audio.pickup(); G.stats.missions++; }
        else G.hud.toast('Missione fallita', true, 3000);
        G.hud.mission(null); this.cool = 3;
      }
      return;
    }
    G.hud.mission(null);
    if (pl.dead || this.cool > 0) return;
    for (const s of this.starts) {
      const d = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z), r = pl.vehicle ? 11 : 4;
      if (d < r) {
        if (s.need === 'jet') { if (pl.vehicle && pl.vehicle.kind === 'jet') { this.start(s); } else G.hud.prompt('Sali su una <b>moto d\'acqua</b> per la gara'); return; }
        if (s.id === 'pizza' && pl.vehicle) { this.start(s); return; }
        if (pl.vehicle) return;
        G.hud.prompt(`<b>E</b> ${s.name}`);
        if (G.input.use) { this.start(s); }
        return;
      }
    }
  }
  start(s) {
    const G = this.G;
    if (s.id === 'jet') this.active = new JetRace(G, this);
    else if (s.id === 'pizza') this.active = new Pizza(G, this);
    else this.active = new Run(G, this);
    G.hud.toast(s.name, true, 3000);
  }
  clearVisuals(m) { if (m.dispose) m.dispose(); }
}

class JetRace {
  constructor(G, M) {
    this.G = G; this.M = M; this.reward = 800; this.time = 85; this.i = 0; this.title = 'Gara in moto d\'acqua';
    const pts = [[-720, -130], [-610, -210], [-500, -280], [-380, -230], [-300, -140], [-380, -60], [-520, -110], [-640, -90], [-745, -38]];
    this.pts = pts.map(([z, d]) => { const [x, zz] = frame(z, d); return { x, z: zz }; });
    this.beam = M.makeBeam(0x37e0ff, 26, 6); M.group.add(this.beam); this.next = M.makeBeam(0xffffff, 16, 3); M.group.add(this.next); this.place();
    this.hex = 0;
  }
  place() { const p = this.pts[this.i], n = this.pts[Math.min(this.pts.length - 1, this.i + 1)]; this.beam.position.set(p.x, 0.2, p.z); this.next.position.set(n.x, 0.2, n.z); this.next.visible = this.i < this.pts.length - 1; }
  markers() { return [{ x: this.pts[this.i].x, z: this.pts[this.i].z, color: '#37e0ff' }]; }
  hud() { return { title: this.title, text: `Boa ${this.i + 1}/${this.pts.length}`, timer: this.time }; }
  update(dt) {
    const G = this.G, pl = G.player; this.time -= dt; this.beam.rotation.y += dt;
    if (this.time <= 0) return 'fail';
    if (pl.dead) return 'fail';
    const p = this.pts[this.i];
    if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 11) { this.i++; G.audio.pickup(); if (this.i >= this.pts.length) return 'win'; this.place(); G.hud.toast(`Boa ${this.i}/${this.pts.length}`); }
    if (!(pl.vehicle && pl.vehicle.kind === 'jet') && !pl.swimming) { /* può scendere ma il tempo corre */ }
  }
  dispose() { this.M.group.remove(this.beam); this.M.group.remove(this.next); }
}

class Pizza {
  constructor(G, M) {
    this.G = G; this.M = M; this.reward = 450; this.time = 160; this.title = 'Consegna pizza'; this.phase = 0;
    this.to = M.pizzaTo; this.beam = M.makeBeam(0x4cff7a, 40, 1.8); this.beam.position.set(this.to.x, G.terrain.heightAt(this.to.x, this.to.z), this.to.z); M.group.add(this.beam);
    G.hud.toast('Pizza caricata! Portala all\'Hotel Panorama', false, 4000);
  }
  markers() { return [{ x: this.to.x, z: this.to.z, color: '#4cff7a' }]; }
  hud() { return { title: this.title, text: 'Porta la pizza all\'Hotel Panorama prima che si fredda!', timer: this.time }; }
  update(dt) {
    const G = this.G, pl = G.player; this.time -= dt; this.beam.rotation.y += dt;
    if (this.time <= 0 || pl.dead) return 'fail';
    if (Math.hypot(pl.pos.x - this.to.x, pl.pos.z - this.to.z) < (pl.vehicle ? 9 : 4)) { this.reward += Math.floor(this.time * 2); return 'win'; }
  }
  dispose() { this.M.group.remove(this.beam); }
}

class Run {
  constructor(G, M) {
    this.G = G; this.M = M; this.reward = 1500; this.time = 80; this.title = 'Fuga dai Carabinieri';
    G.setWanted(3); G.hud.toast('Hai combinato un guaio! Scappa!', false, 3500);
  }
  markers() { return []; }
  hud() { return { title: this.title, text: 'Resisti finché non ti mollano', timer: this.time }; }
  update(dt) {
    const G = this.G; this.time -= dt;
    if (G.player.dead) return 'fail';
    if (G.wanted === 0 || this.time <= 0) { G.setWanted(0); return 'win'; }
    // il tempo scorre solo finché ti inseguono
  }
}
