// scripts/main.js
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { io } from "socket.io-client";

import { World } from './world';
import { Player } from './player';
import { Physics } from './physics';
import { setupUI } from './ui';
import { ModelLoader } from './modelLoader';
import { Character } from './character.js';

let otherPlayers = {};
let socket;
let world;
let player;
let physics;
let modelLoaderInstance;
let sun;

const stats = new Stats();
document.body.appendChild(stats.dom);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x80a0e0, 50, 100);

const orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(24, 35, 24);
orbitCamera.layers.enable(1);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.target.set(16, 0, 16);
controls.update();

const pendingBlockUpdates = new Map();

function applyPendingUpdatesForChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (pendingBlockUpdates.has(key)) {
        const updates = pendingBlockUpdates.get(key);
        updates.forEach(update => {
            if (world) {
                 world.updateBlock(update.x, update.y, update.z, update.blockId);
            }
        });
        pendingBlockUpdates.delete(key);
    }
}

function setupLights() {
  sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(50, 80, 50);
  sun.castShadow = true;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0005;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
}

function setupMultiplayer() {
  socket = io();
  world = new World(socket);
  scene.add(world);
  physics = new Physics(scene);

  socket.on('worldInfo', (info) => {
    // console.log(`CLIENT (${socket.id}): Received 'worldInfo'`, JSON.stringify(info));
    const connectionStatusElement = document.getElementById('connection-status');
    if(connectionStatusElement) connectionStatusElement.textContent = 'World information received!';
    if (world) { world.setWorldInformation(info); }
    else { console.error(`CLIENT (${socket.id}): worldInfo received, but world object is null!`); }

    if (!player) {
        player = new Player(scene, world, info.chunkSize);
        // console.log(`CLIENT (${socket.id}): Player object created:`, player);
        player.setSocket(socket);
        modelLoaderInstance = new ModelLoader((models) => {
            if (player) player.setTool(models.pickaxe);
        });
        setupUI(world, player, physics, scene);
    }
    if (player && world && world.params && typeof world.params.seed === 'number') {
        // console.log(`CLIENT (${socket.id}): worldInfo processed, triggering initial world.update. Seed:`, world.params.seed);
        world.update(player);
    }
  });

  document.addEventListener('chunkMeshesGenerated', (event) => {
    const { x, z } = event.detail;
    applyPendingUpdatesForChunk(x,z);
  });

  socket.on('connect', () => {
    console.log(`CLIENT (${socket.id}): Connected to server.`);
    const connectionStatusElement = document.getElementById('connection-status');
    if(connectionStatusElement) connectionStatusElement.textContent = 'Connected to server!';
  });

  socket.on('disconnect', () => {
    console.log(`CLIENT (${socket.id}): Disconnected from server.`);
    const connectionStatusElement = document.getElementById('connection-status');
    if(connectionStatusElement) connectionStatusElement.textContent = 'Disconnected. Trying to reconnect...';
    Object.keys(otherPlayers).forEach(id => {
        if (otherPlayers[id]?.character?.model) scene.remove(otherPlayers[id].character.model);
        if (otherPlayers[id]?.character) otherPlayers[id].character.dispose();
    });
    otherPlayers = {};
  });

  socket.on('currentPlayers', (playersFromServer) => {
    console.log(`CLIENT (${socket.id}): Received 'currentPlayers'. Server has ${Object.keys(playersFromServer).length} players.`);
    Object.keys(playersFromServer).forEach((id) => {
        const playerInfo = playersFromServer[id];
        if (id === socket.id) {
            if (player && playerInfo) {
                player.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
                if (player.camera) player.camera.rotation.y = playerInfo.rotationY || 0;
                if (world && world.params && typeof world.params.seed === 'number') {
                    world.update(player);
                }
            }
            return;
        }
        addOtherPlayer(playerInfo);
    });
  });

  socket.on('newPlayer', (playerInfo) => {
    console.log(`CLIENT (${socket.id}): Received 'newPlayer' event for player ${playerInfo.id}`);
    if (!playerInfo || playerInfo.id === socket.id) return;
    addOtherPlayer(playerInfo);
  });

  socket.on('playerDisconnected', (playerId) => {
    console.log(`CLIENT (${socket.id}): Player ${playerId} disconnected.`);
    if (otherPlayers[playerId]) {
      if (otherPlayers[playerId].character?.model) scene.remove(otherPlayers[playerId].character.model);
      if (otherPlayers[playerId].character) otherPlayers[playerId].character.dispose();
      delete otherPlayers[playerId];
    }
  });

  socket.on('playerMoved', (playerInfo) => {
   console.log(`CLIENT (${socket.id}): Received 'playerMoved' for ${playerInfo.id}. New pos: x:${playerInfo.x.toFixed(1)}, y:${playerInfo.y.toFixed(1)}, z:${playerInfo.z.toFixed(1)}`); // MOVEMENT DEBUG
   if (otherPlayers[playerInfo.id]?.character) {
    otherPlayers[playerInfo.id].character.updateState(playerInfo);
    otherPlayers[playerInfo.id].data = playerInfo;
  } else if (playerInfo.id !== socket.id) {
    // console.warn(`CLIENT (${socket.id}): Received 'playerMoved' for ${playerInfo.id}, but no character found.`);
  }
});

  socket.on('playerStateChanged', (playerInfo) => {
    if (otherPlayers[playerInfo.id]?.character) {
        otherPlayers[playerInfo.id].data = playerInfo;
        if (typeof otherPlayers[playerInfo.id].character.updateToolVisibility === 'function') {
            otherPlayers[playerInfo.id].character.updateToolVisibility(playerInfo.activeBlockId);
        }
    }
  });

  socket.on('blockUpdated', (blockData) => {
    // console.log(`CLIENT (${socket.id}): Received 'blockUpdated'`, blockData); // BLOCK UPDATE DEBUG
    if (!world || !world.chunkSize || !world.params || typeof world.params.seed !== 'number') return;
    const coords = world.worldToChunkCoords(blockData.x, blockData.y, blockData.z);
    if (!coords) return;
    const chunk = world.getChunk(coords.chunk.x, coords.chunk.z);
    if (chunk && chunk.isGenerated) {
        world.updateBlock(blockData.x, blockData.y, blockData.z, blockData.blockId);
    } else {
        const key = `${coords.chunk.x},${coords.chunk.z}`;
        if (!pendingBlockUpdates.has(key)) pendingBlockUpdates.set(key, []);
        pendingBlockUpdates.get(key).push(blockData);
    }
  });
}

