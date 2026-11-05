// Orchestratore: camera, combattimento, ricercato, spawn veicoli, ciclo di gioco
import * as THREE from 'three';
import { BOUNDS, SPAWN, LANDMARKS, frame, shoreX } from './map.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Player } from './player.js';
import { Vehicle, HEAD, TAIL } from './vehicles.js';
import { Human, Pedestrians, Traffic, Police } from './npc.js';
import { Pickups } from './pickups.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { rayTerrain } from './physics.js';
import { WEAPONS } from './weapons.js';
import { RNG, clamp, lerp, damp, wrapAngle, smooth } from './util.js';
import { waveH } from './water.js';

const HEAT = [0, 1, 4, 8, 13, 20];

class CameraRig {
  constructor(G) { this.G = G; this.yaw = SPAWN.yaw; this.pitch = 0.22; this.dist = 3.6; this.fov = 62; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.idle = 0; this.dir = new THREE.Vector3(); this.first = true; }
  update(dt) {
    const G = this.G, pl = G.player, I = G.input, cam = G.camera, v = pl.vehicle;
    const l = I.consumeLook(); const sens = 0.0022;
    this.yaw -= l.x * sens; this.pitch = clamp(this.pitch + l.y * sens, -0.55, 1.3);
    if (I.wheel) this.dist = clamp(this.dist + I.wheel * 0.4, 2.2, 6);
    if (Math.abs(l.x) + Math.abs(l.y) > 1) this.idle = 0; else this.idle += dt;
    if (v && !G.paused) { // auto-allinea dietro al veicolo
      const fwdYaw = v.yaw + (v.fwdSpeed < -2 ? Math.PI : 0);
      if (this.idle > 0.8 && v.speed > 2) { this.yaw += wrapAngle(fwdYaw - this.yaw) * clamp(dt * 2.2, 0, 1); this.pitch = damp(this.pitch, v.kind === 'jet' || v.kind === 'boat' ? 0.2 : 0.17, 2, dt); }
    }
    const aim = pl.aiming && !v;
    const baseDist = v ? (v.kind === 'boat' ? 9.5 : v.kind === 'car' ? 6.4 : 5.2) + clamp(v.speed * 0.06, 0, 2.6) : aim ? 1.9 : this.dist;
    const tx = v ? v.pos.x : pl.pos.x, ty = (v ? v.pos.y + (v.kind === 'jet' ? 1.3 : 1.45) : pl.pos.y + (pl.swimming ? 0.8 : 1.55)), tz = v ? v.pos.z : pl.pos.z;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const off = aim ? 0.75 : v ? 0 : 0.35; this.sh = damp(this.sh ?? 0, off, 8, dt);
    const ox = tx + rx * this.sh, oy = ty, oz = tz + rz * this.sh;
    // collisione camera
    let d = baseDist; const dx = -this.dir.x, dy = -this.dir.y, dz = -this.dir.z;
    const hit = G.colliders.ray(ox, oy, oz, dx, dy, dz, d + 0.4); if (hit) d = Math.min(d, hit.t - 0.25);
    const th = rayTerrain(G.terrain, ox, oy, oz, dx, dy, dz, d + 0.4); if (th) d = Math.min(d, th.t - 0.3);
    d = Math.max(0.5, d);
    this.curDist = this.curDist === undefined ? d : (d < this.curDist ? d : damp(this.curDist, d, 6, dt));
    d = this.curDist;
    let cx = ox + dx * d, cy = oy + dy * d, cz = oz + dz * d;
    const gy = G.terrain.heightAt(cx, cz) + 0.35; if (cy < gy) cy = gy;
    if (!G.underwaterAllowed) { if (G.terrain.heightAt(cx, cz) < -0.3 && cy < 0.45 && ty > 0) cy = 0.45; }
    this.pos.set(cx, cy, cz);
    cam.position.copy(this.pos);
    this.look.set(ox + this.dir.x * 20, oy + this.dir.y * 20, oz + this.dir.z * 20);
    cam.lookAt(this.look);
    const fovT = (aim ? 46 : 62) + (v ? clamp(v.speed * 0.45, 0, 16) : pl.speed > 6 ? 4 : 0);
    this.fov = damp(this.fov, fovT, 6, dt); if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

export class Game {
  constructor(G) {
    this.G = G; Object.assign(this, G); G.game = this;
    this.rng = G.rng = new RNG(99);
    this.humans = G.humans = []; this.vehicles = G.vehicles = [];
    this.stats = G.stats = { kills: 0, deaths: 0, lemons: 0, missions: 0 };
    this.time = 0; G.time = 0; this.wanted = G.wanted = 0; this.wantedHeat = 0; this.lostT = 0; this.copsSee = false; this.lastNoise = null; this.paused = true; this.started = false;
    G.dist2Cam = (p) => { const c = G.camera.position; return (p.x - c.x) ** 2 + (p.z - c.z) ** 2; };
    G.inView = (x, z, m) => this.inView(x, z, m);
    G.hasLOS = (a, ay, b, by) => this.hasLOS(a, ay, b, by);
    G.obstacleAhead = (v, r) => this.obstacleAhead(v, r);
    G.noise = (x, z, r) => this.noise(x, z, r);
    G.crime = (a, v) => this.crime(a, v);
    G.setWanted = (n) => this.setWanted(n);
    G.copShoot = (c) => this.copShoot(c);
    G.explosionAt = (...a) => this.explosionAt(...a);
    G.ejectDriver = (v, k) => this.ejectDriver(v, k);
    G.enterVehicle = (v) => this.enterVehicle(v);
    G.exitVehicle = (f) => this.exitVehicle(f);
    G.playerShoot = (p, w) => this.playerShoot(p, w);
    G.melee = (p) => this.melee(p);
    G.respawnPlayer = () => this.respawnPlayer();
    G.worldLimit = (p) => this.worldLimit(p);
    this.night = G.nightU;
  }

  init() {
    const G = this.G;
    G.input = new Input(G.renderer.domElement, G.isTouch); G.input.onPause = () => { if (this.started && !this.paused) this.pause(); };
    G.audio = new AudioSys(); G.fx = new FX(G.scene, G.T, G.renderer, G.camera); G.fx.resize();
    G.hud = new HUD(G); G.hud.buildMap();
    G.player = new Player(G);
    G.pickups = new Pickups(G); G.pickups.populate();
    G.missions = new Missions(G); G.missions.init();
    G.cam = new CameraRig(G);
    G.peds = new Pedestrians(G); G.traffic = new Traffic(G); G.police = new Police(G);
    this.headlight = new THREE.SpotLight(0xfff0d8, 0, 80, 0.55, 0.6, 1.4); G.scene.add(this.headlight); G.scene.add(this.headlight.target);
    this.spawnVehicles();
    G.player.respawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
    G.cam.yaw = SPAWN.yaw; G.cam.pitch = 0.2;
    // pedoni iniziali vicino al centro
    for (let i = 0; i < Math.min(10, G.q.npc); i++) { const nr = G.roads.nearest(SPAWN.x + this.rng.range(-120, 120), SPAWN.z + this.rng.range(-120, 120), 80); if (nr) G.peds.spawn(nr.s.x, nr.s.z); }
    addEventListener('resize', () => G.fx.resize());
  }

  spawnVehicles() {
    const G = this.G, T = G.terrain, rng = this.rng, add = (name, x, z, yaw, opt) => { const v = new Vehicle(G, name, x, z, yaw, { parked: true, ...opt }); G.vehicles.push(v); return v; };
    // parcheggio sul lungolago
    for (let i = 0; i < 9; i++) { const z = -600 + i * 14 + rng.range(-3, 3), [x, zz] = frame(z, 7.5); if (rng.f() < 0.8) add(rng.pick(['panda', 'panda', 'sedan', 'suv']), x, zz, Math.atan2(-0.24, 1) * 0 + Math.PI / 2 * 0 + Math.atan2(1, -0.24) * 0 + (Math.PI) + rng.range(-0.05, 0.05)); }
    // vicino allo spawn: auto sportiva
    { const R2 = G.roads.roads.find((r) => r.id === 'R2'), p = R2.path[Math.round(120 / 1.5)], q = R2.path[Math.round(150 / 1.5)];
      const lane = (P, k) => ({ x: P.x - P.tz * 1.9 * k, z: P.z + P.tx * 1.9 * k, yaw: Math.atan2(P.tx, P.tz) });
      const a = lane(p, 1); add('sport', a.x, a.z, a.yaw, { color: 0xb3262b }); const b = lane(q, 1); add('scooter', b.x, b.z, b.yaw); }
    // alberghi e strade
    for (const [z, d] of [[-120, 62], [-60, 64], [20, 66], [150, 70], [250, 75], [330, 80], [-220, 68], [380, 20], [560, 20], [700, 20]]) { const [x, zz] = frame(z, d); add(rng.pick(['panda', 'sedan', 'suv', 'sport', 'scooter']), x, zz, rng.range(0, 6.28)); }
    // acqua: moto d'acqua e barche
    for (const [z, d] of [[-777, -26], [-759, -28], [-741, -24]]) { const [x, zz] = frame(z, d); add('jetski', x, zz, Math.PI / 2 + rng.range(-0.3, 0.3)); }
    { const [x, z] = frame(-5, -9); add('jetski', x, z, Math.PI / 2); } { const [x, z] = frame(505, -9); add('jetski', x, z, Math.PI / 2); } { const [x, z] = frame(790, -8); add('jetski', x, z, Math.PI / 2); }
    { const [x, z] = frame(-720, -30); add('boat', x, z, Math.PI / 2, { color: 0x1f4e8c }); } { const [x, z] = frame(-690, -42); add('boat', x, z, Math.PI / 2 + 0.2, { color: 0xb3262b }); }
    // carabinieri alla stazione
    const cb = LANDMARKS.carabinieri; const pc = add('cop', cb.x + 6, cb.z + 10, rng.range(0, 6)); pc.sirenOn = false;
  }

  // ---------- flusso ----------
  begin() {
    const G = this.G; this.started = true; this.paused = false; G.audio.start();
    $('menu').hidden = true; G.input.enabled = true; $('hud').hidden = false; $('touch').hidden = !G.isTouch;
    if (!G.isTouch) G.input.lock();
    G.hud.toast('Benvenuto a Limone! Esplora, sali sui veicoli [E] e raccogli i 🍋', false, 5000);
  }
  pause() { this.paused = true; this.G.input.enabled = false; $('menu').hidden = false; $('btnPlay').textContent = 'Riprendi'; G_ENGINE_OFF(this.G); }
  resume() { this.begin(); }

  update(dt) {
    const G = this.G, I = G.input;
    dt = Math.min(dt, 0.05); this.time += dt; G.time = this.time;
    G.sky.timeScale = this.started ? 1 / 90 : 1 / 400;
    if (!this.started || this.paused) { this.menuCamera(dt); return; }
    if (I.pressed('KeyP') || I.pressed('T_pause')) { this.pause(); I.endFrame(); return; }
    if (I.map) { G.bigMapOpen = !G.bigMapOpen; $('bigmap').hidden = !G.bigMapOpen; if (G.bigMapOpen) G.hud.drawBig(); }
    if (I.timeKey) { G.sky.hour = (G.sky.hour + 3) % 24; G.hud.toast('Ora: ' + String(Math.floor(G.sky.hour)).padStart(2, '0') + ':00'); }
    if (I.pressed('KeyG') && !G.player.vehicle) G.player.nextWeapon();
    // uso: salita/discesa
    if (I.use && !G.player.dead && !G.missions.active) { if (!G.player.vehicle) { if (G.player.tryEnter()) { I.edge.delete('KeyE'); I.edge.delete('T_use'); } } }
    else if (I.use && !G.player.dead && G.missions.active && !G.player.vehicle) { if (G.player.tryEnter()) { I.edge.delete('KeyE'); I.edge.delete('T_use'); } }
    if (I.use && G.player.vehicle) { /* la discesa è gestita in Player.updateVehicle */ }
    if (I.firePressed) G.input.pressedFire = true;
    const steps = dt > 0.034 ? 2 : 1, h = dt / steps;
    for (let s = 0; s < steps; s++) this.step(h);
    I.endFrame();
  }
  step(dt) {
    const G = this.G;
    G.player.update(dt);
    // veicoli
    for (let i = G.vehicles.length - 1; i >= 0; i--) {
      const v = G.vehicles[i];
      if (v.ai && !v.driver && !v.dead) v.ai.update(dt);
      else if (!v.driver && !v.ai) { v.in.throttle = 0; v.in.steer = 0; v.in.brake = 1; }
      if (G.dist2Cam(v.pos) > 700 * 700 && !v.driver) { v.root.visible = false; continue; } v.root.visible = true;
      const r = v.update(dt);
      if (r === 'remove') { v.dispose(); G.vehicles.splice(i, 1); if (G.police.cars.includes(v)) G.police.cars.splice(G.police.cars.indexOf(v), 1); }
    }
    this.vehicleInteractions(dt);
    G.peds.update(dt); G.traffic.update(dt); G.police.update(dt);
    G.pickups.update(dt); G.missions.update(dt);
    this.wantedUpdate(dt);
    // limiti lago
    for (const v of G.vehicles) if (v.water) { const lim = this.worldLimit(v.pos, 760); if (lim) { v.pos.x = lim.x; v.pos.z = lim.z; v.vx *= -0.3; v.vz *= -0.3; if (v.driver) G.hud.toast('Troppo lontano dalla riva!', false, 1200); } }
    G.cam.update(dt);
    G.fx.update(dt); G.props.update(dt, G.timeU.value);
    // prompt
    this.prompts();
    G.hud.update(dt);
    // notte: fari
    const night = G.nightU.value;
    HEAD.emissiveIntensity = 0.15 + night * 5; TAIL.emissiveIntensity = 0.2 + night * 2.5;
    const pv = G.player.vehicle;
    if (pv && (pv.kind === 'car' || pv.kind === 'bike') && night > 0.2) { const f = pv.fwd; this.headlight.intensity = night * 70; this.headlight.position.set(pv.pos.x + f.x * 1.8, pv.pos.y + 0.8, pv.pos.z + f.z * 1.8); this.headlight.target.position.set(pv.pos.x + f.x * 20, pv.pos.y, pv.pos.z + f.z * 20); } else this.headlight.intensity = 0;
    G.underwater = G.camera.position.y < waveH(G.camera.position.x, G.camera.position.z, G.timeU.value) * 0.8 && G.terrain.heightAt(G.camera.position.x, G.camera.position.z) < 0;
    G.audio.setUnderwater(G.underwater);
    if (!pv) G.audio.engineStop();
  }

  prompts() {
    const G = this.G, pl = G.player; if (pl.dead) { G.hud.prompt(null); return; }
    if (G.missions.active || G.hud.el.prompt.dataset.keep) { /* missioni gestiscono i loro prompt */ }
    if (pl.vehicle) { const v = pl.vehicle; if (v.speed < 5 || v.kind === 'jet' || v.kind === 'boat') G.hud.prompt('<b>E</b> Scendi'); else G.hud.prompt(null); return; }
    let best = null, bd = 4.2; for (const v of G.vehicles) { if (v.dead || v.driver || v.sinkT > 0) continue; const d = Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) - v.def.L * 0.25; if (d < bd) { bd = d; best = v; } }
    if (best && !(G.missions.starts.some((s) => Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) < 4) && !G.missions.active)) G.hud.prompt(`<b>E</b> ${best.ai ? 'Ruba' : 'Sali su'}: ${best.def.label}`);
    else if (!G.missions.active) { const near = G.missions.starts.some((s) => Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) < 4); if (!near) G.hud.prompt(null); }
    else G.hud.prompt(null);
  }

  menuCamera(dt) {
    const G = this.G, c = G.camera, t = this.time * 0.05, [cx, cz] = frame(-640, -40);
    const r = 130; c.position.set(cx + Math.cos(t) * r, 40 + Math.sin(t * 0.7) * 6, cz + Math.sin(t) * r * 0.9);
    c.lookAt(cx - 60, 14, cz); c.fov = 55; c.updateProjectionMatrix();
    G.fx.update(dt); G.props.update(dt, G.timeU.value);
  }

  // ---------- veicoli ----------
  enterVehicle(v) {
    const G = this.G, pl = G.player;
    if (v.ai && !v.cop) { // furto d'auto: l'autista scappa
      const h = new Human(G); h.place(v.pos.x + 1.6, v.pos.z + 1.0); h.state = 'flee'; h.fleeT = 10; h.threat = pl.pos.clone(); G.humans.push(h); G.peds.list.push(h); this.crime(0.6, v);
    }
    if (v.cop) { this.crime(2.5, v); }
    if (v.ai) { v.ai = null; }
    pl.vehicle = v; v.driver = pl; v.in.hand = 0;
    pl.root.parent && pl.root.parent.remove(pl.root); v.body.add(pl.root); pl.root.position.copy(v.model.seat); pl.root.rotation.set(0, 0, 0); pl.root.scale.setScalar(1);
    for (const k in pl.models) pl.models[k].visible = false;
    pl.swimming = false; pl.grounded = true;
    G.audio.engineStart(v.kind); G.hud.toast(v.def.label);
    G.cam.curDist = undefined;
  }
  exitVehicle(forced) {
    const G = this.G, pl = G.player, v = pl.vehicle; if (!v) return;
    v.body.remove(pl.root); G.scene.add(pl.root); pl.root.scale.setScalar(1);
    v.driver = null; v.in.throttle = 0; v.in.brake = 1; v.in.steer = 0; v.in.hand = 0;
    // posizione di uscita: lato sinistro
    const side = (v.def.W || 1.4) / 2 + 0.9, c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    let x = v.pos.x + c * side, z = v.pos.z - s * side;
    const T = G.terrain; if (T.heightAt(x, z) < -0.5 && !v.water) { x = v.pos.x - c * side; z = v.pos.z + s * side; }
    pl.pos.set(x, Math.max(T.heightAt(x, z), v.water ? -0.6 : -9), z); pl.vehicle = null; pl.vx = v.vx * 0.5; pl.vz = v.vz * 0.5;
    if (v.water) { const sfc = waveH(x, z, G.timeU.value); pl.pos.y = T.heightAt(x, z) < -1 ? sfc - 0.6 : T.heightAt(x, z); if (T.heightAt(x, z) < -1.2) { pl.swimming = true; G.fx.splash({ x, y: 0, z }, 14, 0.8); G.audio.splash(); } }
    G.colliders.resolve(pl.pos, pl.r);
    pl.yaw = v.yaw; pl.grounded = true; pl.vy = 0;
    pl.setWeapon(pl.weapon.id);
    G.audio.engineStop(); G.cam.curDist = undefined;
    if (forced && forced !== 'quiet') { pl.vy = 4; pl.grounded = false; }
  }
  ejectDriver(v, killed) { const G = this.G; if (v.driver === G.player) { this.exitVehicle(true); if (killed) G.player.hurt(45, 'explosion'); } }

  vehicleInteractions(dt) {
    const G = this.G, V = G.vehicles;
    // veicolo vs veicolo
    for (let i = 0; i < V.length; i++) {
      const a = V[i]; if (a.sinkT > 0) continue;
      if (G.dist2Cam(a.pos) > 160 * 160) continue;
      for (let j = i + 1; j < V.length; j++) {
        const b = V[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, m = a.radius + b.radius + (a.def.L + b.def.L) * 0.18;
        if (Math.abs(dx) > m + 4 || Math.abs(dz) > m + 4) continue;
        // 3 punti per auto
        for (const sa of [-0.8, 0, 0.8]) for (const sb of [-0.8, 0, 0.8]) {
          const ax = a.pos.x + Math.sin(a.yaw) * sa * a.def.L * 0.4, az = a.pos.z + Math.cos(a.yaw) * sa * a.def.L * 0.4, bx = b.pos.x + Math.sin(b.yaw) * sb * b.def.L * 0.4, bz = b.pos.z + Math.cos(b.yaw) * sb * b.def.L * 0.4;
          const ddx = bx - ax, ddz = bz - az, d = Math.hypot(ddx, ddz), mm = a.radius + b.radius;
          if (d < mm && d > 1e-3) {
            const nx = ddx / d, nz = ddz / d, pen = mm - d, wa = a.parked && !a.driver ? 0.1 : 1, wb = b.parked && !b.driver ? 0.1 : 1, tot = wa + wb;
            a.pos.x -= nx * pen * wa / tot * 0.5; a.pos.z -= nz * pen * wa / tot * 0.5; b.pos.x += nx * pen * wb / tot * 0.5; b.pos.z += nz * pen * wb / tot * 0.5;
            const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (rv < -0.5) { const imp = -rv * 0.7, jx = nx * imp, jz = nz * imp; a.vx += jx * wa / tot; a.vz += jz * wa / tot; b.vx -= jx * wb / tot; b.vz -= jz * wb / tot; if (-rv > 3.5) { const dmg = (-rv - 3.5) * 5; a.damage(dmg, b.driver); b.damage(dmg, a.driver); G.audio.crash(Math.min(1, -rv / 14)); G.fx.sparks({ x: (ax + bx) / 2, y: a.pos.y + 0.6, z: (az + bz) / 2 }, 6); if (a.driver === G.player || b.driver === G.player) G.player.hurt(Math.min(18, (-rv - 3.5) * 1.5), 'crash'); this.noise(ax, az, 35); if (a.ai && !a.dead) { /* si arrabbiano: niente */ } } }
          }
        }
      }
    }
    // veicolo vs persone
    for (const v of V) {
      if (v.dead || v.speed < 2.2 || v.kind === 'boat' && false) continue;
      for (const h of G.humans) {
        if (h.dead) continue; const dx = h.pos.x - v.pos.x, dz = h.pos.z - v.pos.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
        const f = Math.sin(v.yaw), g = Math.cos(v.yaw), fd = dx * f + dz * g, ld = Math.abs(dx * g - dz * f);
        if (fd > -v.def.L * 0.3 && fd < v.def.L * 0.55 && ld < v.def.W / 2 + 0.4 && Math.abs(h.pos.y - v.pos.y) < 2) {
          h.hit(v.speed * 5, v.driver ? v.driver : v); h.pos.x += v.vx * 0.03; h.pos.z += v.vz * 0.03; v.vx *= 0.97; v.vz *= 0.97;
          if (v.driver === G.player) { this.crime(0.8, h); if (h.dead) this.stats.kills++; }
          G.audio.hit(); G.fx.dust(h.pos, 3);
        }
      }
      // contro il giocatore a piedi (auto IA)
      const pl = G.player; if (!pl.vehicle && !pl.dead && v.ai) {
        const dx = pl.pos.x - v.pos.x, dz = pl.pos.z - v.pos.z, f = Math.sin(v.yaw), g = Math.cos(v.yaw), fd = dx * f + dz * g, ld = Math.abs(dx * g - dz * f);
        if (fd > -v.def.L * 0.3 && fd < v.def.L * 0.55 && ld < v.def.W / 2 + 0.4 && Math.abs(pl.pos.y - v.pos.y) < 1.8) { pl.hurt(v.speed * 2.2, v); pl.vx += v.vx * 0.5; pl.vz += v.vz * 0.5; pl.vy = 3; pl.grounded = false; }
      }
    }
  }

  // ---------- query ----------
  inView(x, z, m = 0) {
    const c = this.G.camera.position, d = this.G.cam.dir, dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz) + 0.01;
    return (dx * d.x + dz * d.z) / (l * Math.hypot(d.x, d.z) + 0.001) > 0.28 - Math.min(0.4, m / l);
  }
  hasLOS(a, ay, b, by) {
    const G = this.G, ox = a.x, oy = a.y + ay, oz = a.z, dx = b.x - ox, dy = b.y + by - oy, dz = b.z - oz, L = Math.hypot(dx, dy, dz); if (L < 0.5) return true;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    if (G.colliders.ray(ox, oy, oz, ux, uy, uz, L - 0.5)) return false;
    const th = rayTerrain(G.terrain, ox, oy, oz, ux, uy, uz, L - 0.5); return !th;
  }
  obstacleAhead(v, range) {
    const G = this.G, f = Math.sin(v.yaw), g = Math.cos(v.yaw); let best = null;
    const test = (px, pz, r) => { const dx = px - v.pos.x, dz = pz - v.pos.z, fd = dx * f + dz * g; if (fd < 0.5 || fd > range) return; const ld = Math.abs(dx * g - dz * f); if (ld < r + v.radius + 0.5) { const d = fd - r - v.def.L / 2; if (!best || d < best.dist) best = { dist: d }; } };
    for (const o of G.vehicles) if (o !== v && !o.dead) test(o.pos.x, o.pos.z, o.radius + o.def.L * 0.25);
    for (const h of G.humans) if (!h.dead) test(h.pos.x, h.pos.z, 0.5);
    if (!G.player.vehicle) test(G.player.pos.x, G.player.pos.z, 0.5);
    return best;
  }
  worldLimit(p, lakeMax = 720) {
    const lx = Math.min(BOUNDS.x1 - 25, shoreX(p.z) + lakeMax), x0 = BOUNDS.x0 + 25, z0 = BOUNDS.z0 + 25, z1 = BOUNDS.z1 - 25;
    if (p.x > lx || p.x < x0 || p.z < z0 || p.z > z1) return { x: clamp(p.x, x0, lx), z: clamp(p.z, z0, z1) }; return null;
  }
  noise(x, z, r) { this.lastNoise = { x, z, r, t: this.time }; this.G.lastNoise = this.lastNoise; }

  // ---------- ricercato ----------
  crime(a, victim) { this.wantedHeat += a; this.applyHeat(); this.lostT = 0; }
  applyHeat() { let w = 0; for (let i = 1; i < 6; i++) if (this.wantedHeat >= HEAT[i]) w = i; if (w > this.wanted) { this.G.hud.toast(w === 1 ? 'I Carabinieri ti cercano!' : `Ricercato: ${'★'.repeat(w)}`, w > 1, 2500); } this.wanted = this.G.wanted = w; }
  setWanted(n) { this.wantedHeat = HEAT[n]; this.wanted = this.G.wanted = n; this.lostT = 0; }
  wantedUpdate(dt) {
    const G = this.G, pl = G.player; if (this.wanted === 0) { this.copsSee = false; return; }
    let see = false;
    for (const h of G.humans) if (h.cop && !h.dead && h.hasLOS && Math.hypot(h.pos.x - pl.pos.x, h.pos.z - pl.pos.z) < 75) { see = true; break; }
    if (!see) for (const v of G.police.cars) if (!v.dead && Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) < 55 && this.hasLOS(v.pos, 1, pl.pos, 1)) { see = true; break; }
    this.copsSee = G.copsSee = see;
    if (see) this.lostT = 0; else this.lostT += dt;
    if (this.lostT > 16) { this.wantedHeat = Math.max(0, this.wantedHeat - 3.5); this.lostT = 8; const old = this.wanted; this.applyHeat(); this.wanted = this.G.wanted = this.heatLevel(); if (this.wanted === 0) { this.wantedHeat = 0; G.hud.toast('Ti hanno perso di vista', true, 3000); } else if (this.wanted < old) G.hud.toast('Meno ricercato…'); }
    if (pl.dead) { this.setWanted(0); }
  }
  heatLevel() { let w = 0; for (let i = 1; i < 6; i++) if (this.wantedHeat >= HEAT[i]) w = i; return w; }

  // ---------- combattimento ----------
  rayHit(o, d, range, owner) {
    const G = this.G; let best = { t: range, type: 'none', obj: null };
    const st = G.colliders.ray(o.x, o.y, o.z, d.x, d.y, d.z, best.t); if (st && st.t < best.t) best = { t: st.t, type: 'static', obj: st.obj };
    const th = rayTerrain(G.terrain, o.x, o.y, o.z, d.x, d.y, d.z, best.t); if (th && th.t < best.t) best = { t: th.t, type: 'terrain', obj: null };
    if (d.y < 0 && o.y > 0) { const t = -o.y / d.y; if (t < best.t && t > 0) { const px = o.x + d.x * t, pz = o.z + d.z * t; if (G.terrain.heightAt(px, pz) < -0.1) best = { t, type: 'water', obj: null }; } }
    const cyl = (cx, cy, cz, r, h) => {
      const fx = o.x - cx, fz = o.z - cz, a = d.x * d.x + d.z * d.z; if (a < 1e-8) return -1; const b = fx * d.x + fz * d.z, c = fx * fx + fz * fz - r * r, disc = b * b - a * c; if (disc < 0) return -1;
      const t = (-b - Math.sqrt(disc)) / a; if (t < 0 || t > best.t) return -1; const y = o.y + d.y * t; return y >= cy - 0.1 && y <= cy + h ? t : -1;
    };
    for (const h of G.humans) { if (h === owner || h.dead) continue; const t = cyl(h.pos.x, h.pos.y, h.pos.z, 0.42, 1.85); if (t > 0 && t < best.t) best = { t, type: 'human', obj: h, head: o.y + d.y * t > h.pos.y + 1.52 }; }
    if (owner !== G.player && !G.player.dead && !G.player.vehicle) { const t = cyl(G.player.pos.x, G.player.pos.y, G.player.pos.z, 0.4, G.player.swimming ? 0.8 : 1.8); if (t > 0 && t < best.t) best = { t, type: 'player', obj: G.player }; }
    for (const v of G.vehicles) {
      if (v.sinkT > 0) continue; const dx = o.x - v.pos.x, dz = o.z - v.pos.z; if (dx * dx + dz * dz > (v.def.L + range) ** 2 && range < 400) { /* fuori portata */ }
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lox = dx * c - dz * s, loz = dx * s + dz * c, ldx = d.x * c - d.z * s, ldz = d.x * s + d.z * c;
      let t0 = 0, t1 = best.t; const slab = (p, dd, lo, hi) => { if (Math.abs(dd) < 1e-9) return p >= lo && p <= hi; let a = (lo - p) / dd, b = (hi - p) / dd; if (a > b) { const x = a; a = b; b = x; } if (a > t0) t0 = a; if (b < t1) t1 = b; return t0 <= t1; };
      if (slab(lox, ldx, -v.def.W / 2, v.def.W / 2) && slab(loz, ldz, -v.def.L / 2, v.def.L / 2) && slab(o.y - v.pos.y, d.y, 0, v.model.top)) { if (t0 > 0 && t0 < best.t) best = { t: t0, type: 'vehicle', obj: v }; }
    }
    return best;
  }
  applyHit(h, o, d, w, owner, dmg) {
    const G = this.G, p = new THREE.Vector3(o.x + d.x * h.t, o.y + d.y * h.t, o.z + d.z * h.t);
    if (h.type === 'human') { h.obj.hit(dmg, owner, h.head); G.hud.hitT = 0.25; G.fx.dust(p, 1, [0.9, 0.9, 0.9]); }
    else if (h.type === 'vehicle') { h.obj.damage(dmg * 0.55, owner); G.fx.sparks(p, 4); if (h.obj.ai && !h.obj.cop && owner === G.player) this.crime(0.25); if (h.obj.cop && owner === G.player) this.crime(1); }
    else if (h.type === 'player') { G.player.hurt(dmg, 'cop'); }
    else if (h.type === 'static') G.fx.sparks(p, 4);
    else if (h.type === 'terrain') G.fx.dust(p, 3);
    else if (h.type === 'water') G.fx.splash(p, 6, 0.5);
    return p;
  }
  playerShoot(pl, w) {
    const G = this.G, cam = G.camera, ray = new THREE.Vector3(); cam.getWorldDirection(ray);
    const model = pl.models[w.id]; const M = new THREE.Vector3(); (model ? model.userData.muzzle : pl.root).getWorldPosition(M);
    const skip = G.cam.curDist + 0.4; const O = cam.position.clone().addScaledVector(ray, skip);
    const aimHit = this.rayHit({ x: O.x, y: O.y, z: O.z }, ray, 220, pl); const A = O.clone().addScaledVector(ray, aimHit.t);
    let dir = A.clone().sub(M); if (dir.length() < 2) dir.copy(ray); dir.normalize();
    const spread = w.spread * (pl.aiming ? 0.6 : 1.3) * (1 + clamp(pl.speed / 8, 0, 1));
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      const r1 = (Math.random() - 0.5) * 2 * spread, r2 = (Math.random() - 0.5) * 2 * spread;
      const d = dir.clone(); const up = new THREE.Vector3(0, 1, 0), rt = new THREE.Vector3().crossVectors(d, up).normalize(); const u2 = new THREE.Vector3().crossVectors(rt, d).normalize();
      d.addScaledVector(rt, r1).addScaledVector(u2, r2).normalize();
      const h = this.rayHit({ x: M.x, y: M.y, z: M.z }, d, w.range, pl);
      const dmg = w.dmg * (h.type === 'human' ? clamp(1.2 - h.t / w.range * 0.6, 0.55, 1.2) : 1);
      const p = this.applyHit(h, M, d, w, pl, dmg); if (i < 3 || n === 1) G.fx.tracer(M, p);
    }
    G.fx.muzzle(M, w.id === 'shotgun' ? 8 : 4);
    G.audio.shot(w.sound); this.noise(pl.pos.x, pl.pos.z, w.noise);
    G.cam.pitch = Math.max(-0.55, G.cam.pitch - w.recoil * 0.6); G.cam.yaw += (Math.random() - 0.5) * w.recoil * 0.3;
    // pubblico che assiste = crimine
    if (this.wanted === 0) { for (const h of G.humans) { if (h.cop || h.dead) continue; if (Math.hypot(h.pos.x - pl.pos.x, h.pos.z - pl.pos.z) < 28 && this.hasLOS(h.pos, 1.5, pl.pos, 1.5)) { this.crime(0.12); break; } } }
    if (w.id === 'shotgun') { G.fx.smoke.emit(M.x, M.y, M.z, 0, 0.3, 0, 0.8, 0.3, 1.2, [0.8, 0.8, 0.8, 0.4], [0.8, 0.8, 0.8, 0]); }
  }
  melee(pl) {
    const G = this.G; G.audio.shot('punch'); const f = Math.sin(pl.yaw), g = Math.cos(pl.yaw);
    for (const h of G.humans) { if (h.dead) continue; const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz); if (d < 2.0 && (dx * f + dz * g) / (d + 1e-3) > 0.3) { h.hit(WEAPONS.fists.dmg, pl); G.hud.hitT = 0.25; this.noise(pl.pos.x, pl.pos.z, 15); h.pos.x += f * 0.4; h.pos.z += g * 0.4; break; } }
  }
  copShoot(c) {
    const G = this.G, pl = G.player, a = new THREE.Vector3(c.pos.x, c.pos.y + 1.4, c.pos.z), tgt = pl.vehicle ? pl.vehicle.pos : pl.pos;
    const b = new THREE.Vector3(tgt.x, tgt.y + (pl.vehicle ? 0.9 : 1.1), tgt.z), d = a.distanceTo(b);
    const ch = clamp(0.5 - d * 0.011, 0.1, 0.45) * (pl.vehicle && pl.vehicle.speed > 8 ? 0.55 : 1) * (pl.aiming ? 1 : 1);
    G.audio.shot('pistol', 0.5 * clamp(1 - d / 80, 0.1, 1)); G.fx.muzzle(a, 0.5);
    const miss = Math.random() > ch; if (miss) { b.x += (Math.random() - 0.5) * 3; b.y += (Math.random() - 0.5) * 2; b.z += (Math.random() - 0.5) * 3; }
    G.fx.tracer(a, b);
    if (!miss) { if (pl.vehicle) pl.vehicle.damage(7, c); pl.hurt(3 + G.wanted * 0.8, c); }
  }
  explosionAt(x, y, z, r, dmg, src) {
    const G = this.G;
    for (const h of G.humans) { if (h.dead) continue; const d = Math.hypot(h.pos.x - x, h.pos.z - z); if (d < r) { h.hit(dmg * (1 - d / r) * 1.3, src && src.driver ? src.driver : G.player); h.vy = 5; } }
    const pl = G.player; const dp = Math.hypot(pl.pos.x - x, pl.pos.z - z); if (!pl.vehicle && dp < r) pl.hurt(dmg * 0.7 * (1 - dp / r), 'explosion');
    for (const v of G.vehicles) { if (v === src || v.dead) continue; const d = Math.hypot(v.pos.x - x, v.pos.z - z); if (d < r + 2) { v.damage(dmg * 1.4 * (1 - d / (r + 2)), src && src.driver); const k = (r + 2 - d) / (r + 2); v.vx += (v.pos.x - x) / (d + 0.5) * 10 * k; v.vz += (v.pos.z - z) / (d + 0.5) * 10 * k; v.vy = 3 * k; v.air = k > 0.3; } }
    this.noise(x, z, 120); if (src && src.driver === G.player) this.crime(1);
  }

  respawnPlayer() {
    const G = this.G, pl = G.player, fee = Math.min(Math.floor(pl.money * 0.1), 400);
    G.hud.dead(true, 'K.O.', `Ti hanno portato alla Guardia Medica. -€${fee}`);
    pl.money -= fee; $('fxFade').style.opacity = 1;
    setTimeout(() => {
      const L = LANDMARKS.guardia; const nr = G.roads.nearest(L.x, L.z, 80); const p = nr ? { x: nr.s.x + nr.s.tz * 5, z: nr.s.z - nr.s.tx * 5 } : { x: SPAWN.x, z: SPAWN.z };
      pl.respawn(p.x, p.z, 0); for (const k in pl.owned) { if (pl.owned[k] && k !== 'fists') pl.ammo[k].reserve = Math.max(pl.ammo[k].reserve, 24); }
      pl.hp = 100; this.setWanted(0); G.hud.dead(false); $('fxFade').style.opacity = 0; G.cam.curDist = undefined; G.cam.yaw = 0;
    }, 1600);
    pl.deadT = -10;
  }
}
const $ = (id) => document.getElementById(id);
function G_ENGINE_OFF(G) { try { G.audio.engineStop(); } catch (e) { /* ok */ } }
