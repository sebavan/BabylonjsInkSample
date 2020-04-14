// Import our Shader Config
import { Vector2 } from "@babylonjs/core/Maths/math.vector";

export interface PathBufferDataOptions {
    smoothingDistance: number;
    roundness: number;
    radius: number;
    debounce: number;
}

const DefaultOptions: PathBufferDataOptions = {
    smoothingDistance: 20,
    roundness: 16,
    radius: 5,
    debounce: 1,
}

export class PathBufferData {

    private static readonly _VerticesStartSize = 10000;
    private static readonly _VerticesExpansionRate = 2;

    public positions: Float32Array;
    public distances: Float32Array;
    public indices: Uint32Array;
    public indicesCount: number;

    private readonly _options: PathBufferDataOptions;
    private readonly _smoothingDistance: number;
    private readonly _roundness: number;
    private readonly _radius: number;
    private readonly _debounce: number;
    private readonly _roundnessSliceAlpha: number;
    private readonly _maxAddedVerticesPerPoint: number;

    private _maxVerticesCount: number;

    private _nextVertexIndex: number;
    private _nextTriangleIndex: number;
    private _previousPoint: Vector2;
    private _currentPoint: Vector2;

    private _points = [];

    // Update temp data preventing GC
    private _previous_translation: Vector2 = new Vector2();
    private _previous_thicknessDirection: Vector2 = new Vector2();
    private _previous_thicknessDirectionScaled: Vector2 = new Vector2();
    private _previous_p1: Vector2 = new Vector2();
    private _previous_p2: Vector2 = new Vector2();
    private _previous_p3: Vector2 = new Vector2();
    private _previous_p4: Vector2 = new Vector2();
    private _previous_p2Index = 0;
    private _previous_p3Index = 0;
    private _previous_distance = 0;

    private _translation: Vector2 = new Vector2();
    private _thicknessDirection: Vector2 = new Vector2();
    private _thicknessDirectionScaled: Vector2 = new Vector2();
    private _p1: Vector2 = new Vector2();
    private _p2: Vector2 = new Vector2();
    private _p3: Vector2 = new Vector2();
    private _p4: Vector2 = new Vector2();

    private _p1p2: Vector2 = new Vector2();
    private _p1previous_p2: Vector2 = new Vector2();

    private _currentDebounce = 0;

    public constructor(options: Partial<PathBufferDataOptions> = DefaultOptions) {
        this._options = {
            ...DefaultOptions,
            ...options,
        };

        this._smoothingDistance = Math.max(5, this._options.smoothingDistance);
        this._debounce = Math.max(1, this._options.debounce);

        // Compute default slice rotation angle according to the roundness.
        this._roundness = Math.max(4, this._options.roundness);
        this._radius = Math.max(1, this._options.radius);
        this._roundnessSliceAlpha = 2 * Math.PI / this._roundness;

        // We can at max add as many vertices than half the roundness
        // plus the mid point and the new quad for the current point.
        this._maxAddedVerticesPerPoint = (this._roundness / 2 + 1 + 4) + 20;

        this._nextVertexIndex = 0;
        this._nextTriangleIndex = 0;
        this._previousPoint = new Vector2(0, 0);
        this._currentPoint = new Vector2(0, 0);

        this._maxVerticesCount = PathBufferData._VerticesStartSize;
        this._createBuffers(this._maxVerticesCount);

        // No data so far
        this.indicesCount = 0;
    }

    public get totalDistance(): number {
        return this._previous_distance;
    }

    public addPointToPath(x: number, y: number): void {
        const pointsLength = this._points.length;
        if (pointsLength === 0) {
            this._addPoint(x, y);
        }
        else if (this._previousPoint.x !== x || this._previousPoint.y !== y) {
            this._currentDebounce++;
            this._currentDebounce = this._currentDebounce % this._debounce;
            if (this._currentDebounce !== 0) {
                return;
            }

            this._currentPoint.set(x, y);
            this._currentPoint.subtractInPlace(this._previousPoint);
            const dist = this._currentPoint.length();

            if (dist > this._radius) {
                if (pointsLength <= 2) {
                    this._addMidPoint(x, y);
                }
                else {
                    // As soon as we have at least 1 previous point we can start smoothing
                    this._addPointsSmoothly(x, y);
                }
            }
        }

        this._points.push(x, y);
    }

