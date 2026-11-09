import {ACubismMotion} from "../framework/src/motion/acubismmotion"
import {Live2DCubismModel} from "./Live2DCubismModel"

export class ExpressionController {
    public model: Live2DCubismModel
  
    constructor(model: Live2DCubismModel) {
        this.model = model
    }
  
    public load = async () => {
        const {expressionBuffers} = this.model.buffers

        for (let i = 0; i < expressionBuffers.length; i++) {
            const name = this.model.expressionIds[i]
            const expressionBuffer = expressionBuffers[i]
            const motion = this.model.loadExpression(expressionBuffer, expressionBuffer.byteLength, name)

            if (this.model.expressions.has(name)) {
                ACubismMotion.delete(this.model.expressions.get(name))
                this.model.expressions.set(name, null)
            }
            this.model.expressions.set(name, motion)
        }
    }

    public update = (deltaTime: DOMHighResTimeStamp) => {
        if (this.model.expressionManager != null && this.model.enableExpression) {
            this.model.expressionManager.updateMotion(this.model.model, deltaTime)
        }
    }

    public setExpression = (expression: string) => {
        const motion = this.model.expressions.get(expression)
        if (motion) this.model.expressionManager.startMotion(motion, false)
    }

    public setRandomExpression = () => {
        if (!this.model.expressions.size) return
        const rand = Math.floor(Math.random() * this.model.expressions.size)
        const name = Array.from(this.model.expressions.keys())[rand]
        this.setExpression(name)
    }
}