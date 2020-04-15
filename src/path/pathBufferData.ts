// Import our Shader Config
import { Vector2 } from "@babylonjs/core/Maths/math.vector";

/**
 * Defines the set of options available to create path buffer data
 */
export interface PathBufferDataOptions {
    /**
     * Defines what is the min distance between 2 added points
     * to start smoothing.
     */
    smoothingDistance: number;
    /**
     * Defines the end caps roundness (how many subdivs the points would have).
     */
    roundness: number;
    /**
     * Defines the radius of the path.
     */
    radius: number;
    /**
     * Defines how many added points do we debounce.
     * (can be a great help while debugging to simulate slowing down pointer events)
     */
    debounce: number;
}

/**
 * Defines the set of data changed while adding data
 */
export interface PathBufferDataChanges {
    /**
     * Defines the minimum index that changes during the path changes
     */
    indexStart: number;
    /**
     * Defines the maximum index that changes during the path changes
     */
    indexEnd: number;
    /**
     * Defines the minimum position that changes during the path changes
     */
    vertexPositionStart: number;
    /**
     * Defines the maximum position that changes during the path changes
     */
    vertexPositionEnd: number;
    /**
     * Defines the minimum distance that changes during the path changes
     */
    vertexDistanceStart: number;
    /**
     * Defines the maximum distance that changes during the path changes
     */
    vertexDistanceEnd: number;
}

/**
 * The default options setup
 */
const DefaultOptions: PathBufferDataOptions = {
    smoothingDistance: 20,
    roundness: 16,
    radius: 5,
    debounce: 1,
}

/**
 * This class helps creating a mesh according to a list of points being
 * added to it.
 * 
 * It will expose all the required buffer data to be wrappable in any gl contexts.
 * 
 * It will try to limit GC and over allocation.
 */
export class PathBufferData {

    private static readonly _VerticesStartSize = 10000;
    private static readonly _VerticesExpansionRate = 2;

    /**
     * The positions vertex buffer raw data as float (vec3)
     */
    public positions: Float32Array;
    /**
     * The distances vertex buffer raw data as float (float)
     */
    public distances: Float32Array;
    /**
     * The indices buffer raw data as UInt32 (TRIANGLE)
     */
    public indices: Uint32Array;
    /**
     * The number of meaningfull data in the indices buffer (to help drawing only
     * the relevant information as the buffers might be bigger)
     */
    public indicesCount: number;

    private readonly _options: PathBufferDataOptions;
    private readonly _smoothingDistance: number;
    private readonly _roundness: number;
    private readonly _radius: number;
    private readonly _debounce: number;
    private readonly _roundnessSliceAlpha: number;
    private readonly _maxAddedVerticesPerPoint: number;
    private readonly _currentChanges: PathBufferDataChanges;

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
    private _previous_length = 0;
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
    private _smoothing_previousPoint = new Vector2();
    private _smoothing_newPoint = new Vector2();
    private _smoothing_temp = new Vector2();

    /**
     * Creates a new instance of the path buffer data.
     * @param options defines the various options impacting how we generate the path
     */
    constructor(options: Partial<PathBufferDataOptions> = DefaultOptions) {
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
        this._currentChanges = {
            indexStart: 0,
            indexEnd: 0,
            vertexPositionStart: 0,
            vertexPositionEnd: 0,
            vertexDistanceStart: 0,
            vertexDistanceEnd: 0,
        }
    }

    /**
     * Get the total length of the path (accumulated distance between each points)
     */
    public get totalLength(): number {
        return this._previous_length;
    }

    /**
     * Adds a new point to the path.
     * @param x defines the x coordinates of the path
     * @param y defines the x coordinates of the path
     */
    public addPointToPath(x: number, y: number): PathBufferDataChanges {
        // Reset the changes
        this._currentChanges.indexStart = Number.MAX_VALUE;
        this._currentChanges.indexEnd = 0;
        this._currentChanges.vertexPositionStart = Number.MAX_VALUE;
        this._currentChanges.vertexPositionEnd = 0;
        this._currentChanges.vertexDistanceStart = Number.MAX_VALUE;
        this._currentChanges.vertexDistanceEnd = 0;

        const pointsLength = this._points.length;
        if (pointsLength === 0) {
            // The first point is directly added
            this._addPoint(x, y);
        }
        // The subsequent ones needs to be different
        else if (this._previousPoint.x !== x || this._previousPoint.y !== y) {

            // Also we debounce our inputs here for debug purpose
            this._currentDebounce++;
            this._currentDebounce = this._currentDebounce % this._debounce;
            if (this._currentDebounce !== 0) {
                return this._currentChanges;
            }

            // We compute the distance from the previous point
            this._currentPoint.set(x, y);
            this._currentPoint.subtractInPlace(this._previousPoint);
            const dist = this._currentPoint.length();

            // Only if we are superior to half the radius
            if (dist > this._radius / 2) {
                if (pointsLength <= 2) {
                    // Under 2 points we can not smooth the lines.
                    this._addMidPoint(x, y);
                }
                else {
                    // As soon as we have at least 2 previous points we can start smoothing
                    this._addPointsSmoothly(x, y);
                }
            }
        }

        this._points.push(x, y);
        return this._currentChanges;
    }

//_______________ SMOOTHING ______________

