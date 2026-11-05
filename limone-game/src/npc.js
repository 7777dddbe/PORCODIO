// Persone (pedoni, carabinieri), traffico, polizia
import * as THREE from 'three';
import { buildHuman, MAX } from './character.js';
import { Vehicle, DriverAI, routeAStar } from './vehicles.js';
import { clamp, lerp, damp, wrapAngle, RNG } from './util.js';
import { buildWeaponModel, WEAPONS } from './weapons.js';

const SKINS = ['#f1c9a8', '#e3b48f', '#d1a07a', '#b57e57', '#8d5a3c', '#e8bd9d'];
const HAIR = ['#1b1210', '#3a2518', '#6b4a2a', '#9c7a43', '#c9a76a', '#8a8a8a', '#2b1a12', '#5a2e1e'];
const SHIRTS = ['#e9e6df', '#d94f4f', '#3f7fd0', '#e8c14a', '#3fa56b', '#f08a3a', '#8e5fc0', '#2c3e50', '#f2a7c0', '#59c7c0'];
const PANTS = ['#2b3652', '#3b3b3f', '#a8946c', '#5c6a82', '#e7e2d6', '#1d1d20', '#6b4e34'];

let HID = 1;
export class Human {
  constructor(G, o = {}) {
    this.G = G; this.id = HID++; this.kind = o.kind || 'ped';
    const r = G.rng;
    const opts = o.cop ? { ...MAX, seed: 3, skin: r.pick(SKINS.slice(0, 3)), freckles: 0, hair: '#1b1210', curly: false, glasses: false, jacket: '#10213f', shirt: '#e8ecf2', pants: '#0f1a30', shoes: '#111', hat: '#0b1630', hairStyle: 'short', knit: null }
      : { ...MAX, seed: r.int(1, 7), skin: r.pick(SKINS), freckles: r.f() < 0.2 ? 40 : 0, hair: r.pick(HAIR), hairHi: r.pick(HAIR), curly: false, glasses: r.f() < 0.14, jacket: r.pick(SHIRTS), shirt: '#f2f0ec', pants: r.pick(PANTS), shoes: r.pick(['#f0f0f0', '#2a2a2a', '#7a5a3a', '#c0392b']), hat: r.f() < 0.22 ? r.pick(['#f0e6c8', '#d9534f', '#2f6db5', '#e8e8e8']) : null, long: r.f() < 0.4, tuft: r.f() < 0.2, knit: null, brow: '#2a1a12', lip: r.pick(['#b8625f', '#c97f7f', '#a85050']) };
    this.rig = buildHuman(opts); this.root = this.rig.root; G.scene.add(this.root);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.vy = 0;
    this.hp = o.cop ? 120 : 60; this.state = 'idle'; this.t = 0; this.dead = false; this.deadT = 0; this.r = 0.38; this.threat = null; this.fleeT = 0; this.hitT = 0;
    this.cop = !!o.cop; this.shootCd = 1 + Math.random() * 2; this.alpha = 1; this.wantYaw = 0;
    if (o.cop) { this.gun = buildWeaponModel('pistol'); this.rig.weaponSlot.add(this.gun); }
    this.path = null; this.s = 0; this.dir = 1; this.lat = 0; this.pause = 0; this.inCar = null; this.stuck = 0;
  }
  place(x, z) { this.pos.set(x, this.G.terrain.heightAt(x, z), z); this.root.position.copy(this.pos); }
  hit(dmg, src, head = false) {
    if (this.dead) return;
    this.hp -= dmg * (head ? 2.5 : 1); this.hitT = 0.3;
    this.G.audio.hit(0.7);
    if (this.hp <= 0) this.die(src);
    else if (!this.cop) { this.state = 'flee'; this.fleeT = 8 + Math.random() * 5; this.threat = src && src.pos ? src.pos.clone() : this.G.player.pos.clone(); }
    if (src === this.G.player) { this.G.crime(this.cop ? 2 : 0.5, this); if (this.cop) this.G.wantedHeat = Math.max(this.G.wantedHeat, 2); }
    if (this.cop && src === this.G.player) this.state = 'chase';
  }
  die(src) {
    this.dead = true; this.deadT = 0; this.state = 'dead';
    if (src === this.G.player) { this.G.crime(this.cop ? 3 : 1.2, this); this.G.stats.kills++; }
    if (Math.random() < 0.65 || this.cop) this.G.pickups.dropCash(this.pos.x + (Math.random() - 0.5), this.pos.z + (Math.random() - 0.5), this.cop ? 120 : 20 + Math.floor(Math.random() * 140));
    if (this.cop && Math.random() < 0.5) this.G.pickups.dropAmmo(this.pos.x, this.pos.z);
  }
  update(dt) {
    const G = this.G, T = G.terrain;
    this.t += dt; this.hitT = Math.max(0, this.hitT - dt);
    if (this.dead) {
      this.deadT += dt; this.rig.animate(dt, { mode: 'dead' });
      if (this.deadT > 14) { this.alpha = Math.max(0, 1 - (this.deadT - 14) / 2); this.root.scale.setScalar(Math.max(0.01, this.alpha)); if (this.alpha <= 0) return 'remove'; }
      this.root.position.y = Math.max(T.heightAt(this.pos.x, this.pos.z), -0.2) + 0.05; return;
    }
    const pl = G.player, dPl = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    let targetSpeed = 0, st = { mode: 'foot' };
    if (this.cop) this.copAI(dt, dPl);
    else this.pedAI(dt, dPl);
    // movimento
    let tgtSp = this.wantSpeed || 0;
    this.speed = damp(this.speed, tgtSp, 8, dt);
    const dyaw = wrapAngle(this.wantYaw - this.yaw); this.yaw += clamp(dyaw, -dt * 7, dt * 7);
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      const h0 = T.heightAt(this.pos.x, this.pos.z), h1 = T.heightAt(nx, nz);
      if (h1 > -0.45 && (h1 - h0) / (this.speed * dt + 1e-4) < 1.4) { this.pos.x = nx; this.pos.z = nz; }
      else { this.blocked = true; if (!this.cop && this.state !== 'flee') this.dir *= -1; this.speed *= 0.3; }
    }
    const col = G.colliders.resolve(this.pos, this.r, G._o || (G._o = { nx: 0, nz: 0, depth: 0 }));
    if (col && this.speed > 0.5) { this.stuck += dt; if (this.stuck > 1.2 && !this.cop) { this.dir *= -1; this.stuck = 0; } } else this.stuck = Math.max(0, this.stuck - dt);
    const gy = T.heightAt(this.pos.x, this.pos.z); this.pos.y = damp(this.pos.y, gy, 20, dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    st.speed = this.speed; st.flee = this.state === 'flee'; st.hurt = this.hitT > 0 ? 1 : 0; st.holdWeapon = this.cop; st.aim = this.cop && this.state === 'shoot'; st.pitch = 0; st.wave = this.waving;
    this.rig.animate(dt, st);
  }
  pedAI(dt, dPl) {
    const G = this.G, pl = G.player;
    // paura: armi puntate, spari vicini o veicoli veloci
    if (this.state !== 'flee') {
      const nz = G.lastNoise; if (nz && G.time - nz.t < 1.5 && Math.hypot(nz.x - this.pos.x, nz.z - this.pos.z) < nz.r * 0.5) { this.state = 'flee'; this.fleeT = 7 + Math.random() * 6; this.threat = new THREE.Vector3(nz.x, 0, nz.z); }
      if (pl.aiming && dPl < 16 && pl.weapon.id !== 'fists') { this.state = 'flee'; this.fleeT = 6; this.threat = pl.pos.clone(); }
      const v = pl.vehicle; if (v && v.speed > 9 && dPl < 14) { const toX = this.pos.x - v.pos.x, toZ = this.pos.z - v.pos.z; if ((toX * v.vx + toZ * v.vz) < 0 && Math.abs(toX * v.vz - toZ * v.vx) / (v.speed + 0.1) < 2.5) { this.state = 'flee'; this.fleeT = 3; this.threat = v.pos.clone(); } }
    }
    this.waving = false;
    if (this.state === 'flee') {
      this.fleeT -= dt; const th = this.threat || pl.pos;
      this.wantYaw = Math.atan2(this.pos.x - th.x, this.pos.z - th.z) + Math.sin(this.t * 1.3) * 0.5; this.wantSpeed = 5.6;
      if (this.fleeT <= 0) { this.state = 'idle'; this.pause = 1; this.snapToPath(); }
      return;
    }
    if (!this.path) { this.snapToPath(); }
    if (this.pause > 0) { this.pause -= dt; this.wantSpeed = 0; this.waving = dPl < 4 && this.t % 30 < 3 && this.id % 5 === 0; if (dPl < 5) this.wantYaw = Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z); return; }
    // segue il percorso
    const P = this.path.path; this.s += this.dir * 1.35 * dt;
    const L = this.path.len;
    if (this.s < 0 || this.s > L) { this.dir *= -1; this.s = clamp(this.s, 0, L); }
    const p = P[Math.min(P.length - 1, Math.max(0, Math.round(this.s / 1.5)))];
    const tx = p.x + -p.tz * this.lat, tz = p.z + p.tx * this.lat;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 6) { this.snapToPath(true); return; }
    this.wantYaw = Math.atan2(dx + p.tx * this.dir * 2, dz + p.tz * this.dir * 2); this.wantSpeed = this.walkSp;
    if (Math.random() < dt * 0.04) { this.pause = 2 + Math.random() * 6; }
  }
  snapToPath(keep) {
    const G = this.G, nr = G.roads.nearest(this.pos.x, this.pos.z, 60);
    if (!nr) { this.path = null; this.wantSpeed = 0; this.pause = 1; return; }
    const r = nr.s.r; this.path = r; this.s = nr.s.s; if (!keep) { this.dir = Math.random() < 0.5 ? 1 : -1; this.lat = (Math.random() < 0.5 ? -1 : 1) * (r.hw + (r.sidewalk ? 1.0 : 1.4) + Math.random() * 0.6); this.walkSp = 1.05 + Math.random() * 0.55; }
  }
  copAI(dt, dPl) {
    const G = this.G, pl = G.player;
    this.shootCd -= dt;
    const tx = pl.pos.x - this.pos.x, tz = pl.pos.z - this.pos.z; const d = Math.hypot(tx, tz);
    this.wantYaw = Math.atan2(tx, tz);
    if (G.wanted === 0) { this.wantSpeed = 0; this.state = 'idle'; return; }
    const los = G.hasLOS(this.pos, 1.5, pl.pos, pl.vehicle ? 1.0 : 1.4);
    this.hasLOS = los;
    if (d > (los ? 22 : 8)) {
      this.state = 'chase'; this.wantSpeed = G.wanted >= 3 ? 6.8 : 5.8;
      if (!(los && d < 45)) { // niente visuale: segue le strade verso il giocatore
        this.navT = (this.navT || 0) - dt;
        if (!this.nav || this.navT <= 0) { this.navT = 3; const a = G.police.nodeNear(this.pos), b = G.police.nodeNear(pl.pos); const r = a && b ? routeAStar(G.roads, a, b, 700) : null; this.nav = r ? r.slice(1) : []; }
        while (this.nav.length && Math.hypot(this.nav[0].x - this.pos.x, this.nav[0].z - this.pos.z) < 4) this.nav.shift();
        const n = this.nav[0]; if (n) this.wantYaw = Math.atan2(n.x - this.pos.x, n.z - this.pos.z);
      }
      // anti-incastro
      this.chkT = (this.chkT || 0) + dt; if (this.chkT > 1.2) { const mv = Math.hypot(this.pos.x - (this.lx ?? this.pos.x), this.pos.z - (this.lz ?? this.pos.z)); this.lx = this.pos.x; this.lz = this.pos.z; this.chkT = 0; if (mv < 1.2) this.side = (Math.random() < 0.5 ? -1 : 1) * 1.6; else this.side = 0; }
      if (this.side) this.wantYaw += this.side;
    }
    else { this.state = 'shoot'; this.wantSpeed = 0; if (los && this.shootCd <= 0) { this.shootCd = 0.9 + Math.random() * 0.9; G.copShoot(this); } }
    if (d < 3 && !pl.dead) { this.wantSpeed = 0; if (this.shootCd <= 0) { this.shootCd = 0.8; pl.hurt(6, 'cop'); G.audio.shot('punch'); } }
  }
  dispose() { this.G.scene.remove(this.root); this.root.traverse((o) => { if (o.isMesh) { /* geometrie non condivise */ o.geometry.dispose(); } }); }
}

