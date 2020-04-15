import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

import { SimpleShaderConfiguration } from "./simpleShader";

/**
 * Creates a new instance of a simple material.
 * (A basic monochrome material well fitted for lines)
 * @param name defines the name of the material
 * @param scene defines the scene the material belongs to
 * @param color defines the... color of the material
 * @returns the created material
 */
export function createSimpleMaterial(name: string, scene: Scene, color: Color3): ShaderMaterial {
    // We simply use a shader material for this.
    const shaderMaterial = new ShaderMaterial(name, scene, SimpleShaderConfiguration, {
        attributes: SimpleShaderConfiguration.attributes,
        uniforms: SimpleShaderConfiguration.uniformNames
    });

    // Sets the requested color on our shader
    shaderMaterial.setColor3("color", color);

    return shaderMaterial;
}