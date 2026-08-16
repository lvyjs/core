import { defineConfig } from 'tsdown'

import { dirname } from 'path'

type TsdownConfig = {
  entry: string[]
  outDir: string
  unbundle: boolean
  format: 'esm'
  platform: 'node'
  fixedExtension: boolean
  dts: boolean
  clean: boolean
}

/**
 * 生成 tsdown 配置：将包源码按原目录结构转译到 lib（unbundle 模式），
 * 并生成 .d.ts 声明文件。
 *
 * @param input 入口文件（默认 src/index.ts），实际编译 src 目录下全部脚本
 * @param dir 输出目录（默认 lib）
 */
export const build = (input = 'src/index.ts', dir = 'lib'): TsdownConfig => {
  const base = dirname(input)
  return {
    entry: [`${base}/**/*.{ts,js,jsx,tsx}`, `!${base}/**/*.d.ts`],
    outDir: dir,
    unbundle: true,
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    dts: true,
    clean: true
  }
}

export default defineConfig(build('src/index.ts', 'lib'))
