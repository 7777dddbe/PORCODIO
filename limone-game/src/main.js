import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildTextures, setAniso } from './textures.js';
import { RoadNet } from './roads.js';
import { Terrain, makeTerrainMaterial, buildFarTerrain } from './terrain.js';
import { SkySystem } from './sky.js';
import { Water } from './water.js';
import * as MAP from './map.js';
import { SPAWN, BOUNDS } from './map.js';
import { Colliders } from './physics.js';
import { Buildings } from './buildings.js';
import { Vegetation } from './vegetation.js';
import { Props } from './props.js';
import * as CH from './character.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const QUALITY = {
  high: { name: 'high', shadows: true, shadowSize: 4096, shadowExtent: 105, pr: 1.75, bloom: true, composer: true, lodScale: 1.0, trees: 1.0, npc: 28, traffic: 12, aniso: 8 },
  med: { name: 'med', shadows: true, shadowSize: 2048, shadowExtent: 85, pr: 1.25, bloom: false, composer: false, lodScale: 0.8, trees: 0.65, npc: 18, traffic: 8, aniso: 4 },
  low: { name: 'low', shadows: true, shadowSize: 1024, shadowExtent: 65, pr: 1, bloom: false, composer: false, lodScale: 0.6, trees: 0.4, npc: 10, traffic: 5, aniso: 2 },
};
let qName = params.get('q');
try { qName = qName || localStorage.getItem('limone.q'); } catch (e) { /* storage non disponibile */ }
if (!QUALITY[qName]) qName = isTouch ? 'med' : 'high';
const q = QUALITY[qName];

const G = window.__G = { THREE, q, isTouch, params, debug: params.has('debug'), manual: params.has('manual') };

function progress(p, txt) { $('loadBar').style.width = Math.round(p * 100) + '%'; if (txt) $('loadTxt').textContent = txt; }
const tick = () => new Promise((r) => setTimeout(r, 0));

function setupRenderer() {
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(q.pr, window.devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAniso(Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy()));
  G.renderer = renderer;
  const scene = new THREE.Scene(); G.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 14000); G.camera = camera;
  if (q.composer) {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    if (q.bloom) { G.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.55, 1.05); composer.addPass(G.bloom); }
    composer.addPass(new OutputPass());
    G.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uSat: { value: 1.08 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uVig, uSat;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, uSat);
        vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVig * dot(d, d) * 2.2; c.rgb += (h(vUv * 1000.0) - 0.5) * 0.018; gl_FragColor = c; }`,
    });
    composer.addPass(G.grade);
    G.composer = composer;
  }
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (G.composer) { G.composer.setSize(innerWidth, innerHeight); }
  });
}

async function boot() {
  setupRenderer();
  const { scene, camera, renderer } = G;
  progress(0.02, 'Genero le texture…');
  const tb = buildTextures();
  for (let i = 0; i < tb.steps.length; i++) { tb.run(i); progress(0.02 + 0.2 * (i / tb.steps.length), 'Texture: ' + tb.steps[i][0]); await tick(); }
  const T = G.T = tb.finish();

  progress(0.24, 'Disegno le strade…');
  await tick();
  const roadNet = G.roads = new RoadNet();

  progress(0.28, 'Scolpisco la montagna…');
  const terrain = G.terrain = new Terrain();
  await terrain.bake(roadNet, (p) => progress(0.28 + p * 0.3));
  G.MAP = MAP; G.char = CH;
  const colliders = G.colliders = new Colliders();
  const sky0 = { uniforms: { uTime: { value: 0 }, uNight: { value: 0 } } };
  G.nightU = sky0.uniforms.uNight; G.timeU = sky0.uniforms.uTime;
  progress(0.58, 'Costruisco il paese…'); await tick();
  const buildings = G.buildings = new Buildings({ terrain, roads: roadNet, T, colliders, nightU: G.nightU, q });
  buildings.generate();
  const props = G.props = new Props({ terrain, roads: roadNet, T, colliders, buildings, nightU: G.nightU, timeU: G.timeU, q });
  props.shapeTerrain();
  terrain.buildMasks();

  progress(0.62, 'Cielo e lago…');
  await tick();
  const sky = G.sky = new SkySystem(renderer, scene, q);
  sky.uniforms.uNight = G.nightU; sky.uniforms.uTime = G.timeU;
  sky.timeScale = 1 / 90;
  sky.refreshEnv();
  const tmat = G.tmat = makeTerrainMaterial(T, terrain, sky.uniforms, 0.55);
  scene.add(terrain.buildMeshes(tmat));
  const far = buildFarTerrain(tmat); scene.add(far);
  scene.add(roadNet.buildMeshes(T));
  scene.add(buildings.buildMeshes());
  props.sky = sky; scene.add(props.build());
  progress(0.8, 'Pianto ulivi e cipressi…'); await tick();
  const veg = G.veg = new Vegetation({ terrain, roads: roadNet, T, colliders, buildings, q, uniforms: sky.uniforms });
  veg.generate(); scene.add(veg.buildMeshes());
  console.log('[t] buildings', buildings.list.length, 'trees', veg.count);
  const water = G.water = new Water(T, terrain, sky); scene.add(water.mesh);

  progress(0.95, 'Preparo i personaggi…'); await tick();
  G.sky.timeScale = 1 / 400;
  const game = G.gameObj = new Game(G); game.init(); G.game = game;
  G.setCam = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); };
  G.sim = (dt = 0.033) => { game.update(dt); sky.update(dt, camera.position, camera); water.update(dt, camera); };
  G.render = (dt = 0.016) => {
    game.update(dt);
    sky.update(dt, camera.position, camera);
    water.update(dt, camera);
    terrain.updateLOD(camera.position.x, camera.position.z, q.lodScale);
    if (G.composer) { if (G.grade) G.grade.uniforms.uTime.value += dt; G.composer.render(dt); } else renderer.render(scene, camera);
  };
  progress(1, 'Pronto!');
  await tick();
  $('loading').hidden = true; $('menu').hidden = false;
  if (isTouch) { $('keysDesk').hidden = true; $('menuNote').textContent = 'Stick a sinistra: muovi · trascina a destra: guarda · pulsanti per sparare, saltare, salire sui veicoli.'; }
  for (const b of document.querySelectorAll('#qRow button')) { b.classList.toggle('on', b.dataset.q === qName); b.onclick = () => { try { localStorage.setItem('limone.q', b.dataset.q); } catch (e) { /* ok */ } const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u.toString(); }; }
  $('btnPlay').onclick = () => game.begin();
  $('btnFull').onclick = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* ok */ } };
  if (!G.manual) { let last = performance.now(); const loop = (t) => { requestAnimationFrame(loop); const dt = Math.min(0.1, (t - last) / 1000); last = t; G.render(dt); }; requestAnimationFrame(loop); }
}
boot().catch((e) => { console.error(e); $('loadTxt').textContent = 'Errore: ' + e.message; });
