// ui.js
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { resources } from './blocks'; // Client-side blocks for UI listing
// Physics import is fine

export function setupUI(world, player, physics, scene) {
  if (!player || !world || !physics || !scene) {
    console.warn("UI setup called before all components are ready. Retrying in 1s.");
    setTimeout(() => setupUI(world, player, physics, scene), 1000);
    return;
  }
  const gui = new GUI();
  gui.title("Controls (U to toggle)");

  const playerFolder = gui.addFolder('Player');
  playerFolder.add(player, 'maxSpeed', 1, 20, 0.1).name('Max Speed');
  playerFolder.add(player, 'jumpSpeed', 1, 20, 0.1).name('Jump Speed'); // Increased max for jump
  playerFolder.add(player.boundsHelper, 'visible').name('Show Player Bounds');
  playerFolder.add(player.cameraHelper, 'visible').name('Show Camera Helper');

  const physicsFolder = gui.addFolder('Physics');
  if (physics.helpers) { // physics.helpers might not be initialized if physics constructor changes
      physicsFolder.add(physics.helpers, 'visible').name('Visualize Collisions');
  }
  physicsFolder.add(physics, 'gravity', 10, 100, 1).name('Gravity');
  physicsFolder.add(physics, 'simulationRate', 10, 1000, 10).name('Sim Rate');


  const worldFolder = gui.addFolder('World');
  worldFolder.add(world, 'drawDistance', 0, 10, 1).name('Draw Distance').onChange(() => {
      if (player && world) world.update(player); // Force update to load/unload chunks
  });
  // asyncLoading is now more about client-side mesh building stagger if any
  // worldFolder.add(world, 'asyncLoading').name('Async Mesh Building'); (If implemented)
  if (scene.fog) {
    worldFolder.add(scene.fog, 'near', 1, 200, 1).name('Fog Near');
    worldFolder.add(scene.fog, 'far', 1, 300, 1).name('Fog Far'); // Increased far fog
  } else {
      console.warn("Scene fog not initialized for UI control.");
  }


  // Terrain params are now server-side, client UI can't change them directly.
  // Could have a button "Request Server Params" or display read-only.
  // For now, removing direct manipulation of world.params from client UI.
  // If you want to change them, it would require a server restart or a command sent to server.

  const worldParamsFolder = worldFolder.addFolder('World Parameters (Read-Only)');
  function displayWorldParams() {
      worldParamsFolder.children.forEach(c => c.destroy()); // Clear old params

      if (world && world.params && Object.keys(world.params).length > 0) {
        worldParamsFolder.add({ seed: world.params.seed || 'N/A' }, 'seed').name('Seed (Server)').disable();
        
        if(world.params.terrain) {
            const terrainSubFolder = worldParamsFolder.addFolder('Terrain');
            terrainSubFolder.add(world.params.terrain, 'scale').name('Scale').disable();
            terrainSubFolder.add(world.params.terrain, 'magnitude').name('Magnitude').disable();
            terrainSubFolder.add(world.params.terrain, 'offset').name('Offset').disable();
            terrainSubFolder.add(world.params.terrain, 'waterOffset').name('Water Offset').disable();
        }
         // Add other params (biomes, trees, clouds) similarly as read-only
      } else {
        worldParamsFolder.add({ info: "Waiting for server..." }, 'info').name("Status").disable();
      }
  }
  displayWorldParams();
  // Refresh params display if worldInfo is received again (e.g. server restart with new params)
  if (world.socket) {
      world.socket.on('worldInfo', () => {
          displayWorldParams();
      });
  }


  // Resources are defined in blocks.js, their generation scarcity/scale is server-side.
  // Client UI can show block definitions but not change generation params.
  const resourcesDisplayFolder = worldFolder.addFolder('Resources (Definitions)');
  for (const resource of resources) { // These are client-side definitions
    const resourceFolder = resourcesDisplayFolder.addFolder(resource.name);
    resourceFolder.add({ id: resource.id }, 'id').name('ID').disable();
    // Scarcity/scale are generation params, not part of client block material.
    // To show server-side scarcity, server would need to send these params.
    // For now, this just shows the client knows about the block.
  }


  // No "Generate" button, as world is dynamically loaded from server.
  // worldFolder.onFinishChange((event) => {
  //   // world.generate(true); // Old client-side generation
  // });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyU') {
      if (gui.domElement.style.display === 'none') {
        gui.show();
      } else {
        gui.hide();
      }
    }
  });

  // Initially hide GUI if overlay is visible
  if (document.getElementById('overlay')?.style.display !== 'none') {
      gui.hide();
  }
}