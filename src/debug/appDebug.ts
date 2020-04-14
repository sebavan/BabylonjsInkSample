import { Scene } from "@babylonjs/core/scene";

// Go big or go...
import "@babylonjs/core/Legacy/legacy";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";

export function toggleDebugMode(scene: Scene): void {
    if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide();
    }
    else {
        scene.debugLayer.show({
            embedMode: true
        });
    }
}