export class Pedestrians {
  constructor(G) { this.G = G; this.list = []; this.t = 0; }
  spawn(x, z) {
    const h = new Human(this.G); h.place(x, z); h.snapToPath(); h.state = 'walk';
    // posizionalo sul percorso
    if (h.path) { const P = h.path.path, p = P[Math.min(P.length - 1, Math.round(h.s / 1.5))]; h.place(p.x + -p.tz * h.lat, p.z + p.tx * h.lat); h.yaw = h.wantYaw = Math.atan2(p.tx * h.dir, p.tz * h.dir); }
    this.list.push(h); this.G.humans.push(h); return h;
  }
  update(dt) {
    const G = this.G; this.t -= dt;
    const target = G.q.npc;
    if (this.t <= 0) {
      this.t = 0.35;
      let alive = 0; for (const h of this.list) if (!h.dead) alive++;
      if (alive < target) {
        // spawn su una strada vicina al giocatore, fuori dalla vista
        const pl = G.player.pos, rng = G.rng;
        for (let k = 0; k < 8; k++) {
          const a = rng.f() * 6.28, r = rng.range(40, 170), x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
          const nr = G.roads.nearest(x, z, 35); if (!nr || nr.s.r.kind === 'main' && rng.f() < 0.7) continue;
          const y = G.terrain.heightAt(nr.s.x, nr.s.z); if (y < 1.1) continue;
          if (G.inView(nr.s.x, nr.s.z, 25)) continue;
          this.spawn(nr.s.x, nr.s.z); break;
        }
      }
      // rimozione dei lontani
      for (let i = this.list.length - 1; i >= 0; i--) {
        const h = this.list[i], d = Math.hypot(h.pos.x - G.player.pos.x, h.pos.z - G.player.pos.z);
        if (d > 230 && !G.inView(h.pos.x, h.pos.z, 10)) this.remove(i);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i], d2 = G.dist2Cam(h.pos);
      if (d2 > 320 * 320) { h.root.visible = false; continue; }
      h.root.visible = true;
      if (h.update(dt) === 'remove') this.remove(i);
    }
  }
  remove(i) { const h = this.list[i]; this.list.splice(i, 1); const j = this.G.humans.indexOf(h); if (j >= 0) this.G.humans.splice(j, 1); h.dispose(); }
}

