import {CubismModelSettingJson} from "../framework/src/cubismmodelsettingjson"
import {CubismDefaultParameterId} from "../framework/src/cubismdefaultparameterid"
import {ICubismModelSetting} from "../framework/src/icubismmodelsetting"
import {ACubismMotion, FinishedMotionCallback, BeganMotionCallback} from "../framework/src/motion/acubismmotion"
import {CubismEyeBlink} from "../framework/src/effect/cubismeyeblink"
import {CubismIdHandle} from "../framework/src/id/cubismid"
import {CubismBreath, BreathParameterData} from "../framework/src/effect/cubismbreath"
import {CubismMotionQueueManager, CubismMotionQueueEntryHandle} from "../framework/src/motion/cubismmotionqueuemanager"
import {CubismFramework} from "../framework/src/live2dcubismframework"
import {CubismViewMatrix} from "../framework/src/math/cubismviewmatrix"
import {CubismMatrix44} from "../framework/src/math/cubismmatrix44"
import {CubismMoc} from "../framework/src/model/cubismmoc"
import {Live2DCubismUserModel} from "./Live2DCubismUserModel"
import {WavFileController} from "./WavFileController"
import {TouchController} from "./TouchController"
import {MotionController} from "./MotionController"
import {ExpressionController} from "./ExpressionController"
import {CameraController} from "./CameraController"
import {WebGLRenderer} from "./WebGLRenderer"
import {Live2DModelOptions, Live2DBuffers, CubismCDI3Json, VTubeStudioJson, EventMap} from "./types"
import type fileTypeFn from "magic-bytes.js"
import type JSZip from "jszip"
import path from "path"

let id = null

export const isLive2DZip = async (arrayBuffer: ArrayBuffer) => {
    let fileType: typeof fileTypeFn
    let JSZip: JSZip
    try {
        fileType = await import("magic-bytes.js").then((r) => r.default)
        JSZip = await import("jszip").then((r) => r.default)
    } catch {
        return Promise.reject("jszip and magic-bytes.js required")
    }

    let isZip = false
    const result = fileType(new Uint8Array(arrayBuffer))?.[0] || {mime: ""}
    if (result.mime === "application/zip") isZip = true
    if (!isZip) return false
    
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    let hasModel = false
    let hasMoc3 = false
    let hasTexture = false

    for (const [relativePath, file] of Object.entries(zip.files)) {
        if (relativePath.startsWith("__MACOSX") || file.dir) continue
        if (relativePath.endsWith('model3.json')) hasModel = true
        if (relativePath.endsWith("moc3")) hasMoc3 = true
        if (relativePath.match(/\.(png|jpg|webp|avif)$/)) hasTexture = true
    }
    
    return hasModel && hasMoc3 && hasTexture
}

