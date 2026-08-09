/* Door 2 electrical room and removable dual-channel bridge fuse.
   The red/blue glass channels visually match the lower diagnostic panel, so
   the wall object establishes the circuit vocabulary without tutorial text. */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { boxGeo, cylGeo, scene } from './scene.js';
import { matDark, matMetal } from './materials.js';

const W = CFG.world.corridorW;
const wallX = -W / 2;
const Z = CFG.transit.electroZ;

export const ELECTRO = { gapZ: Z - 1.9, gapY: 2.22 };

const matCab = new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 0.6, metalness: 0.5 });
const matHaz = new THREE.MeshStandardMaterial({ color: 0x8a7a2c, roughness: 0.8, metalness: 0.1 });
const matSocket = new THREE.MeshStandardMaterial({ color: 0x141a1e, roughness: 0.75, metalness: 0.25 });
const matRedGlass = new THREE.MeshStandardMaterial({
  color: 0xff525e, emissive: 0xb71925, emissiveIntensity: 1.6,
  roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.9,
});
const matBlueGlass = new THREE.MeshStandardMaterial({
  color: 0x5594ff, emissive: 0x164fbf, emissiveIntensity: 1.8,
  roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.9,
});

export const electroRoom = new THREE.Group();
electroRoom.visible = false;
scene.add(electroRoom);

const add = (geo, mat, sx, sy, sz, x, y, z, rx = 0) => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); mesh.rotation.x = rx;
  electroRoom.add(mesh);
  return mesh;
};

/* Cabinet and venting keep the existing transformer-room silhouette. */
add(boxGeo, matCab, 0.16, 1.5, 0.95, wallX + 0.08, 1.05, Z);
add(boxGeo, matMetal, 0.02, 1.3, 0.8, wallX + 0.175, 1.05, Z);
for (let i = 0; i < 4; i++)
  add(boxGeo, matDark, 0.012, 0.03, 0.62, wallX + 0.19, 1.42 - i * 0.09, Z);
add(cylGeo, matMetal, 0.03, 0.04, 0.03, wallX + 0.19, 0.72, Z + 0.28);
for (let i = 0; i < 6; i++)
  add(boxGeo, i % 2 ? matHaz : matDark, 0.02, 0.1, 0.14, wallX + 0.17, 0.24, Z - 0.38 + i * 0.15);

/* Two separate feeds lead into an empty cartridge cradle. */
const railY = [ELECTRO.gapY + 0.065, ELECTRO.gapY - 0.065];
const tube = (z0, z1, y) =>
  add(cylGeo, matMetal, 0.027, z0 - z1, 0.027, wallX + 0.065, y, (z0 + z1) / 2, Math.PI / 2);
add(cylGeo, matMetal, 0.04, 0.75, 0.04, wallX + 0.06, 2.225, Z);
for (const y of railY) {
  tube(Z, ELECTRO.gapZ + 0.34, y);
  tube(ELECTRO.gapZ - 0.34, 1.15, y);
}

/* Dark backing and four contacts remain after the fuse is removed. */
add(boxGeo, matSocket, 0.035, 0.18, 0.42, wallX + 0.075, ELECTRO.gapY, ELECTRO.gapZ);
for (const y of railY) {
  for (const z of [ELECTRO.gapZ - 0.29, ELECTRO.gapZ + 0.29])
    add(cylGeo, matMetal, 0.035, 0.055, 0.035, wallX + 0.115, y, z, Math.PI / 2);
}

export const loosePiece = new THREE.Group();
export const LOOSE = {
  home: new THREE.Vector3(wallX + 0.125, ELECTRO.gapY - 0.01, ELECTRO.gapZ),
  homeRotZ: 0.045,
};
loosePiece.position.copy(LOOSE.home);
loosePiece.rotation.z = LOOSE.homeRotZ;
electroRoom.add(loosePiece);

/** Transit animates this emissive shell while the player is looking at it. */
export const matLoose = new THREE.MeshStandardMaterial({
  color: 0x69747a, roughness: 0.42, metalness: 0.55,
  emissive: 0x24515e, emissiveIntensity: 0.75,
});
export const LOOSE_GLOW = 0.75;

/* Ceramic carrier, twin glass channels and unmistakable end blades. */
{
  const carrier = new THREE.Mesh(boxGeo, matLoose);
  carrier.scale.set(0.045, 0.17, 0.32);
  loosePiece.add(carrier);

  for (const [y, material] of [[0.068, matRedGlass], [-0.068, matBlueGlass]]) {
    const glass = new THREE.Mesh(cylGeo, material);
    glass.scale.set(0.035, 0.58, 0.035);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0.065, y, 0);
    loosePiece.add(glass);

    for (const z of [-0.265, 0.265]) {
      const cap = new THREE.Mesh(boxGeo, matMetal);
      cap.scale.set(0.058, 0.038, 0.045);
      cap.position.set(0.055, y, z);
      loosePiece.add(cap);
    }
  }

  for (const z of [-0.34, 0.34]) {
    const blade = new THREE.Mesh(boxGeo, matLoose);
    blade.scale.set(0.035, 0.15, 0.035);
    blade.position.z = z;
    loosePiece.add(blade);
  }

  // One retaining clip still grips the cartridge, making it read as loose rather than decorative.
  const clip = new THREE.Mesh(boxGeo, matMetal);
  clip.scale.set(0.052, 0.025, 0.07);
  clip.position.set(-0.014, 0.18, 0.24);
  loosePiece.add(clip);
}
