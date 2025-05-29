// server_chunk_generator.js
import { SimplexNoise } from './server_simplex_noise.js';
import { RNG } from './server_rng.js';
import { blocks, resources as blockResourcesList } from './server_blocks.js';
import { CHUNK_SIZE } from './server_config.js';

// Helper to get a flat index for 3D array
function getBlockIndex(x, y, z) {
  return y * CHUNK_SIZE.width * CHUNK_SIZE.width + z * CHUNK_SIZE.width + x;
}

export class ServerChunkGenerator {
  constructor(params) {
    this.params = params; // World generation parameters
    this.rng = new RNG(this.params.seed);
    this.simplex = new SimplexNoise(this.rng); // Pass RNG to SimplexNoise if its constructor is adapted
                                               // Original three.js SimplexNoise doesn't use it directly for permutation table
                                               // but it's good practice if you modify SimplexNoise to be seedable.
                                               // For now, SimplexNoise uses its own internal (possibly Math.random based) permutation.
                                               // To make it deterministic, the SimplexNoise permutation table itself should be seeded.
                                               // For this example, we assume the copied SimplexNoise is deterministic or we accept its default.
  }

  generateChunkData(chunkX, chunkZ) {
    const chunkBlockData = new Uint8Array(CHUNK_SIZE.width * CHUNK_SIZE.height * CHUNK_SIZE.width).fill(blocks.empty.id);
    const chunkWorldX = chunkX * CHUNK_SIZE.width;
    const chunkWorldZ = chunkZ * CHUNK_SIZE.width;

    // Terrain pass
    for (let x = 0; x < CHUNK_SIZE.width; x++) {
      for (let z = 0; z < CHUNK_SIZE.width; z++) {
        const biome = this.getBiome(this.simplex, chunkWorldX + x, chunkWorldZ + z);
        const value = this.simplex.noise(
          (chunkWorldX + x) / this.params.terrain.scale,
          (chunkWorldZ + z) / this.params.terrain.scale
        );
        const scaledNoise = this.params.terrain.offset + this.params.terrain.magnitude * value;
        let height = Math.floor(scaledNoise);
        height = Math.max(0, Math.min(height, CHUNK_SIZE.height - 1));

        for (let y = 0; y <= height; y++) {
          const idx = getBlockIndex(x, y, z);
          if (y === height) {
            if (y <= this.params.terrain.waterOffset) {
                 chunkBlockData[idx] = blocks.sand.id;
            } else {
                let groundBlockType = blocks.grass.id; // Default
                if (biome === 'Desert') groundBlockType = blocks.sand.id;
                else if (biome === 'Tundra') groundBlockType = blocks.snow.id;
                else if (biome === 'Jungle') groundBlockType = blocks.jungleGrass.id; // Assuming jungleGrass
                chunkBlockData[idx] = groundBlockType;
            }
          } else {
            // Fill below surface, check for resources
            let blockToPlace = blocks.dirt.id;
            for (const resource of blockResourcesList) {
                const resValue = this.simplex.noise3d(
                    (chunkWorldX + x) / resource.scale.x,
                    (y) / resource.scale.y, // y is world Y here
                    (chunkWorldZ + z) / resource.scale.z
                );
                if (resValue > resource.scarcity) {
                    blockToPlace = resource.id;
                    break; 
                }
            }
             chunkBlockData[idx] = blockToPlace === blocks.dirt.id && y < height -3 ? blocks.stone.id : blockToPlace;
          }
        }
      }
    }
    
    // Tree pass (after main terrain is set)
    // Need a temporary 2D heightmap for placing trees correctly or re-check height
    const localRng = new RNG(this.params.seed + chunkX * 10000 + chunkZ); // Seed per chunk for trees
    for (let x = 0; x < CHUNK_SIZE.width; x++) {
        for (let z = 0; z < CHUNK_SIZE.width; z++) {
            // Recalculate height for tree placement
            let surfaceY = -1;
            for (let y = CHUNK_SIZE.height -1; y >=0; y--) {
                if (chunkBlockData[getBlockIndex(x,y,z)] !== blocks.empty.id) {
                    surfaceY = y;
                    break;
                }
            }
            if (surfaceY === -1) continue; // No ground

            const currentSurfaceBlockId = chunkBlockData[getBlockIndex(x, surfaceY, z)];
            const canPlaceTree = currentSurfaceBlockId === blocks.grass.id || 
                                 currentSurfaceBlockId === blocks.jungleGrass.id ||
                                 currentSurfaceBlockId === blocks.dirt.id || // Allow on dirt
                                 currentSurfaceBlockId === blocks.sand.id; // For cacti

            if (canPlaceTree && localRng.random() < this.params.trees.frequency) {
                const biome = this.getBiome(this.simplex, chunkWorldX + x, chunkWorldZ + z);
                this.generateTree(chunkBlockData, localRng, biome, x, surfaceY + 1, z);
            }
        }
    }


    // Cloud pass (simple flat layer)
    if (this.params.clouds.density > 0) {
        for (let x = 0; x < CHUNK_SIZE.width; x++) {
            for (let z = 0; z < CHUNK_SIZE.width; z++) {
                const cloudValue = (this.simplex.noise(
                    (chunkWorldX + x) / this.params.clouds.scale,
                    (chunkWorldZ + z) / this.params.clouds.scale
                ) + 1) * 0.5; // Normalize to 0-1

                if (cloudValue < this.params.clouds.density) {
                    // Place clouds at a fixed high Y level, e.g., CHUNK_SIZE.height - 1 or CHUNK_SIZE.height - 2
                    const cloudY = CHUNK_SIZE.height - 2; // Example Y for clouds
                     if (chunkBlockData[getBlockIndex(x,cloudY,z)] === blocks.empty.id) { // Avoid overwriting
                        chunkBlockData[getBlockIndex(x, cloudY, z)] = blocks.cloud.id;
                     }
                }
            }
        }
    }
    return Array.from(chunkBlockData); // Convert Uint8Array to regular array for JSON stringify if needed by socket.io
  }

