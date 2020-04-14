
// This shader is used to simulate a rainbow effect along a path.
// Fake particles should simmer over time.

const vertexShader = `
// Attributes
attribute vec3 position;
attribute float distance;

// Transform main transform for local space to clip
uniform mat4 worldViewProjection;

// Output
varying vec3 vPosition;
varying float vDistance;

void main(void) {
    // Position
    vec4 p = vec4(position.xyz, 1.);

    vPosition = position.xyz;
    vDistance = distance / 1000.;

    gl_Position = worldViewProjection * p;
}`;

const fragmentShader = `
// Inputs from vertex
varying vec3 vPosition;
varying float vDistance;

// Rainbow Color Lookup
uniform sampler2D rainbowLookup;

// Screen Size
uniform vec2 screenSize;

// Time offset
uniform float offset;

// Helper functions
float getRand(vec2 seed) {
    return fract(sin(dot(seed.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
float dither(vec2 seed, float varianceAmount) {
    float rand = getRand(seed);
    float value = mix(-varianceAmount/255.0, varianceAmount/255.0, rand);

    return value;
}

// Main function
void main(void) {
    vec2 halfScreen = screenSize / 2.;
    float staticGlitters = dither((vPosition.xy + halfScreen) / (screenSize + halfScreen), 230.);
    staticGlitters = clamp(staticGlitters, 0.0, 1.0);

    vec2 xyOffset = vec2(offset, offset);
    float dynamicGlitters = dither((vPosition.xy + xyOffset) / (screenSize + xyOffset), 200.);
    dynamicGlitters = clamp(dynamicGlitters, -0.2, 1.0);

    float totalGlitters = mix(staticGlitters, dynamicGlitters, 0.3);

    vec3 rainbowColor = texture2D(rainbowLookup, vec2(vDistance, 0.5)).rgb;
    vec3 finalColor = rainbowColor + totalGlitters;

    gl_FragColor = vec4(finalColor, 1.0);
}`;

/**
 * Defines all the data required for our effect
 */
export const RainbowShaderConfiguration = {
    name: "Rainbow",
    fragment: "Rainbow",
    vertexSource: vertexShader,
    fragmentSource: fragmentShader,
    attributes: ["position", "distance"],
    uniformNames: ["worldViewProjection", "screenSize", "offset"],
    samplerNames: ["rainbowLookup"],
}