export class Traffic {
  constructor(G) { this.G = G; this.list = G.vehicles; this.t = 0; }
  spawnAt(node, name) {
    const G = this.G, rng = G.rng;
    const v = new Vehicle(G, name, node.x, node.z, 0, { parked: false });
    const ai = new DriverAI(v, G, 'traffic'); v.ai = ai;
    const nx = node.links.length ? node.links[Math.floor(rng.f() * node.links.length)] : null;
    ai.setStart(node); if (nx) { ai.prev = node; ai.cur = nx; ai.tgt = nx; const dx = nx.x - node.x, dz = nx.z - node.z, l = Math.hypot(dx, dz) || 1; v.yaw = Math.atan2(dx, dz); v.pos.x = node.x + -dz / l * node.r.hw * 0.5; v.pos.z = node.z + dx / l * node.r.hw * 0.5; v.pos.y = G.terrain.heightAt(v.pos.x, v.pos.z); }
    v.vx = Math.sin(v.yaw) * 6; v.vz = Math.cos(v.yaw) * 6; v.fwdSpeed = 6;
    G.vehicles.push(v);
    // autista (pedone non interagibile)
    return v;
  }
  update(dt) {
    const G = this.G, pl = G.player.pos; this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      let n = 0; for (const v of G.vehicles) if (v.ai && v.ai.mode === 'traffic' && !v.dead) n++;
      if (n < G.q.traffic && G.wanted < 3) {
        for (let k = 0; k < 10; k++) {
          const node = G.roads.randomNode(G.rng, (nd) => nd.r.kind !== 'lane' && nd.r.id !== 'RING');
          const d = Math.hypot(node.x - pl.x, node.z - pl.z);
          if (d < 90 || d > 240 || G.inView(node.x, node.z, 20) && d < 160) continue;
          let busy = false; for (const v of G.vehicles) if (Math.hypot(v.pos.x - node.x, v.pos.z - node.z) < 14) { busy = true; break; }
          if (busy) continue;
          const r = G.rng.f(); const name = r < 0.34 ? 'panda' : r < 0.58 ? 'sedan' : r < 0.78 ? 'suv' : r < 0.84 ? 'sport' : 'scooter';
          this.spawnAt(node, name); break;
        }
      }
      for (let i = G.vehicles.length - 1; i >= 0; i--) {
        const v = G.vehicles[i]; if (!v.ai || v.driver) continue;
        const d = Math.hypot(v.pos.x - pl.x, v.pos.z - pl.z);
        if ((d > 300 || (d > 170 && !G.inView(v.pos.x, v.pos.z, 20) && v.age > 20 && v.ai.mode === 'traffic')) && v.ai.mode === 'traffic') { v.dispose(); G.vehicles.splice(i, 1); }
      }
    }
  }
}

