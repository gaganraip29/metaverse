// world.js
import * as THREE from 'three';
import { WorldChunk } from './worldChunk';
import { blocks } from './blocks.js'; // Static import for block definitions

export class World extends THREE.Group {
  asyncLoading = true;
  drawDistance = 3;
  chunkSize = {};
  params = {};
  requestedChunks = new Set();

  constructor(socket) {
    super();
    this.socket = socket;

    this.socket.on('chunkData', ({ chunkX, chunkZ, data }) => {
      const chunkKey = `${chunkX},${chunkZ}`;
      this.requestedChunks.delete(chunkKey);

      let chunk = this.getChunk(chunkX, chunkZ);
      if (!chunk) {
        // console.warn(`CLIENT: Received data for chunk ${chunkX},${chunkZ} but chunk object not found. Creating placeholder again.`);
        chunk = this.createChunkPlaceholder(chunkX, chunkZ);
      }

      if (chunk && !chunk.isGenerated && !chunk.isGenerating) {
        chunk.processChunkDataFromServer(data);
      } else if (chunk && (chunk.isGenerated || chunk.isGenerating)) {
        // console.log(`CLIENT: Chunk ${chunkX},${chunkZ} data received, but already generated/generating. Ignored duplicate data.`);
      }
    });
  }

  setWorldInformation(info) {
    // console.log('WORLD.JS: setWorldInformation called with:', JSON.stringify(info));
    this.params = info.params || {};
    this.chunkSize = info.chunkSize || { width: 32, height: 32 };
    // console.log('WORLD.JS: this.params is now:', JSON.stringify(this.params));
    // console.log('WORLD.JS: this.chunkSize is now:', JSON.stringify(this.chunkSize));
  }

  update(player) {
    if (!this.params.seed && typeof this.params.seed !== 'number' || !this.chunkSize.width) {
      return;
    }

    const visibleChunks = this.getVisibleChunks(player);
    const chunksToRequest = this.getChunksToRequest(visibleChunks);
    this.removeUnusedChunks(visibleChunks, player);

    for (const chunkCoord of chunksToRequest) {
      this.createChunkPlaceholder(chunkCoord.x, chunkCoord.z);
      this.requestChunkFromServer(chunkCoord.x, chunkCoord.z);
    }
  }

  createChunkPlaceholder(chunkX, chunkZ) {
    let chunk = this.getChunk(chunkX, chunkZ);
    if (chunk) return chunk;

    chunk = new WorldChunk(this);
    chunk.position.set(
      chunkX * (this.chunkSize.width || 32),
      0,
      chunkZ * (this.chunkSize.width || 32)
    );
    chunk.userData.x = chunkX; // userData.isWorldChunk is set in WorldChunk constructor
    chunk.userData.z = chunkZ;
    chunk.userData.isPlaceholder = true;
    // console.log(`Created placeholder for chunk ${chunkX},${chunkZ} with userData:`, JSON.stringify(chunk.userData));

    this.add(chunk);
    return chunk;
  }

  requestChunkFromServer(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (this.requestedChunks.has(key)) {
      return;
    }
    const existingChunk = this.getChunk(chunkX, chunkZ);
    if (existingChunk && existingChunk.isGenerated) {
      return;
    }

    // console.log(`CLIENT: Requesting chunk ${chunkX},${chunkZ} from server.`);
    this.socket.emit('requestChunk', { chunkX, chunkZ });
    this.requestedChunks.add(key);
  }

  getVisibleChunks(player) {
    const visibleChunks = [];
    if (!player || !player.position || !this.chunkSize.width) return visibleChunks;

    const coords = this.worldToChunkCoords(player.position.x, player.position.y, player.position.z);
    if (!coords) return visibleChunks;

    const playerChunkX = coords.chunk.x;
    const playerChunkZ = coords.chunk.z;

    for (let x = playerChunkX - this.drawDistance; x <= playerChunkX + this.drawDistance; x++) {
      for (let z = playerChunkZ - this.drawDistance; z <= playerChunkZ + this.drawDistance; z++) {
        visibleChunks.push({ x, z });
      }
    }
    return visibleChunks;
  }

  getChunksToRequest(visibleChunks) {
    return visibleChunks.filter(coord => {
      const chunk = this.getChunk(coord.x, coord.z);
      const key = `${coord.x},${coord.z}`;
      return (!chunk || (!chunk.isGenerated && !chunk.isGenerating)) && !this.requestedChunks.has(key);
    });
  }

  removeUnusedChunks(visibleChunks, player) {
    const chunksToRemove = this.children.filter(obj => {
      if (!obj.userData || typeof obj.userData.x !== 'number' || typeof obj.userData.z !== 'number') return false;
      const isVisible = visibleChunks.some(vc => vc.x === obj.userData.x && vc.z === obj.userData.z);
      return !isVisible;
    });

    for (const chunk of chunksToRemove) {
      if (chunk.disposeInstances) {
        chunk.disposeInstances();
      }
      this.remove(chunk);
      this.requestedChunks.delete(`${chunk.userData.x},${chunk.userData.z}`);
      this.socket.emit('unloadChunk', { chunkX: chunk.userData.x, chunkZ: chunk.userData.z });
    }
  }

  getBlock(worldX, worldY, worldZ) {
    const coords = this.worldToChunkCoords(worldX, worldY, worldZ);
    if (!coords) return null;
    const chunk = this.getChunk(coords.chunk.x, coords.chunk.z);

    if (chunk && chunk.loaded) {
      return chunk.getBlock(coords.block.x, coords.block.y, coords.block.z);
    }
    return null;
  }

  worldToChunkCoords(worldX, worldY, worldZ) {
    if (!this.chunkSize || !this.chunkSize.width) {
      return null;
    }
    const chunkX = Math.floor(worldX / this.chunkSize.width);
    const chunkZ = Math.floor(worldZ / this.chunkSize.width);
    const blockX = Math.floor(worldX - chunkX * this.chunkSize.width);
    const blockY = Math.floor(worldY);
    const blockZ = Math.floor(worldZ - chunkZ * this.chunkSize.width);

    return {
      chunk: { x: chunkX, z: chunkZ },
      block: { x: blockX, y: blockY, z: blockZ }
    };
  }

  getChunk(chunkX, chunkZ) {
    return this.children.find(c => c.userData && c.userData.x === chunkX && c.userData.z === chunkZ);
  }

  updateBlock(worldX, worldY, worldZ, blockId) {
    const coords = this.worldToChunkCoords(worldX, worldY, worldZ);
    if (!coords) {
      return;
    }
    const chunk = this.getChunk(coords.chunk.x, coords.chunk.z);

    if (chunk && chunk.data) {
      chunk.setBlockId_Client(coords.block.x, coords.block.y, coords.block.z, blockId);
    }
  }

  addBlock(worldX, worldY, worldZ, blockId) {
    this.updateBlock(worldX, worldY, worldZ, blockId);
  }

  removeBlock(worldX, worldY, worldZ) {
    this.updateBlock(worldX, worldY, worldZ, blocks.empty.id);
  }

  dispose() {
    this.children.forEach(chunk => {
      if (chunk.disposeInstances) {
        chunk.disposeInstances();
      }
    });
    this.clear();
    this.requestedChunks.clear();
  }
}