  getBiome(simplex, worldX, worldZ) {
    let noise = 0.5 * simplex.noise(
      worldX / this.params.biomes.scale,
      worldZ / this.params.biomes.scale
    ) + 0.5;
    noise += this.params.biomes.variation.amplitude * simplex.noise(
      worldX / this.params.biomes.variation.scale,
      worldZ / this.params.biomes.variation.scale
    );

    if (noise < this.params.biomes.tundraToTemperate) return 'Tundra';
    if (noise < this.params.biomes.temperateToJungle) return 'Temperate';
    if (noise < this.params.biomes.jungleToDesert) return 'Jungle';
    return 'Desert';
  }
  
  _setBlock(chunkData, x, y, z, blockId) {
    if (x >= 0 && x < CHUNK_SIZE.width && y >= 0 && y < CHUNK_SIZE.height && z >= 0 && z < CHUNK_SIZE.width) {
        chunkData[getBlockIndex(x,y,z)] = blockId;
    }
  }

  generateTree(chunkData, rng, biome, x, startY, z) {
    const minH = this.params.trees.trunk.minHeight;
    const maxH = this.params.trees.trunk.maxHeight;
    const h = Math.round(minH + (maxH - minH) * rng.random());

    let trunkBlock = blocks.tree.id;
    let leavesBlock = blocks.leaves.id;

    if (biome === 'Jungle') {
        trunkBlock = blocks.jungleTree.id;
        leavesBlock = blocks.jungleLeaves.id;
    } else if (biome === 'Desert') {
        // Cactus: 1 to 3 blocks high, no canopy
        const cactusHeight = 1 + Math.floor(rng.random() * 3);
        for (let i = 0; i < cactusHeight; i++) {
            if (startY + i < CHUNK_SIZE.height) {
                this._setBlock(chunkData, x, startY + i, z, blocks.cactus.id);
            }
        }
        return; // No canopy for cactus
    } else if (biome === 'Tundra') {
        // Standard tree, maybe make them sparser or shorter via params if desired
    }


    for (let treeY = 0; treeY < h; treeY++) {
        if (startY + treeY < CHUNK_SIZE.height) {
            this._setBlock(chunkData, x, startY + treeY, z, trunkBlock);
        }
    }

    // Canopy
    if (startY + h < CHUNK_SIZE.height) { // Ensure canopy base is within chunk
        const minR = this.params.trees.canopy.minRadius;
        const maxR = this.params.trees.canopy.maxRadius;
        const r = Math.round(minR + (maxR - minR) * rng.random());
        const canopyBaseY = startY + h;

        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) { // Canopy is somewhat spherical/cuboid
                for (let dz = -r; dz <= r; dz++) {
                    if (dx * dx + dy * dy + dz * dz > r * r && dy < 0) continue; // Roughly spherical, allow flatter top
                     if (dx * dx + dz * dz > r * r && dy >= 0) continue; // More circular top


                    const leafX = x + dx;
                    const leafY = canopyBaseY + dy; // Center canopy around top of trunk
                    const leafZ = z + dz;

                    if (leafX >= 0 && leafX < CHUNK_SIZE.width &&
                        leafY >= 0 && leafY < CHUNK_SIZE.height &&
                        leafZ >= 0 && leafZ < CHUNK_SIZE.width) {
                        if (chunkData[getBlockIndex(leafX,leafY,leafZ)] === blocks.empty.id) { // Don't overwrite trunk
                           if (rng.random() < this.params.trees.canopy.density) {
                             this._setBlock(chunkData, leafX, leafY, leafZ, leavesBlock);
                           }
                        }
                    }
                }
            }
        }
    }
  }
}