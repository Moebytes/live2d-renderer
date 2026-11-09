import {Live2DCubismModel} from "./Live2DCubismModel"
import {MotionPriority} from "./types"

export class TouchController {
    public model: Live2DCubismModel
    public startX: number
    public startY: number
    public lastX: number
    public lastY: number
  
    constructor(model: Live2DCubismModel) {
        this.model = model
        this.startX = this.startY = 0
        this.lastX = this.lastY = 0
    }
  
    public touchStart = (posX: number, posY: number) => {
        this.startX = this.lastX = posX
        this.startY = this.lastY = posY
    }
  
    public touchMove = (posX: number, posY: number) => {
        this.lastX = posX
        this.lastY = posY
    }
  
    public getFlickDistance = () => {
        return this.calculateDistance(this.startX, this.startY, this.lastX, this.lastY)
    }
  
    public calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
        return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
    }
  
    public calculateMovingAmount = (x1: number, x2: number) => {
        if ((x1 > 0) !== (x2 > 0)) return 0
        return Math.sign(x1) * Math.min(Math.abs(x1), Math.abs(x2))
    }

    public pointerDown = (event: PointerEvent) => {
        if (this.model.paused) return
        const rect = this.model.canvas.getBoundingClientRect()
        const posX = event.clientX - rect.left
        const posY = event.clientY - rect.top
        this.touchStart(posX, posY)
    }

    public pointerMove = (event: PointerEvent) => {
        if (this.model.paused) return
        const rect = this.model.canvas.getBoundingClientRect()
        const posX = event.clientX - rect.left
        const posY = event.clientY - rect.top

        const x = this.model.transformX(this.lastX)
        const y = this.model.transformY(this.lastY)

        this.touchMove(posX, posY)
        this.model.setDragging(x, y)
    }

    public pointerUp = (event: PointerEvent) => {
        if (this.model.paused) return
        const rect = this.model.canvas.getBoundingClientRect()
        const posX = event.clientX - rect.left
        const posY = event.clientY - rect.top
        this.model.setDragging(0, 0)
        const x = this.model.transformX(posX)
        const y = this.model.transformY(posY)
        if (this.model.tapInteraction) this.tap(x, y)
    }

    public tap = (x: number, y: number) => {
        if (this.model.hitTest("Head", x, y)) {
            this.model.setRandomExpression()
        } else if (this.model.hitTest("Body", x, y)) {
            this.model.startRandomMotion("TapBody", MotionPriority.Normal)
        }

        let hitAreas = [] as string[]
        for (let i = 0; i < this.model.settings.getHitAreasCount(); i++) {
            const drawId = this.model.settings.getHitAreaId(i)
            if (this.model.isHit(drawId, x, y)) {
                hitAreas.push(drawId.getString())
            }
        }
        this.model.emit("hit", hitAreas, x, y)
    }

    public startInteractions = () => {
        if (!this.model.autoInteraction) return
        document.addEventListener("pointerdown", this.pointerDown, {passive: true})
        document.addEventListener("pointermove", this.pointerMove, {passive: true})
        document.addEventListener("pointerup", this.pointerUp, {passive: true})
        document.addEventListener("pointercancel", this.pointerUp, {passive: true})
    }

    public cancelInteractions = () => {
        document.removeEventListener("pointerdown", this.pointerDown)
        document.removeEventListener("pointermove", this.pointerMove)
        document.removeEventListener("pointerup", this.pointerUp)
        document.removeEventListener("pointercancel", this.pointerUp)
    }

    public initInteractions = () => {
        this.cancelInteractions()
        this.startInteractions()
    }
}