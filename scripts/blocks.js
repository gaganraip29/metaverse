// blocks.js
import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

function loadTexture(path) {
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

const textures = {
  cactusSide: loadTexture('/textures/cactus_side.png'), // Vite serves from /public or root
  cactusTop: loadTexture('/textures/cactus_top.png'),
  dirt: loadTexture('/textures/dirt.png'),
  grass: loadTexture('/textures/grass.png'),
  grassSide: loadTexture('/textures/grass_side.png'),
  coalOre: loadTexture('/textures/coal_ore.png'),
  ironOre: loadTexture('/textures/iron_ore.png'),
  jungleTreeSide: loadTexture('/textures/jungle_tree_side.png'),
  jungleTreeTop: loadTexture('/textures/jungle_tree_top.png'),
  jungleLeaves: loadTexture('/textures/jungle_leaves.png'),
  leaves: loadTexture('/textures/leaves.png'),
  treeSide: loadTexture('/textures/tree_side.png'),
  treeTop: loadTexture('/textures/tree_top.png'),
  sand: loadTexture('/textures/sand.png'),
  snow: loadTexture('/textures/snow.png'),
  snowSide: loadTexture('/textures/snow_side.png'),
  stone: loadTexture('/textures/stone.png'),
  pickaxe: loadTexture('/textures/pickaxe.png'), // For toolbar if needed, though tool model is separate
};

export const blocks = {
  empty: { // ID 0, often used for "no block" or the pickaxe action
    id: 0,
    name: 'empty',
    visible: false // Not rendered as a block
  },
  grass: { // ID 1
    id: 1,
    name: 'grass',
    material: [
      new THREE.MeshLambertMaterial({ map: textures.grassSide }), // right
      new THREE.MeshLambertMaterial({ map: textures.grassSide }), // left
      new THREE.MeshLambertMaterial({ map: textures.grass }),     // top
      new THREE.MeshLambertMaterial({ map: textures.dirt }),      // bottom
      new THREE.MeshLambertMaterial({ map: textures.grassSide }), // front
      new THREE.MeshLambertMaterial({ map: textures.grassSide })  // back
    ]
  },
  dirt: { // ID 2
    id: 2,
    name: 'dirt',
    material: new THREE.MeshLambertMaterial({ map: textures.dirt })
  },
  stone: { // ID 3
    id: 3,
    name: 'stone',
    material: new THREE.MeshLambertMaterial({ map: textures.stone }),
    // Scale/scarcity are server-side generation params, not strictly needed in client block def
    // scale: { x: 30, y: 30, z: 30 },
    // scarcity: 0.8
  },
  coalOre: { // ID 4
    id: 4,
    name: 'coal_ore',
    material: new THREE.MeshLambertMaterial({ map: textures.coalOre }),
  },
  ironOre: { // ID 5
    id: 5,
    name: 'iron_ore',
    material: new THREE.MeshLambertMaterial({ map: textures.ironOre }),
  },
  tree: { // ID 6 - Represents Oak Tree Log
    id: 6,
    name: 'tree',
    material: [
      new THREE.MeshLambertMaterial({ map: textures.treeSide }),
      new THREE.MeshLambertMaterial({ map: textures.treeSide }),
      new THREE.MeshLambertMaterial({ map: textures.treeTop }),  // Top
      new THREE.MeshLambertMaterial({ map: textures.treeTop }),  // Bottom (same as top for logs)
      new THREE.MeshLambertMaterial({ map: textures.treeSide }),
      new THREE.MeshLambertMaterial({ map: textures.treeSide })
    ]
  },
  leaves: { // ID 7 - Represents Oak Leaves
    id: 7,
    name: 'leaves',
    material: new THREE.MeshLambertMaterial({ map: textures.leaves, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }) // Added transparency
  },
  sand: { // ID 8
    id: 8,
    name: 'sand',
    material: new THREE.MeshLambertMaterial({ map: textures.sand })
  },
  cloud: { // ID 9 - Not typically placeable by player, but server generates
    id: 9,
    name: 'cloud',
    visible: true, // Or false if clouds are special non-block entities
    material: new THREE.MeshBasicMaterial({ color: 0xf0f0f0, opacity: 0.8, transparent: true })
  },
  snow: { // ID 10 - Snow Block (full block, not just layer)
    id: 10,
    name: 'snow',
    material: [
      new THREE.MeshLambertMaterial({ map: textures.snowSide }),
      new THREE.MeshLambertMaterial({ map: textures.snowSide }),
      new THREE.MeshLambertMaterial({ map: textures.snow }),   // Top
      new THREE.MeshLambertMaterial({ map: textures.dirt }),    // Bottom (snow block on dirt)
      new THREE.MeshLambertMaterial({ map: textures.snowSide }),
      new THREE.MeshLambertMaterial({ map: textures.snowSide })
    ]
  },
  jungleTree: { // ID 11
    id: 11,
    name: 'jungleTree',
    material: [
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeSide }),
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeSide }),
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeTop }),
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeTop }),
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeSide }),
      new THREE.MeshLambertMaterial({ map: textures.jungleTreeSide })
    ]
  },
  jungleLeaves: { // ID 12
    id: 12,
    name: 'jungleLeaves',
    material: new THREE.MeshLambertMaterial({ map: textures.jungleLeaves, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }) // Added transparency
  },
  cactus: { // ID 13
    id: 13,
    name: 'cactus',
    material: [
        new THREE.MeshLambertMaterial({ map: textures.cactusSide }),
        new THREE.MeshLambertMaterial({ map: textures.cactusSide }),
        new THREE.MeshLambertMaterial({ map: textures.cactusTop }), // Top
        new THREE.MeshLambertMaterial({ map: textures.cactusTop }), // Bottom
        new THREE.MeshLambertMaterial({ map: textures.cactusSide }),
        new THREE.MeshLambertMaterial({ map: textures.cactusSide })
    ]
  },
  jungleGrass: { // ID 14
    id: 14,
    name: 'jungleGrass',
    material: [ // Similar to grass but could have a color tint if desired, or unique side texture
      new THREE.MeshLambertMaterial({ map: textures.grassSide }), // color: 0x6A8C69 for tint example
      new THREE.MeshLambertMaterial({ map: textures.grassSide }),
      new THREE.MeshLambertMaterial({ map: textures.grass }), // Top - could be tinted grass.png
      new THREE.MeshLambertMaterial({ map: textures.dirt }),
      new THREE.MeshLambertMaterial({ map: textures.grassSide }),
      new THREE.MeshLambertMaterial({ map: textures.grassSide })
    ]
  },
  // Add more blocks here if needed, ensure their IDs are unique
  // and match what the server might generate or what players can place.
};

// Resources are mainly for server-side generation logic.
// Client might not need this array directly if blocks object is used for materials.
export const resources = [
  blocks.stone,
  blocks.coalOre,
  blocks.ironOre
];