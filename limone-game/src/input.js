// Input: tastiera + mouse (pointer lock) + touch (joystick e pulsanti)
export class Input {
  constructor(canvas, isTouch) {
    this.canvas = canvas; this.isTouch = isTouch;
    this.keys = new Set(); this.edge = new Set(); this.mouse = { l: false, r: false };
    this.lookX = 0; this.lookY = 0; this.stick = { x: 0, y: 0 }; this.touchBtn = {};
    this.locked = false; this.enabled = false; this.onPause = null;
    const key = (e, down) => {
      if (!this.enabled && down) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      if (down && !this.keys.has(k)) this.edge.add(k);
      if (down) this.keys.add(k); else this.keys.delete(k);
    };
    addEventListener('keydown', (e) => key(e, true)); addEventListener('keyup', (e) => key(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked && this.enabled && !this.isTouch && this.onPause) this.onPause(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.isTouch) { this.lock(); }
      if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true;
      if (e.button === 0) this.edge.add('MouseL');
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) { this.lookX += e.movementX; this.lookY += e.movementY; }
      else if ((this.mouse.l || this.mouse.r) && !this.isTouch) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
    if (isTouch) this.setupTouch();
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* non supportato */ } }
  unlock() { try { document.exitPointerLock(); } catch (e) { /* ok */ } }

  setupTouch() {
    const $ = (id) => document.getElementById(id);
    const stick = $('stick'), knob = stick.querySelector('i'), look = $('lookzone');
    let sid = null, sc = { x: 0, y: 0 };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); const r = stick.getBoundingClientRect(); sc = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; upd(e); });
    const upd = (e) => { let dx = (e.clientX - sc.x) / 55, dy = (e.clientY - sc.y) / 55; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } this.stick.x = dx; this.stick.y = -dy; knob.style.transform = `translate(${dx * 42}px,${dy * 42}px)`; };
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) upd(e); });
    const end = (e) => { if (e.pointerId === sid) { sid = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; } };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    let lid = null, last = { x: 0, y: 0 };
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; look.setPointerCapture(lid); last = { x: e.clientX, y: e.clientY }; });
    look.addEventListener('pointermove', (e) => { if (e.pointerId === lid) { this.lookX += (e.clientX - last.x) * 1.6; this.lookY += (e.clientY - last.y) * 1.6; last = { x: e.clientX, y: e.clientY }; } });
    const lend = (e) => { if (e.pointerId === lid) lid = null; };
    look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    const bind = (id, name, hold) => {
      const el = $(id); if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); this.touchBtn[name] = true; this.edge.add('T_' + name); });
      const up = () => { el.classList.remove('down'); this.touchBtn[name] = false; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    bind('tbFire', 'fire'); bind('tbJump', 'jump'); bind('tbUse', 'use'); bind('tbRun', 'run'); bind('tbAim', 'aim'); bind('tbWeap', 'weap'); bind('tbBrake', 'brake'); bind('tbMap', 'map'); bind('tbPause', 'pause');
  }

  // --- interrogazioni ---
  held(code) { return this.keys.has(code); }
  pressed(code) { return this.edge.has(code); }
  get moveX() { return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.stick.x; }
  get moveY() { return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + this.stick.y; }
  get fire() { return this.mouse.l || this.touchBtn.fire || this.keys.has('KeyF') && false; }
  get firePressed() { return this.pressed('MouseL') || this.pressed('T_fire'); }
  get aim() { return this.mouse.r || this.touchBtn.aim; }
  get run() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchBtn.run; }
  get jump() { return this.keys.has('Space') || this.touchBtn.jump; }
  get brake() { return this.keys.has('Space') || this.touchBtn.brake; }
  get use() { return this.pressed('KeyE') || this.pressed('T_use'); }
  get reload() { return this.pressed('KeyR'); }
  get map() { return this.pressed('KeyM') || this.pressed('T_map'); }
  get horn() { return this.keys.has('KeyH'); }
  get weaponNext() { return this.pressed('T_weap') || this.pressed('KeyQ'); }
  get timeKey() { return this.pressed('KeyT'); }
  get camKey() { return this.pressed('KeyC'); }
  weaponSlot() { for (let i = 1; i <= 4; i++) if (this.pressed('Digit' + i)) return i; return 0; }
  consumeLook() { const o = { x: this.lookX, y: this.lookY }; this.lookX = 0; this.lookY = 0; return o; }
  endFrame() { this.edge.clear(); this.wheel = 0; }
}
