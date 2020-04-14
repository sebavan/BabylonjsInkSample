// Import our Shader Config
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Meshes/buffer";

import { PathBufferData, PathBufferDataOptions } from "./pathBufferData";

export class PathMesh extends Mesh {
    private readonly _pathData: PathBufferData;

    private _currentPositionsBufferLength: number;

    /**
     * @constructor
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

    public get totalDistance(): number {
        return this._pathData.totalDistance;
    }

    public addPointToPath(x: number, y: number): void {
        this._pathData.addPointToPath(x, y);
        this._updateGeometry();
    }

    private _createGeometry(): void {
        const indices = this._pathData.indices;
        const positions = this._pathData.positions;
        const distances = this._pathData.distances;

        this.setIndices(indices, null, true);

        // update vertex buffers
        this.setVerticesData(VertexBuffer.PositionKind, positions, true);
        this.setVerticesData("distance", distances, true, 1);

        this.subMeshes[0].indexCount = this._pathData.indicesCount;

        this._currentPositionsBufferLength = positions.length;
    }

    private _updateGeometry(): void {
        // TODO. Should only upload the relevant new part to the gpu.
        // TODO. In this case updateIndices should work as well.
        // TODO. Should only draw the relevant new part as well.

        const indices = this._pathData.indices;
        const positions = this._pathData.positions;
        const distances = this._pathData.distances;

        const geometry = this.geometry;

        // prevent extra copy with the use of gpu only on the next line
        geometry._indices = indices;

        if (this._currentPositionsBufferLength !== positions.length) {
            geometry.updateIndices(indices, 0, true);
            this.setVerticesData(VertexBuffer.PositionKind, positions, true);
            this.setVerticesData("distance", distances, true, 1);
        }
        else {
            geometry.updateIndices(indices, 0, true);
            geometry.updateVerticesDataDirectly(VertexBuffer.PositionKind, positions, 0);
            geometry.updateVerticesDataDirectly("distance", distances, 0);
        }

        // update bbox
        // and do not recreate...

        // update submesh indices
        this.subMeshes[0].indexCount = this._pathData.indicesCount;
        (<any>this.subMeshes[0])._linesIndexBuffer = null;
        this._currentPositionsBufferLength = positions.length;
    }
}
