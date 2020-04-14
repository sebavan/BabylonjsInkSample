import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

import { SimpleShaderConfiguration } from "./simpleShader";

export function createSimpleMaterial(name: string, scene: Scene, color: Color3): ShaderMaterial {
    const shaderMaterial = new ShaderMaterial(name, scene, SimpleShaderConfiguration, {
        attributes: SimpleShaderConfiguration.attributes,
        uniforms: SimpleShaderConfiguration.uniformNames
    });

    shaderMaterial.setColor3("color", color);

    return shaderMaterial;
}