export class Police {
  constructor(G) { this.G = G; this.cops = []; this.cars = []; this.t = 0; this.carT = 5; }
  update(dt) {
    const G = this.G, pl = G.player; this.t -= dt;
    for (let i = this.cops.length - 1; i >= 0; i--) { const c = this.cops[i]; if (G.dist2Cam(c.pos) > 400 * 400) { c.root.visible = false; continue; } c.root.visible = true; if (c.update(dt) === 'remove') { this.removeCop(c); this.cops.splice(i, 1); } }
    if (G.wanted === 0) {
      // sparizione graduale
      for (let i = this.cops.length - 1; i >= 0; i--) { const c = this.cops[i]; if (c.dead) { this.cops.splice(i, 1); continue; } if (Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) > 60 || !G.inView(c.pos.x, c.pos.z, 5)) { this.removeCop(c); this.cops.splice(i, 1); } }
      for (let i = this.cars.length - 1; i >= 0; i--) { const v = this.cars[i]; v.sirenOn = false; if (v.ai) v.ai.mode = 'traffic'; if (Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) > 150 && !G.inView(v.pos.x, v.pos.z, 10)) { const j = G.vehicles.indexOf(v); if (j >= 0) G.vehicles.splice(j, 1); v.dispose(); this.cars.splice(i, 1); } }
      return;
    }
    const wantCops = Math.min(10, G.wanted * 2 + 1);
    let alive = 0; for (const c of this.cops) if (!c.dead) alive++;
    if (this.t <= 0 && alive < wantCops) {
      this.t = 3.5 - G.wanted * 0.4;
      for (let k = 0; k < 8; k++) {
        const a = G.rng.f() * 6.28, r = G.rng.range(55, 110), x = pl.pos.x + Math.cos(a) * r, z = pl.pos.z + Math.sin(a) * r;
        const nr = G.roads.nearest(x, z, 40); const sp = nr ? nr.s : null; if (!sp) continue; if (G.inView(sp.x, sp.z, 10) && k < 6) continue;
        if (G.terrain.heightAt(sp.x, sp.z) < 1) continue;
        const c = new Human(G, { cop: true }); c.place(sp.x, sp.z); c.state = 'chase'; this.cops.push(c); G.humans.push(c); break;
      }
    }
    // auto della polizia
    this.carT -= dt;
    if (this.carT <= 0 && G.wanted >= 2 && this.cars.filter((c) => !c.dead).length < Math.min(3, G.wanted - 0)) {
      this.carT = 9;
      const node = G.roads.randomNode(G.rng, (nd) => nd.r.kind !== 'lane' && Math.hypot(nd.x - pl.pos.x, nd.z - pl.pos.z) > 130 && Math.hypot(nd.x - pl.pos.x, nd.z - pl.pos.z) < 260);
      if (node && !G.inView(node.x, node.z, 20)) {
        const v = new Vehicle(G, 'cop', node.x, node.z, 0); const ai = new DriverAI(v, G, 'cop'); v.ai = ai; ai.setStart(node); ai.prev = null; v.sirenOn = true; ai.mode = 'cop';
        v.pos.set(node.x, G.terrain.heightAt(node.x, node.z), node.z); G.vehicles.push(v); this.cars.push(v); ai.replan = 0;
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i]; if (v.dead || v.sinkT > 0 || !G.vehicles.includes(v)) { this.cars.splice(i, 1); continue; }
      const ai = v.ai; if (!ai) continue; v.sirenOn = true;
      const d = Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z);
      ai.replan = (ai.replan || 0) - dt;
      if (ai.replan <= 0 && d > 28) {
        ai.replan = 3;
        const goal = G.roads.nearest(pl.pos.x, pl.pos.z, 400);
        if (goal) { const gn = G.roads.nodes.reduce ? this.nodeNear(goal.s) : null; const sn = ai.cur || this.nodeNear(v.pos); const route = gn && sn ? routeAStar(G.roads, sn, gn) : null; if (route && route.length > 1) { ai.route = route.slice(1); ai.cur = route[0]; ai.prev = null; ai.tgt = null; } }
      }
      if (d < 32 && v.speed < 14 && !v.ai.arrived) { v.ai.arrived = true; v.in.throttle = 0; v.ai.mode = 'stopped'; for (let k = 0; k < 2; k++) { const c = new Human(G, { cop: true }); c.place(v.pos.x + (k ? 2 : -2), v.pos.z + 2); c.state = 'chase'; this.cops.push(c); G.humans.push(c); } }
      if (v.ai.mode === 'stopped') { v.in.throttle = 0; v.in.brake = 1; v.in.steer = 0; }
      if (d > 70) G.audio.siren(0); else if (d < 70) G.audio.siren(1 - d / 70);
    }
  }
  nodeNear(p) { const G = this.G; let best = null, bd = 1e9; for (const R of [40, 160]) { for (const n of G.roads.ng.query(p.x - R, p.z - R, p.x + R, p.z + R)) { const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; best = n; } } if (best) break; } return best || G.roads.nodes[0]; }
  removeCop(c) { const j = this.G.humans.indexOf(c); if (j >= 0) this.G.humans.splice(j, 1); c.dispose(); }
}
