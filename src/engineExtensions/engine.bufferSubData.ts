import { ThinEngine } from "@babylonjs/core/Engines/thinEngine";
import { DataBuffer } from "@babylonjs/core/Buffers/dataBuffer";

declare module "@babylonjs/core/Engines/thinEngine" {
    export interface ThinEngine {
        /**
         * Update a gpu index buffer
         * @param indexBuffer defines the buffer to update
         * @param dstByteOffset defines where to start updating the data in bytes in the gpu buffer
         * @param data defines the data to upload to the gpu
         * @param srcOffset defines the index where to start the copy of data in the source buffer
         * @param srcLength defines the number of UInt32 elements to copy
         */
        indexBufferSubData(indexBuffer: DataBuffer, dstByteOffset: number, data: Uint32Array, srcOffset: number, srcLength: number): void;
        /**
         * Update a gpu vertex buffer
         * @param dstByteOffset defines where to start updating the data in bytes in the gpu buffer
         * @param data defines the data to upload to the gpu
         * @param srcOffset defines the index where to start the copy of data in the source buffer
         * @param srcLength defines the number of Float32 elements to copy
         */
        vertexBufferSubData(vertexBuffer: DataBuffer, dstByteOffset: number, data: Float32Array, srcOffset: number, srcLength: number): void;
    }
}

ThinEngine.prototype.indexBufferSubData = function(this: ThinEngine, indexBuffer: DataBuffer, dstByteOffset: number, data: Uint32Array, srcOffset: number, srcLength: number): void {
    // Force cache update
    this._currentBoundBuffer[this._gl.ELEMENT_ARRAY_BUFFER] = null;
    this.bindIndexBuffer(indexBuffer);

    if (this.webGLVersion === 2) {
        (this._gl as unknown as WebGL2RenderingContext).bufferSubData(this._gl.ELEMENT_ARRAY_BUFFER, dstByteOffset, data, srcOffset, srcLength);
    }
    else {
        const dataView = new Uint32Array(data.buffer, srcOffset * 4, srcLength);
        this._gl.bufferSubData(this._gl.ELEMENT_ARRAY_BUFFER, dstByteOffset, dataView);
    }

    this._resetIndexBufferBinding();
}

ThinEngine.prototype.vertexBufferSubData = function(this: ThinEngine, vertexBuffer: DataBuffer, dstByteOffset: number, data: Float32Array, srcOffset: number, srcLength: number): void {
    this.bindArrayBuffer(vertexBuffer);

    if (this.webGLVersion === 2) {
        (this._gl as unknown as WebGL2RenderingContext).bufferSubData(this._gl.ARRAY_BUFFER, dstByteOffset, data, srcOffset, srcLength);
    }
    else {
        const dataView = new Float32Array(data.buffer, srcOffset * 4, srcLength);
        this._gl.bufferSubData(this._gl.ARRAY_BUFFER, dstByteOffset, dataView);
    }

    this._resetVertexBufferBinding();
};