import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { PrecisionDate } from "@babylonjs/core/Misc/precisionDate";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

import { RainbowShaderConfiguration } from "./rainbowShader";

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

const colors = colorLookup.length / 4;

export function getColorAtToRef(distance: number, result: Color4): void {
    distance = distance % 1000;
    distance = distance / 1000;

    distance = distance * (colors - 1);

    const index1 = Math.floor(distance) * 4;
    const index2 = Math.ceil(distance) * 4;

    distance = distance - Math.floor(distance);

    result.r = Scalar.Lerp(colorLookup[index1 + 0], colorLookup[index2 + 0], distance) / 255;
    result.g = Scalar.Lerp(colorLookup[index1 + 1], colorLookup[index2 + 1], distance) / 255;
    result.b = Scalar.Lerp(colorLookup[index1 + 2], colorLookup[index2 + 2], distance) / 255;
}

export function createRainbowMaterial(name: string, scene: Scene): ShaderMaterial {
    const lookup = RawTexture.CreateRGBATexture(colorLookup, 8, 1, scene);
    lookup.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    lookup.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

    const shaderMaterial = new ShaderMaterial(name, scene, RainbowShaderConfiguration, {
        attributes: RainbowShaderConfiguration.attributes,
        uniforms: RainbowShaderConfiguration.uniformNames,
        samplers: RainbowShaderConfiguration.samplerNames
    });

    shaderMaterial.setFloat("offset", 10);
    shaderMaterial.setTexture("rainbowLookup", lookup);
    const screenSize = new Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight());
    shaderMaterial.setVector2("screenSize", screenSize);

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