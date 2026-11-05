// Max: movimento a piedi, nuoto, salto, armi, salita sui veicoli
import * as THREE from 'three';
import { buildHuman, MAX } from './character.js';
import { WEAPONS, buildWeaponModel } from './weapons.js';
import { waveH } from './water.js';
import { clamp, lerp, damp, wrapAngle } from './util.js';

export class Player {
  constructor(G) {
    this.G = G;
    this.rig = buildHuman({ ...MAX, knit: G.T.knit }); this.root = this.rig.root; G.scene.add(this.root);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.speed = 0;
    this.hp = 100; this.armor = 0; this.money = 500; this.dead = false; this.deadT = 0;
    this.grounded = true; this.swimming = false; this.wading = 0; this.vehicle = null; this.aiming = false;
    this.ammo = { fists: { mag: 0, reserve: 0 }, pistol: { mag: 12, reserve: 60 }, smg: { mag: 0, reserve: 0 }, shotgun: { mag: 0, reserve: 0 } };
    this.owned = { fists: true, pistol: true, smg: false, shotgun: false };
    this.weapon = WEAPONS.pistol; this.cool = 0; this.reloadT = 0; this.punchT = 0; this.models = {};
    this.stepT = 0; this.invul = 0; this.lastHit = -10; this.recoil = 0;
    this.setWeapon('pistol');
  }
  get r() { return 0.36; }
  setWeapon(id) {
    if (!this.owned[id]) return; this.weapon = WEAPONS[id]; this.reloadT = 0;
    for (const k in this.models) this.models[k].visible = false;
    if (id !== 'fists') { if (!this.models[id]) { this.models[id] = buildWeaponModel(id); this.rig.weaponSlot.add(this.models[id]); } this.models[id].visible = !this.vehicle; }
  }
  giveWeapon(id) { this.owned[id] = true; const w = WEAPONS[id]; this.ammo[id].mag = w.mag; this.ammo[id].reserve += w.mag * 4; this.setWeapon(id); }
  addAmmo(n) { for (const id of ['pistol', 'smg', 'shotgun']) if (this.owned[id]) this.ammo[id].reserve += Math.round(n * (id === 'shotgun' ? 0.3 : 1)); }
  nextWeapon() { const order = ['fists', 'pistol', 'smg', 'shotgun']; let i = order.indexOf(this.weapon.id); for (let k = 0; k < 4; k++) { i = (i + 1) % 4; if (this.owned[order[i]]) { this.setWeapon(order[i]); return; } } }
  respawn(x, z, yaw) { this.pos.set(x, this.G.terrain.heightAt(x, z), z); this.yaw = yaw; this.vx = this.vz = this.vy = 0; this.hp = 100; this.dead = false; this.deadT = 0; this.rig.root.rotation.set(0, yaw, 0); this.rig.dead = 0; this.swimming = false; this.invul = 3; this.root.visible = true; }
  hurt(n, src) {
    if (this.dead || this.invul > 0) return; const G = this.G;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.6); this.armor -= a; n -= a; }
    this.hp -= n; G.hud.damage(); this.lastHit = G.time; G.audio.hit();
    if (this.hp <= 0) this.die(src);
  }
  die(src) {
    if (this.dead) return; this.dead = true; this.deadT = 0; this.G.stats.deaths++;
    if (this.vehicle) this.G.exitVehicle(true);
    this.aiming = false;
  }

  update(dt) {
    const G = this.G, T = G.terrain, I = G.input, cam = G.cam;
    this.cool -= dt; this.invul = Math.max(0, this.invul - dt); this.recoil = Math.max(0, this.recoil - dt * 4);
    if (this.dead) { this.deadT += dt; this.rig.animate(dt, { mode: 'dead' }); this.root.position.copy(this.pos); if (this.deadT > 3.2) G.respawnPlayer(); return; }
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt * 3.5);
    if (this.vehicle) { this.updateVehicle(dt); return; }
    // ---- a piedi / nuoto ----
    const mx = I.moveX, my = I.moveY, mag = Math.min(1, Math.hypot(mx, my));
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const wx = sy * my + -cy * mx, wz = cy * my + sy * mx;
    const ground = T.heightAt(this.pos.x, this.pos.z);
    const depth = -ground;
    const surf = waveH(this.pos.x, this.pos.z, G.timeU.value) * 0.8;
    const wasSwim = this.swimming;
    // acqua profonda?
    if (!this.swimming && depth > 1.25 && this.pos.y < surf + 0.15) { this.swimming = true; if (this.vy < -3) { G.fx.splash(this.pos, 26, 1.2); G.audio.splash(); } this.vy = 0; if (!wasSwim) G.fx.splash(this.pos, 14, 0.8); }
    if (this.swimming && (depth < 0.9 || this.pos.y - ground > 1.6 && depth < 0.9)) this.swimming = false;
    this.aiming = (I.aim || (I.fire && this.weapon.id !== 'fists')) && !this.swimming && !this.dead;
    const run = I.run && !this.aiming;
    let tgt = this.swimming ? (run ? 4.2 : 2.5) : this.aiming ? 2.7 : run ? 7.6 : 4.0;
    if (!this.swimming && depth > 0.2) tgt *= 1 - clamp(depth / 1.6, 0, 0.5);
    this.wading = !this.swimming && depth > 0.3 ? 1 : 0;
    const tvx = wx / (mag || 1) * tgt * mag, tvz = wz / (mag || 1) * tgt * mag;
    const acc = this.grounded || this.swimming ? 14 : 3;
    this.vx = damp(this.vx, tvx, acc, dt); this.vz = damp(this.vz, tvz, acc, dt);
    this.speed = Math.hypot(this.vx, this.vz);
    // orientamento
    let wantYaw = this.yaw;
    if (this.aiming || this.punchT > 0) wantYaw = cam.yaw; else if (mag > 0.1) wantYaw = Math.atan2(this.vx, this.vz);
    this.yaw += clamp(wrapAngle(wantYaw - this.yaw), -dt * 11, dt * 11);
    // spostamento con controllo pendenza
    const nx = this.pos.x + this.vx * dt, nz = this.pos.z + this.vz * dt;
    const tryMove = (x, z) => { const h1 = T.heightAt(x, z), h0 = T.heightAt(this.pos.x, this.pos.z), step = Math.hypot(x - this.pos.x, z - this.pos.z) + 1e-5; return (this.pos.y > h1 + 0.3) || (h1 - Math.max(h0, this.pos.y)) / step < 1.45 || (h1 - this.pos.y) < 0.35; };
    if (tryMove(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else if (tryMove(nx, this.pos.z)) this.pos.x = nx; else if (tryMove(this.pos.x, nz)) this.pos.z = nz; else { this.vx *= 0.3; this.vz *= 0.3; }
    G.colliders.resolve(this.pos, this.r, G._po || (G._po = { nx: 0, nz: 0, depth: 0 }), this.pos.y - 0.6);
    // verticale
    const g2 = T.heightAt(this.pos.x, this.pos.z);
    if (this.swimming) {
      this.pos.y = damp(this.pos.y, surf - 0.62, 8, dt); this.vy = 0; this.grounded = false;
      if (I.jump && this.pos.y > -1) { /* si può tuffare di nuovo */ }
      if (this.speed > 1 && Math.random() < dt * 8) G.fx.wake({ x: this.pos.x, y: 0, z: this.pos.z }, this.vx, this.vz, 1);
    } else {
      this.vy -= 24 * dt;
      if (this.grounded && I.jump) { this.vy = 7.4; this.grounded = false; this.pos.y += 0.05; }
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g2) {
        if (!this.grounded && this.vy < -17 && g2 > -0.8) { const dmg = (-this.vy - 16) * 7; this.hurt(dmg, 'fall'); G.audio.crash(0.5); }
        this.pos.y = g2; this.vy = 0; this.grounded = true;
      } else if (this.pos.y > g2 + 0.12) this.grounded = false;
      if (!this.grounded && this.pos.y < 0.05 && g2 < -1.2) { /* entra in acqua: gestito sopra */ }
      if (this.grounded && this.speed > 2 && depth < 0.2) { this.stepT -= dt * this.speed; if (this.stepT <= 0) { this.stepT = 2.1; G.audio.step(Math.min(0.28, 0.08 + this.speed * 0.025)); if (this.speed > 6) G.fx.dust(this.pos, 1, [0.75, 0.7, 0.6]); } }
      else if (this.grounded && this.wading && this.speed > 1.5 && Math.random() < dt * 6) G.fx.splash({ x: this.pos.x, y: 0, z: this.pos.z }, 3, 0.4);
    }
    // limite del mondo giocabile sul lago
    const lim = G.worldLimit(this.pos); if (lim) { this.pos.x = lim.x; this.pos.z = lim.z; }
    // armi
    if (I.reload && !this.swimming) this.startReload();
    const sl = I.weaponSlot(); if (sl) { const ids = ['fists', 'pistol', 'smg', 'shotgun']; this.setWeapon(ids[sl - 1]); }
    if (I.weaponNext) this.nextWeapon();
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
    const w = this.weapon;
    if (!this.swimming && I.fire) {
      if (w.melee) { if (this.cool <= 0) { this.cool = 1 / w.rate; this.punchT = 1; G.melee(this); } }
      else if (this.cool <= 0 && this.reloadT <= 0 && (w.auto || I.firePressed)) {
        if (this.ammo[w.id].mag > 0) { this.ammo[w.id].mag--; this.cool = 1 / w.rate; G.playerShoot(this, w); this.recoil = 1; }
        else if (this.ammo[w.id].reserve > 0) this.startReload(); else if (this.cool <= 0) { this.cool = 0.3; G.audio.shot('click'); }
      }
    }
    // modello
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    const st = { mode: this.swimming ? 'swim' : this.grounded ? 'foot' : 'air', speed: this.speed, aim: this.aiming, pitch: -cam.pitch + (this.recoil * 0.1), holdWeapon: this.weapon.id !== 'fists', punch: this.weapon.melee ? this.punchT : 0, look: 0 };
    this.rig.animate(dt, st);
    if (this.recoil > 0 && this.aiming) this.rig.armR.sh.rotation.x += this.recoil * 0.08;
  }
  startReload() { const w = this.weapon, a = this.ammo[w.id]; if (w.melee || this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return; this.reloadT = w.id === 'shotgun' ? 1.6 : 1.2; this.G.hud.toast('Ricarica…', false, 900); }
  finishReload() { const w = this.weapon, a = this.ammo[w.id], need = w.mag - a.mag, take = Math.min(need, a.reserve); a.mag += take; a.reserve -= take; }

  // ---- veicoli ----
  tryEnter() {
    const G = this.G; if (this.dead) return false;
    let best = null, bd = 4.2;
    for (const v of G.vehicles) { if (v.dead || v.driver || v.sinkT > 0) continue; const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) - (v.def.L * 0.25); if (d < bd) { bd = d; best = v; } }
    if (!best) return false;
    G.enterVehicle(best); return true;
  }
  updateVehicle(dt) {
    const G = this.G, I = G.input, v = this.vehicle;
    if (I.use) { G.exitVehicle(false); return; }
    const inp = v.in; inp.throttle = clamp(I.moveY, -1, 1); inp.steer = clamp(I.moveX, -1, 1); inp.brake = 0; inp.hand = I.brake ? 1 : 0;
    if (I.horn) G.audio.horn();
    this.pos.copy(v.pos); this.yaw = v.yaw; this.speed = v.speed; this.vx = v.vx; this.vz = v.vz;
    this.aiming = false;
    // il pilota segue il veicolo (riparentato in G.enterVehicle)
    this.rig.animate(dt, { mode: v.model.pose === 'bike' ? 'bike' : v.model.pose === 'jet' ? 'jet' : 'car', speed: v.speed, steer: inp.steer, look: 0 });
    // fari di notte
    G.audio.engineSet(clamp(v.speed / v.def.max, 0, 1.2), Math.max(0, inp.throttle));
  }
}
