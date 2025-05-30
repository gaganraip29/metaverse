// player.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { blocks } from './blocks';

const CENTER_SCREEN = new THREE.Vector2(0, 0);

export class Player {
  height = 1.75;
  radius = 0.5;
  maxSpeed = 5;
  jumpSpeed = 10;

  sprinting = false;
  onGround = false;
  socket = null;

  input = new THREE.Vector3();
  velocity = new THREE.Vector3();
  #worldVelocity = new THREE.Vector3();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  controls = new PointerLockControls(this.camera, document.body);

  cameraHelper = new THREE.CameraHelper(this.camera);
  boundsHelper = new THREE.Mesh(
    new THREE.CylinderGeometry(this.radius, this.radius, this.height, 16),
    new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.5 })
  );

  raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0.1,5);
  selectedCoords = null;
  activeBlockId = blocks.empty.id;

  tool = {
    container: new THREE.Group(),
    animate: false,
    animationStart: 0,
    animationSpeed: 0.025,
    animationTimeout: null
  }

  constructor(scene, world, clientChunkSize) {
    this.world = world;
    this.clientChunkSize = clientChunkSize || { width: 32, height: 32 };

    this.position.set(this.clientChunkSize.width / 2, this.clientChunkSize.height * 0.75 + 10, this.clientChunkSize.width / 2); // Start a bit higher

    scene.add(this.camera);

    this.cameraHelper.visible = false;
    scene.add(this.cameraHelper);
    this.boundsHelper.visible = false; // Set to true to debug player collision cylinder
    scene.add(this.boundsHelper);

    this.controls.addEventListener('lock', () => {
      document.getElementById('overlay').style.display = 'none';
      // console.log("Player controls locked.");
    });
    this.controls.addEventListener('unlock', () => {
      document.getElementById('overlay').style.display = 'flex';
      // console.log("Player controls unlocked.");
      if (this.selectionHelper) this.selectionHelper.visible = false;
    });

    this.camera.add(this.tool.container);
    this.raycaster.layers.set(0);

    const selectionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.3,
      color: 0xffffaa,
      depthTest: false
    });
    const selectionGeometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    this.selectionHelper = new THREE.Mesh(selectionGeometry, selectionMaterial);
    this.selectionHelper.visible = false;
    scene.add(this.selectionHelper);

    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('keyup', this.onKeyUp.bind(this));
    document.addEventListener('mousedown', this.onMouseDown.bind(this));

    const initialToolbarElement = document.getElementById(`toolbar-${this.activeBlockId}`);
    if (initialToolbarElement) {
        initialToolbarElement.classList.add('selected');
    }
    this.tool.container.visible = (this.activeBlockId === blocks.empty.id);
  }

  setSocket(socketInstance) {
    this.socket = socketInstance;
  }

  update(worldContext) {
    this.updateBoundsHelper();
    if (this.controls.isLocked) {
      this.updateRaycaster(worldContext);
    } else {
      if (this.selectionHelper) this.selectionHelper.visible = false;
    }

    if (this.tool.animate) {
      this.updateToolAnimation();
    }
  }

  updateRaycaster(worldContext) {
    if (!this.camera || !worldContext) return;

    this.raycaster.setFromCamera(CENTER_SCREEN, this.camera);
    const intersections = this.raycaster.intersectObject(worldContext, true);

    if (intersections.length > 0) {
        const intersection = intersections[0];
        // console.log(
        //     "!!!!!!!!!!!!!!!!!!!!!!!! RAYCASTER HIT !!!!!!!!!!!!!!!!!!!!!!!!",
        //     "\n  Object Name:", intersection.object.name,
        //     "\n  Is InstancedMesh:", intersection.object.isInstancedMesh,
        //     "\n  Parent Exists:", !!intersection.object.parent,
        //     "\n  Parent Name:", intersection.object.parent?.name,
        //     "\n  Parent UserData:", JSON.stringify(intersection.object.parent?.userData),
        //     "\n  Distance:", intersection.distance.toFixed(2),
        //     "\n  InstanceID:", intersection.instanceId,
        //     "\n  Face Normal (local):", intersection.face?.normal ? `x:${intersection.face.normal.x.toFixed(2)},y:${intersection.face.normal.y.toFixed(2)},z:${intersection.face.normal.z.toFixed(2)}` : "N/A"
        // );

        if (intersection.object.isInstancedMesh && intersection.object.parent?.userData?.isWorldChunk) {
            // console.log("!!!!!!!! VALID BLOCK HIT - SHOULD SEE YELLOW BOX SOON !!!!!!!!");
            
            const chunk = intersection.object.parent;
            const blockWorldPosition = new THREE.Vector3();
            const instanceMatrix = new THREE.Matrix4();
            intersection.object.getMatrixAt(intersection.instanceId, instanceMatrix);
            
            const blockWorldMatrix = new THREE.Matrix4().multiplyMatrices(chunk.matrixWorld, instanceMatrix);
            blockWorldPosition.setFromMatrixPosition(blockWorldMatrix);

            const intersectedBlockX = Math.floor(blockWorldPosition.x);
            const intersectedBlockY = Math.floor(blockWorldPosition.y);
            const intersectedBlockZ = Math.floor(blockWorldPosition.z);

            const worldNormal = intersection.face.normal.clone();
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(blockWorldMatrix);
            worldNormal.applyMatrix3(normalMatrix).normalize();
            worldNormal.round();

            if (this.activeBlockId === blocks.empty.id) {
                this.selectedCoords = { x: intersectedBlockX, y: intersectedBlockY, z: intersectedBlockZ };
                this.selectionHelper.position.set(intersectedBlockX + 0.5, intersectedBlockY + 0.5, intersectedBlockZ + 0.5);
            } else {
                this.selectedCoords = {
                    x: intersectedBlockX + worldNormal.x,
                    y: intersectedBlockY + worldNormal.y,
                    z: intersectedBlockZ + worldNormal.z,
                };
                this.selectionHelper.position.set(this.selectedCoords.x + 0.5, this.selectedCoords.y + 0.5, this.selectedCoords.z + 0.5);
            }
            this.selectionHelper.visible = true;
        } else {
            // console.log("!!!!!!!! HIT OBJECT BUT NOT A VALID BLOCK (check conditions above) !!!!!!!!");
            this.selectedCoords = null;
            if (this.selectionHelper) this.selectionHelper.visible = false;
        }
    } else {
        this.selectedCoords = null;
        if (this.selectionHelper) this.selectionHelper.visible = false;
    }
  }

  applyInputs(dt) {
    // console.log("Player onGround:", this.onGround, "Velocity Y:", this.velocity.y.toFixed(2)); // LOG FOR JUMP DEBUG
    if (this.controls.isLocked) {
      const speed = this.maxSpeed * (this.sprinting ? 1.75 : 1);
      this.velocity.x = this.input.x * speed;
      this.velocity.z = this.input.z * speed;

      this.controls.moveRight(this.velocity.x * dt);
      this.controls.moveForward(this.velocity.z * dt);

      this.position.y += this.velocity.y * dt;

      if (this.position.y < -64) {
        this.position.set(this.clientChunkSize.width / 2, this.clientChunkSize.height * 0.75 + 10, this.clientChunkSize.width / 2);
        this.velocity.y = 0;
      }
    }
    const posElement = document.getElementById('info-player-position');
    if (posElement) {
        posElement.innerHTML = this.toString();
    }
  }

  updateBoundsHelper() {
    if (this.camera && this.boundsHelper) {
        this.boundsHelper.position.copy(this.camera.position);
        this.boundsHelper.position.y -= this.height / 2;
    }
  }

  setTool(toolMesh) {
    this.tool.container.clear();
    if (!toolMesh) {
        // console.warn("setTool called with null toolMesh");
        return;
    }
    const newTool = toolMesh.clone();
    newTool.scale.set(0.4, 0.4, 0.4);
    newTool.position.set(0.3, -0.25, -0.3);
    newTool.rotation.set(0, Math.PI * 0.8, Math.PI / 2.5);

    newTool.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.tool.container.add(newTool);
  }

  updateToolAnimation() {
    if (this.tool.container.children.length > 0) {
      const t = this.tool.animationSpeed * (performance.now() - this.tool.animationStart);
      this.tool.container.children[0].rotation.x = 0.5 * Math.sin(t);
    }
  }

  get position() {
    return this.camera.position;
  }

  get worldVelocity() {
    this.#worldVelocity.set(this.input.x, 0, this.input.z);
    this.#worldVelocity.multiplyScalar(this.maxSpeed * (this.sprinting ? 1.75 : 1));
    this.#worldVelocity.applyEuler(new THREE.Euler(0, this.camera.rotation.y, 0, 'YXZ'));
    this.#worldVelocity.y = this.velocity.y;
    return this.#worldVelocity;
  }

  applyWorldDeltaVelocity(dv) {
    const camYRotation = new THREE.Euler(0, -this.camera.rotation.y, 0, 'YXZ');
    const localDV = dv.clone().applyEuler(camYRotation);

    this.velocity.x += localDV.x;
    this.velocity.y += dv.y;
    this.velocity.z += localDV.z;
  }

  onKeyDown(event) {
    if (!this.controls.isLocked && event.key !== 'F10' && event.key !== 'Escape' && !event.code.startsWith('Digit')) {
      this.controls.lock();
    }

    switch (event.code) {
      case 'Digit0': case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7':
      case 'Digit8': case 'Digit9':
        const newActiveBlockId = Number(event.key);
        const blockDef = Object.values(blocks).find(b => b.id === newActiveBlockId);
        const isPickaxe = newActiveBlockId === blocks.empty.id;

        if (isPickaxe || blockDef) { // Allow pickaxe (ID 0) or any block defined in blocks.js
            if (newActiveBlockId !== this.activeBlockId) {
                console.log(`PLAYER: Key ${event.key} pressed. Old activeBlockId: ${this.activeBlockId}, New: ${newActiveBlockId}`); // TOOLBAR LOG
                document.getElementById(`toolbar-${this.activeBlockId}`)?.classList.remove('selected');
                const newToolbarItem = document.getElementById(`toolbar-${newActiveBlockId}`);
                if (newToolbarItem) {
                    newToolbarItem.classList.add('selected');
                } else {
                    // console.warn(`Toolbar item for ID ${newActiveBlockId} not found in HTML.`);
                }
                this.activeBlockId = newActiveBlockId;
                console.log("PLAYER: Active Block ID SET TO:", this.activeBlockId); // TOOLBAR LOG
                this.tool.container.visible = (this.activeBlockId === blocks.empty.id);

                if (this.socket && this.socket.connected) {
                    this.socket.emit('playerStateUpdate', { activeBlockId: this.activeBlockId });
                }
            }
        } else {
            // console.warn(`Toolbar key ${event.key} pressed, but no block defined for ID ${newActiveBlockId}`);
        }
        break;
      case 'KeyW': this.input.z = 1; break;
      case 'KeyA': this.input.x = -1; break;
      case 'KeyS': this.input.z = -1; break;
      case 'KeyD': this.input.x = 1; break;
      case 'KeyR':
        if (event.repeat) break;
        this.position.set(this.clientChunkSize.width / 2, this.clientChunkSize.height * 0.75 + 10, this.clientChunkSize.width / 2);
        this.velocity.set(0, 0, 0);
        if (this.world && this.world.params && typeof this.world.params.seed === 'number') {
            this.world.update(this);
        }
        break;
      case 'ShiftLeft': case 'ShiftRight': this.sprinting = true; break;
      case 'Space':
        console.log("PLAYER: Space pressed. onGround:", this.onGround, "Current Y Vel:", this.velocity.y); // JUMP LOG
        if (this.onGround) {
          this.velocity.y = this.jumpSpeed;
          // this.onGround = false; // Set onGround to false immediately after jump to prevent multi-jump before physics updates
        }
        break;
      case 'F10': this.controls.unlock(); break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW': if (this.input.z > 0) this.input.z = 0; break;
      case 'KeyA': if (this.input.x < 0) this.input.x = 0; break;
      case 'KeyS': if (this.input.z < 0) this.input.z = 0; break;
      case 'KeyD': if (this.input.x > 0) this.input.x = 0; break;
      case 'ShiftLeft': case 'ShiftRight': this.sprinting = false; break;
    }
  }

  onMouseDown(event) {
    if (!this.controls.isLocked) {
        // console.log("Player.onMouseDown: Controls not locked.");
        return;
    }
    if (!this.socket || !this.socket.connected) {
        // console.warn("Player.onMouseDown: Socket not connected.");
        return;
    }

    // console.log("Player.onMouseDown: Mouse clicked.");

    if (this.selectedCoords) {
        console.log("PLAYER: EMIT CHECK - Selected Coords:", JSON.stringify(this.selectedCoords), "Active Block ID for emit:", this.activeBlockId); // TOOLBAR LOG

        const { x, y, z } = this.selectedCoords;

        if (this.activeBlockId === blocks.empty.id) {
            // console.log(`Player.onMouseDown: Attempting to remove block at ${x},${y},${z}`);
            if (this.world && y < 1) {
                 // console.log("Player.onMouseDown: Cannot remove base layer block (client check).");
                 return;
            }
            this.socket.emit('blockRemoved', { x, y, z });
        } else {
            // console.log(`Player.onMouseDown: Attempting to place block ID ${this.activeBlockId} at ${x},${y},${z}`);
            this.socket.emit('blockPlaced', { x, y, z, blockId: this.activeBlockId });
        }

        if (this.tool.container.visible && !this.tool.animate) {
          this.tool.animate = true;
          this.tool.animationStart = performance.now();
          clearTimeout(this.tool.animationTimeout);
          this.tool.animationTimeout = setTimeout(() => {
            this.tool.animate = false;
            if (this.tool.container.children.length > 0) {
              this.tool.container.children[0].rotation.x = 0;
            }
          }, 300);
        }
    } else {
        // console.log("Player.onMouseDown: No block selected (this.selectedCoords is null).");
    }
  }

  toString() {
    if (!this.camera || !this.camera.position) return "Position: N/A";
    return `X: ${this.camera.position.x.toFixed(2)} Y: ${this.camera.position.y.toFixed(2)} Z: ${this.camera.position.z.toFixed(2)}`;
  }
}