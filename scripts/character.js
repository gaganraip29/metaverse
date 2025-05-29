// scripts/character.js
import * as THREE from 'three';

const PLAYER_EYE_HEIGHT = 1.75;
const PLAYER_VISUAL_RADIUS = 0.5;

export class Character {
    constructor(playerInitialData) {
        this.model = new THREE.Group();

        const bodyWidth = PLAYER_VISUAL_RADIUS * 1.8;
        const bodyDepth = PLAYER_VISUAL_RADIUS * 1.0;
        const bodyHeight = PLAYER_EYE_HEIGHT * 0.65;
        const headSize = PLAYER_EYE_HEIGHT * 0.25;

        const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        this.body.position.y = bodyHeight / 2;
        this.model.add(this.body);

        const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffeecc });
        this.head = new THREE.Mesh(headGeometry, headMaterial);
        this.head.castShadow = true;
        this.head.receiveShadow = true;
        this.head.position.y = bodyHeight + (headSize / 2);
        this.model.add(this.head);

        this.model.position.set(
            playerInitialData.x,
            playerInitialData.y - PLAYER_EYE_HEIGHT,
            playerInitialData.z
        );
        this.model.rotation.y = playerInitialData.rotationY || 0; // Ensure rotationY is defined
        this.playerData = playerInitialData;
    }

    updateState(playerData) {
        // console.log(`CHARACTER (${this.playerData.id}): Updating state from server. New model pos for ID ${playerData.id}: x:${playerData.x.toFixed(1)}, y:${(playerData.y - PLAYER_EYE_HEIGHT).toFixed(1)}, z:${playerData.z.toFixed(1)}`); // MOVEMENT DEBUG

        this.playerData = playerData;
        this.model.position.set(
            playerData.x,
            playerData.y - PLAYER_EYE_HEIGHT,
            playerData.z
        );
        this.model.rotation.y = playerData.rotationY || 0; // Ensure rotationY is defined
    }

    updateToolVisibility(activeBlockId) { // Optional: if you want other players to show/hide tools
        // Example: if (this.toolMesh) this.toolMesh.visible = (activeBlockId === 0);
    }

    dispose() {
        if (this.body?.geometry) this.body.geometry.dispose();
        if (this.body?.material) this.body.material.dispose();
        if (this.head?.geometry) this.head.geometry.dispose();
        if (this.head?.material) this.head.material.dispose();
        this.model.clear();
    }
}