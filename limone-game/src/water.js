// Lago di Garda: shader d'acqua con fresnel, riflessi del cielo, profondità e schiuma a riva
import * as THREE from 'three';
import { BOUNDS } from './map.js';

// altezza onde (CPU) - stessa formula usata per far ondeggiare barche/moto d'acqua
export const waveAmp = { v: 1 };
export function waveH(x, z, t) {
  const a = waveAmp.v;
  return a * (0.07 * Math.sin(x * 0.11 + z * 0.045 + t * 1.25) + 0.045 * Math.sin(x * 0.07 - z * 0.13 + t * 1.7) + 0.02 * Math.sin(x * 0.31 + z * 0.23 + t * 2.6));
}

export class Water {
  constructor(T, terrain, sky) {
    const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1); geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, tNormal: { value: T.waterNormal }, tDepth: { value: terrain.depthTex },
        uBounds: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0) },
        uSunDir: { value: sky.sunDir }, uSunColor: { value: sky.state.sunColor }, uHorizon: { value: sky.state.horizon }, uZenith: { value: sky.state.zenith },
        uDay: { value: 1 }, uWind: { value: 1 }, uShade: { value: 1 },
        uShallow: { value: new THREE.Color(0.05, 0.42, 0.45) }, uDeep: { value: new THREE.Color(0.012, 0.09, 0.18) },
      }]),
      vertexShader: `varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
      fragmentShader: `varying vec3 vWP;
      uniform float uTime, uDay, uWind, uShade; uniform sampler2D tNormal, tDepth; uniform vec4 uBounds;
      uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uShallow, uDeep;
      #include <fog_pars_fragment>
      vec3 skyCol(vec3 d){
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon * 1.05, uZenith, pow(h, 0.4));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSunColor * (pow(s, 6.0) * 0.12 + pow(s, 220.0) * 1.2 + pow(s, 3500.0) * 60.0) * uShade;
        return c;
      }
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        float dist = length(cameraPosition - vWP);
        vec2 p = vWP.xz;
        vec3 n1 = texture2D(tNormal, p * 0.040 + vec2(uTime * 0.012, uTime * 0.006)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, p * 0.115 + vec2(-uTime * 0.021, uTime * 0.014)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(tNormal, p * 0.47 + vec2(uTime * 0.05, -uTime * 0.03)).xyz * 2.0 - 1.0;
        float at = 1.0 / (1.0 + dist * 0.0035);
        vec2 g = (n1.xy * 0.42 + n2.xy * 0.55 + n3.xy * 0.3 * at) * uWind * (0.35 + 0.65 * at);
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        float ndv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
        vec3 refl = skyCol(normalize(R));
        // profondità dal modello del terreno
        vec2 suv = (vWP.xz - uBounds.xy) / uBounds.zw;
        float inB = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
        float dep = mix(14.0, texture2D(tDepth, clamp(suv, 0.0, 1.0)).r * 14.0, inB);
        float k = 1.0 - exp(-dep * 0.32);
        vec3 body = mix(uShallow, uDeep, k) * (0.18 + 0.82 * uDay * (0.4 + 0.6 * uShade));
        // brillantezza vicino alla riva
        body += uShallow * 0.25 * (1.0 - k) * uDay;
        float alpha = clamp(1.0 - exp(-dep * 1.9), 0.0, 1.0);
        // schiuma sul bagnasciuga
        float nz = texture2D(tNormal, p * 0.9 + uTime * 0.02).z;
        float foam = (1.0 - smoothstep(0.0, 0.5, dep + (n2.x * 0.12))) * (0.55 + 0.45 * sin(uTime * 1.1 + dep * 9.0 + n1.x * 3.0));
        foam *= inB * (0.6 + 0.6 * nz);
        vec3 col = mix(body, refl, fres * 0.9 + 0.02);
        col = mix(col, vec3(0.92, 0.96, 1.0) * (0.25 + 0.75 * uDay), clamp(foam, 0.0, 1.0) * 0.8);
        alpha = max(alpha, max(fres, clamp(foam, 0.0, 1.0)));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.renderOrder = 2; this.mesh.frustumCulled = false; this.mesh.name = 'lake';
    this.sky = sky;
  }
  update(dt, camera) {
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    u.uDay.value = this.sky.state.dayF; u.uShade.value = 0.35 + 0.65 * this.sky.state.shade;
    this.mesh.position.set(Math.round(camera.position.x / 100) * 100, 0, Math.round(camera.position.z / 100) * 100);
  }
}
