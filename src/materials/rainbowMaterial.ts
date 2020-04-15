import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { PrecisionDate } from "@babylonjs/core/Misc/precisionDate";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

import { RainbowShaderConfiguration } from "./rainbowShader";

/**
 * The Rainbow colors
 */
const colorLookup = new Uint8Array([
    148, 0,   211, 255,
    75,  0,   130, 255,
    0,   0,   255, 255,
    0,   255, 0,   255,
    255, 255, 0,   255,
    255, 187, 0,   255,
    255, 88, 0,   255,
    255, 0,   0,   255,
]);

/**
 * The number of colors in our rainbow
 */
const colorsCount = colorLookup.length / 4;

/**
 * Get the color we find at a certain distance from the begining of the stroke
 * This interpolates as the GPU would do to ensure a matching color scheme
 * @param distance defines the distance from the begining of the stroke we want to know the color for
 * @param result the color we want to update with the result to prevent GC
 */
export function getColorAtToRef(distance: number, result: Color4): void {
    // copied setup from the rainbow shader. (one full color loop on 1000px)
    distance = distance % 1000;
    // go back between 0 and 1
    distance = distance / 1000;

    // let's compute the colors index in the array (the one right before and right after)
    distance = distance * (colorsCount - 1);
    const index1 = Math.floor(distance) * 4;
    const index2 = Math.ceil(distance) * 4;

    // Keep only the floating part to lerp between both color
    distance = distance - Math.floor(distance);

    // Lerp Lerp Lerp
    result.r = Scalar.Lerp(colorLookup[index1 + 0], colorLookup[index2 + 0], distance) / 255;
    result.g = Scalar.Lerp(colorLookup[index1 + 1], colorLookup[index2 + 1], distance) / 255;
    result.b = Scalar.Lerp(colorLookup[index1 + 2], colorLookup[index2 + 2], distance) / 255;
}

/**
 * Creates a new instance of a rainbow material.
 * (this material change colors along the distance attribute in a wrapped way)
 * @param name defines the name of the material
 * @param scene defines the scene the material belongs to
 * @returns the created material
 */
export function createRainbowMaterial(name: string, scene: Scene): ShaderMaterial {
    // Create a lookup texture from the rainbow colors
    const lookup = RawTexture.CreateRGBATexture(colorLookup, 8, 1, scene);
    lookup.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    lookup.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

    // A simple shader material is enought for the rainbow
    const shaderMaterial = new ShaderMaterial(name, scene, RainbowShaderConfiguration, {
        attributes: RainbowShaderConfiguration.attributes,
        uniforms: RainbowShaderConfiguration.uniformNames,
        samplers: RainbowShaderConfiguration.samplerNames
    });

    // Sets our required values for the shader
    const screenSize = new Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight());
    shaderMaterial.setVector2("screenSize", screenSize);
    shaderMaterial.setFloat("offset", 10);
    shaderMaterial.setTexture("rainbowLookup", lookup);

    // On every 6 frames... because it looks ok, update our offset to provide
    // a glittery look
    let debounceShimmerValue = 0;
    scene.onBeforeRenderObservable.add(() => {
        debounceShimmerValue++;
        debounceShimmerValue = debounceShimmerValue % 6;
        if (debounceShimmerValue === 0) {
            const time = PrecisionDate.Now / 10000 % 400;
            shaderMaterial.setFloat("offset", time);
        }
    });

    return shaderMaterial;
}