import React, {useEffect, useRef, useState, useContext, useReducer} from "react"
import {ModelContext, AudioContext, Live2DContext} from "../demo"
import zoomLock from "../../assets/zoomlock.png"
import zoomLocked from "../../assets/zoomlocked.png"
import zoomIn from "../../assets/zoomin.png"
import zoomOut from "../../assets/zoomout.png"
import halfSpeed from "../../assets/0.5x.png"
import normalSpeed from "../../assets/1x.png"
import doubleSpeed from "../../assets/2x.png"
import pause from "../../assets/pause.png"
import play from "../../assets/play.png"
import {Live2DCubismModel, compressLive2DTextures} from "../../live2dcubism"
import "./styles/live2dmodel.less"

const audioContext = new window.AudioContext()

const Live2DModel: React.FunctionComponent = (props) => {
    const [ignored, forceUpdate] = useReducer(x => x + 1, 0)
    const {model, setModel} = useContext(ModelContext)
    const {audio, setAudio} = useContext(AudioContext)
    const {live2D, setLive2D} = useContext(Live2DContext)
    const [controlHover, setControlHover] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [paused, setPaused] = useState(false)
    const [enableZoom, setEnableZoom] = useState(true)
    const [canvasSize, setCanvasSize] = useState(Math.min(window.innerWidth, 700))
    const rendererRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const handleResize = () => setCanvasSize(Math.min(window.innerWidth, 700))
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    const load = async () => {
        let cubismCorePath = "https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js"
        const live2DModel = new Live2DCubismModel(rendererRef.current!, {cubismCorePath, scale: 1, scaledYPos: false})
        live2DModel.canvas.width = 700
        live2DModel.canvas.height = 700

        /*
        const arrayBuffer = await fetch(model).then((r) => r.arrayBuffer())
        const newBuffer = await compressLive2DTextures(arrayBuffer)
        console.log(URL.createObjectURL(new Blob([new Uint8Array(newBuffer)])))*/

        await live2DModel.load(model)
        setLive2D(live2DModel)
    }

    useEffect(()=> {
        load()
    }, [model])

    const loadAudio = async () => {
        if (!live2D || !audio) return
        const arrayBuffer = await fetch(audio).then((r) => r.arrayBuffer())
        live2D.inputAudio(arrayBuffer, true)
    }

    useEffect(() => {
        loadAudio()
    }, [live2D, audio])

    useEffect(() => {
        if (!live2D) return
        live2D.paused = paused
        live2D.speed = speed
        live2D.zoomEnabled = enableZoom
        forceUpdate()
    }, [live2D, paused, speed, enableZoom])

    const changeSpeed = () => {
        if (speed === 0.5) setSpeed(1)
        if (speed === 1) setSpeed(2)
        if (speed === 2) setSpeed(0.5)
    }

    const zoomLockIcon = () => {
        return enableZoom ? zoomLock : zoomLocked
    }

    const speedIcon = () => {
        if (speed === 0.5) return halfSpeed
        if (speed === 1) return normalSpeed
        if (speed === 2) return doubleSpeed
    }

    return (
        <div className="live2d-model-container">
            {live2D ? <div className={`live2d-controls ${controlHover ? "live2d-controls-visible" : ""}`} 
            onMouseEnter={() => setControlHover(true)} onMouseLeave={() => setControlHover(false)}>
                <img draggable={false} className="live2d-control-icon" src={zoomLockIcon()} onClick={() => setEnableZoom((prev) => !prev)}/>
                <img draggable={false} className="live2d-control-icon" src={zoomOut} onClick={() => live2D.zoomOut()}/>
                <img draggable={false} className="live2d-control-icon" src={zoomIn} onClick={() => live2D.zoomIn()}/>
                <img draggable={false} className="live2d-control-icon" src={live2D.paused ? play : pause} onClick={() => setPaused((prev) => !prev)}/>
                <img draggable={false} className="live2d-control-icon" src={speedIcon()} onClick={changeSpeed}/>
            </div> : null}
            <canvas ref={rendererRef} width={canvasSize} height={canvasSize}></canvas>
        </div>
    )
}

export default Live2DModel