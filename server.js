// server.js
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { CHUNK_SIZE, DEFAULT_WORLD_PARAMS } from './server_config.js';
import { ServerChunkGenerator } from './server_chunk_generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

const PORT = process.env.PORT || 3000;

const WORLD_DATA_FILE = path.join(__dirname, 'world_data.json');

let worldSeed = DEFAULT_WORLD_PARAMS.seed;
let worldParams = { ...DEFAULT_WORLD_PARAMS };
let modifiedBlocks = {};
let chunkGenerator;

const chunkCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

function loadWorldData() {
    try {
        if (fs.existsSync(WORLD_DATA_FILE)) {
            const fileContent = fs.readFileSync(WORLD_DATA_FILE, 'utf8');
            const data = JSON.parse(fileContent);
            worldSeed = data.seed || DEFAULT_WORLD_PARAMS.seed;
            worldParams = {
                ...DEFAULT_WORLD_PARAMS, ...(data.params || {}),
                terrain: { ...DEFAULT_WORLD_PARAMS.terrain, ...(data.params?.terrain || {}) },
                biomes: { ...DEFAULT_WORLD_PARAMS.biomes, ...(data.params?.biomes || {}) },
                trees: { ...DEFAULT_WORLD_PARAMS.trees, ...(data.params?.trees || {}) },
                clouds: { ...DEFAULT_WORLD_PARAMS.clouds, ...(data.params?.clouds || {}) },
            };
            worldParams.seed = worldSeed;
            modifiedBlocks = data.modifiedBlocks || {};
            chunkGenerator = new ServerChunkGenerator(worldParams);
            // console.log('World data loaded. Seed:', worldSeed);
        } else {
            worldSeed = Math.floor(Math.random() * 100000);
            worldParams.seed = worldSeed;
            modifiedBlocks = {};
            chunkGenerator = new ServerChunkGenerator(worldParams);
            // console.log('New world. Seed:', worldSeed);
            saveWorldData();
        }
    } catch (error) {
        console.error('Error loading world data:', error);
        worldSeed = Math.floor(Math.random() * 100000);
        worldParams = { ...DEFAULT_WORLD_PARAMS, seed: worldSeed };
        modifiedBlocks = {};
        chunkGenerator = new ServerChunkGenerator(worldParams);
    }
}

