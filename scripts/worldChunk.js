// worldChunk.js
import * as THREE from 'three';
import { blocks } from './blocks'; // Client-side block definitions for materials

const geometry = new THREE.BoxGeometry(1, 1, 1); // Unit cube

export class WorldChunk extends THREE.Group {
  data = null; // Flat array of block IDs from server
  isGenerated = false; // True when meshes are built from server data
  isGenerating = false; // Flag to prevent multiple mesh generations
  loaded = false; // True when data received AND meshes built

  constructor(clientWorldReference) {
    super();
    this.clientWorld = clientWorldReference; // To access chunkSize, params from parent World
    this.userData.isWorldChunk = true; // Flag for raycasting and identification
    // this.position is set by World.js
    // this.userData.x and this.userData.z are also set by World.js
  }

  processChunkDataFromServer(chunkBlockData) {
    if (this.isGenerated || this.isGenerating) {
      return;
    }
    this.isGenerating = true;

    // console.log(`CHUNK ${this.userData?.x},${this.userData?.z}: Processing chunk data from server.`);
    this.data = chunkBlockData; // Store the flat array of block IDs

    this.generateMeshes(); // Build visuals

    this.loaded = true;
    this.isGenerated = true;
    this.isGenerating = false;

    document.dispatchEvent(new CustomEvent('chunkMeshesGenerated', {
      detail: {
        x: this.userData.x,
        z: this.userData.z,
        chunk: this
      }
    }));
  }

  getBlockId(localX, localY, localZ) {
    if (!this.data || !this.clientWorld.chunkSize || !this.inBounds(localX, localY, localZ)) {
      return blocks.empty.id;
    }
    const { width, height } = this.clientWorld.chunkSize;
    const index = localY * width * width + localZ * width + localX; // Y-major order
    if (index < 0 || index >= this.data.length) return blocks.empty.id; // Bounds check for flat array
    return this.data[index];
  }

