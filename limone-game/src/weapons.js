// Armi: dati + modelli 3D semplici
import * as THREE from 'three';

export const WEAPONS = {
  fists: { id: 'fists', name: 'Pugni', slot: 1, melee: true, dmg: 16, rate: 2.0, range: 1.9 },
  pistol: { id: 'pistol', name: 'Pistola', slot: 2, mag: 12, dmg: 26, rate: 3.4, spread: 0.010, range: 150, auto: false, sound: 'pistol', recoil: 0.018, noise: 55 },
  smg: { id: 'smg', name: 'Mitraglietta', slot: 3, mag: 30, dmg: 14, rate: 11, spread: 0.028, range: 130, auto: true, sound: 'smg', recoil: 0.01, noise: 60 },
  shotgun: { id: 'shotgun', name: 'Fucile a pompa', slot: 4, mag: 6, dmg: 10, pellets: 9, rate: 1.1, spread: 0.075, range: 55, auto: false, sound: 'shotgun', recoil: 0.04, noise: 80 },
};

const steel = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.35, metalness: 0.85 });
const grip = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7, metalness: 0.1 });
const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });

// canna lungo +z, "su" = +y. Poi ruotata per stare nella mano (vedi character: asse mano = -y)
export function buildWeaponModel(id) {
  const g = new THREE.Group(), m = new THREE.Group(); g.add(m);
  const box = (w, h, d, x, y, z, mat = steel) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; m.add(b); return b; };
  const cyl = (r, l, x, y, z, mat = steel) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), mat); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); c.castShadow = true; m.add(c); return c; };
  let muzzleZ = 0.2;
  if (id === 'pistol') { box(0.03, 0.045, 0.2, 0, 0.02, 0.09); box(0.028, 0.1, 0.045, 0, -0.04, 0.0).rotation.x = -0.18; box(0.012, 0.012, 0.03, 0, 0.05, 0.19); muzzleZ = 0.21; }
  else if (id === 'smg') { box(0.04, 0.07, 0.3, 0, 0.02, 0.1); cyl(0.012, 0.16, 0, 0.03, 0.33); box(0.03, 0.14, 0.04, 0, -0.08, 0.03).rotation.x = -0.1; box(0.026, 0.12, 0.035, 0, -0.07, 0.15); box(0.028, 0.04, 0.12, 0, 0.0, -0.1, grip); muzzleZ = 0.42; }
  else if (id === 'shotgun') { cyl(0.014, 0.7, 0, 0.03, 0.4); cyl(0.012, 0.55, 0, 0.0, 0.34); box(0.04, 0.06, 0.24, 0, 0.0, 0.0, wood); box(0.035, 0.1, 0.18, 0, -0.03, -0.18, wood); box(0.045, 0.045, 0.14, 0, -0.03, 0.34, wood); muzzleZ = 0.76; }
  m.rotation.x = Math.PI / 2; m.position.set(0, -0.02, 0.0);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -muzzleZ, 0.0); g.add(muzzle); // dopo rotazione: -y è avanti
  g.userData.muzzle = muzzle;
  return g;
}
