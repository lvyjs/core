import { buildAndRun } from './build/index.js'
import { initConfig } from './store.js'

export const main = async () => {
  if (process.argv.includes('--lvy-build')) {
    await initConfig()
    buildAndRun()
  }
}