    private _addMidPoint(x: number, y: number): void {
        const length = this._points.length;

        // Compute the Mid Point between our last inputs and the new one
        const x1 = this._points[length - 2];
        const y1 = this._points[length - 1];
        this._smoothing_previousPoint.set(x1, y1);
        this._smoothing_newPoint.set(x, y);
        this._smoothing_newPoint.subtractToRef(this._smoothing_previousPoint, this._smoothing_temp);
        this._smoothing_temp.scaleInPlace(0.5);

        // Temp now holds the half vector (previous -> current)
        // We add back to the previous point
        this._smoothing_temp.addInPlace(this._smoothing_previousPoint);

        // To find our mid point
        const midPointX = this._smoothing_temp.x;
        const midPointY = this._smoothing_temp.y;

        // Which is the one we visually add
        this._addPoint(midPointX, midPointY);
    }

    private _addPointsSmoothly(x: number, y: number): void {
        const length = this._points.length;

        // Compute the Mid Point between our last inputs and the new one
        const x1 = this._points[length - 2];
        const y1 = this._points[length - 1];
        this._smoothing_previousPoint.set(x1, y1);
        this._smoothing_newPoint.set(x, y);
        this._smoothing_newPoint.subtractToRef(this._smoothing_previousPoint, this._smoothing_temp);
        // We extract the distance the pointer did since the previous addition
        const distanceFromPreviousPoint = this._smoothing_temp.length();
        this._smoothing_temp.scaleInPlace(0.5);

        // Temp now holds the half vector (previous -> current)
        // We add back to the previous point
        this._smoothing_temp.addInPlace(this._smoothing_previousPoint);

        // To find our mid point
        const midPointX = this._smoothing_temp.x;
        const midPointY = this._smoothing_temp.y;

        // We compute how many steps we should introduce depending on our
        // smoothing distance.
        // An angle would be more relevant than a distance here but it looks ok so...
        const steps = Math.ceil(distanceFromPreviousPoint / this._smoothingDistance);
        if (steps > 1) {
            const previousX = this._previousPoint.x;
            const previousY = this._previousPoint.y;
            for (let step = 1; step < steps; step++) {
                const howFar = step / steps;
                const smoothX = this._quadraticBezierEquation(howFar, previousX, x1, midPointX);
                const smoothY = this._quadraticBezierEquation(howFar, previousY, y1, midPointY);

                // We use a quadratic bezier between the previous point and the new coordinates
                // with a control points being the mid vector
                this._addPoint(smoothX, smoothY);
            }
        }

        // Finally we record the point
        this._addPoint(midPointX, midPointY);
    }

//_______________ SMOOTHING END _____________
//_______________   GEOMETRY   ______________

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
        const totalDistance = this._previous_length + currentSegmentDistance;
        const p1Index = this._pushVertexData(this._p1.x, this._p1.y, 0, this._previous_length);
        const p2Index = this._pushVertexData(this._p2.x, this._p2.y, 0, totalDistance);
        const p3Index = this._pushVertexData(this._p3.x, this._p3.y, 0, totalDistance);
        const p4Index = this._pushVertexData(this._p4.x, this._p4.y, 0, this._previous_length);

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
            const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_length);

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
        this._previous_length = totalDistance;

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

        const totalDistance = this._previous_length + currentSegmentDistance;
        const p1Index = this._pushVertexData(this._p1.x, this._p1.y, 0, this._previous_length);
        const p2Index = this._pushVertexData(this._p2.x, this._p2.y, 0, totalDistance);
        const p3Index = this._pushVertexData(this._p3.x, this._p3.y, 0, totalDistance);
        const p4Index = this._pushVertexData(this._p4.x, this._p4.y, 0, this._previous_length);

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
                    const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_length);
                    if (i == 1) {
                        this._pushTriangleData(previousCenterIndex, contourIndex, p4Index);
                    }
                    else {
                        this._pushTriangleData(previousCenterIndex, contourIndex, contourIndex - 1);
                    }
                }
            }
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
                const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_length);

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
                const contourIndex = this._pushVertexData(xSlice, ySlice, 0, this._previous_length);
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
        this._previous_length = totalDistance;

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
        this._currentChanges.vertexPositionStart = Math.min(this._currentChanges.vertexPositionStart, vertexIndexInPositionBuffer);
        this._currentChanges.vertexPositionEnd = Math.max(this._currentChanges.vertexPositionEnd, vertexIndexInPositionBuffer);

        const vertexIndexInDistanceBuffer = vertexIndex * 1;
        this.distances[vertexIndexInDistanceBuffer + 0] = dist;
        this._currentChanges.vertexDistanceStart = Math.min(this._currentChanges.vertexDistanceStart, vertexIndexInDistanceBuffer);
        this._currentChanges.vertexDistanceEnd = Math.max(this._currentChanges.vertexDistanceEnd, vertexIndexInDistanceBuffer);
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
        this._currentChanges.indexStart = Math.min(this._currentChanges.indexStart, triangleIndexInIndicesBuffer);
        this._currentChanges.indexEnd = Math.max(this._currentChanges.indexEnd, triangleIndexInIndicesBuffer);
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
