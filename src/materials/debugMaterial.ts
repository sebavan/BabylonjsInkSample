import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";

import { DebugShaderConfiguration } from "./debugShader";

/**
 * Creates a new instance of a debug material.
 * (A basic wireframe material with rolling over distance to under the setup and topology)
 * @param name defines the name of the material
 * @param scene defines the scene the material belongs to
 * @returns the created material
 */
export function createDebugMaterial(name: string, scene: Scene): ShaderMaterial {
    // We simply use a shader material for this.
    const shaderMaterial = new ShaderMaterial(name, scene, DebugShaderConfiguration, {
        attributes: DebugShaderConfiguration.attributes,
        uniforms: DebugShaderConfiguration.uniformNames
    });

    // In wireframe mode.
    shaderMaterial.wireframe = true;

    return shaderMaterial;
}