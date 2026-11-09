<div align="left">
  <p>
    <img src="https://github.com/Moebytes/live2d-renderer/blob/main/assets/live2dlogo.png?raw=true" width="700" />
  </p>
  <p>
    <a href="https://nodei.co/npm/live2d-renderer/"><img src="https://nodei.co/npm/live2d-renderer.png" /></a>
  </p>
</div>

The Live2D Cubism SDK can be complex, and this project aims to do all the heavy lifting for you so you only have to 
worry about loading and interacting with your models. We support loading Live2D Cubism 5 models (which should also be 
backwards compatible with 3 and 4) and rendering them in a WebGL2 canvas.

### Insallation
```ts
npm install live2d-renderer
```

### Useful Links
- [**Demo Site**](https://live2d-renderer.netlify.app/)
- [**Live2D Cubism Web SDK**](https://www.live2d.com/en/sdk/download/web/)

### Live2D Cubism Core

You need to install Live2D Cubism Core, a proprietary library for loading moc3 files. You must point 
the option `cubismCorePath` to a link containing `live2dcubismcore.min.js` (or the unminified version). You can 
download the library [here](https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js).

### Usage

You should import the class `Live2DCubismModel` and initialize it with your own `HTMLCanvasElement`. Also make sure 
that your canvas has a width and height set. From there, call the asynchronous `load` method with a path to either a 
zip containing all the json files and textures, or the path to model3.json (and the other paths will be resolved relative 
to it). To load zip files, make sure you install `jszip` and `magic-bytes.js`.

```ts
import {Live2DCubismModel} from "live2d-renderer"

const loadLive2DModel = async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 500
    canvas.height = 500
    const model = new Live2DCubismModel(canvas, options)
    await model.load("Live2D Model.zip") // Load zip
    await model.load("Live2D Model.model3.json") // Load model3.json
}
```

### Options

By default, the model will begin animating automatically, but you can disable this to control it manually. The 
`Live2DCubismModel` class has all of these optional options.

```ts
export interface Live2DModelOptions {
    // Toggle whether the animation loop will get called automatically.
    autoAnimate?: boolean = true
    // Toggle whether the pointer actions will begin automatically.
    autoInteraction?: boolean = true
    // Toggle whether a motion will be played on tap.
    tapInteraction?: boolean = true
    // Toggle whether you want it to play random motions, or just play the idle animation.
    randomMotion?: boolean = true
    // Resizes the aspect ratio of your canvas to match the model dimensions.
    keepAspect?: boolean = false
    // Link to the Cubism Core Library. It will be appended as a script tag if it isn't already.
    cubismCorePath?: string = "live2dcubismcore.min.js"
    // Whether the animations are currently paused.
    paused?: boolean = false
    // The speed of the animation eg. 0.5 is half as fast.
    speed?: number = 1
    // The starting scale of the model, aka the zoom factor.
    scale?: number = 1
    // The lowest scale/zoom that should be allowed.
    minScale?: number = 0.1
    // The highest scale/zoom that should be allowed.
    maxScale?: number = 10
    // The panning speed eg. 2 is twice as fast.
    panSpeed?: number = 1.5
    // The step used for zooming, should be pretty small like 0.005.
    zoomStep?: number = 0.005
    // Whether zooming in with the mouse wheel should be allowed.
    zoomEnabled?: boolean = true
    // Whether panning by dragging should be allowed.
    enablePan?: boolean = true
    // Reset the zoom/pan on double click.
    doubleClickReset?: boolean = true
    // Set the starting x-position. Note: it's a ratio pixels/canvas.width
    x?: number = 0
    // Set the starting y-position. Note: it's a ratio pixels/canvas.height
    y?: number = 0
    // Check moc consistency when loading the model.
    checkMocConsistency?: boolean = true
    // Whether textures have premultiplied alpha.
    premultipliedAlpha?: boolean = true
    // The smoothing factor of the lip sync.
    lipSyncSmoothing?: number = 0.1
    // Volume of audio (if enabling playback).
    volume?: number = 1
    // You may pass in your own AudioContext
    audioContext?: AudioContext = new AudioContext()
    // The first node the audio is connected to, defaults to GainNode
    connectNode?: AudioNode = audioContext.createGain()
    // Maximum texture size. Must be a power of 2. Defaults to the WebGL max (usually 8192).
    maxTextureSize?: number = 8192
    // Multiply the y-position by the scale
    scaledYPos?: boolean
    // Append value to y-position when centering
    appendYOffset?: number
    // You can toggle various features in the animation loop.
    enablePhysics?: boolean = true
    enableEyeblink?: boolean = true
    enableBreath?: boolean = true
    enableLipsync?: boolean = true
    enableMotion?: boolean = true
    enableExpression?: boolean = true
    enableMovement?: boolean = true
    enablePose?: boolean = true
}
```

### Manual Looping

To loop the model manually, you should disable the animation in the constructor and then provide your 
own animation loop where you call the model's `update` method repeatedly.

```ts
const model = new Live2DCubismModel(canvas, {autoAnimate: false})

const loop = async () => {
    model.update()
    id = window.requestAnimationFrame(loop)
}
loop()
```

### Parameters and Parts

Most of the functions for interacting with parameters and parts are located in the internal model, such as 
`model.model.getParameterValueById()` Additionally, if you change properties on the internal model you should 
call its update method at `model.model.update()`. For your convenience, I moved some common methods up to the 
top level.

```ts
// All parameters, parts, and drawables
const parameters = model.parameters
const parts = model.parts
const drawables = model.drawables

// Get parameter value
model.getParameterValue("ParamAngleX")
// Set parameters
model.setParameter("ParamAngleX", 30)
// Get part opacity
model.getPartOpacity("PartCheek")
// Set part opacity
model.setPartOpacity("PartCheek", 0.5)
```

### Motions and Expressions

You should disable the model animation and handle it manually if you want to play your own 
motions and expressions.

```ts
// Sets a random expression
model.setRandomExpression()
// Sets an expression
model.setExpression("name")

// Plays a random motion
model.startRandomMotion(null, MotionPriority.Normal, startMotionCallback, endMotionCallback)
// Provide a motion group name to randomly play within that group
model.startRandomMotion("Idle", MotionPriority.Normal, startMotionCallback, endMotionCallback)
// Plays any motion
model.startMotion("Group", index, priority, startMotionCallback, endMotionCallback)

// View all motions and expressions
model.motions
model.expressions
```

### Lipsync

Some motions contain their own audio which will sync their lips automatically. You can also 
pass in an audio input to the model (wav/mp3 arraybuffer).

```ts
// Lip sync smoothing factor, 0 would move the lips abruptly.
model.lipsyncSmoothing = 0.1
// Input audio
model.inputAudio(audioArrayBuffer)
```

### Events

```ts
model.on("hit", (hitAreas: string[], x: number, y: number) => {
  console.log("Hit!")
})
```

### Licenses

Live2D Web Framework is licensed under the [Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html) \
Live2D Cubism Core is licensed under the [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)
