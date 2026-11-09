import {readFile, readdir, writeFile} from "fs/promises"

const source = new URL("../renderer/shaders/", import.meta.url)
const output = new URL("../build/renderer/shaders/", import.meta.url)

for (const file of await readdir(source)) {
    if (!/\.(vert|frag)$/.test(file)) continue
    const shader = await readFile(new URL(file, source), "utf8")
    await writeFile(new URL(`${file}.js`, output), `module.exports = ${JSON.stringify(shader)}`)
}