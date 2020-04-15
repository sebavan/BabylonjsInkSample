// Import our Shader Config
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Meshes/buffer";
import { Observer } from "@babylonjs/core/Misc/observable";
import { DataBuffer } from "@babylonjs/core/Meshes/dataBuffer";
import { ThinEngine } from "@babylonjs/core/Engines/thinEngine";

import "../engineExtensions/engine.bufferSubData";

import { PathBufferData, PathBufferDataOptions, PathBufferDataChanges } from "./pathBufferData";


/**
 * A path mesh is representing a line of a certain thickness that can be 
 * constructed gradually.
 */
export class PathMesh extends Mesh {
    private readonly _onBeforeRenderObserver: Observer<Scene>;
    private readonly _pathData: PathBufferData;
    private readonly _currentChanges: PathBufferDataChanges;
    private readonly _engine: ThinEngine;

    private _currentPositionsBufferLength: number;

    private _indicesBuffer: DataBuffer;
    private _positionsBuffer: DataBuffer;
    private _distancesBuffer: DataBuffer;

    /**
     * Instantiates a new path from its starting location.
     * @param name The value used by scene.getMeshByName() to do a lookup.
     * @param scene The scene to add this mesh to.
     * @param startPointX Defines where does the path starts horizontally.
     * @param startPointY Defines where does the path starts vertically.
     * @param options Defines the path mesh construction options.
     */
    constructor(name: string, scene: Scene, startPointX: number, startPointY: number, options?: Partial<PathBufferDataOptions>) {
        super(name, scene);

        this._engine = scene.getEngine();

        this._currentChanges = {
            indexStart: 0,
            indexEnd: 0,
            vertexPositionStart: 0,
            vertexPositionEnd: 0,
            vertexDistanceStart: 0,
            vertexDistanceEnd: 0,
        }
        this._resetCurrentChanges();

        this._pathData = new PathBufferData(options);
        this._pathData.addPointToPath(startPointX, startPointY);

        this._createGeometry();

        this._onBeforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
            this._updateGeometry();
        });
    }

    /**
     * Gets the total length of the path by summing all the 
     * distance between the points that have been added to the path
     */
    public get totalLength(): number {
        return this._pathData.totalLength;
    }

    /**
     * Adds a new point to the path
     * @param x defines the x coordinates of the point
     * @param y defines the y coordinates of the point
     */
    public addPointToPath(x: number, y: number): void {
        const changes = this._pathData.addPointToPath(x, y);
        this._currentChanges.indexStart = Math.min(this._currentChanges.indexStart, changes.indexStart);
        this._currentChanges.indexEnd = Math.max(this._currentChanges.indexEnd, changes.indexEnd);
        this._currentChanges.vertexPositionStart = Math.min(this._currentChanges.vertexPositionStart, changes.vertexPositionStart);
        this._currentChanges.vertexPositionEnd = Math.max(this._currentChanges.vertexPositionEnd, changes.vertexPositionEnd);
        this._currentChanges.vertexDistanceStart = Math.min(this._currentChanges.vertexDistanceStart, changes.vertexDistanceStart);
        this._currentChanges.vertexDistanceEnd = Math.max(this._currentChanges.vertexDistanceEnd, changes.vertexDistanceEnd);
    }

    /**
     * Release the resources associated with the mesh
     * @param doNotRecurse defines whether or not to recurse and dispose childrens
     * @param disposeMaterialAndTextures defines whether or not to dispose associated material and textures
     */
    public dispose(doNotRecurse?: boolean, disposeMaterialAndTextures?: boolean) {
        this._scene.onBeforeRenderObservable.remove(this._onBeforeRenderObserver);

        super.dispose(doNotRecurse, disposeMaterialAndTextures);
    }

    private _createGeometry(): void {
        const indices = this._pathData.indices;
        const positions = this._pathData.positions;
        const distances = this._pathData.distances;

        // Sets the indices buffer
        this.setIndices(indices, null, true);

        // Sets the vertices buffers
        this.setVerticesData(VertexBuffer.PositionKind, positions, true, 3);
        this.setVerticesData("distance", distances, true, 1);

        this._indicesBuffer = this.geometry.getIndexBuffer();
        this._positionsBuffer = this.geometry.getVertexBuffer(VertexBuffer.PositionKind).getBuffer();
        this._distancesBuffer = this.geometry.getVertexBuffer("distance").getBuffer();

        // Reset the meaningfull index count
        // The buffer are not resized every frame to save GC
        // and prevent over allocation on every frame
        this.subMeshes[0].indexCount = this._pathData.indicesCount;

        // hold on to the current buffer size
        this._currentPositionsBufferLength = positions.length;
    }

    private _updateGeometry(): void {
        // TODO. Should update bounding boxes.

        const indices = this._pathData.indices;
        const positions = this._pathData.positions;
        const distances = this._pathData.distances;

        const geometry = this.geometry;

        // Prevent extra copy with the use of gpu only on the next line
        geometry._indices = indices;

        if (this._currentPositionsBufferLength !== positions.length) {
            // if the buffers have been recreated upload the new buffer to the gpu
            geometry.updateIndices(indices, 0, true);
            this.setVerticesData(VertexBuffer.PositionKind, positions, true, 3);
            this.setVerticesData("distance", distances, true, 1);

            this._indicesBuffer = this.geometry.getIndexBuffer();
            this._positionsBuffer = this.geometry.getVertexBuffer(VertexBuffer.PositionKind).getBuffer();
            this._distancesBuffer = this.geometry.getVertexBuffer("distance").getBuffer();
        }
        else {
            // if the buffers haven t been recreated update the gpu data only
            if (this._currentChanges.indexStart !== Number.MAX_VALUE) {
                // Add 3 to handle the end data point
                const length = this._currentChanges.indexEnd - this._currentChanges.indexStart + 3;
                const offset = this._currentChanges.indexStart;
                this._engine.indexBufferSubData(this._indicesBuffer, offset * 4, indices, offset, length);
            }
            if (this._currentChanges.vertexPositionStart !== Number.MAX_VALUE) {
                // Add 3 to handle the end data point
                const positionsLength = this._currentChanges.vertexPositionEnd - this._currentChanges.vertexPositionStart + 3;
                const positionsOffset = this._currentChanges.vertexPositionStart;
                this._engine.vertexBufferSubData(this._positionsBuffer, positionsOffset * 4, positions, positionsOffset, positionsLength);

                // Add 1 to handle the end data point
                const distancesLength = this._currentChanges.vertexDistanceEnd - this._currentChanges.vertexDistanceStart + 1;
                const distancesOffset = this._currentChanges.vertexDistanceStart;
                this._engine.vertexBufferSubData(this._distancesBuffer, distancesOffset * 4, distances, distancesOffset, distancesLength);
            }
        }

        // Reset the meaningfull index count
        // The buffer are not resized every frame to save GC
        // and prevent over allocation on every frame
        this.subMeshes[0].indexCount = this._pathData.indicesCount;

        // Reset the line index cache to help with wireframe as all the operations
        // are intented to be almost gpu exclusive
        (<any>this.subMeshes[0])._linesIndexBuffer = null;

        // hold on to the current buffer size
        this._currentPositionsBufferLength = positions.length;

        // Reset the changes
        this._resetCurrentChanges();
    }

    private _resetCurrentChanges(): void {
        this._currentChanges.indexStart = Number.MAX_VALUE;
        this._currentChanges.indexEnd = 0;
        this._currentChanges.vertexPositionStart = Number.MAX_VALUE;
        this._currentChanges.vertexPositionEnd = 0;
        this._currentChanges.vertexDistanceStart = Number.MAX_VALUE;
        this._currentChanges.vertexDistanceEnd = 0;
    }
}
