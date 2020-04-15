
// This shader is used to simply display a static color at the requested
// position.

const vertexShader = `
// Attributes
attribute vec3 position;

// Transform main transform for local space to clip
uniform mat4 worldViewProjection;

void main(void) {
    // Position
    vec4 p = vec4(position.xyz, 1.);
    gl_Position = worldViewProjection * p;
}`;

const fragmentShader = `
// Inputs
uniform vec3 color;

// Main function
void main(void) {
    gl_FragColor = vec4(color, 1.0);
}`;

/**
 * Defines all the data required for our effect
 */
export const SimpleShaderConfiguration = {
    name: "Simple",
    fragment: "Simple",
    vertexSource: vertexShader,
    fragmentSource: fragmentShader,
    attributes: ["position"],
    uniformNames: ["worldViewProjection", "color"],
}