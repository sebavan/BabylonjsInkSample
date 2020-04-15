// Import our Shader Config
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Meshes/buffer";

import { PathBufferData, PathBufferDataOptions } from "./pathBufferData";

/**
 * A path mesh is representing a line of a certain thickness that can be 
 * constructed gradually.
 */
export class PathMesh extends Mesh {
    private readonly _pathData: PathBufferData;

    private _currentPositionsBufferLength: number;

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

        this._pathData = new PathBufferData(options);
        this._pathData.addPointToPath(startPointX, startPointY);

        this._createGeometry();
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
        this._pathData.addPointToPath(x, y);
        this._updateGeometry();
    }

    private _createGeometry(): void {
        const indices = this._pathData.indices;
        const positions = this._pathData.positions;
        const distances = this._pathData.distances;

        // Sets the indices buffer
        this.setIndices(indices, null, true);

        // Sets the vertices buffers
        this.setVerticesData(VertexBuffer.PositionKind, positions, true);
        this.setVerticesData("distance", distances, true, 1);

        // Reset the meaningfull index count
        // The buffer are not resized every frame to save GC
        // and prevent over allocation on every frame
        this.subMeshes[0].indexCount = this._pathData.indicesCount;

        // hold on to the current buffer size
        this._currentPositionsBufferLength = positions.length;
    }

    private _updateGeometry(): void {
        // TODO. Should only upload the relevant new part to the gpu.
        // TODO. In this case updateIndices should work as well.
        // TODO. Should only draw the relevant new part as well.
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
            this.setVerticesData(VertexBuffer.PositionKind, positions, true);
            this.setVerticesData("distance", distances, true, 1);
        }
        else {
            // if the buffers haven t been recreated update the gpu data only
            geometry.updateIndices(indices, 0, true);
            geometry.updateVerticesDataDirectly(VertexBuffer.PositionKind, positions, 0);
            geometry.updateVerticesDataDirectly("distance", distances, 0);
        }

        // update bbox
        // and do not recreate...

        // Reset the meaningfull index count
        // The buffer are not resized every frame to save GC
        // and prevent over allocation on every frame
        this.subMeshes[0].indexCount = this._pathData.indicesCount;

        // Reset the line index cache to help with wireframe as all the operations
        // are intented to be almost gpu exclusive
        (<any>this.subMeshes[0])._linesIndexBuffer = null;

        // hold on to the current buffer size
        this._currentPositionsBufferLength = positions.length;
    }
}