function saveWorldData() {
    try {
        const dataToSave = { seed: worldSeed, params: worldParams, modifiedBlocks: modifiedBlocks };
        fs.writeFileSync(WORLD_DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving world data:', error);
    }
}

function getGeneratedChunkDataWithModifications(chunkX, chunkZ) {
    const cacheKey = `${chunkX},${chunkZ}`;
    const now = Date.now();
    if (chunkCache.has(cacheKey)) {
        const cached = chunkCache.get(cacheKey);
        if (now - cached.timestamp < CACHE_EXPIRY_MS) {
            cached.timestamp = now; return cached.data;
        } else { chunkCache.delete(cacheKey); }
    }
    let generatedData = chunkGenerator.generateChunkData(chunkX, chunkZ);
    const chunkWorldStartX = chunkX * CHUNK_SIZE.width;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE.width;
    for (let y = 0; y < CHUNK_SIZE.height; y++) {
        for (let z_local = 0; z_local < CHUNK_SIZE.width; z_local++) {
            for (let x_local = 0; x_local < CHUNK_SIZE.width; x_local++) {
                const worldX = chunkWorldStartX + x_local;
                const worldZ = chunkWorldStartZ + z_local;
                const key = `${worldX},${y},${worldZ}`;
                if (modifiedBlocks[key] !== undefined) {
                    const flatIndex = y * CHUNK_SIZE.width * CHUNK_SIZE.width + z_local * CHUNK_SIZE.width + x_local;
                    generatedData[flatIndex] = modifiedBlocks[key];
                }
            }
        }
    }
    if (chunkCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = chunkCache.keys().next().value;
        if(oldestKey) chunkCache.delete(oldestKey);
    }
    chunkCache.set(cacheKey, { data: generatedData, timestamp: now });
    return generatedData;
}

loadWorldData();
let players = {};

const MAX_INTERACTION_DISTANCE_SQ = 10 * 10; // Increased slightly
const MAX_MOVEMENT_DISTANCE_PER_UPDATE_SQ = 7 * 7; // Increased slightly for tolerance
const MIN_Y_REMOVE_LIMIT = 1;
const VALID_ACTIVE_BLOCK_ID_MIN = 0;
const VALID_ACTIVE_BLOCK_ID_MAX = 14; // From blocks.js

io.on('connection', (socket) => {
    // console.log('User connected:', socket.id);
    players[socket.id] = {
        id: socket.id, x: 32, y: 32 + CHUNK_SIZE.height * 0.75, z: 32, rotationY: 0, // Start higher
        activeBlockId: 0, lastMovementTime: Date.now(), loadedChunks: new Set()
    };
    socket.emit('worldInfo', { seed: worldSeed, params: worldParams, chunkSize: CHUNK_SIZE });
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('requestChunk', ({ chunkX, chunkZ }) => {
        const chunkData = getGeneratedChunkDataWithModifications(chunkX, chunkZ);
        socket.emit('chunkData', { chunkX, chunkZ, data: chunkData });
        if(players[socket.id]) { players[socket.id].loadedChunks.add(`${chunkX},${chunkZ}`); }
    });
    socket.on('unloadChunk', ({chunkX, chunkZ}) => {
        if(players[socket.id]) { players[socket.id].loadedChunks.delete(`${chunkX},${chunkZ}`); }
    });

    socket.on('disconnect', () => {
        // console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('playerMovement', (movementData) => {
        const player = players[socket.id];
        if (!player) return;
        const dx = movementData.x - player.x;
        const dz = movementData.z - player.z;
        const distanceSq = dx*dx + dz*dz;
        if (distanceSq > MAX_MOVEMENT_DISTANCE_PER_UPDATE_SQ) {
            // console.warn(`SERVER (${socket.id}): Player moved too far. DistSq: ${distanceSq.toFixed(1)}. MaxSq: ${MAX_MOVEMENT_DISTANCE_PER_UPDATE_SQ}. IGNORING.`);
            return;
        }
        player.x = movementData.x; player.y = movementData.y; player.z = movementData.z;
        player.rotationY = movementData.rotationY; player.lastMovementTime = Date.now();
        // console.log(`SERVER (${socket.id}): Broadcasting 'playerMoved' for ${player.id}, Pos: X:${player.x.toFixed(1)} Z:${player.z.toFixed(1)}`); // MOVEMENT DEBUG
        socket.broadcast.emit('playerMoved', player);
    });

    socket.on('playerStateUpdate', (stateData) => {
        const player = players[socket.id];
        if (!player) return;
        if (typeof stateData.activeBlockId === 'number' &&
            stateData.activeBlockId >= VALID_ACTIVE_BLOCK_ID_MIN &&
            stateData.activeBlockId <= VALID_ACTIVE_BLOCK_ID_MAX) {
            player.activeBlockId = stateData.activeBlockId;
            socket.broadcast.emit('playerStateChanged', player);
        } else {
            // console.warn(`SERVER (${socket.id}): Player sent invalid activeBlockId: ${stateData.activeBlockId}.`);
        }
    });

    socket.on('blockPlaced', (blockData) => {
        console.log(`SERVER (${socket.id}): Received 'blockPlaced':`, JSON.stringify(blockData)); // LOGGING
        const player = players[socket.id];
        if (!player) {
            console.warn(`SERVER (${socket.id}): 'blockPlaced' from unknown player. IGNORING.`);
            return;
        }
        const distSq = Math.pow(blockData.x - player.x, 2) + Math.pow(blockData.z - player.z, 2);
        if (distSq > MAX_INTERACTION_DISTANCE_SQ) {
            console.warn(`SERVER (${socket.id}): Player tried to place block too far. DistSq: ${distSq.toFixed(1)}. MaxSq: ${MAX_INTERACTION_DISTANCE_SQ}. Coords: P(${player.x.toFixed(1)},${player.z.toFixed(1)}) B(${blockData.x},${blockData.z}). IGNORING.`);
            return;
        }
        if (blockData.blockId === 0 || blockData.blockId > VALID_ACTIVE_BLOCK_ID_MAX) {
            console.warn(`SERVER (${socket.id}): Player tried to place invalid block ID: ${blockData.blockId}. IGNORING.`);
            return;
        }
        const key = `${blockData.x},${blockData.y},${blockData.z}`;
        console.log(`SERVER (${socket.id}): Placing block ${blockData.blockId} at ${key}.`); // LOGGING
        modifiedBlocks[key] = blockData.blockId;
        const affectedChunkX = Math.floor(blockData.x / CHUNK_SIZE.width);
        const affectedChunkZ = Math.floor(blockData.z / CHUNK_SIZE.width);
        chunkCache.delete(`${affectedChunkX},${affectedChunkZ}`);
        io.emit('blockUpdated', blockData);
        saveWorldData();
    });

    socket.on('blockRemoved', (blockData) => {
        console.log(`SERVER (${socket.id}): Received 'blockRemoved':`, JSON.stringify(blockData)); // LOGGING
        const player = players[socket.id];
        if (!player) {
            console.warn(`SERVER (${socket.id}): 'blockRemoved' from unknown player. IGNORING.`);
            return;
        }
        const distSq = Math.pow(blockData.x - player.x, 2) + Math.pow(blockData.z - player.z, 2);
        if (distSq > MAX_INTERACTION_DISTANCE_SQ) {
            console.warn(`SERVER (${socket.id}): Player tried to remove block too far. DistSq: ${distSq.toFixed(1)}. MaxSq: ${MAX_INTERACTION_DISTANCE_SQ}. Coords: P(${player.x.toFixed(1)},${player.z.toFixed(1)}) B(${blockData.x},${blockData.z}). IGNORING.`);
            return;
        }
        if (blockData.y < MIN_Y_REMOVE_LIMIT) {
            console.warn(`SERVER (${socket.id}): Player tried to remove base layer block at y=${blockData.y}. IGNORING.`);
            return;
        }
        const key = `${blockData.x},${blockData.y},${blockData.z}`;
        console.log(`SERVER (${socket.id}): Removing block at ${key}.`); // LOGGING
        modifiedBlocks[key] = 0;
        const affectedChunkX = Math.floor(blockData.x / CHUNK_SIZE.width);
        const affectedChunkZ = Math.floor(blockData.z / CHUNK_SIZE.width);
        chunkCache.delete(`${affectedChunkX},${affectedChunkZ}`);
        const updateData = { ...blockData, blockId: 0 };
        io.emit('blockUpdated', updateData);
        saveWorldData();
    });
});

app.use(express.static(path.join(__dirname, '.'))); // Serves files from project root for Vite

function handleShutdown() {
    console.log('Server shutting down. Saving world data...');
    saveWorldData();
    setTimeout(() => { process.exit(0); }, 500);
}
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    // console.log(`Access the game via Vite dev server (usually http://127.0.0.1:5173 or http://localhost:5173)`);
    // console.log(`World data file: ${WORLD_DATA_FILE}`);
});