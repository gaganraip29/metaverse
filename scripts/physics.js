// physics.js
import * as THREE from 'three';
import { blocks } from './blocks';

const collisionMaterial = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  transparent: true,
  opacity: 0.2,
  wireframe: true // Easier to see through
});
const collisionGeometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);

const contactMaterial = new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff00 });
const contactGeometry = new THREE.SphereGeometry(0.05, 6, 6);

const OTHER_PLAYER_COLLISION_RADIUS = 0.5;
const OTHER_PLAYER_COLLISION_HEIGHT = 1.75;

const playerCollisionMaterial = new THREE.MeshBasicMaterial({
  color: 0x0000ff,
  transparent: true,
  opacity: 0.25,
  wireframe: true
});

export class Physics {
  gravity = 32;
  simulationRate = 250; // simulations per second
  stepSize; // calculated as 1 / simulationRate
  accumulator = 0;

  constructor(scene) {
    this.helpers = new THREE.Group();
    this.helpers.visible = true; // DEBUG: ENABLE COLLISION HELPERS
    scene.add(this.helpers);
    this.stepSize = 1 / this.simulationRate;
  }

  update(dt, player, world, otherPlayers) {
    this.accumulator += dt;
    while (this.accumulator >= this.stepSize) {
      player.velocity.y -= this.gravity * this.stepSize;
      player.applyInputs(this.stepSize); // Apply player's desired movement
      this.detectCollisions(player, world); // World block collisions

      if (otherPlayers && Object.keys(otherPlayers).length > 0) {
        this.detectPlayerCollisions(player, otherPlayers);
      }

      this.accumulator -= this.stepSize;
    }
  }

  detectCollisions(player, world) {
    player.onGround = false; // Reset before checks
    this.helpers.clear();

    const candidates = this.broadPhase(player, world);
    const collisions = this.narrowPhase(candidates, player);

    if (collisions.length > 0) {
      this.resolveCollisions(collisions, player);
    }
  }