export const compressLive2DTextures = async (arrayBuffer: ArrayBuffer, maxSize = 8192, quality = 0.8, format = "webp") => {
    let fileType: typeof fileTypeFn
    let JSZip: JSZip
    try {
        fileType = await import("magic-bytes.js").then((r) => r.default)
        JSZip = await import("jszip").then((r) => r.default)
    } catch {
        return Promise.reject("jszip and magic-bytes.js required")
    }

    const result = fileType(new Uint8Array(arrayBuffer))?.[0] || {mime: ""}
    if (result.mime !== "application/zip") return arrayBuffer
    
    const zip = await JSZip.loadAsync(arrayBuffer)
    const newZip = new JSZip()

    for (const [relativePath, file] of Object.entries(zip.files)) {
        if (relativePath.startsWith("__MACOSX") || file.dir) continue

        if (relativePath.endsWith("model3.json")) {
            const json = JSON.parse(await file.async("string"))
            for (let i = 0; i < json.FileReferences.Textures?.length; i++) {
                const texture = json.FileReferences.Textures[i]
                json.FileReferences.Textures[i] = texture.replace(/\.(png|jpg|webp|avif)$/, `.${format}`)
            }
            newZip.file(relativePath, JSON.stringify(json, null, 4))
        } else if (relativePath.match(/\.(png|jpg|webp|avif)$/)) {
            const blob = await file.async("blob")
            const image = await createImageBitmap(blob)

            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (image.width > maxSize || image.height > maxSize) {
                const aspectRatio = image.width / image.height
                if (image.width > image.height) {
                    canvas.width = maxSize
                    canvas.height = maxSize / aspectRatio
                } else {
                    canvas.height = maxSize
                    canvas.width = maxSize * aspectRatio
                }
            } else {
                canvas.width = image.width
                canvas.height = image.height
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

            const newBlob = await new Promise<Blob>(resolve => canvas.toBlob(resolve, `image/${format}`, quality))
            newZip.file(relativePath.replace(/\.(png|jpg|webp|avif)$/, `.${format}`), newBlob)
        } else {
            newZip.file(relativePath, await file.async("arraybuffer"))
        }
    }
    const newBuffer = await newZip.generateAsync({type: "arraybuffer"})
    return newBuffer
}

export class Live2DCubismModel extends Live2DCubismUserModel {
    private events: {[event: string]: Function[]} = {}
    private _paused: boolean
    public buffers: Live2DBuffers
    public motions: Map<string, ACubismMotion>
    public expressions: Map<string, ACubismMotion>
    public expressionIds: string[]
    public motionIds: string[]
    public textures: Array<WebGLTexture>
    public eyeBlinkIds: Array<CubismIdHandle>
    public lipSyncIds: Array<CubismIdHandle>
    public settings: ICubismModelSetting
    public vtubeSettings: VTubeStudioJson
    public displayInfo: CubismCDI3Json
    public viewMatrix: CubismViewMatrix
    public projection: CubismMatrix44
    public deviceToScreen: CubismMatrix44
    public canvas: HTMLCanvasElement
    public deltaTime: DOMHighResTimeStamp
    public currentFrame: DOMHighResTimeStamp
    public lastFrame: DOMHighResTimeStamp
    public queueManager: CubismMotionQueueManager
    public premultipliedAlpha: boolean
    public cubismCorePath: string
    public autoAnimate: boolean
    public autoInteraction: boolean
    public tapInteraction: boolean
    public randomMotion: boolean
    public keepAspect: boolean
    public speed: number
    public logicalLeft: number
    public logicalRight: number
    public logicalBottom: number
    public logicalTop: number
    public audioContext: AudioContext
    public connectNode: AudioNode | null
    public wavController: WavFileController
    public touchController: TouchController
    public motionController: MotionController
    public expressionController: ExpressionController
    public cameraController: CameraController
    public webGLRenderer: WebGLRenderer
    public enablePhysics: boolean
    public enableEyeblink: boolean
    public enableBreath: boolean
    public enableLipsync: boolean
    public enableMotion: boolean
    public enableExpression: boolean
    public enableMovement: boolean
    public enablePose: boolean
    public size: number
    public maxTextureSize: number
    public scaledYPos: boolean
    public appendYOffset: number
    public totalMotionCount: number = 0
    public needsResize: boolean = false
    public loaded: boolean = false
    public cubismLoaded: boolean = false

    public on<K extends keyof EventMap>(event: K, listener: EventMap[K]) {
        if (!this.events[event]) {
            this.events[event] = []
        }
        this.events[event].push(listener)
    }

    public emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(...args))
        }
    }

    public off<K extends keyof EventMap>(event: K, listener: EventMap[K]) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(l => l !== listener)
        }
    }

    get zoomEnabled() {
        return this.cameraController.zoomEnabled
    }

    set zoomEnabled(zoomEnabled) {
        this.cameraController.zoomEnabled = zoomEnabled
    }

    get minScale() {
        return this.cameraController.minScale
    }

    set minScale(minScale) {
        this.cameraController.minScale = minScale
    }

    get maxScale() {
        return this.cameraController.maxScale
    }

    set maxScale(maxScale) {
        this.cameraController.maxScale = maxScale
    }

    get panSpeed() {
        return this.cameraController.panSpeed
    }

    set panSpeed(panSpeed) {
        this.cameraController.panSpeed = panSpeed
    }

    get zoomStep() {
        return this.cameraController.zoomStep
    }

    set zoomStep(zoomStep) {
        this.cameraController.zoomStep = zoomStep
    }

    get scale() {
        return this.cameraController.scale
    }

    set scale(scale) {
        this.cameraController.scale = scale
    }

    get x() {
        return this.cameraController.x
    }
    
    set x(x) {
        this.cameraController.x = x
    }
    
    get y() {
        return this.cameraController.y
    }
    
    set y(y) {
        this.cameraController.y = y
    }    

    get lipsyncSmoothing() {
        return this.wavController.smoothingFactor
    }

    set lipsyncSmoothing(lipsyncSmoothing) {
        this.wavController.smoothingFactor = lipsyncSmoothing
    }

    get volume() {
        return this.wavController.volumeNode.gain.value
    }

    set volume(volume) {
        this.wavController.volumeNode.gain.value = volume
    }

    get doubleClickReset() {
        return this.cameraController.doubleClickReset
    }

    set doubleClickReset(doubleClickReset) {
        this.cameraController.doubleClickReset = doubleClickReset
    }

    get paused() {
        return this._paused
    }

    set paused(paused) {
        if (paused) this.stopMotions()
        this._paused = paused
    }

    public constructor(canvas: HTMLCanvasElement, options?: Live2DModelOptions) {
        if (!options) options = {}
        super()
        this.canvas = canvas
        this.motions = new Map<string, ACubismMotion>()
        this.expressions = new Map<string, ACubismMotion>()
        this.expressionIds = []
        this.motionIds = []
        this.textures = new Array<WebGLTexture>()
        this.eyeBlinkIds = new Array<CubismIdHandle>()
        this.lipSyncIds = new Array<CubismIdHandle>()
        this.viewMatrix = new CubismViewMatrix()
        this.projection = new CubismMatrix44()
        this.deviceToScreen = new CubismMatrix44()
        this.queueManager = new CubismMotionQueueManager()
        this.cubismCorePath = options.cubismCorePath ?? "/live2dcubismcore.min.js"
        this.mocConsistency = options.checkMocConsistency ?? true
        this.premultipliedAlpha = options.premultipliedAlpha ?? true
        this.autoAnimate = options.autoAnimate ?? true
        this.autoInteraction = options.autoInteraction ?? true
        this.tapInteraction = options.tapInteraction ?? true
        this.keepAspect = options.keepAspect ?? false
        this.randomMotion = options.randomMotion ?? true
        this._paused = options.paused ?? false
        this.speed = options.speed ?? 1
        this.audioContext = options.audioContext ?? new AudioContext()
        this.scaledYPos = options.scaledYPos ?? false
        this.appendYOffset = options.appendYOffset ?? 0
        if (options.maxTextureSize) this.maxTextureSize = options.maxTextureSize
        if (options.connectNode) this.connectNode = options.connectNode
        this.wavController = new WavFileController(this)
        this.touchController = new TouchController(this)
        this.motionController = new MotionController(this)
        this.expressionController = new ExpressionController(this)
        this.cameraController = new CameraController(this)
        this.webGLRenderer = new WebGLRenderer(this)
        this.cameraController.zoomEnabled = options.zoomEnabled ?? true
        this.cameraController.enablePan = options.enablePan ?? true
        this.cameraController.doubleClickReset = options.doubleClickReset ?? true
        this.cameraController.minScale = options.minScale ?? 0.1
        this.cameraController.maxScale = options.maxScale ?? 10
        this.cameraController.panSpeed = options.panSpeed ?? 1
        this.cameraController.zoomStep = options.zoomStep ?? 0.005
        this.cameraController.scale = options.scale ?? 1
        this.cameraController.x = options.x ?? this.canvas.width / 2
        this.cameraController.y = options.y ?? 0
        this.wavController.smoothingFactor = options.lipsyncSmoothing ?? 0.1
        this.wavController.volumeNode.gain.value = options.volume ?? 1
        this.enablePhysics = options.enablePhysics ?? true
        this.enableBreath = options.enableBreath ?? true
        this.enableEyeblink = options.enableEyeblink ?? true
        this.enableLipsync = options.enableLipsync ?? true
        this.enableMotion = options.enableMotion ?? true
        this.enableExpression = options.enableExpression ?? true
        this.enableMovement = options.enableMovement ?? true
        this.enablePose = options.enablePose ?? true
        this.updateTime()
    }

    public destroy = (destroyCubism = false) => {
        cancelAnimationFrame(id)
        this.motions.clear()
        this.expressions.clear()
        this.eyeBlinkIds.length = 0
        this.lipSyncIds.length = 0
        this.webGLRenderer.deleteTextures()
        this.webGLRenderer.deleteShader()
        this.touchController.cancelInteractions()
        this.cameraController.removeListeners()
        this.expressionIds = []
        this.motionIds = []
        Object.keys(this.events).forEach(event => {
            this.events[event] = []
        })
        if (this.buffers) {
            this.buffers.modelBuffer = null
            this.buffers.expressionBuffers = []
            this.buffers.physicsBuffer = null
            this.buffers.poseBuffer = null
            this.buffers.userDataBuffer = null
            this.buffers.motionGroups = []
            this.buffers.textureImages = []
        }
        this.buffers = null
        this.loaded = false
        this.cubismLoaded = false
        this.model.release()
        if (destroyCubism) CubismFramework.dispose()
    }

    public loadCubismCore = async () => {
        await new Promise<void>(async (resolve, reject) => {
            if (document.querySelector(`script[src="${this.cubismCorePath}"]`)) {
                return resolve()
            }
            const script = document.createElement("script")
            script.src = this.cubismCorePath
            document.body.appendChild(script)
            script.onload = () => resolve()
            script.onerror = (err) => reject(err)
        })
    }

    public loadFramework = async () => {
        CubismFramework.startUp({logFunction: (msg: string) => console.log(msg), loggingLevel: 5})
        CubismFramework.initialize()
    }

    public initializeCubism = async () => {
        await this.loadCubismCore().catch(() => null)
        await this.loadFramework().catch(() => null)
        this.cubismLoaded = true
    }

    public loadBuffers = async (link: string | ArrayBuffer) => {
        let fileType: typeof fileTypeFn
        let JSZip: JSZip
        try {
            fileType = await import("magic-bytes.js").then((r) => r.default)
            JSZip = await import("jszip").then((r) => r.default)
        } catch {
            fileType = null
            JSZip = null
        }

        let isZip = false
        let arrayBuffer = link instanceof ArrayBuffer ? link : new ArrayBuffer(0)
        if (typeof link === "string") {
            isZip = path.extname(link).replace(".", "") === "zip"
            arrayBuffer = await fetch(link).then(r => r.arrayBuffer()).catch(() => new ArrayBuffer(0))
        }
        if (!arrayBuffer.byteLength) return Promise.reject(`Failed to load ${link}`)

        if (fileType) {
            const result = fileType(new Uint8Array(arrayBuffer))?.[0] || {mime: ""}
            if (result.mime === "application/zip") isZip = true
        }

        let files = {} as {[key: string]: ArrayBuffer}
        let basename = link instanceof ArrayBuffer ? "." : path.dirname(link)
    
        if (isZip && JSZip) {
            const zip = await JSZip.loadAsync(arrayBuffer)
            this.size = arrayBuffer.byteLength
    
            for (const [relativePath, file] of Object.entries(zip.files)) {
                if (relativePath.startsWith("__MACOSX") || file.dir) continue
                const key = relativePath.split("/").slice(1).join("/")
                const contents = await file.async("arraybuffer")
                files[key] = contents
                if (!this.settings && key.endsWith("model3.json")) this.settings = new CubismModelSettingJson(contents, contents.byteLength)
                if (!this.vtubeSettings && key.endsWith("vtube.json")) this.vtubeSettings = JSON.parse(await file.async("string"))
                if (!this.displayInfo && key.endsWith("cdi3.json")) this.displayInfo = JSON.parse(await file.async("string"))
            }
        } else {
            this.settings = new CubismModelSettingJson(arrayBuffer, arrayBuffer.byteLength)
        }
    
        const getBuffer = async (filename: string) => {
            if (isZip) {
                let name = filename.startsWith(".") ? filename.split("/").slice(2).join("/") : filename
                let buffer = null as ArrayBuffer | null
                for (const [key, value] of Object.entries(files)) {
                    if (key.includes(name)) {
                        buffer = value
                        break
                    }
                }
                if (!buffer?.byteLength) return Promise.reject(`Failed to load ${name}`)
                return buffer
            } else {
                const filePath = path.join(basename, filename)
                const buffer = await fetch(filePath).then(r => r.arrayBuffer()).catch(() => new ArrayBuffer(0))
                if (!buffer.byteLength) return Promise.reject(`Failed to load ${filePath}`)
                return buffer
            }
        }
    
        const getBufferOptional = async (getFilenameFn: Function) => {
            try {
                const filename = getFilenameFn()
                return filename ? await getBuffer(filename) : null
            } catch {
                return null
            }
        }
    
        const getBufferArray = async (count: number, getFilenameFn: Function) => {
            const buffers = [] as ArrayBuffer[]
            for (let i = 0; i < count; i++) {
                buffers.push(await getBuffer(getFilenameFn(i)))
            }
            return buffers
        }
    
        const modelBuffer = await getBuffer(this.settings.getModelFileName())
        this.size = modelBuffer.byteLength
    
        const physicsBuffer = await getBufferOptional(() => this.settings.getPhysicsFileName())
        const poseBuffer = await getBufferOptional(() => this.settings.getPoseFileName())
        const userDataBuffer = await getBufferOptional(() => this.settings.getUserDataFile())

        const expressionBuffers = []
        if (this.settings.getExpressionCount()) {
            expressionBuffers.push(...await getBufferArray(this.settings.getExpressionCount(), (i: number) => this.settings.getExpressionFileName(i)))
            this.expressionIds = Array.from({length: this.settings.getExpressionCount()}).map((_, i) => this.settings.getExpressionFileName(i))
        } else if (this.vtubeSettings) {
            this.expressionIds = this.vtubeSettings.Hotkeys.filter((h: any) => h.Action === "ToggleExpression").map((e: any) => e.File)
            expressionBuffers.push(...await getBufferArray(this.expressionIds.length, (i: number) => this.expressionIds[i]))
        }
    
        const motionGroups = []
        if (this.settings.getMotionGroupCount()) {
            for (let i = 0; i < this.settings.getMotionGroupCount(); i++) {
                const group = this.settings.getMotionGroupName(i)
                const motionBuffers = await getBufferArray(this.settings.getMotionCount(group), (i: number) => this.settings.getMotionFileName(group, i))
                const wavBuffer = await getBufferOptional(() => this.settings.getMotionSoundFileName(group, i))
                motionGroups.push({group, motionData: {motionBuffers, wavBuffer}})
                this.motionIds.push(...Array.from({length: this.settings.getMotionCount(group)}).map((_, i) => `${group}_${i}`))
            }
        } else if (this.vtubeSettings) {
            const motions = [this.vtubeSettings.FileReferences.IdleAnimation]
            motions.push(...this.vtubeSettings.Hotkeys.filter((h) => h.Action === "TriggerAnimation").map((e) => e.File))
            for (let i = 0; i < motions.length; i++) {
                const buffer = await getBuffer(motions[i])
                motionGroups.push({group: motions[i], motionData: {motionBuffers: [buffer], wavBuffer: null}})
                this.motionIds.push(`${motions[i]}_0`)
            }
        }
    
        const textureImages = []
        for (let i = 0; i < this.settings.getTextureCount(); i++) {
            const filename = this.settings.getTextureFileName(i)
            const buffer = await getBuffer(filename)
            const blob = new Blob([buffer])
            const url = URL.createObjectURL(blob)
            const img = new Image()
            img.src = url
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve()
                img.onerror = (err) => reject(err)
            })
            URL.revokeObjectURL(url)
            textureImages.push(img)
        }
    
        this.buffers = {modelBuffer, expressionBuffers, physicsBuffer, poseBuffer, userDataBuffer, motionGroups, textureImages}
        return this.buffers
    }

    public load = async (link: string | ArrayBuffer) => {
        if (!this.cubismLoaded) await this.initializeCubism()
        const {modelBuffer, physicsBuffer, poseBuffer, userDataBuffer} = await this.loadBuffers(link)

        this.touchController.initInteractions()
        this.cameraController.initListeners()

        this.loadModel(modelBuffer, this._mocConsistency)
        this.initialize()

        await this.expressionController.load()

        if (physicsBuffer) {
            this.loadPhysics(physicsBuffer, physicsBuffer.byteLength)
        }

        if (poseBuffer) {
            this.loadPose(poseBuffer, poseBuffer.byteLength)
        }

        if (this.settings.getEyeBlinkParameterCount() > 0) {
            this.eyeBlink = CubismEyeBlink.create(this.settings)
        }

        this.breath = CubismBreath.create()
        const breathParameters = new Array<BreathParameterData>()

        const manager = CubismFramework?.getIdManager?.()
        const paramAngleX = manager?.getId(CubismDefaultParameterId.ParamAngleX)
        const paramAngleY = manager?.getId(CubismDefaultParameterId.ParamAngleY)
        const paramAngleZ = manager?.getId(CubismDefaultParameterId.ParamAngleZ)
        const paramBodyAngleX = manager?.getId(CubismDefaultParameterId.ParamBodyAngleX)
        const paramBreath = manager?.getId(CubismDefaultParameterId.ParamBreath)
        if (paramAngleX) breathParameters.push(new BreathParameterData(paramAngleX, 0.0, 15.0, 6.5345, 0.5))
        if (paramAngleY) breathParameters.push(new BreathParameterData(paramAngleY, 0.0, 8.0, 3.5345, 0.5))
        if (paramAngleZ) breathParameters.push(new BreathParameterData(paramAngleZ, 0.0, 10.0, 5.5345, 0.5))
        if (paramBodyAngleX) breathParameters.push(new BreathParameterData(paramBodyAngleX, 0.0, 4.0, 15.5345, 0.5))
        if (paramBreath) breathParameters.push(new BreathParameterData(paramBreath, 0.5, 0.5, 3.2345, 1))
        this.breath.setParameters(breathParameters)

        if (userDataBuffer) {
            this.loadUserData(userDataBuffer, userDataBuffer.byteLength)
        }

        const eyeBlinkCount = this.settings.getEyeBlinkParameterCount() 
        for (let i = 0; i < eyeBlinkCount; ++i) {
            this.eyeBlinkIds.push(this.settings.getEyeBlinkParameterId(i))
        }

        const lipSyncCount = this.settings.getLipSyncParameterCount()
        for (let i = 0; i < lipSyncCount; ++i) {
            this.lipSyncIds.push(this.settings.getLipSyncParameterId(i))
        }
        if (!lipSyncCount) {
            const index = this.parameters.ids.indexOf("ParamMouthOpenY")
            if (index !== -1) this.lipSyncIds.push(this.model.getParameterId(index))
            this.lipsync = Boolean(this.lipSyncIds.length)
        }

        const layout = new Map<string, number>()
        this.settings.getLayoutMap(layout)
        this.modelMatrix.setupFromLayout(layout)

        await this.motionController.load()

        this.createRenderer(this.canvas.width, this.canvas.height)
        await this.loadTextures()
        this.loaded = true
        this.webGLRenderer.start()
        this.resize()
        this.animationLoop()
        this.centerModel()
    }

    public loadTextures = async () => {
        const {textureImages} = this.buffers

        for (let i = 0; i < textureImages.length; i++) {
            const img = textureImages[i]
            this.webGLRenderer.loadTexture(i, img)
        }
    }

    public resize = () => {
        if (this.keepAspect) {
            const ratio = this.width / this.height
            if (this.canvas.width / this.canvas.height >= ratio) {
                this.canvas.height = this.canvas.height
                this.canvas.width = this.canvas.height * ratio
            } else {
                this.canvas.width = this.canvas.width
                this.canvas.height = this.canvas.width / ratio
            }
        } else {
            this.canvas.width = this.canvas.clientWidth ? this.canvas.clientWidth : this.canvas.width
            this.canvas.height = this.canvas.clientHeight ? this.canvas.clientHeight : this.canvas.height
        }

        const aspectRatio = this.canvas.width / this.canvas.height
        const logicalHeight = 2
        const logicalWidth = logicalHeight * aspectRatio

        this.logicalLeft = -logicalWidth / 2
        this.logicalRight = logicalWidth / 2
        this.logicalBottom = -logicalHeight / 2
        this.logicalTop = logicalHeight / 2

        this.setRenderTargetSize(this.canvas.width, this.canvas.height)

        this.viewMatrix.setScreenRect(this.logicalLeft, this.logicalRight, this.logicalBottom, this.logicalTop)
        this.viewMatrix.scale(1, 1)

        this.deviceToScreen.loadIdentity()
        const screenScale = logicalHeight / this.canvas.height
        this.deviceToScreen.scaleRelative(screenScale, -screenScale)
        this.deviceToScreen.translateRelative(-this.canvas.width * 0.5, -this.canvas.height * 0.5)

        this.viewMatrix.setMinScale(this.minScale)
        this.viewMatrix.setMaxScale(this.maxScale)
        this.viewMatrix.setMaxScreenRect(this.logicalLeft, this.logicalRight, this.logicalBottom, this.logicalTop)
    }

    public updateTime = () => {
        this.currentFrame = performance.now()
        this.deltaTime = (this.currentFrame - this.lastFrame) / 1000
        this.lastFrame = this.currentFrame
    }

    public updateCamera = () => {
        const {x, y, scale} = this.cameraController
    
        const logicalX = this.logicalLeft + (x / this.canvas.width) * (this.logicalRight - this.logicalLeft)
        const logicalY = this.logicalTop + (y / this.canvas.height) * (this.logicalTop - this.logicalBottom)

        const centerX = (this.logicalLeft + this.logicalRight) / 2

        this.viewMatrix.scale(scale, scale)
        this.viewMatrix.translate(centerX - logicalX, this.logicalTop - logicalY * (this.scaledYPos ? scale : 1))
    }

    public updateProjection = () => {
        const {width, height} = this.canvas
        const projection = new CubismMatrix44()
        const canvasAspect = width / height
        if (this.model.getCanvasWidth() > 1 && width < height) {
            this.modelMatrix.setWidth(2)
            projection.scale(1, canvasAspect)
        } else {
            projection.scale(1 / canvasAspect, 1)
        }

        if (this.viewMatrix) {
            projection.multiplyByMatrix(this.viewMatrix)
        }
        this.projection = projection
    }

    public update = () => {
        if (!this.model || this.webGLRenderer.contextLost()) return

        this.updateTime()
        this.updateCamera()
        this.updateProjection()
        this.webGLRenderer.prepare()
        this.deltaTime *= this.speed

        if (this.needsResize) {
            this.resize()
            this.needsResize = false
        }
        
        this.model.saveParameters()

        let motionUpdated = this.motionController.update(this.deltaTime)
        this.expressionController.update(this.deltaTime)

        if (!this.paused) {
            this.dragManager.update(this.deltaTime)
            this.dragX = this.dragManager.getX()
            this.dragY = this.dragManager.getY()
    
            if (!motionUpdated) {
                if (this.eyeBlink !== null && this.enableEyeblink) {
                  this.eyeBlink.updateParameters(this.model, this.deltaTime)
                }
            }
    
            if (this.enableMovement) {
                const manager = CubismFramework.getIdManager?.()
                const paramAngleX = manager?.getId(CubismDefaultParameterId.ParamAngleX)
                const paramAngleY = manager?.getId(CubismDefaultParameterId.ParamAngleY)
                const paramAngleZ = manager?.getId(CubismDefaultParameterId.ParamAngleZ)
                const paramBodyAngleX = manager?.getId(CubismDefaultParameterId.ParamBodyAngleX)
                const paramEyeBallX = manager?.getId(CubismDefaultParameterId.ParamEyeBallX)
                const paramEyeBallY = manager?.getId(CubismDefaultParameterId.ParamEyeBallY)
                if (paramAngleX) this.model.addParameterValueById(paramAngleX, this.dragX * 30)
                if (paramAngleY) this.model.addParameterValueById(paramAngleY, this.dragY * 30)
                if (paramAngleZ) this.model.addParameterValueById(paramAngleZ, this.dragX * this._dragY * -30)
                if (paramBodyAngleX) this.model.addParameterValueById(paramBodyAngleX, this._dragX * 10)
                if (paramEyeBallX) this.model.addParameterValueById(paramEyeBallX, this.dragX)
                if (paramEyeBallY) this.model.addParameterValueById(paramEyeBallY, this.dragY)
            }
    
            if (this.breath !== null && this.enableBreath) {
                this.breath.updateParameters(this.model, this.deltaTime)
            }
    
            if (this.physics !== null && this.enablePhysics) {
                this.physics.evaluate(this.model, this.deltaTime)
            }
    
            if (this.lipsync && this.enableLipsync) {
                this.wavController.update(this.deltaTime)
                let value = this.wavController.getRms()
        
                for (let i = 0; i < this.lipSyncIds.length; ++i) {
                    const parameterIndex = this.model.getParameterIndex(this.lipSyncIds[i])
                    const minValue = this.model.getParameterMinimumValue(parameterIndex)
                    const maxValue = this.model.getParameterMaximumValue(parameterIndex)
                    const scaledValue = minValue + (maxValue - minValue) * value
                    this.model.addParameterValueById(this.lipSyncIds[i], scaledValue, 0.8)
                }
            }
        
            if (this.pose !== null && this.enablePose) {
              this.pose.updateParameters(this.model, this.deltaTime)
            }
        }
    
        this.model.update()
        this.model.loadParameters()
        this.webGLRenderer.draw()
    }

    public animationLoop = () => {
        this.update()
        if (!this.autoAnimate) return
        const loop = async () => {
            this.update()
            id = window.requestAnimationFrame(loop)
        }
        loop()
    }

    public stopMotions = () => {
        if (!this.loaded) return
        this.motionController.stopMotions()
    }

    public startMotion = async (group: string, i: number, priority: number, onStartMotion?: BeganMotionCallback, 
        onEndMotion?: FinishedMotionCallback): Promise<CubismMotionQueueEntryHandle> => {
            return this.motionController.startMotion(group, i, priority, onStartMotion, onEndMotion)
    }

    public startRandomMotion = async (group: string | null, priority: number, onStartMotion?: BeganMotionCallback, 
        onEndMotion?: FinishedMotionCallback): Promise<CubismMotionQueueEntryHandle> => {
            return this.motionController.startRandomMotion(group, priority, onStartMotion, onEndMotion)
    }

    public getExpressions = () => {
        return this.expressionIds
    }

    public getMotions = () => {
        return this.motionIds
    }

    public hasLipsync = () => {
        return this.lipsync
    }

    public setExpression = (expression: string) => {
        return this.expressionController.setExpression(expression)
    }

    public setRandomExpression = () => {
        return this.expressionController.setRandomExpression()
    }

    public inputAudio = async (wavBuffer: ArrayBuffer | AudioBuffer, playAudio = false) => {
        return this.wavController.start(wavBuffer, playAudio)
    }

    public stopAudio = () => {
        return this.wavController.stop()
    }

    public hitTest = (areaName: string, x: number, y: number) => {
        if (!this.loaded) return
        if (this.opacity < 1) return
        for (let i = 0; i < this.settings.getHitAreasCount(); i++) {
            if (this.settings.getHitAreaName(i) == areaName) {
                const drawId = this.settings.getHitAreaId(i)
                return this.isHit(drawId, x, y)
            }
        }
    }

    public isMocConsistent = () => {
        const {modelBuffer} = this.buffers
        return CubismMoc.hasMocConsistency(modelBuffer)
    }

    public transformX = (pointX: number) => {
        const screenX = this.deviceToScreen.transformX(pointX)
        return this.viewMatrix.invertTransformX(screenX)
    }

    public transformY = (pointY: number) => {
        const screenY = this.deviceToScreen.transformY(pointY)
        return this.viewMatrix.invertTransformY(screenY)
    }

    public takeScreenshot = async (format: string = "png", faceCrop = false) => {
        this.centerModel()
        this.update()
        if (faceCrop) {
            const clonedCanvas = document.createElement("canvas")
            const cropSize = this.canvas.width / 4
            clonedCanvas.width = cropSize
            clonedCanvas.height = cropSize

            const ctx = clonedCanvas.getContext("2d")
            const startX = (this.canvas.width - cropSize) / 2
            ctx.drawImage(this.canvas, startX, 0, cropSize, cropSize, 0, 0, cropSize, cropSize)

            return clonedCanvas.toDataURL(`image/${format}`)
        } else {
            return this.canvas.toDataURL(`image/${format}`)
        }
    }

    public zoomIn = (factor = 0.1) => {
        return this.cameraController.zoomIn(factor)
    }

    public zoomOut = (factor = 0.1) => {
        return this.cameraController.zoomOut(factor)
    }

    public centerModel = () => {
        this.x = this.canvas.width / 2
        this.y = 0
        this.update()
        
        const clonedCanvas = document.createElement("canvas")
        clonedCanvas.width = this.canvas.width / this.scale
        clonedCanvas.height = this.canvas.height / this.scale

        const ctx = clonedCanvas.getContext("2d")
        ctx.scale(1 / this.scale, 1 / this.scale)
        ctx.drawImage(this.canvas, 0, 0)

        const imageData = ctx.getImageData(0, 0, clonedCanvas.width, clonedCanvas.height).data

        let firstNonTransparentY = clonedCanvas.height
        let lastNonTransparentY = 0

        for (let y = 0; y < clonedCanvas.height; y++) {
            for (let x = 0; x < clonedCanvas.width; x++) {
                if (imageData[(y * clonedCanvas.width + x) * 4 + 3] !== 0) {
                    firstNonTransparentY = Math.min(firstNonTransparentY, y)
                    lastNonTransparentY = Math.max(lastNonTransparentY, y)
                }
            }
        }

        const characterHeight = lastNonTransparentY - firstNonTransparentY
        let marginHeight = this.canvas.height / 15 / this.scale
        let centerOffset = (characterHeight / 2) * (this.scale - 1) * this.scale
        let offsetY = (firstNonTransparentY * (1.5*this.scale**this.scale) * (this.scale - 1))

        if (this.scaledYPos) {
            this.y = -firstNonTransparentY * 1.1 + marginHeight + this.appendYOffset
        } else {
            if (this.scale === 1) {
                offsetY = firstNonTransparentY - this.canvas.height / 15
                marginHeight = 0
            }
            this.y = centerOffset - marginHeight - offsetY + this.appendYOffset
        }
    }

    public characterPosition = () => {
        const savedX = this.x
        const savedY = this.y
        this.x = this.canvas.width / 2
        this.y = 0
        this.update()
    
        const clonedCanvas = document.createElement("canvas")
        clonedCanvas.width = this.canvas.width / this.scale
        clonedCanvas.height = this.canvas.height / this.scale
        const ctx = clonedCanvas.getContext("2d")
        ctx.scale(1 / this.scale, 1 / this.scale)
        ctx.drawImage(this.canvas, 0, 0, clonedCanvas.width, clonedCanvas.height)
        this.x = savedX
        this.y = savedY
    
        const imageData = ctx.getImageData(0, 0, clonedCanvas.width, clonedCanvas.height).data
        let firstNonTransparentY = clonedCanvas.height
        let lastNonTransparentY = 0
    
        for (let y = 0; y < clonedCanvas.height; y++) {
            for (let x = 0; x < clonedCanvas.width; x++) {
                if (imageData[(y * clonedCanvas.width + x) * 4 + 3] !== 0) {
                    firstNonTransparentY = Math.min(firstNonTransparentY, y)
                    lastNonTransparentY = Math.max(lastNonTransparentY, y)
                }
            }
        }

        const characterHeight = lastNonTransparentY - firstNonTransparentY
        let marginHeight = this.canvas.height / 15

        return {firstNonTransparentY, lastNonTransparentY, characterHeight, marginHeight}
    }

    public getParameterName = (parameter: string) => {
        if (!this.displayInfo) return parameter
        return this.displayInfo.Parameters.find((p) => p.Id === parameter)?.Name ?? parameter
    }

    public getPartName = (part: string) => {
        if (!this.displayInfo) return part
        return this.displayInfo.Parts.find((p) => p.Id === part)?.Name ?? part
    }

    public getParameterNames = () => {
        return this.parameters.ids.map((id) => this.getParameterName(id))
    }

    public getPartNames = () => {
        return this.parts.ids.map((id) => this.getPartName(id))
    }
}