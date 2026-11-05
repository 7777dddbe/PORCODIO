// Particelle (fumo, scintille, spruzzi) e raggi traccianti
import * as THREE from 'three';

class Pool {
  constructor(scene, max, tex, blending, renderer, depthTest = true) {
    this.max = max; this.n = 0; this.next = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3); this.ca = new THREE.BufferAttribute(this.col, 4); this.sa = new THREE.BufferAttribute(this.size, 1);
    g.setAttribute('position', this.pa); g.setAttribute('aColor', this.ca); g.setAttribute('aSize', this.sa);
    this.uniforms = { map: { value: tex }, uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending, depthTest,
      vertexShader: 'attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 90.0); }',
      fragmentShader: 'varying vec4 vC; uniform sampler2D map; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.003) discard; }',
    });
    this.mesh = new THREE.Points(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0, drag = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max; this.n = Math.min(this.max, this.n + 1);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag;
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = c0[k]; this.c1[i * 4 + k] = c1[k]; }
  }
  update(dt) {
    const N = this.max;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
    }
    this.pa.needsUpdate = true; this.ca.needsUpdate = true; this.sa.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, T, renderer, camera) {
    this.renderer = renderer; this.camera = camera;
    this.smoke = new Pool(scene, 900, T.smoke, THREE.NormalBlending);
    this.add = new Pool(scene, 700, T.glow, THREE.AdditiveBlending);
    this.spray = new Pool(scene, 700, T.puff, THREE.NormalBlending);
    // traccianti
    this.tracers = []; this.tg = new THREE.CylinderGeometry(0.012, 0.012, 1, 4); this.tg.rotateX(Math.PI / 2); this.tg.translate(0, 0, 0.5);
    this.tm = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.group = new THREE.Group(); scene.add(this.group);
    this.flash = new THREE.PointLight(0xffc070, 0, 14, 2); scene.add(this.flash); this.flashT = 0;
  }
  resize() { const s = this.renderer.domElement.height / (2 * Math.tan(this.camera.fov * Math.PI / 360)); for (const p of [this.smoke, this.add, this.spray]) p.uniforms.uScale.value = s; }
  tracer(a, b) {
    const m = new THREE.Mesh(this.tg, this.tm); m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, a.distanceTo(b)); this.group.add(m); this.tracers.push({ m, t: 0.07 });
  }
  muzzle(p, light = 4) { this.flash.position.copy(p); this.flash.intensity = light; this.flashT = 0.05; this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.06, 0.9, 0.3, [1, 0.8, 0.45, 1], [1, 0.4, 0.1, 0]); }
  sparks(p, n = 6, n2 = null) { for (let i = 0; i < n; i++) this.add.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.25 + Math.random() * 0.25, 0.14, 0.02, [1, 0.8, 0.4, 1], [1, 0.3, 0.1, 0], 12); this.smoke.emit(p.x, p.y, p.z, 0, 0.4, 0, 0.6, 0.35, 0.9, [0.7, 0.7, 0.7, 0.35], [0.7, 0.7, 0.7, 0]); }
  dust(p, n = 6, col = [0.62, 0.56, 0.45]) { for (let i = 0; i < n; i++) this.smoke.emit(p.x, p.y + 0.05, p.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.9 + Math.random() * 0.6, 0.4, 1.5, [col[0], col[1], col[2], 0.5], [col[0], col[1], col[2], 0], -0.2, 1.2); }
  splash(p, n = 18, power = 1) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = (1 + Math.random() * 3) * power; this.spray.emit(p.x, p.y + 0.1, p.z, Math.cos(a) * s, 3 + Math.random() * 4 * power, Math.sin(a) * s, 0.7 + Math.random() * 0.6, 0.18, 0.5, [1, 1, 1, 0.7], [0.9, 0.97, 1, 0], 10, 0.4); } }
  wake(p, vx, vz, n = 2) { for (let i = 0; i < n; i++) this.spray.emit(p.x + (Math.random() - 0.5), p.y + 0.15, p.z + (Math.random() - 0.5), vx * -0.1 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, vz * -0.1 + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.4, 0.16, 0.45, [1, 1, 1, 0.55], [1, 1, 1, 0], 8, 0.6); }
  explosion(p) {
    for (let i = 0; i < 26; i++) this.add.emit(p.x, p.y + 0.5, p.z, (Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14, 0.5 + Math.random() * 0.6, 1.4, 0.2, [1, 0.7, 0.25, 1], [1, 0.2, 0.05, 0], 6, 1);
    for (let i = 0; i < 28; i++) this.smoke.emit(p.x, p.y + 0.5, p.z, (Math.random() - 0.5) * 7, 2 + Math.random() * 6, (Math.random() - 0.5) * 7, 2 + Math.random() * 1.5, 1.5, 6, [0.12, 0.11, 0.1, 0.8], [0.2, 0.2, 0.2, 0], -1, 1.2);
    this.flash.position.copy(p); this.flash.intensity = 40; this.flashT = 0.25;
  }
  burn(p) { this.add.emit(p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5), 0, 2.5, 0, 0.5, 0.9, 0.2, [1, 0.6, 0.2, 0.7], [1, 0.2, 0.05, 0], -1, 0.5); this.smoke.emit(p.x, p.y + 0.5, p.z, (Math.random() - 0.5), 2 + Math.random(), (Math.random() - 0.5), 2, 0.8, 3.5, [0.1, 0.1, 0.1, 0.6], [0.2, 0.2, 0.2, 0], -0.5, 0.4); }
  update(dt) {
    this.smoke.update(dt); this.add.update(dt); this.spray.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.t -= dt; if (t.t <= 0) { this.group.remove(t.m); this.tracers.splice(i, 1); } }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; else this.flash.intensity *= 0.8; }
  }
}