  isBlockObscured(x, y, z) {
    // For simplicity, this only checks immediate neighbors within this chunk's data
    // More advanced culling would check adjacent chunks (requires access to them)
    const up = this.getBlockId(x, y + 1, z);
    const down = this.getBlockId(x, y - 1, z);
    const left = this.getBlockId(x + 1, y, z); // Positive X
    const right = this.getBlockId(x - 1, y, z); // Negative X
    const forward = this.getBlockId(x, y, z + 1); // Positive Z
    const back = this.getBlockId(x, y, z - 1);   // Negative Z

    const isEmpty = blocks.empty.id;
    // A block is obscured if all 6 neighbors are solid (not empty and not transparent - simplified for now)
    // This also doesn't account for blocks at the edge of the chunk which might be exposed to air in an adjacent unloaded chunk.
    if (up !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === up)]?.visible !== false &&
        down !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === down)]?.visible !== false &&
        left !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === left)]?.visible !== false &&
        right !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === right)]?.visible !== false &&
        forward !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === forward)]?.visible !== false &&
        back !== isEmpty && blocks[Object.keys(blocks).find(k => blocks[k].id === back)]?.visible !== false) {
      return true;
    }
    return false;
  }

  generateWater() {
    if (!this.clientWorld || !this.clientWorld.params || !this.clientWorld.chunkSize) return;
    const material = new THREE.MeshLambertMaterial({
      color: 0x9090e0,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });

    const waterGeometry = new THREE.PlaneGeometry(this.clientWorld.chunkSize.width, this.clientWorld.chunkSize.width);
    const waterMesh = new THREE.Mesh(waterGeometry, material);
    waterMesh.rotateX(-Math.PI / 2.0);
    waterMesh.position.set(
      this.clientWorld.chunkSize.width / 2,
      this.clientWorld.params.terrain.waterOffset + 0.4, // Use world params for water level
      this.clientWorld.chunkSize.width / 2
    );
    waterMesh.layers.set(1); // Water on a different layer if needed for raycasting interactions
    this.add(waterMesh);
  }

  generateMeshes() {
    this.clear(); // Clear previous meshes, including water
    if (!this.data || !this.clientWorld || !this.clientWorld.chunkSize || !this.clientWorld.params) {
      // console.warn(`Chunk ${this.userData?.x},${this.userData?.z} has no data or world context to generate meshes from.`);
      return;
    }

    this.generateWater();

    const { width, height } = this.clientWorld.chunkSize;
    const maxCount = width * height * width; // Max possible blocks in a chunk

    const meshes = {};
    Object.values(blocks)
      .filter(blockType => blockType.id !== blocks.empty.id && blockType.visible !== false)
      .forEach(blockType => {
        if (!blockType.material) {
          // console.warn(`Block type ${blockType.name} (ID ${blockType.id}) has no material for client meshing.`);
          return;
        }
        const mesh = new THREE.InstancedMesh(geometry, blockType.material, maxCount);
        mesh.name = String(blockType.id); // Used by raycaster to identify block type
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes[blockType.id] = mesh;
      });

    const matrix = new THREE.Matrix4();
    for (let y_local = 0; y_local < height; y_local++) {
      for (let z_local = 0; z_local < width; z_local++) {
        for (let x_local = 0; x_local < width; x_local++) {
          const blockId = this.getBlockId(x_local, y_local, z_local);
          
          const clientBlockDef = Object.values(blocks).find(b => b.id === blockId);
          if (!clientBlockDef || clientBlockDef.id === blocks.empty.id || clientBlockDef.visible === false) {
            continue;
          }

          const mesh = meshes[blockId];
          if (!mesh) { // Should not happen if blockId is valid and has material
            // console.warn(`No InstancedMesh found for blockId ${blockId} during mesh generation.`);
            continue;
          }
          
          if (!this.isBlockObscured(x_local, y_local, z_local)) {
            matrix.setPosition(x_local + 0.5, y_local + 0.5, z_local + 0.5); // Center of the block
            mesh.setMatrixAt(mesh.count, matrix);
            mesh.count++;
          }
        }
      }
    }

    // Add all created instanced meshes to the chunk group
    Object.values(meshes).forEach(mesh => {
        if (mesh && mesh.count > 0) { // Only add if it has instances
            this.add(mesh);
        }
    });
    // console.log(`CHUNK ${this.userData?.x},${this.userData?.z}: Meshes generated.`);
  }

  setBlockId_Client(localX, localY, localZ, blockId) {
    if (!this.data || !this.clientWorld.chunkSize || !this.inBounds(localX, localY, localZ)) return;
    const { width } = this.clientWorld.chunkSize;
    const index = localY * width * width + localZ * width + localX;

    if (index < 0 || index >= this.data.length) {
        console.warn(`setBlockId_Client: Index ${index} out of bounds for data array of chunk ${this.userData?.x},${this.userData?.z}`);
        return;
    }

    if (this.data[index] !== blockId) {
      this.data[index] = blockId;
      // console.log(`CHUNK ${this.userData?.x},${this.userData?.z}: Client set block at ${localX},${localY},${localZ} to ID ${blockId}. Rebuilding meshes.`);
      this.updateMeshes(); // Rebuild this chunk's visuals
    }
  }

  getBlock(x, y, z) { // local coords
    if (this.inBounds(x, y, z) && this.data) {
      return { id: this.getBlockId(x, y, z), instanceId: null }; // instanceId not easily tracked with flat data from server
    }
    return null;
  }

  inBounds(x, y, z) {
    if (!this.clientWorld || !this.clientWorld.chunkSize) return false;
    const { width, height } = this.clientWorld.chunkSize;
    return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < width;
  }

  updateMeshes() {
    if (!this.clientWorld || !this.clientWorld.chunkSize) {
      return;
    }
    // console.log(`CHUNK ${this.userData?.x},${this.userData?.z}: updateMeshes called.`);
    this.generateMeshes();
  }

  disposeInstances() {
    this.traverse((obj) => {
      if (obj.isInstancedMesh) {
        // Geometry is shared (the const `geometry` at the top)
        // Materials are from `blocks.js`, also shared. Don't dispose them here.
      } else if (obj.isMesh) { // For non-instanced meshes like water
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      }
    });
    this.clear(); // Removes all children from this THREE.Group
    this.isGenerated = false;
    this.loaded = false;
    this.data = null; // Clear data when chunk is disposed
  }
}