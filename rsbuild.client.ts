import {defineConfig} from "@rsbuild/core"
import {pluginReact} from "@rsbuild/plugin-react"
import {pluginNodePolyfill} from "@rsbuild/plugin-node-polyfill"
import {pluginLess} from "@rsbuild/plugin-less"

export default defineConfig({
    tools: {
        rspack(config) {
            config.module = config.module || {}
            config.module.rules = config.module.rules || []

            config.module.rules.push({
                test: /\.(zip)$/,
                type: "asset/resource",
            })

            config.module.rules.push({
                test: /\.(vert|frag)$/,
                type: "asset/source",
            })

            return config
        }
    },
    plugins: [
        pluginReact(),
        pluginLess(),
        pluginNodePolyfill()
    ],
    source: {
        entry: {index: "./demo/demo.tsx"}
    },
    html: {
        template: "./demo/demo.html"
    },
    output: {
        target: "web",
        distPath: {root: "./dist/client"},
        minify: false,
        filenameHash: false,
        sourceMap: false,
        legalComments: "none",
        copy: [
            {from: "./assets/Hiyori.zip", to: "assets/Hiyori.zip"}
        ]
    }
})