  broadPhase(player, world) {
    const candidates = [];
    if (!player || !player.position) return candidates; // Guard

    // Define search box based on player's cylindrical bounds
    const minX = Math.floor(player.position.x - player.radius);
    const maxX = Math.ceil(player.position.x + player.radius);
    const minY = Math.floor(player.position.y - player.height); // Feet
    const maxY = Math.ceil(player.position.y);                   // Head (eye-level is top of collision box)
    const minZ = Math.floor(player.position.z - player.radius);
    const maxZ = Math.ceil(player.position.z + player.radius);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const blockValue = world.getBlock(x, y, z); // Get block data from world
          if (blockValue && blockValue.id !== blocks.empty.id) {
            const block = { x, y, z, id: blockValue.id }; // Store world coordinates & id
            candidates.push(block);
            if (this.helpers.visible) {
              this.addBlockCollisionHelper(block);
            }
          }
        }
      }
    }
    return candidates;
  }

  narrowPhase(candidates, player) {
    const collisions = [];
    if (!player || !player.position) return collisions;

    for (const block of candidates) {
      // Closest point on the AABB of the block to the player's cylinder's CENTERLINE
      // For Y, compare to player's cylinder vertical extent.
      // Block center is (block.x + 0.5, block.y + 0.5, block.z + 0.5)
      // Block extents are +/- 0.5 from its integer coords.
      const closestPoint = {
        x: Math.max(block.x, Math.min(player.position.x, block.x + 1.0)),
        y: Math.max(block.y, Math.min(player.position.y - (player.height / 2), block.y + 1.0)), // compare to player cylinder's vertical mid-point for penetration depth
        z: Math.max(block.z, Math.min(player.position.z, block.z + 1.0))
      };

      // Vector from player's cylinder CENTER to closest point on block AABB.
      // Player's cylinder center for XZ is player.position.x, player.position.z.
      // Player's cylinder vertical center is player.position.y - player.height / 2.
      const dx = closestPoint.x - player.position.x;
      const dy = closestPoint.y - (player.position.y - (player.height / 2));
      const dz = closestPoint.z - player.position.z;

      // Check if this closest point is inside player's bounding cylinder
      if (this.pointInPlayerBoundingCylinder(closestPoint, player)) {
        const overlapY = (player.height / 2) - Math.abs(dy);
        const overlapXZ = player.radius - Math.sqrt(dx * dx + dz * dz); // This is horizontal distance from cylinder edge to point, not overlap

        let normal, overlap;

        // Simplified penetration resolution: find axis of least penetration.
        // This is a basic AABB vs Cylinder penetration check.
        // More accurate would be SAT or GJK/EPA for cylinder vs AABB.

        // Distances to move player out of block.
        // This logic can be complex. We want to find the minimum push vector.
        // For simplicity, this uses an older approach, might need refinement for robustness.

        if (overlapY < overlapXZ && overlapY > 0) { // Vertical collision seems more significant
          normal = new THREE.Vector3(0, -Math.sign(dy), 0); // Normal pointing away from the block's face that's being penetrated
          overlap = overlapY;
          // If normal.y > 0, it means player is colliding with a surface below them (dy was negative).
          if (normal.y > 0 && player.velocity.y <= 0.01) { // Slightly tolerate small upward vel for ramps
            player.onGround = true;
            // console.log("Physics: Player onGround set TRUE due to block collision. Normal Y:", normal.y, "Player Vel Y:", player.velocity.y);
          }
        } else if (overlapXZ > 0) { // Horizontal collision
          normal = new THREE.Vector3(-dx, 0, -dz).normalize();
          overlap = overlapXZ; // This isn't exactly overlap, it's distance from center to edge minus distance from center to point
                               // A better overlapXZ would be more complex for cylinder-AABB
        } else {
            continue; // No significant overlap on either axis based on this simplified check
        }


        collisions.push({
          block,
          contactPoint: closestPoint, // For visualization
          normal,
          overlap
        });

        if (this.helpers.visible) {
          this.addContactPointerHelper(closestPoint);
        }
      }
    }
    return collisions;
  }


  resolveCollisions(collisions, player) {
    if (!player || !player.position) return;
    // Sort by smallest overlap - this is often problematic with simple overlap values.
    // A better sort might be by collision importance (e.g., vertical first).
    // collisions.sort((a, b) => a.overlap - b.overlap); // May not be ideal

    for (const collision of collisions) {
      // Re-check point in cylinder for current player position, as it might have changed
      // from previous resolutions in this same physics step.
      if (!this.pointInPlayerBoundingCylinder(collision.contactPoint, player)) continue;

      // Positional correction
      let deltaPosition = collision.normal.clone();
      deltaPosition.multiplyScalar(collision.overlap); // Push player out by overlap amount
      player.position.add(deltaPosition);

      // Velocity correction: Zero out velocity component into the collision normal
      // Convert player's world velocity to local camera space for input-based velocity
      let playerWorldVel = player.worldVelocity; // Gets current world velocity based on input & camera
      let magnitude = playerWorldVel.dot(collision.normal); // Project world velocity onto collision normal

      if (magnitude < 0) { // Only if moving into the collision object
        let velocityAdjustment = collision.normal.clone().multiplyScalar(magnitude);
        
        // We need to subtract this adjustment from the correct velocity components.
        // If player.velocity is local, then player.applyWorldDeltaVelocity needs to handle conversion.
        // For simplicity here, if we're stopping motion into a wall:
        if (collision.normal.y === 0) { // Horizontal collision
            // This is tricky if player.velocity is local.
            // A direct way: if worldVel projected on normal is negative, stop that component.
            // This requires careful handling of local vs world velocity.
            // For now, let player.applyWorldDeltaVelocity handle it based on world-space adjustment.
            player.applyWorldDeltaVelocity(velocityAdjustment.negate());
        } else if (collision.normal.y !== 0 && player.velocity.y * collision.normal.y < 0) { // Vertical collision and moving into it
            player.velocity.y = 0; // Stop vertical velocity
        }
      }
    }
  }

  // --- Player-to-Player Collision Methods (Simplified AABB for now) ---
  detectPlayerCollisions(localPlayer, otherPlayersMap) {
    if(!localPlayer || !localPlayer.position) return;

    const localPlayerAABB = this.getPlayerAABB(localPlayer);
    const playerCollisions = [];

    for (const id in otherPlayersMap) {
      if (otherPlayersMap.hasOwnProperty(id)) {
        const otherPlayerData = otherPlayersMap[id];
        if (otherPlayerData && otherPlayerData.character && otherPlayerData.character.model) {
          const otherPlayerCharacter = otherPlayerData.character;
          const otherPlayerAABB = this.getOtherPlayerAABB(otherPlayerCharacter);

          if (this.checkAABBCollision(localPlayerAABB, otherPlayerAABB)) {
            const collisionInfo = this.calculateAABBCollisionDetails(localPlayerAABB, otherPlayerAABB, localPlayer, otherPlayerCharacter);
            if (collisionInfo) {
              playerCollisions.push(collisionInfo);
              if (this.helpers.visible) {
                this.addPlayerCollisionHelper(otherPlayerAABB);
              }
            }
          }
        }
      }
    }
    if (playerCollisions.length > 0) {
      this.resolvePlayerCollisions(playerCollisions, localPlayer);
    }
  }

  getPlayerAABB(player) {
    return {
      minX: player.position.x - player.radius, maxX: player.position.x + player.radius,
      minY: player.position.y - player.height, maxY: player.position.y, // Feet to Eye-level
      minZ: player.position.z - player.radius, maxZ: player.position.z + player.radius,
      centerX: player.position.x, centerY: player.position.y - player.height / 2, centerZ: player.position.z,
    };
  }

  getOtherPlayerAABB(character) {
    const pos = character.model.position; // Feet position
    return {
      minX: pos.x - OTHER_PLAYER_COLLISION_RADIUS, maxX: pos.x + OTHER_PLAYER_COLLISION_RADIUS,
      minY: pos.y, maxY: pos.y + OTHER_PLAYER_COLLISION_HEIGHT, // Feet to Top of head
      minZ: pos.z - OTHER_PLAYER_COLLISION_RADIUS, maxZ: pos.z + OTHER_PLAYER_COLLISION_RADIUS,
      centerX: pos.x, centerY: pos.y + OTHER_PLAYER_COLLISION_HEIGHT / 2, centerZ: pos.z,
    };
  }

  checkAABBCollision(aabb1, aabb2) {
    return (
      aabb1.minX < aabb2.maxX && aabb1.maxX > aabb2.minX &&
      aabb1.minY < aabb2.maxY && aabb1.maxY > aabb2.minY &&
      aabb1.minZ < aabb2.maxZ && aabb1.maxZ > aabb2.minZ
    );
  }

  calculateAABBCollisionDetails(localAABB, otherAABB, localPlayer, otherCharacter) {
    const overlapX = Math.min(localAABB.maxX, otherAABB.maxX) - Math.max(localAABB.minX, otherAABB.minX);
    const overlapY = Math.min(localAABB.maxY, otherAABB.maxY) - Math.max(localAABB.minY, otherAABB.minY);
    const overlapZ = Math.min(localAABB.maxZ, otherAABB.maxZ) - Math.max(localAABB.minZ, otherAABB.minZ);

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;

    let normal = new THREE.Vector3();
    let overlap = 0;

    if (overlapX < overlapY && overlapX < overlapZ) {
      overlap = overlapX; normal.set(localAABB.centerX > otherAABB.centerX ? 1 : -1, 0, 0);
    } else if (overlapY < overlapZ) {
      overlap = overlapY; normal.set(0, localAABB.centerY > otherAABB.centerY ? 1 : -1, 0);
    } else {
      overlap = overlapZ; normal.set(0, 0, localAABB.centerZ > otherAABB.centerZ ? 1 : -1);
    }
    return { otherCharacter, normal, overlap };
  }

  resolvePlayerCollisions(collisions, player) {
     if (!player || !player.position) return;
    collisions.sort((a, b) => a.overlap - b.overlap);

    for (const collision of collisions) {
      const currentLocalPlayerAABB = this.getPlayerAABB(player);
      const otherPlayerAABB = this.getOtherPlayerAABB(collision.otherCharacter);
      if (!this.checkAABBCollision(currentLocalPlayerAABB, otherPlayerAABB)) continue;

      let actualCollision = this.calculateAABBCollisionDetails(currentLocalPlayerAABB, otherPlayerAABB, player, collision.otherCharacter);
      if (!actualCollision) continue;

      player.position.add(actualCollision.normal.clone().multiplyScalar(actualCollision.overlap));

      let playerWorldVel = player.worldVelocity;
      let magnitude = playerWorldVel.dot(actualCollision.normal);
      if (magnitude < 0) { // Moving into the other player
        let velocityAdjustment = actualCollision.normal.clone().multiplyScalar(magnitude);
        // If player.velocity is local, conversion for adjustment is complex.
        // Assuming player.applyWorldDeltaVelocity handles it or physics should adjust world vel components.
        // For vertical:
        if (actualCollision.normal.y > 0 && player.velocity.y < 0) { // Landed on other player
          player.velocity.y = 0;
          player.onGround = true;
        } else if (actualCollision.normal.y < 0 && player.velocity.y > 0) { // Hit head on other player
          player.velocity.y = 0;
        } else if (actualCollision.normal.y === 0) { // Horizontal collision
            player.applyWorldDeltaVelocity(velocityAdjustment.negate()); // Attempt to stop horizontal motion into player
        }
      }
    }
  }
  // --- END Player-to-Player Collision ---

  pointInPlayerBoundingCylinder(p, player) {
    // p is a point on the block's AABB.
    // Player's cylinder axis is vertical.
    // Check Y extent first. Player's collision box bottom is player.position.y - player.height. Top is player.position.y.
    const playerCylinderBottom = player.position.y - player.height;
    const playerCylinderTop = player.position.y;

    if (p.y > playerCylinderTop || p.y < playerCylinderBottom) {
        // Check if point is exactly at top/bottom for onGround.
        // A better check: is point.y between playerCylinderBottom - epsilon and playerCylinderTop + epsilon?
        // And if the horizontal distance is within radius.
        // This simplified check here is for general penetration.
    }

    // Check horizontal distance from point p to player's XZ position (center of cylinder base)
    const dx = p.x - player.position.x;
    const dz = p.z - player.position.z;
    const distSqXZ = dx * dx + dz * dz;

    // Point is "inside" if its Y is within player's height range AND its XZ projection is within player's radius.
    // For narrowphase, this means point p (on block) has penetrated player's cylinder.
    // The dy check for overlapY was more about vertical distance from center.
    // Here, ensure p.y is actually between player's feet and head.
    const isVerticallyAligned = (p.y <= player.position.y && p.y >= (player.position.y - player.height));
    
    return isVerticallyAligned && (distSqXZ < player.radius * player.radius);
  }

  addBlockCollisionHelper(block) {
    const blockMesh = new THREE.Mesh(collisionGeometry, collisionMaterial);
    // Position helper at center of block
    blockMesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    this.helpers.add(blockMesh);
  }

  addContactPointerHelper(p) {
    const contactMesh = new THREE.Mesh(contactGeometry, contactMaterial);
    contactMesh.position.copy(p);
    this.helpers.add(contactMesh);
  }

  addPlayerCollisionHelper(aabb) {
    const width = aabb.maxX - aabb.minX;
    const height = aabb.maxY - aabb.minY;
    const depth = aabb.maxZ - aabb.minZ;
    const helperGeometry = new THREE.BoxGeometry(width, height, depth);
    const helperMesh = new THREE.Mesh(helperGeometry, playerCollisionMaterial);
    helperMesh.position.set(aabb.centerX, aabb.centerY, aabb.centerZ);
    this.helpers.add(helperMesh);
  }
}