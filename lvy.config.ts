import { defineConfig } from 'lvyjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  alias: {
    entries: [{ find: '@src', replacement: join(__dirname, 'src') }]
  },
  watch: ['src/**/*'],
  assets: {
    filter: /\.(png|jpg|jpeg|gif|svg|webp|ico|yaml|txt|ttf)$/
  },
  build: {
    OutputOptions: {
      intro: `/**  https://lvyjs.dev script start **/`,
      outro: ` /**  https://lvyjs.dev script end  **/ `
    },
    dts: true,
    tsdown: {}
  }
})
