import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";

import { DebugShaderConfiguration } from "./debugShader";

export function createDebugMaterial(name: string, scene: Scene): ShaderMaterial {
    const shaderMaterial = new ShaderMaterial(name, scene, DebugShaderConfiguration, {
        attributes: DebugShaderConfiguration.attributes,
        uniforms: DebugShaderConfiguration.uniformNames
    });

    shaderMaterial.wireframe = true;

    return shaderMaterial;
}