import vertShaderSrc from "./vertshadersrc.vert"
import vertShaderSrcMasked from "./vertshadersrcmasked.vert"
import vertShaderSrcSetupMask from "./vertshadersrcsetupmask.vert"
import fragShaderSrcSetupMask from "./fragshadersrcsetupmask.frag"
import fragShaderSrcPremultipliedAlpha from "./fragshadersrcpremultipliedalpha.frag"
import fragShaderSrcMaskPremultipliedAlpha from "./fragshadersrcmaskpremultipliedalpha.frag"
import fragShaderSrcMaskInvertedPremultipliedAlpha from "./fragshadersrcmaskinvertedpremultipliedalpha.frag"
import vertShaderSrcCopy from "./vertshadersrccopy.vert"
import fragShaderSrcCopy from "./fragshadersrccopy.frag"
import fragShaderSrcColorBlend from "./fragshadersrccolorblend.frag"
import fragShaderSrcAlphaBlend from "./fragshadersrcalphablend.frag"
import vertShaderSrcBlend from "./vertshadersrcblend.vert"
import fragShaderSrcBlend from "./fragshadersrcpremultipliedalphablend.frag"

export default {
    _vertShaderSrc: vertShaderSrc,
    _vertShaderSrcMasked: vertShaderSrcMasked,
    _vertShaderSrcSetupMask: vertShaderSrcSetupMask,
    _fragShaderSrcSetupMask: fragShaderSrcSetupMask,
    _fragShaderSrcPremultipliedAlpha: fragShaderSrcPremultipliedAlpha,
    _fragShaderSrcMaskPremultipliedAlpha: fragShaderSrcMaskPremultipliedAlpha,
    _fragShaderSrcMaskInvertedPremultipliedAlpha: fragShaderSrcMaskInvertedPremultipliedAlpha,
    _vertShaderSrcCopy: vertShaderSrcCopy,
    _fragShaderSrcCopy: fragShaderSrcCopy,
    _fragShaderSrcColorBlend: fragShaderSrcColorBlend + "\n",
    _fragShaderSrcAlphaBlend: fragShaderSrcAlphaBlend + "\n",
    _vertShaderSrcBlend: vertShaderSrcBlend,
    _fragShaderSrcBlend: fragShaderSrcBlend
}