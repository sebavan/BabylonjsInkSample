import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Material } from "@babylonjs/core/Materials/material";
import { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Nullable } from "@babylonjs/core/types";
import { KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures";
import { Observable } from "@babylonjs/core/Misc/observable";

import { PathBufferDataOptions } from "./path/pathBufferData";
import { PathMesh } from "./path/pathMesh";

import { createDebugMaterial } from "./materials/debugMaterial";
import { createSimpleMaterial } from "./materials/simpleMaterial";
import { createRainbowMaterial, getColorAtToRef } from "./materials/rainbowMaterial";

// Find our elements
const enum Mode {
    pen,
    rainbow,
}

export class InkCanvas {
    private readonly _debug: boolean;
    private readonly _particleTextureURL: string;
    private readonly _scene: Scene;
    private readonly _pointerNode: Vector3;
    private readonly _particleSystem: ParticleSystem;

    private readonly _paths: PathMesh[];
    private readonly _redoPaths: PathMesh[];

    private _currentPath: Nullable<PathMesh> = null;
    private _currentSize: number;
    private _currentColor: Color3;
    private _currentMode: Mode;

    constructor(canvas: HTMLCanvasElement, particleTextureURL: string, debug = false) {
        this._debug = debug;
        this._particleTextureURL = particleTextureURL;
        this._paths = [];
        this._redoPaths = [];
        this._currentPath = null;
        this._currentSize = 5;
        this._currentColor = Color3.White();
        this._currentMode = Mode.rainbow;

        this._scene = this._createScene(canvas);
        this._pointerNode = new Vector3(0, 0, 0);
        this._particleSystem = this._createParticleSystem();
    }

    public get onKeyboardObservable(): Observable<KeyboardInfo> {
        return this._scene.onKeyboardObservable;
    }

    public get onPointerObservable(): Observable<PointerInfo> {
        return this._scene.onPointerObservable;
    }

    public startPath(): void {
        this._redoPaths.length = 0;
        this._currentPath = this._createPath(this._scene.pointerX, this._scene.pointerY);
        this._currentPath.material = this._createPathMaterial();
    
        this._pointerNode.x = this._scene.pointerX;
        this._pointerNode.y = this._scene.pointerY;
        getColorAtToRef(0, this._particleSystem.color2);
    
        if (this._currentMode === Mode.rainbow) {
            this._particleSystem.start();
        }
    }

    public extendPath(): void {
        if (this._currentPath) {
            this._currentPath.addPointToPath(this._scene.pointerX, this._scene.pointerY);
    
            getColorAtToRef(this._currentPath.totalDistance, this._particleSystem.color2)
            getColorAtToRef(this._currentPath.totalDistance, this._particleSystem.color1)

            this._pointerNode.x = this._scene.pointerX;
            this._pointerNode.y = this._scene.pointerY;
        }
    }
    
    public endPath(): void {
        if (this._currentPath) {
            this._paths.push(this._currentPath);
            this._currentPath = null;

            this._particleSystem.stop();
        }
    }

    public undo(): void {
        if (!this._currentPath && this._paths.length > 0) {
            const path = this._paths.pop();
            this._redoPaths.push(path);
            this._scene.removeMesh(path);
        }
    }
    
    public redo(): void {
        if (!this._currentPath && this._redoPaths.length > 0) {
            const path = this._redoPaths.pop();
            this._paths.push(path);
            this._scene.addMesh(path);
        }
    }
    
    public clear(): void {
        if (!this._currentPath && this._paths.length > 0) {
            let path: PathMesh;
            while (path = this._paths.pop()) {
                path.dispose();
            }
        }
    }
    
    public changeSize(size: number): void {
        this._currentSize = size;
        this._particleSystem.createSphereEmitter(this._currentSize, 0.5);
    }
    
    public changeColor(color: Color3): void {
        this._currentColor = color;
        this.usePen();
    }
    
    public usePen(): void {
        this._currentMode = Mode.pen;
    }
    
    public useRainbow(): void {
        this._currentMode = Mode.rainbow;
    }

    public getFps(): number {
        return this._scene.getEngine().getFps();
    }

    public toggleDebugLayer(): Promise<void> {
        return import(/* webpackChunkName: "debug" */ "./debug/appDebug").then((debugModule) => {
            debugModule.toggleDebugMode(this._scene);
        });
    }

    private _createScene(canvas: HTMLCanvasElement): Scene {
        // Create our engine
        const engine = new Engine(canvas, true, { 
            preserveDrawingBuffer: false
        });
    
        // Create a scene to hold on the canvas
        const scene = new Scene(engine);

        // no need to clear here as we do not preserve buffers
        scene.autoClearDepthAndStencil = false;
    
        // Ensures default is part of our supported use cases.
        scene.defaultMaterial = createSimpleMaterial("default", scene, Color3.White());
    
        const clearColor = new Color4(77 / 255, 86 / 255, 92 / 255, 1);
        scene.clearColor = clearColor;
    
        // Add a camera to the scene
        const camera = new FreeCamera("orthoCamera", new Vector3(0, 0, -3), scene);
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        this._setupCamera(camera, engine.getRenderWidth(), engine.getRenderHeight());
    
        // Rely on the underlying engine render loop to update the filter result every frame.
        engine.runRenderLoop(() => {
            scene.render();
        });
    
        // OnResize
        engine.onResizeObservable.add(() => {
            this._setupCamera(camera, engine.getRenderWidth(), engine.getRenderHeight());
        });
    
        return scene;
    }

    private _setupCamera(camera: Camera, width: number, height: number): void {
        camera.orthoTop = 0;
        camera.orthoLeft = 0;
        camera.orthoBottom = height;
        camera.orthoRight = width;
    }

    private _createParticleSystem(): ParticleSystem {
        // Create a particle system
        const particleSystem = new ParticleSystem("particles", 1500, this._scene);
    
        //Texture of each particle
        particleSystem.particleTexture = new Texture(this._particleTextureURL, this._scene);
    
        // Where the particles come from
        particleSystem.emitter = this._pointerNode; // the starting location
    
        // Colors of all particles
        particleSystem.color1 = new Color4(0.99, 0.99, 0.99);
        particleSystem.color2 = new Color4(1, 0.98, 0);
        particleSystem.colorDead = new Color4(0.1, 0.1, 0.1, 0.1);
    
        // Size of each particle (random between...
        particleSystem.minSize = 1;
        particleSystem.maxSize = 8;
    
        // Life time of each particle (random between...
        particleSystem.minLifeTime = 0.1;
        particleSystem.maxLifeTime = 0.2;
    
        // Emission rate
        particleSystem.emitRate = 5000;
    
        /******* Emission Space ********/
        particleSystem.createSphereEmitter(this._currentSize, 0.3);
    
        // Speed
        particleSystem.minEmitPower = 70;
        particleSystem.maxEmitPower = 100;
        particleSystem.updateSpeed = 0.005;
    
        return particleSystem;
    }

    private _createPathMaterial(): Material {
        if (this._debug) {
            const pathMaterial = createDebugMaterial("debugMaterial", this._scene);
            return pathMaterial;
        }
    
        if (this._currentMode === Mode.pen) {
            const pathMaterial = createSimpleMaterial("pathMaterial", this._scene, this._currentColor);
            return pathMaterial;
        }
    
        const pathMaterial = createRainbowMaterial("pathMaterial", this._scene);
        return pathMaterial;
    }

    private _createPath(x: number, y: number): PathMesh {
        let options: Partial<PathBufferDataOptions> = {
            radius: this._currentSize
        }
    
        if (this._debug) {
            options.debounce = 1;
            options.roundness = 8;
        }
    
        const path = new PathMesh('trail', this._scene, x, y, options);
        return path;
    }
}