    private _smoothing_previousPoint = new Vector2();
    private _smoothing_newPoint = new Vector2();
    private _smoothing_temp = new Vector2();

    private _addMidPoint(x: number, y: number): void {
        const length = this._points.length;

        const x1 = this._points[length - 2];
        const y1 = this._points[length - 1];
        this._smoothing_previousPoint.set(x1, y1);
        this._smoothing_newPoint.set(x, y);

        this._smoothing_newPoint.subtractToRef(this._smoothing_previousPoint, this._smoothing_temp);
        this._smoothing_temp.scaleInPlace(0.5);

        // Temp now holds the mid point
        this._smoothing_temp.addInPlace(this._smoothing_previousPoint);

        const midPointX = this._smoothing_temp.x;
        const midPointY = this._smoothing_temp.y;

        this._addPoint(midPointX, midPointY);
    }

    private _addPointsSmoothly(x: number, y: number): void {
        const length = this._points.length;

        const x1 = this._points[length - 2];
        const y1 = this._points[length - 1];
        this._smoothing_previousPoint.set(x1, y1);
        this._smoothing_newPoint.set(x, y);

        this._smoothing_newPoint.subtractToRef(this._smoothing_previousPoint, this._smoothing_temp);
        const distanceFromPreviousPoint = this._smoothing_temp.length();

        this._smoothing_temp.scaleInPlace(0.5);

        // Temp now holds the mid point
        this._smoothing_temp.addInPlace(this._smoothing_previousPoint);
        
        const midPointX = this._smoothing_temp.x;
        const midPointY = this._smoothing_temp.y;

        const steps = Math.ceil(distanceFromPreviousPoint / this._smoothingDistance);
        if (steps > 1) {
            const previousX = this._previousPoint.x;
            const previousY = this._previousPoint.y;
            for (let step = 1; step < steps; step++) {
                const howFar = step / steps;
                const smoothX = this._quadraticBezierEquation(howFar, previousX, x1, midPointX);
                const smoothY = this._quadraticBezierEquation(howFar, previousY, y1, midPointY);

                this._addPoint(smoothX, smoothY);
            }
        }

        this._addPoint(midPointX, midPointY);
    }

    private _addPoint(x: number, y: number): void {
        // Checks and expands buffer accordingly.
        if (this._shouldExpand(1)) {
            this._expandBuffers();
        }

        // Current point setup
        this._currentPoint.x = x;
        this._currentPoint.y = y;

        // We are just starting
        if (this._nextVertexIndex === 0) {
            // Draw a circle
            this._startPath();
        }
        else if (this._nextVertexIndex === 1) {
            // Draw a double caped segment
            this._firstSegment();
        }
        else {
            // Draw a single caped segment linked to the previous 
            // Segment
            this._addSegment();
        }

        // Record the points we are adding.
        this._previousPoint.x = x;
        this._previousPoint.y = y;
    }

    ////// Start ///////

    private _startPath(): void {
        const { x, y } = this._currentPoint;
        const distance = 0;

        // Add Center.
        const centerIndex = this._pushVertexData(x, y, 0, distance);

        // Add Contour for a full circle.
        for (let i: number = 0; i < this._roundness; i++) {
            const alpha = i * this._roundnessSliceAlpha;
            const xSlice = x + Math.cos(alpha) * this._radius;
            const ySlice = y + Math.sin(alpha) * this._radius;

            // Add each point on the contour.
            const contourIndex = this._pushVertexData(xSlice, ySlice, 0, distance);

            if (i == this._roundness - 1) {
                this._pushTriangleData(centerIndex, centerIndex + 1, contourIndex);
            }
            else {
                this._pushTriangleData(centerIndex, contourIndex + 1, contourIndex);
            }
        }

        // Reset to first point only as we need to recreate only half a cap
        // Oriented in the next direction
        this._nextTriangleIndex = 0;
        this._nextVertexIndex = 1;
    }

    ////// First Segment ///////

