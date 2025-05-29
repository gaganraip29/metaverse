// server_blocks.js
export const blocks = {
  empty: { id: 0, name: 'empty', visible: false },
  grass: { id: 1, name: 'grass' },
  dirt: { id: 2, name: 'dirt' },
  stone: { id: 3, name: 'stone', scale: { x: 30, y: 30, z: 30 }, scarcity: 0.8 },
  coalOre: { id: 4, name: 'coal_ore', scale: { x: 20, y: 20, z: 20 }, scarcity: 0.8 },
  ironOre: { id: 5, name: 'iron_ore', scale: { x: 40, y: 40, z: 40 }, scarcity: 0.9 },
  tree: { id: 6, name: 'tree' },
  leaves: { id: 7, name: 'leaves' },
  sand: { id: 8, name: 'sand' },
  cloud: { id: 9, name: 'cloud' },
  snow: { id: 10, name: 'snow' },
  jungleTree: { id: 11, name: 'jungleTree' },
  jungleLeaves: { id: 12, name: 'jungleLeaves' },
  cactus: { id: 13, name: 'cactus' },
  jungleGrass: { id: 14, name: 'jungleGrass' },
  // Add any other blocks the server needs to know by ID for generation
};

export const resources = [
  blocks.stone,
  blocks.coalOre,
  blocks.ironOre
];

// Helper to get block by ID, useful for generation logic if needed
export function getBlockById(id) {
  for (const key in blocks) {
    if (blocks[key].id === id) {
      return blocks[key];
    }
  }
  return blocks.empty; // Default to empty if not found
}