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

/**
 * Various brush modes
 */
const enum Brush {
    /**
     * Normal pen mode
     */
    pen,
    /**
     * Rainbow mode
     */
    rainbow,
}

/**
 * The canvas is responsible to create and orchestrate all the resources
 * the ink platform would need (scene, camera...)
 */
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
    private _currentMode: Brush;

    /**
     * Creates an instance of an ink canvas associated to a html canvas element
     * @param canvas defines the html element to transform into and ink surface
     * @param particleTextureURL defines the URL of the texture used for the rainbow particle effects
     * @param debug defines wheter the ink canvas is in debug mode or not (wireframe, input debounced...)
     */
    constructor(canvas: HTMLCanvasElement, particleTextureURL: string, debug = false) {
        this._debug = debug;
        this._particleTextureURL = particleTextureURL;
        this._paths = [];
        this._redoPaths = [];
        this._currentPath = null;
        this._currentSize = 5;
        this._currentColor = Color3.White();
        this._currentMode = Brush.rainbow;

        this._scene = this._createScene(canvas);
        this._pointerNode = new Vector3(0, 0, 0);
        this._particleSystem = this._createParticleSystem();
    }

    /**
     * Gets the keyboard observable for the current canvas
     */
    public get onKeyboardObservable(): Observable<KeyboardInfo> {
        return this._scene.onKeyboardObservable;
    }

    /**
     * Gets the pointer observable for the current canvas
     */
    public get onPointerObservable(): Observable<PointerInfo> {
        return this._scene.onPointerObservable;
    }

    /**
     * Starts creating a new path at the location of the pointer
     */
    public startPath(): void {
        if (this._currentPath) {
            return;
        }

        // Cleanup the redo list
        this._redoPaths.length = 0;

        // Create the new path mesh and assigns its material
        this._currentPath = this._createPath(this._scene.pointerX, this._scene.pointerY);
        this._currentPath.material = this._createPathMaterial();

        // Quick Optim
        this._currentPath.isPickable = false;
        this._currentPath.material.freeze();
        this._currentPath.alwaysSelectAsActiveMesh = true;
        this._currentPath.freezeWorldMatrix();

        // Starts the particles in rainbow mode
        if (this._currentMode === Brush.rainbow) {
            this._updateParticleSystem();
            this._particleSystem.start();
        }
    }

    /**
     * Extends the path to the new pointer location
     */
    public extendPath(): void {
        if (!this._currentPath) {
            return;
        }

        // Add a new point to the path
        this._currentPath.addPointToPath(this._scene.pointerX, this._scene.pointerY);

        // Updates the particles in rainbow mode
        if (this._currentMode === Brush.rainbow) {
            this._updateParticleSystem();
        }
    }

    /**
     * Ends the current path
     */
    public endPath(): void {
        if (!this._currentPath) {
            return;
        }

        // Adds the path to our undo list
        this._paths.push(this._currentPath);

        // Clear the current path
        this._currentPath = null;

        // Stops the particle system
        this._particleSystem.stop();
    }

    /**
     * Undo the latest created path
     */
    public undo(): void {
        if (!this._currentPath && this._paths.length > 0) {
            const path = this._paths.pop();
            this._redoPaths.push(path);
            this._scene.removeMesh(path);
        }
    }

    /**
     * Redo the latest undone path
     */
    public redo(): void {
        if (!this._currentPath && this._redoPaths.length > 0) {
            const path = this._redoPaths.pop();
            this._paths.push(path);
            this._scene.addMesh(path);
        }
    }

    /**
     * Clear all the created path
     */
    public clear(): void {
        if (!this._currentPath && this._paths.length > 0) {
            let path: PathMesh;
            while (path = this._paths.pop()) {
                path.dispose();
            }
        }
    }

    /**
     * Change the size of the current brush
     */
    public changeSize(size: number): void {
        this._currentSize = size;
        this._particleSystem.createSphereEmitter(this._currentSize, 0.5);
    }

    /**
     * Change the color of the current pen
     */
    public changeColor(color: Color3): void {
        this._currentColor = color;
        this.usePen();
    }

    /**
     * Switch to pen mode
     */
    public usePen(): void {
        this._currentMode = Brush.pen;
    }

    /**
     * Switch to rainbow mode
     */
    public useRainbow(): void {
        this._currentMode = Brush.rainbow;
    }

    /**
     * Get the current framerate
     */
    public getFps(): number {
        return this._scene.getEngine().getFps();
    }

    /**
     * Toggle the Babylon almighty inspector
     */
    public toggleDebugLayer(): Promise<void> {
        // Rely on code splitting to prevent all of babylon
        // + loaders, serializers... to be downloaded if not necessary
        return import(/* webpackChunkName: "debug" */ "./debug/appDebug").then((debugModule) => {
            debugModule.toggleDebugMode(this._scene);
        });
    }

    private _updateParticleSystem(): void {
        // Update the current particle emitter
        this._pointerNode.x = this._scene.pointerX;
        this._pointerNode.y = this._scene.pointerY;

        // Gets the interpolated color for the rainbow particle
        getColorAtToRef(this._currentPath.totalLength, this._particleSystem.color2)
        getColorAtToRef(this._currentPath.totalLength, this._particleSystem.color1)

    }

    private _createScene(canvas: HTMLCanvasElement): Scene {
        // Create our engine to hold on the canvas
        const engine = new Engine(canvas, true, { 
            preserveDrawingBuffer: false,
            alpha: false,
        });
        engine.preventCacheWipeBetweenFrames = true;
    
        // Create a scene to ink with
        const scene = new Scene(engine);
        
        // no need to clear here as we do not preserve buffers
        scene.autoClearDepthAndStencil = false;
    
        // Ensures default is part of our supported use cases.
        scene.defaultMaterial = createSimpleMaterial("default", scene, Color3.White());

        // A nice and fancy background color
        const clearColor = new Color4(77 / 255, 86 / 255, 92 / 255, 1);
        scene.clearColor = clearColor;
    
        // Add a camera to the scene
        const camera = new FreeCamera("orthoCamera", new Vector3(0, 0, -3), scene);
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
        // We chose an orthographic view to simplify at most our mesh creation
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

        // Setup the camera to fit with our gl coordinates in the canvas
        camera.unfreezeProjectionMatrix();
        camera.orthoTop = 0;
        camera.orthoLeft = 0;
        camera.orthoBottom = height;
        camera.orthoRight = width;
        camera.getProjectionMatrix(true);
        camera.freezeProjectionMatrix();
    }

    private _createParticleSystem(): ParticleSystem {
        // Create a particle system
        const particleSystem = new ParticleSystem("particles", 1500, this._scene);

        // Texture of each particle
        particleSystem.particleTexture = new Texture(this._particleTextureURL, this._scene);

        // Where the particles come from
        particleSystem.emitter = this._pointerNode; // the starting location

        // Colors of all particles
        particleSystem.color1 = new Color4(0.99, 0.99, 0.99);
        particleSystem.color2 = new Color4(1, 0.98, 0);
        particleSystem.colorDead = new Color4(0.1, 0.1, 0.1, 0.1);
    
        // Size of each particle; random between...
        particleSystem.minSize = 1;
        particleSystem.maxSize = 8;
    
        // Life time of each particle; random between...
        particleSystem.minLifeTime = 0.1;
        particleSystem.maxLifeTime = 0.2;

        // Emission rate
        particleSystem.emitRate = 5000;

        // Emission Space
        particleSystem.createSphereEmitter(this._currentSize, 0.3);
    
        // Speed
        particleSystem.minEmitPower = 70;
        particleSystem.maxEmitPower = 100;
        particleSystem.updateSpeed = 0.005;
    
        return particleSystem;
    }

    private _createPathMaterial(): Material {
        // Creates a material for the path according to our current inking
        // setup.

        if (this._debug) {
            const pathMaterial = createDebugMaterial("debugMaterial", this._scene);
            return pathMaterial;
        }
    
        if (this._currentMode === Brush.pen) {
            const pathMaterial = createSimpleMaterial("pathMaterial", this._scene, this._currentColor);
            return pathMaterial;
        }
    
        const pathMaterial = createRainbowMaterial("pathMaterial", this._scene);
        return pathMaterial;
    }

    private _createPath(x: number, y: number): PathMesh {
        // Creates a path mesh according to our current inking setup

        let options: Partial<PathBufferDataOptions> = {
            radius: this._currentSize
        }
    
        if (this._debug) {
            options.debounce = 1;
            options.roundness = 8;
        }
    
        const path = new PathMesh('path', this._scene, x, y, options);
        return path;
    }
}
