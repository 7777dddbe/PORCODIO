// HUD: barre, minimappa, mappa grande, notifiche
import { BOUNDS, LANDMARKS } from './map.js';
import { fmtMoney, clamp } from './util.js';
import { obbCorners } from './buildings.js';

const MS = 0.34; // px per metro nella mappa pre-renderizzata
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = { hud: $('hud'), hp: $('hpFill'), ar: $('arFill'), money: $('money'), stars: $('stars'), clock: $('clock'), place: $('place'), wName: $('wName'), wAmmo: $('wAmmo'), speed: $('speed'), cross: $('cross'), prompt: $('prompt'), toasts: $('toasts'), mission: $('mission'), mTitle: $('mTitle'), mText: $('mText'), mTimer: $('mTimer'), lemons: $('lemons'), dmg: $('fxDamage'), water: $('fxWater'), dead: $('dead'), deadTitle: $('deadTitle'), deadSub: $('deadSub'), bigmap: $('bigmap'), bigc: $('bigc'), mini: $('mini') };
    this.mctx = this.el.mini.getContext('2d'); this.mapCanvas = null; this.lastStars = -1; this.dmgT = 0;
  }
  buildMap() {
    const G = this.G, T = G.terrain, W = Math.round((BOUNDS.x1 - BOUNDS.x0) * MS), H = Math.round((BOUNDS.z1 - BOUNDS.z0) * MS);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), id = c.createImageData(W, H), d = id.data;
    const NX = 1152 + 1;
    const hAt = (x, z) => { const i = Math.max(0, Math.min(1151, ((x - BOUNDS.x0) / 2) | 0)), j = Math.max(0, Math.min(1535, ((z - BOUNDS.z0) / 2) | 0)); return T.H[j * NX + i]; };
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = BOUNDS.x0 + px / MS, z = BOUNDS.z0 + py / MS, h = hAt(x, z), o = (py * W + px) * 4;
      let r, g, b;
      if (h < 0.0) { const t = clamp(-h / 40, 0, 1); r = 70 - 55 * t; g = 170 - 110 * t; b = 190 - 90 * t; }
      else {
        const hx = hAt(x + 3, z) - hAt(x - 3, z), hz = hAt(x, z + 3) - hAt(x, z - 3);
        const sh = clamp(0.62 + (-hx * 0.5 - hz * 0.5) * 0.12, 0.25, 1.15);
        const t = clamp(h / 500, 0, 1);
        r = (150 - 20 * t + 20 * t * t * 3) * sh; g = (170 - 30 * t) * sh; b = (120 + 30 * t) * sh;
        if (h < 2.6) { r = 215 * sh; g = 205 * sh; b = 170 * sh; }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    c.putImageData(id, 0, 0);
    const X = (x) => (x - BOUNDS.x0) * MS, Z = (z) => (z - BOUNDS.z0) * MS;
    // edifici
    c.fillStyle = '#c47a52';
    for (const b of G.buildings.list) { const cs = obbCorners(b.cx, b.cz, b.hx, b.hz, b.yaw); c.beginPath(); c.moveTo(X(cs[0][0]), Z(cs[0][1])); for (let i = 1; i < 4; i++) c.lineTo(X(cs[i][0]), Z(cs[i][1])); c.closePath(); c.fill(); }
    c.fillStyle = '#3bb8d8'; for (const p of G.props.pools) c.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
    // strade
    for (const pass of [0, 1]) for (const r of G.roads.roads) {
      c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); r.path.forEach((p, i) => { if (i % 3 === 0 || i === r.path.length - 1) i ? c.lineTo(X(p.x), Z(p.z)) : c.moveTo(X(p.x), Z(p.z)); });
      if (r.closed) c.closePath();
      const w = Math.max(2, r.w * MS * (pass ? 1.15 : 1.9));
      c.lineWidth = w; c.strokeStyle = pass ? (r.kind === 'main' ? '#ffe9a0' : r.kind === 'lane' ? '#e6e6e6' : '#ffffff') : '#3a3f45'; c.stroke();
    }
    this.mapCanvas = cv;
  }
  worldToMap(x, z) { return [(x - BOUNDS.x0) * MS, (z - BOUNDS.z0) * MS]; }

  toast(text, big = false, ms = 2800) {
    const d = document.createElement('div'); d.className = 'toast' + (big ? ' big' : ''); d.textContent = text; this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }
  prompt(t) { const p = this.el.prompt; if (!t) { p.hidden = true; return; } if (p.dataset.t !== t) { p.innerHTML = t; p.dataset.t = t; } p.hidden = false; }
  damage() { this.dmgT = 0.5; }
  dead(show, title, sub) { this.el.dead.hidden = !show; if (title) this.el.deadTitle.textContent = title; if (sub) this.el.deadSub.textContent = sub; }

  update(dt) {
    const G = this.G, pl = G.player, e = this.el;
    e.hp.style.width = clamp(pl.hp, 0, 100) + '%'; e.ar.style.width = clamp(pl.armor, 0, 100) + '%'; e.ar.parentElement.style.opacity = pl.armor > 0 ? 1 : 0.35;
    e.money.textContent = fmtMoney(pl.money);
    const st = Math.floor(G.wanted); if (st !== this.lastStars) { this.lastStars = st; e.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < st ? '' : 'off'}">★</span>`).join(''); }
    e.stars.classList.toggle('blink', G.wanted > 0 && G.copsSee);
    const hh = Math.floor(G.sky.hour), mm = Math.floor((G.sky.hour % 1) * 60); e.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    // arma
    const w = pl.weapon; e.wName.textContent = pl.vehicle ? pl.vehicle.def.label : w.name;
    e.wAmmo.textContent = pl.vehicle ? '' : w.melee ? '∞' : `${pl.ammo[w.id].mag} / ${pl.ammo[w.id].reserve}`;
    if (pl.vehicle) { e.speed.hidden = false; e.speed.innerHTML = Math.round(pl.vehicle.speed * 3.6) + '<small>KM/H</small>'; } else e.speed.hidden = true;
    e.cross.classList.toggle('on', pl.aiming && !pl.vehicle); e.cross.classList.toggle('hit', this.hitT > 0); this.hitT = Math.max(0, (this.hitT || 0) - dt);
    e.lemons.textContent = `🍋 ${G.stats.lemons}/${G.totalLemons || 0}`;
    this.dmgT = Math.max(0, this.dmgT - dt); e.dmg.style.opacity = Math.min(1, this.dmgT * 2 + (pl.hp < 30 ? 0.35 + 0.15 * Math.sin(G.time * 6) : 0));
    e.water.style.opacity = G.underwater ? 1 : 0;
    // luogo
    let best = null, bd = 1e9; for (const k in LANDMARKS) { const L = LANDMARKS[k]; if (!L.name) continue; const d = Math.hypot(L.x - pl.pos.x, L.z - pl.pos.z); if (d < bd) { bd = d; best = L; } }
    e.place.textContent = best && bd < 140 ? best.name : 'Limone sul Garda';
    this.drawMini();
  }
  mission(m) {
    const e = this.el; if (!m) { e.mission.hidden = true; return; }
    e.mission.hidden = false; e.mTitle.textContent = m.title; e.mText.textContent = m.text; e.mTimer.textContent = m.timer != null ? Math.max(0, Math.ceil(m.timer)) + 's' : '';
  }
  drawMini() {
    const G = this.G, c = this.mctx, S = this.el.mini.width, pl = G.player; if (!this.mapCanvas) return;
    const zoom = G.bigMapOpen ? 0.8 : (pl.vehicle ? 0.55 : 1.0) * 1.15; // px per metro (S=340)
    const yaw = G.cam.yaw, a = yaw - Math.PI, k = zoom / MS;
    c.save(); c.clearRect(0, 0, S, S); c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 3, 0, 7); c.clip();
    c.fillStyle = '#123a4a'; c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2); c.rotate(a); c.scale(k, k);
    const [mx, mz] = this.worldToMap(pl.pos.x, pl.pos.z); c.translate(-mx, -mz);
    c.drawImage(this.mapCanvas, 0, 0);
    c.restore();
    // icone
    const ic = (x, z, col, r = 6, shape = 'dot') => {
      let dx = (x - pl.pos.x) * zoom, dz = (z - pl.pos.z) * zoom;
      const ca = Math.cos(a), sa = Math.sin(a), rx = dx * ca - dz * sa, ry = dx * sa + dz * ca, d = Math.hypot(rx, ry), R = S / 2 - 12;
      let X = S / 2 + rx, Y = S / 2 + ry, edge = false; if (d > R) { X = S / 2 + rx / d * R; Y = S / 2 + ry / d * R; edge = true; }
      c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath();
      if (shape === 'sq') c.rect(X - r, Y - r, r * 2, r * 2); else if (shape === 'tri') { c.moveTo(X, Y - r); c.lineTo(X + r, Y + r); c.lineTo(X - r, Y + r); c.closePath(); } else c.arc(X, Y, edge ? r * 0.8 : r, 0, 7);
      c.fill(); c.stroke();
    };
    for (const m of G.missions.markers()) ic(m.x, m.z, m.color || '#ffd93a', 8, 'sq');
    for (const h of G.humans) if (h.cop && !h.dead) ic(h.pos.x, h.pos.z, '#4aa8ff', 5);
    for (const v of G.vehicles) if (v.cop && !v.dead) ic(v.pos.x, v.pos.z, '#ff4a4a', 6, 'sq');
    if (G.wanted === 0) for (const p of G.pickups.list) if (p.type === 'weapon' && !p.taken) ic(p.x, p.z, '#ff8844', 5, 'tri');
    // giocatore (freccia al centro)
    c.save(); c.translate(S / 2, S / 2); c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
    // N
    c.fillStyle = '#fff'; c.font = '700 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', S / 2 + Math.sin(a) * (S / 2 - 20), S / 2 - Math.cos(a) * (S / 2 - 20));
  }
  drawBig() {
    const G = this.G, cv = this.el.bigc, c = cv.getContext('2d'); if (!this.mapCanvas) return;
    const mc = this.mapCanvas, sc = Math.min(cv.width / mc.width, cv.height / mc.height);
    cv.width = Math.round(mc.width * 1.2); cv.height = Math.round(mc.height * 1.2); const k = cv.width / mc.width;
    c.drawImage(mc, 0, 0, cv.width, cv.height);
    c.font = '600 20px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.lineWidth = 4;
    for (const key in LANDMARKS) { const L = LANDMARKS[key]; if (!L.name) continue; const [x, y] = this.worldToMap(L.x, L.z); c.strokeStyle = '#000'; c.strokeText(L.name, x * k, y * k - 8); c.fillStyle = '#fff'; c.fillText(L.name, x * k, y * k - 8); c.fillStyle = '#f5d633'; c.beginPath(); c.arc(x * k, y * k, 5, 0, 7); c.fill(); }
    for (const m of G.missions.markers()) { const [x, y] = this.worldToMap(m.x, m.z); c.fillStyle = m.color || '#ffd93a'; c.strokeStyle = '#000'; c.lineWidth = 3; c.fillRect(x * k - 7, y * k - 7, 14, 14); c.strokeRect(x * k - 7, y * k - 7, 14, 14); }
    for (const p of G.pickups.list) if (p.type === 'lemon' && !p.taken) { const [x, y] = this.worldToMap(p.x, p.z); c.fillStyle = '#ffe94a'; c.beginPath(); c.arc(x * k, y * k, 3.5, 0, 7); c.fill(); }
    const [px, pz] = this.worldToMap(G.player.pos.x, G.player.pos.z); c.save(); c.translate(px * k, pz * k); c.rotate(-G.cam.yaw + Math.PI); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
}
