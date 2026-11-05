// Cielo, sole/luna, nuvole, stelle, illuminazione e ciclo giorno/notte
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smooth } from './util.js';

const LAT = 45.8 * Math.PI / 180, DEC = 16 * Math.PI / 180;

export class SkySystem {
  constructor(renderer, scene, q) {
    this.renderer = renderer; this.scene = scene; this.q = q;
    this.hour = 9.3;
    this.timeScale = 1 / 5; // ore di gioco per secondo reale (1 ora = 5 s)... regolato in main
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.state = { dayF: 1, night: 0, el: 40, sunColor: new THREE.Color(1, 0.95, 0.85), horizon: new THREE.Color(0.7, 0.8, 0.93), zenith: new THREE.Color(0.2, 0.4, 0.8), fog: new THREE.Color(0.7, 0.8, 0.93), shade: 1 };

    this.sky = new Sky(); this.sky.scale.setScalar(9000); this.sky.name = 'sky';
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.0045; u.mieDirectionalG.value = 0.82;

    // sole
    this.sun = new THREE.DirectionalLight(0xfff0dd, 3.4);
    this.sun.castShadow = q.shadows;
    const ss = q.shadowSize; this.sun.shadow.mapSize.set(ss, ss);
    this.extent = q.shadowExtent;
    const sc = this.sun.shadow.camera; sc.left = -this.extent; sc.right = this.extent; sc.top = this.extent; sc.bottom = -this.extent; sc.near = 10; sc.far = 1200;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.9;
    scene.add(this.sun); scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8aa0d8, 0); scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight(0xbcd2f5, 0x5b5a44, 0.35); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb5cdee, 0.00026);

    // ambiente (IBL) catturato dal cielo
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(80); this.envScene.add(this.envSky);
    this.envT = 0; this.envRT = null;

    // nuvole
    const cg = new THREE.SphereGeometry(8000, 32, 20);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.6, 0.7, 0.9) }, uCover: { value: 0.56 }, uDay: { value: 1 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uTime, uCover, uDay; uniform vec3 uSun, uSunCol, uAmb;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vP); if (d.y < 0.015) discard;
        vec2 uv = d.xz / (d.y + 0.2) * 0.9 + vec2(uTime*0.004, uTime*0.0015);
        float base = fbm(uv * 0.9);
        float det = fbm(uv * 3.2 + base * 1.5);
        float dens = smoothstep(uCover, uCover + 0.28, base * 0.75 + det * 0.35);
        float toward = fbm(uv * 0.9 + uSun.xz * 0.06);
        float shade = clamp((base - toward) * 3.0 + 0.55, 0.0, 1.0);
        vec3 col = mix(uAmb * 1.15, uSunCol * 1.6, shade * 0.65 + 0.2) * (0.62 + 0.38 * (1.0 - dens * 0.5));
        float sd = max(dot(d, uSun), 0.0); col += uSunCol * pow(sd, 6.0) * 0.4 * (1.0 - dens * 0.4);
        float fade = smoothstep(0.015, 0.22, d.y);
        gl_FragColor = vec4(col * uDay, dens * fade * 0.92);
      }`,
    });
    this.clouds = new THREE.Mesh(cg, this.cloudMat); this.clouds.renderOrder = -1; this.clouds.frustumCulled = false; scene.add(this.clouds);

    // stelle
    const sp = new Float32Array(2200 * 3); let k = 0;
    for (let i = 0; i < 2200; i++) { const a = Math.random() * 6.283, b = Math.acos(Math.random() * 0.96 + 0.04); sp[k++] = Math.sin(b) * Math.cos(a) * 7000; sp[k++] = Math.cos(b) * 7000; sp[k++] = Math.sin(b) * Math.sin(a) * 7000; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; scene.add(this.stars);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe8edff, fog: false, transparent: true, opacity: 0 }));
    this.moonMesh.frustumCulled = false; scene.add(this.moonMesh);
    this.uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: this.sunDir } };
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; }

  update(dt, target, camera) {
    this.hour = (this.hour + dt * this.timeScale) % 24;
    const H = (this.hour - 12) * 15 * Math.PI / 180;
    const sinEl = Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H);
    const el = Math.asin(clamp(sinEl, -1, 1));
    let az = Math.acos(clamp((Math.sin(DEC) - sinEl * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT) + 1e-6), -1, 1));
    if (H > 0) az = Math.PI * 2 - az;
    const ce = Math.cos(el);
    this.sunDir.set(ce * Math.sin(az), Math.sin(el), -ce * Math.cos(az)).normalize();
    const eld = el * 180 / Math.PI, S = this.state;
    S.el = eld;
    S.dayF = smooth(-5, 14, eld);
    S.night = 1 - smooth(-16, -3, eld);
    const gold = smooth(22, 3, eld) * smooth(-6, 1, eld);
    // colori
    S.sunColor.setRGB(1, 0.97, 0.92).lerp(new THREE.Color(1, 0.55, 0.26), gold * 0.9);
    S.fog.setRGB(0.6, 0.75, 0.95).lerp(new THREE.Color(0.95, 0.66, 0.5), gold * 0.55).lerp(new THREE.Color(0.025, 0.035, 0.08), S.night * 0.95 + (1 - S.dayF) * 0.0).multiplyScalar(0.55 + 0.45 * S.dayF);
    S.horizon.copy(S.fog); S.zenith.setRGB(0.18, 0.38, 0.78).lerp(new THREE.Color(0.28, 0.3, 0.5), gold * 0.5).multiplyScalar(S.dayF * 0.9 + 0.03);

    // ombra delle montagne a ovest: la luce diretta cala quando il sole scende dietro la cresta
    const west = clamp(-this.sunDir.x * 1.6 + 0.2, 0, 1);
    const ridge = 16 + 10 * west;
    S.shade = lerp(1, smooth(ridge - 6, ridge + 3, eld), west);
    const sunI = 3.6 * smooth(-1.5, 10, eld) * S.shade;
    this.sun.intensity = sunI; this.sun.color.copy(S.sunColor);
    this.moon.intensity = 1.3 * S.night; this.moon.position.copy(this.sunDir).multiplyScalar(-1).setY(Math.abs(this.sunDir.y) + 0.4).normalize().multiplyScalar(500).add(target);
    this.moon.target.position.copy(target); this.moon.visible = S.night > 0.02;
    this.hemi.intensity = 0.28 + 0.12 * S.dayF; this.hemi.color.setRGB(0.74, 0.82, 0.96).lerp(new THREE.Color(0.2, 0.25, 0.5), S.night); this.hemi.groundColor.setRGB(0.36, 0.34, 0.26).multiplyScalar(0.3 + 0.7 * S.dayF);

    // posizione/snap luce solare (stabilizza le ombre)
    const dir = this.sunDir, up = Math.abs(dir.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize(), up2 = new THREE.Vector3().crossVectors(dir, right).normalize();
    const texel = (2 * this.extent) / this.sun.shadow.mapSize.x;
    const a = Math.round(target.dot(right) / texel) * texel, b = Math.round(target.dot(up2) / texel) * texel, c = target.dot(dir);
    const snapped = right.multiplyScalar(a).add(up2.multiplyScalar(b)).add(dir.clone().multiplyScalar(c));
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(dir, 500);
    // se il sole è sotto l'orizzonte niente ombre dal sole (usiamo la luna senza ombre)
    this.sun.visible = sunI > 0.01;

    // cielo
    const su = this.sky.material.uniforms; su.sunPosition.value.copy(dir);
    su.rayleigh.value = lerp(1.2, 2.6, gold); su.turbidity.value = lerp(2.4, 6, gold);
    const eu = this.envSky.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = su[k].value; eu.sunPosition.value.copy(dir);
    this.cloudMat.uniforms.uTime.value += dt; this.cloudMat.uniforms.uSun.value.copy(dir);
    this.cloudMat.uniforms.uSunCol.value.copy(S.sunColor).multiplyScalar(0.9); this.cloudMat.uniforms.uAmb.value.setRGB(0.55, 0.68, 0.95).lerp(new THREE.Color(0.8, 0.5, 0.4), gold * 0.5);
    this.cloudMat.uniforms.uDay.value = 0.02 + 0.98 * S.dayF * (0.5 + 0.5 * S.shade);
    this.clouds.position.copy(camera.position);
    this.sky.position.copy(camera.position); this.stars.position.copy(camera.position);
    this.starMat.opacity = smooth(0.3, 0.9, S.night);
    this.moonMesh.position.copy(camera.position).addScaledVector(dir, -7000); this.moonMesh.material.opacity = smooth(0.3, 0.8, S.night);

    this.scene.fog.color.copy(S.fog); this.scene.fog.density = lerp(0.00030, 0.00019, S.dayF);
    this.renderer.toneMappingExposure = lerp(1.5, 0.52, S.dayF);
    this.uniforms.uNight.value = S.night * (1 - S.dayF * 0.0);
    this.uniforms.uTime.value += dt;

    this.envT -= dt;
    if (this.envT <= 0) { this.envT = 6; this.refreshEnv(); }
  }

  refreshEnv() {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }
}
