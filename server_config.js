// server_config.js
export const CHUNK_SIZE = {
  width: 32,
  height: 32
};

export const DEFAULT_WORLD_PARAMS = {
  seed: 0, // This will be loaded or initialized
  terrain: {
    scale: 100,
    magnitude: 8,
    offset: 6,
    waterOffset: 4
  },
  biomes: {
    scale: 500,
    variation: {
      amplitude: 0.2,
      scale: 50
    },
    tundraToTemperate: 0.25,
    temperateToJungle: 0.5,
    jungleToDesert: 0.75
  },
  trees: {
    trunk: {
      minHeight: 4,
      maxHeight: 7
    },
    canopy: {
      minRadius: 3,
      maxRadius: 3,
      density: 0.7
    },
    frequency: 0.005 // per block chance in suitable biomes
  },
  clouds: {
    scale: 30,
    density: 0.3
  },
  // Resources will be taken from server_blocks.js directly for scarcity/scale
};

// Function to get resource params, as they are part of blocks definition
import { resources as blockResources } from './server_blocks.js';
export function getResourceParams() {
    const resources = {};
    blockResources.forEach(res => {
        resources[res.name] = {
            id: res.id,
            scarcity: res.scarcity,
            scale: res.scale,
        };
    });
    return resources;
}