    // The first segment is a bit different as it requires caps on both ends
    private _firstSegment(): void {
        this._currentPoint.subtractToRef(this._previousPoint, this._translation);
        const currentSegmentDistance = this._translation.length();
        this._translation.normalize();
        this._thicknessDirection.set(-this._translation.y, this._translation.x);
        this._thicknessDirection.scaleToRef(this._radius, this._thicknessDirectionScaled);

        this._previousPoint.subtractToRef(this._thicknessDirectionScaled, this._p1);
        this._currentPoint.subtractToRef(this._thicknessDirectionScaled, this._p2);
        this._currentPoint.addToRef(this._thicknessDirectionScaled, this._p3);
        this._previousPoint.addToRef(this._thicknessDirectionScaled, this._p4);

        // Create the quad for the segment.
        const totalDistance = this._previous_distance + currentSegmentDistance;
        const p1Index = this._pushVertexData(this._p1.x, this._p1.y, 0, this._previous_distance);
        const p2Index = this._pushVertexData(this._p2.x, this._p2.y, 0, totalDistance);
        const p3Index = this._pushVertexData(this._p3.x, this._p3.y, 0, totalDistance);
        const p4Index = this._pushVertexData(this._p4.x, this._p4.y, 0, this._previous_distance);

        this._pushTriangleData(p1Index, p3Index, p2Index);
        this._pushTriangleData(p3Index, p1Index, p4Index);

        let nextSegmentTriangleIndex = this._nextTriangleIndex;

        // Add Start Cap.
        for (let i: number = 1; i < this._roundness; i++) {
            // Only half of a circle.
            const alpha = i * this._roundnessSliceAlpha;
            if (alpha >= Math.PI) {
                nextSegmentTriangleIndex = this._nextTriangleIndex + 1;
                this._pushTriangleData(0, p1Index, this._nextVertexIndex - 1);
                break;
            }

            // 2D rotation
            const xSlice = this._previousPoint.x + (this._thicknessDirectionScaled.x * Math.cos(alpha) - this._thicknessDirectionScaled.y * Math.sin(alpha));
            const ySlice = this._previousPoint.y + (this._thicknessDirectionScaled.x * Math.sin(alpha) + this._thicknessDirectionScaled.y * Math.cos(alpha));

            // Add each point on the contour.
            const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_distance);

            this._pushTriangleData(0, contourIndex, contourIndex - 1);
        }

        const centerIndex = this._pushVertexData(this._currentPoint.x, this._currentPoint.y, 0, totalDistance);

        // Add End Cap.
        for (let i: number = 1; i < this._roundness; i++) {
            // Only half of a circle.
            const alpha = i * this._roundnessSliceAlpha;
            if (alpha >= Math.PI) {
                this._pushTriangleData(centerIndex, p3Index, this._nextVertexIndex - 1);
                break;
            }

            // 2D rotation
            const xSlice = this._currentPoint.x + (-this._thicknessDirectionScaled.x * Math.cos(alpha) + this._thicknessDirectionScaled.y * Math.sin(alpha));
            const ySlice = this._currentPoint.y + (-this._thicknessDirectionScaled.x * Math.sin(alpha) - this._thicknessDirectionScaled.y * Math.cos(alpha));

            // Add each point on the contour.
            const contourIndex = this._pushVertexData(xSlice, ySlice, 0, totalDistance);
            if (i == 1) {
                this._pushTriangleData(centerIndex, contourIndex, p2Index);
            }
            else {
                this._pushTriangleData(centerIndex, contourIndex, contourIndex - 1);
            }
        }

        // Reset to first point only as we need to recreate only half a cap
        this._nextTriangleIndex = nextSegmentTriangleIndex;
        this._nextVertexIndex = centerIndex + 1;
        this._previous_distance = totalDistance;

