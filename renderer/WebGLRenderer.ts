
import {Live2DCubismModel} from "./Live2DCubismModel"
import {CubismShaderManager_WebGL, CubismShaderSet} from "../framework/src/rendering/cubismshader_webgl"
import shaders from "./shaders"

export class WebGLRenderer {
    public model: Live2DCubismModel
    public shader: WebGLProgram

    public constructor(model: Live2DCubismModel) {
        this.model = model
        this.shader = this.createShader()
    }
    public createShader = () => {
        const gl = this.model.canvas.getContext("webgl2")
        const vertexShader = gl.createShader(gl.VERTEX_SHADER)
        const vertexShaderString = `
            precision mediump float;
            attribute vec3 position;
            attribute vec2 uv;
            varying vec2 vuv;
            void main(void) {
               gl_Position = vec4(position, 1.0);
               vuv = uv;
            }`
    
        gl.shaderSource(vertexShader, vertexShaderString)
        gl.compileShader(vertexShader)
    
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
        const fragmentShaderString = `
            precision mediump float;
            varying vec2 vuv;
            uniform sampler2D texture;
            void main(void) {
               gl_FragColor = texture2D(texture, vuv);
            }`
    
        gl.shaderSource(fragmentShader, fragmentShaderString)
        gl.compileShader(fragmentShader)
    
        const shader = gl.createProgram()
        gl.attachShader(shader, vertexShader)
        gl.attachShader(shader, fragmentShader)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
        gl.linkProgram(shader)
        gl.useProgram(shader)
        return shader
    }

    public deleteShader = () => {
        const gl = this.model.canvas.getContext("webgl2")
        gl.deleteProgram(this.shader)
    }

    public start = () => {
        const gl = this.model.canvas.getContext("webgl2")
        this.model.getRenderer().startUp(gl)
        const shader = CubismShaderManager_WebGL.getInstance().getShader(gl)
        if (!shader._isShaderLoaded) {
            Object.assign(shader, shaders)
            shader._shaderSets = Array.from({length: shader._shaderCount}, () => new CubismShaderSet())
            shader.registerShader()
            shader.registerBlendShader()
            shader._isShaderLoaded = true
        }
    }

    public loadTexture = (index: number, image: HTMLImageElement) => {
        const gl = this.model.canvas.getContext("webgl2")
        const maxTextureSize = this.model.maxTextureSize ?? gl.getParameter(gl.MAX_TEXTURE_SIZE)
        let resized = image as HTMLImageElement | HTMLCanvasElement

        if (image.width > maxTextureSize || image.height > maxTextureSize) {
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            const aspectRatio = image.width / image.height
            if (image.width > image.height) {
                canvas.width = maxTextureSize
                canvas.height = maxTextureSize / aspectRatio
            } else {
                canvas.height = maxTextureSize
                canvas.width = maxTextureSize * aspectRatio
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
            resized = canvas
        }

        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        if (this.model.premultipliedAlpha) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, resized)

        if ((resized.width & (resized.width - 1)) === 0 && (resized.height & (resized.height - 1)) === 0) {
            gl.generateMipmap(gl.TEXTURE_2D)
        }
        gl.bindTexture(gl.TEXTURE_2D, null)
        
        this.model.getRenderer().bindTexture(index, tex)
        this.model.getRenderer().setIsPremultipliedAlpha(this.model.premultipliedAlpha)
    }

    public deleteTextures = () => {
        const gl = this.model.canvas.getContext("webgl2")
        for (let i = 0; i < this.model.textures.length; i++) {
            gl.deleteTexture(this.model.textures[i])
            this.model.textures[i] = null
        }
        this.model.textures.length = 0
    }

    public deleteTexture = (texture: WebGLTexture) => {
        const gl = this.model.canvas.getContext("webgl2")
        for (let i = 0; i < this.model.textures.length; i++) {
            if (this.model.textures[i] === texture) {
                gl.deleteTexture(this.model.textures[i])
                this.model.textures[i] = null
                this.model.textures.splice(i, 1)
                break
            }
        }
    }

    public resize = () => {
        const gl = this.model.canvas.getContext("webgl2")
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    }

    public contextLost = () => {
        const gl = this.model.canvas.getContext("webgl2")
        return gl.isContextLost()
    }

    public prepare = () => {
        const gl = this.model.canvas.getContext("webgl2")
        gl.clearColor(0, 0, 0, 0)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LEQUAL)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.clearDepth(1)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.useProgram(this.shader)
        gl.flush()
    }

    public draw = () => {
        if (!this.model.loaded) return
        this.model.projection.multiplyByMatrix(this.model.modelMatrix)
        this.model.getRenderer().setMvpMatrix(this.model.projection)
        const gl = this.model.canvas.getContext("webgl2")
        const viewport = [0, 0, gl.canvas.width, gl.canvas.height]

        const frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
        this.model.getRenderer().setRenderState(frameBuffer, viewport)
        this.model.getRenderer().drawModel()
    }
}