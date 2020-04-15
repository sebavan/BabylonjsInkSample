
// This shader is used to debug our path data.

const vertexShader = `
// Attributes
attribute vec3 position;
attribute float distance;

// Transform main transform for local space to clip
uniform mat4 worldViewProjection;

// Output
varying float vDistance;

void main(void) {
    // Position
    vec4 p = vec4(position.xyz, 1.);

    vDistance = distance / 1000.;

    gl_Position = worldViewProjection * p;
}`;

const fragmentShader = `
// Inputs from vertex
varying float vDistance;

// Main function
void main(void) {
    vec3 debugColor = vec3(0., cos(vDistance) * 0.5 + 0.5, 1.);
    gl_FragColor = vec4(debugColor, 1.0);
}`;

/**
 * Defines all the data required for our effect
 */
export const DebugShaderConfiguration = {
    name: "Debug",
    fragment: "Debug",
    vertexSource: vertexShader,
    fragmentSource: fragmentShader,
    attributes: ["position", "distance"],
    uniformNames: ["worldViewProjection"],
}