        this._previous_translation.copyFrom(this._translation);
        this._previous_thicknessDirection.copyFrom(this._thicknessDirection);
        this._previous_thicknessDirectionScaled.copyFrom(this._thicknessDirectionScaled);
        this._previous_p1.copyFrom(this._p1);
        this._previous_p2.copyFrom(this._p2);
        this._previous_p3.copyFrom(this._p3);
        this._previous_p4.copyFrom(this._p4);
        this._previous_p2Index = p2Index;
        this._previous_p3Index = p3Index;
    }

    ////// Other Segments ///////

    // Add A new segment with end cap and link to the previous segment
    private _addSegment(): void {
        const previousCenterIndex = this._nextVertexIndex - 1;

        this._currentPoint.subtractToRef(this._previousPoint, this._translation);
        const currentSegmentDistance = this._translation.length();
        this._translation.normalize();
        this._thicknessDirection.set(-this._translation.y, this._translation.x);
        this._thicknessDirection.scaleToRef(this._radius, this._thicknessDirectionScaled);

        this._previousPoint.subtractToRef(this._thicknessDirectionScaled, this._p1);
        this._currentPoint.subtractToRef(this._thicknessDirectionScaled, this._p2);
        this._currentPoint.addToRef(this._thicknessDirectionScaled, this._p3);
        this._previousPoint.addToRef(this._thicknessDirectionScaled, this._p4);

        const totalDistance = this._previous_distance + currentSegmentDistance;
        const p1Index = this._pushVertexData(this._p1.x, this._p1.y, 0, this._previous_distance);
        const p2Index = this._pushVertexData(this._p2.x, this._p2.y, 0, totalDistance);
        const p3Index = this._pushVertexData(this._p3.x, this._p3.y, 0, totalDistance);
        const p4Index = this._pushVertexData(this._p4.x, this._p4.y, 0, this._previous_distance);

        this._pushTriangleData(p1Index, p3Index, p2Index);
        this._pushTriangleData(p3Index, p1Index, p4Index);

        this._previous_p2.subtractToRef(this._p1, this._p1previous_p2);
        this._p1previous_p2.normalize();
        this._p2.subtractToRef(this._p1, this._p1p2);
        this._p1p2.normalize();

        // Cos angle compute to determing which quadrant the link should be in
        const dot_p1previous_p2_p1p2 = Vector2.Dot(this._p1previous_p2, this._p1p2);
        const dot_previous_translation_translation = Vector2.Dot(this._previous_translation, this._translation);

        // We are Aligned so either we go forward or backward
        if (dot_p1previous_p2_p1p2 == 0) {
            // if we go backward we need a full Hemisphere as a link
            if (dot_previous_translation_translation < 0) {
                // Add Mid Cap.
                for (let i: number = 1; i < this._roundness; i++) {
                    // Only half of a circle.
                    const alpha = i * this._roundnessSliceAlpha;
                    if (alpha >= Math.PI) {
                        this._pushTriangleData(previousCenterIndex, p1Index, this._nextVertexIndex - 1);
                        break;
                    }
    
                    // 2D rotation
                    const xSlice = this._previousPoint.x + (-this._thicknessDirectionScaled.x * Math.cos(alpha + Math.PI) + this._thicknessDirectionScaled.y * Math.sin(alpha + Math.PI));
                    const ySlice = this._previousPoint.y + (-this._thicknessDirectionScaled.x * Math.sin(alpha + Math.PI) - this._thicknessDirectionScaled.y * Math.cos(alpha + Math.PI));
    
                    // Add each point on the contour.
                    const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_distance);
                    if (i == 1) {
                        this._pushTriangleData(previousCenterIndex, contourIndex, p4Index);
                    }
                    else {
                        this._pushTriangleData(previousCenterIndex, contourIndex, contourIndex - 1);
                    }
                }
            }

            // if (dot_previous_translation_translation < 0) {
            //     // Add Mid Cap.
            //     for (let i: number = 1; i < this._roundness; i++) {
            //         // Only half of a circle.
            //         const alpha = i * this._roundnessSliceAlpha;
            //         if (alpha >= Math.PI) {
            //             this._pushTriangleData(previousCenterIndex, p1Index, this._nextVertexIndex - 1);
            //             break;
            //         }
    
            //         // 2D rotation
            //         const xSlice = this._previousPoint.x + (-this._thicknessDirectionScaled.x * Math.cos(alpha + Math.PI) + this._thicknessDirectionScaled.y * Math.sin(alpha + Math.PI));
            //         const ySlice = this._previousPoint.y + (-this._thicknessDirectionScaled.x * Math.sin(alpha + Math.PI) - this._thicknessDirectionScaled.y * Math.cos(alpha + Math.PI));
    
            //         // Add each point on the contour.
            //         const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_distance);
            //         if (i == 1) {
            //             this._pushTriangleData(previousCenterIndex, contourIndex, p4Index);
            //         }
            //         else {
            //             this._pushTriangleData(previousCenterIndex, contourIndex, contourIndex - 1);
            //         }
            //     }
            // }

            // if we go forward that is the easiest
            else {
                // Extend or do nothing
                // Here we simply do nothing
            }
        }
        // We need to add a top link between p4 an the previous p3 point
        else if (dot_p1previous_p2_p1p2 > 0) {
            // Add Mid Cap.
            for (let i: number = 1; i < this._roundness; i++) {
                // Only half of a circle.
                const alpha = i * this._roundnessSliceAlpha;
                if (Math.cos(alpha) <= dot_previous_translation_translation) {
                    // We are lucky cause if the first angle is enough, this._nextVertexIndex - 1 is actually equal to p4 :-)
                    // We do not need another if.
                    this._pushTriangleData(previousCenterIndex, this._previous_p3Index, this._nextVertexIndex - 1);
                    break;
                }

                // 2D rotation
                const xSlice = this._previousPoint.x + (-this._thicknessDirectionScaled.x * Math.cos(alpha + Math.PI) + this._thicknessDirectionScaled.y * Math.sin(alpha + Math.PI));
                const ySlice = this._previousPoint.y + (-this._thicknessDirectionScaled.x * Math.sin(alpha + Math.PI) - this._thicknessDirectionScaled.y * Math.cos(alpha + Math.PI));

                // Add each point on the contour.
                const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_distance);

                // We are lucky cause if the first angle is enough, contourIndex - 1 is actually equal to p4 :-)
                // We do not need another if.
                this._pushTriangleData(previousCenterIndex, contourIndex, contourIndex - 1);
            }
        }
        // We need to add a bottom link between p1 an the previous p2 point
        else if (dot_p1previous_p2_p1p2 < 0) {
            // Add Mid Cap.
            for (let i: number = 1; i < this._roundness; i++) {
                // Only half of a circle.
                const alpha = i * this._roundnessSliceAlpha;
                if (Math.cos(alpha) <= dot_previous_translation_translation) {
                    if (i == 1) {
                        this._pushTriangleData(previousCenterIndex, p1Index, this._previous_p2Index);
                    }
                    else {
                        this._pushTriangleData(previousCenterIndex, p1Index, this._nextVertexIndex - 1);
                    }
                    break;
                }

                // 2D rotation
                const xSlice = this._previousPoint.x + (-this._previous_thicknessDirectionScaled.x * Math.cos(alpha) + this._previous_thicknessDirectionScaled.y * Math.sin(alpha));
                const ySlice = this._previousPoint.y + (-this._previous_thicknessDirectionScaled.x * Math.sin(alpha) - this._previous_thicknessDirectionScaled.y * Math.cos(alpha));

                // Add each point on the contour.
                const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_distance);
                if (i == 1) {
                    this._pushTriangleData(previousCenterIndex, contourIndex, this._previous_p2Index);
                }
                else {
                    this._pushTriangleData(previousCenterIndex, contourIndex, contourIndex - 1);
                }
            }
        }

        // At this point we can record where the next segment should start.
        let nextSegmentTriangleIndex = this._nextTriangleIndex;

        const centerIndex = this._pushVertexData(this._currentPoint.x, this._currentPoint.y, 0, totalDistance);

        // Add End Cap.
        for (let i: number = 1; i < this._roundness; i++) {
            // Only half of a circle.
            const alpha = i * this._roundnessSliceAlpha;
            if (alpha >= Math.PI) {
                this._pushTriangleData(centerIndex, p3Index, this._nextVertexIndex - 1);
                break;
            }

            // 2D rotation
            const xSlice = this._currentPoint.x + (-this._thicknessDirectionScaled.x * Math.cos(alpha) + this._thicknessDirectionScaled.y * Math.sin(alpha));
            const ySlice = this._currentPoint.y + (-this._thicknessDirectionScaled.x * Math.sin(alpha) - this._thicknessDirectionScaled.y * Math.cos(alpha));

            // Add each point on the contour.
            const contourIndex = this._pushVertexData(xSlice, ySlice, 0, totalDistance);
            if (i == 1) {
                this._pushTriangleData(centerIndex, contourIndex, p2Index);
            }
            else {
                this._pushTriangleData(centerIndex, contourIndex, contourIndex - 1);
            }
        }

        // Reset to first point only as we need to recreate only half a cap
        this._nextTriangleIndex = nextSegmentTriangleIndex;
        this._nextVertexIndex = centerIndex + 1;
        this._previous_distance = totalDistance;

        this._previous_translation.copyFrom(this._translation);
        this._previous_thicknessDirection.copyFrom(this._thicknessDirection);
        this._previous_thicknessDirectionScaled.copyFrom(this._thicknessDirectionScaled);
        this._previous_p1.copyFrom(this._p1);
        this._previous_p2.copyFrom(this._p2);
        this._previous_p3.copyFrom(this._p3);
        this._previous_p4.copyFrom(this._p4);
        this._previous_p2Index = p2Index;
        this._previous_p3Index = p3Index;
    }

    ////// Utils ///////

    private _pushVertexData(x: number, y: number, z: number, dist: number): number {
        const vertexIndex = this._nextVertexIndex;
        this._updateVertexData(vertexIndex, x, y, z, dist);

        this._nextVertexIndex++;

        return vertexIndex;
    }

    private _updateVertexData(vertexIndex: number, x: number, y: number, z: number, dist: number): void {
        const vertexIndexInPositionBuffer = vertexIndex * 3;
        this.positions[vertexIndexInPositionBuffer + 0] = x;
        this.positions[vertexIndexInPositionBuffer + 1] = y;
        this.positions[vertexIndexInPositionBuffer + 2] = z;

        const vertexIndexInDistanceBuffer = vertexIndex * 1;
        this.distances[vertexIndexInDistanceBuffer + 0] = dist;
    }

    private _pushTriangleData(indexA: number, indexB: number, indexC: number): void {
        this._updateTriangleData(this._nextTriangleIndex, indexA, indexB, indexC);
        this._nextTriangleIndex++;
        this.indicesCount = this._nextTriangleIndex * 3;
    }

    private _updateTriangleData(triangleIndex: number, indexA: number, indexB: number, indexC: number): void {
        const triangleIndexInIndicesBuffer = triangleIndex * 3;
        this.indices[triangleIndexInIndicesBuffer + 0] = indexA;
        this.indices[triangleIndexInIndicesBuffer + 1] = indexB;
        this.indices[triangleIndexInIndicesBuffer + 2] = indexC;
    }

    private _createBuffers(size: number) {
        // 3 floats per position x y z
        this.positions = new Float32Array(size * 3);
        // 1 float for the distance
        this.distances = new Float32Array(size * 1);
        // double number of indices for floats
        this.indices = new Uint32Array(size * 3 * 2);
    }

    private _shouldExpand(newPointsCount): boolean {
        const shouldStopAt = this._maxVerticesCount - (this._maxAddedVerticesPerPoint * newPointsCount);

        if (this._nextVertexIndex > shouldStopAt) {
            return true;
        }
        return false;
    }

    private _expandBuffers(): void {
        const oldPositions = this.positions;
        const oldDistances = this.distances;
        const oldIndices = this.indices;

        this._maxVerticesCount = this._maxVerticesCount * PathBufferData._VerticesExpansionRate;
        this._createBuffers(this._maxVerticesCount);

        this.positions.set(oldPositions);
        this.distances.set(oldDistances);
        this.indices.set(oldIndices);
    }

    private _quadraticBezierEquation(t: number, val0: number, val1: number, val2: number): number {
        const result = (1.0 - t) * (1.0 - t) * val0 + 2.0 * t * (1.0 - t) * val1 + t * t * val2;
        return result;
    };
}
