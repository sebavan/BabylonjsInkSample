import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";

import { InkCanvas } from "./inkCanvas";

const debug = false;

// Find our elements
const mainCanvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsDiv = document.getElementById("fps") as HTMLCanvasElement;
const undoBtn = document.getElementById("undo") as HTMLElement;
const redoBtn = document.getElementById("redo") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLElement;
const size1Btn = document.getElementById("size1") as HTMLElement;
const size5Btn = document.getElementById("size5") as HTMLElement;
const size15Btn = document.getElementById("size15") as HTMLElement;
const blackBtn = document.getElementById("black") as HTMLElement;
const whiteBtn = document.getElementById("white") as HTMLElement;
const rainbowBtn = document.getElementById("rainbow") as HTMLElement;

const inkCanvas = new InkCanvas(mainCanvas, "./assets/particle.png", debug);

// Timer Events
setInterval(() => {
    fpsDiv.innerText = "FPS: " + inkCanvas.getFps().toFixed(2);
}, 1000);

// Keyboard events
inkCanvas.onKeyboardObservable.add((e) => {
    if (e.type === KeyboardEventTypes.KEYDOWN) {
        if (e.event.ctrlKey) {
            // Undo
            if (e.event.key === 'z') {
                inkCanvas.undo();
            }
            // Redo
            else if (e.event.key === 'y') {
                inkCanvas.redo();
            }
            // Clear
            else if (e.event.key === 'c') {
                inkCanvas.clear();
            }
            // Debug
            else if (e.event.key === 'i') {
                inkCanvas.toggleDebugLayer();
            }
        }
    }
});

// Pointer events
inkCanvas.onPointerObservable.add((e) => {
    // Create
    if(e.type == PointerEventTypes.POINTERDOWN){
        inkCanvas.startPath();
    }
    // Trace
    else if(e.type == PointerEventTypes.POINTERMOVE){
        inkCanvas.extendPath();
    }
    // Release
    else if(e.type == PointerEventTypes.POINTERUP){
        inkCanvas.endPath();
    }
});

// Buttons Events
undoBtn.onclick = () => {
    inkCanvas.undo();
};
redoBtn.onclick = () => {
    inkCanvas.redo();
};
clearBtn.onclick = () => {
    inkCanvas.clear();
};
size1Btn.onclick = () => {
    inkCanvas.changeSize(1);
};
size5Btn.onclick = () => {
    inkCanvas.changeSize(5);
};
size15Btn.onclick = () => {
    inkCanvas.changeSize(15);
};
blackBtn.onclick = () => {
    inkCanvas.changeColor(Color3.Black());
};
whiteBtn.onclick = () => {
    inkCanvas.changeColor(Color3.White());
};
rainbowBtn.onclick = () => {
    inkCanvas.useRainbow();
};