function addOtherPlayer(playerInfo) {
    if (!playerInfo || !playerInfo.id) {
        // console.warn(`CLIENT (${socket?.id}): addOtherPlayer: Invalid info.`, playerInfo);
        return;
    }
    if (playerInfo.id === socket?.id) return;

    if (otherPlayers[playerInfo.id]) {
        if (otherPlayers[playerInfo.id].character) {
            otherPlayers[playerInfo.id].character.updateState(playerInfo);
        }
        otherPlayers[playerInfo.id].data = playerInfo;
    } else {
        // console.log(`CLIENT (${socket?.id}): addOtherPlayer: Adding NEW other player ${playerInfo.id}.`);
        const character = new Character(playerInfo);
        otherPlayers[playerInfo.id] = { character: character, data: playerInfo };
        scene.add(character.model);
    }
}

let previousTime = performance.now();
let lastPlayerUpdate = 0;
const playerUpdateInterval = 100;

function animate() {
  requestAnimationFrame(animate);
  const currentTime = performance.now();
  const dt = Math.min((currentTime - previousTime) / 1000, 0.05);

  if (player && player.controls.isLocked) {
    if(physics) physics.update(dt, player, world, otherPlayers);
    if(player) player.update(world);
    if (world && world.params && typeof world.params.seed === 'number') {
        world.update(player);
    }
    if (socket && socket.connected && (currentTime - lastPlayerUpdate > playerUpdateInterval)) {
      const movementPayload = {x: player.position.x, y: player.position.y, z: player.position.z, rotationY: player.camera.rotation.y};
      // console.log(`CLIENT (${socket.id}): Sending 'playerMovement'`, JSON.stringify(movementPayload)); // MOVEMENT DEBUG
      socket.emit('playerMovement', movementPayload);
      lastPlayerUpdate = currentTime;
    }
    if(sun && player.camera) {
        sun.position.copy(player.camera.position).add(new THREE.Vector3(50, 80, 50));
        sun.target.position.copy(player.camera.position);
    }
  } else if (player) {
     if(controls && player.position) {
        orbitCamera.position.copy(player.position).add(new THREE.Vector3(16, 16, 16));
        controls.target.copy(player.position);
     }
  }
  if(controls) controls.update();
  renderer.render(scene, player && player.controls.isLocked ? player.camera : orbitCamera);
  if(stats) stats.update();
  previousTime = currentTime;
}

window.addEventListener('resize', () => {
  if (orbitCamera) { orbitCamera.aspect = window.innerWidth / window.innerHeight; orbitCamera.updateProjectionMatrix(); }
  if (player?.camera) { player.camera.aspect = window.innerWidth / window.innerHeight; player.camera.updateProjectionMatrix(); } // Optional chaining
  if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); }
});

setupLights();
setupMultiplayer();
animate();