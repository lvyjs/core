import { convertPath } from '../config'
import { lvyAssets, lvyStylesCSSImport } from './plugins/index'

/**
 * 打包 JS（tsdown 引擎，基于 Rolldown）
 * *** 注意 ***
 * 和 initConfig 配合使用，确保已经初始化了配置。
 * 仅支持 Node.js ^22.18.0 || ^24.11.0 || >=26.0.0（tsdown 要求）。
 *
 * 配置映射：
 * - build.input / build.OutputOptions.input → entry
 * - build.dir / build.OutputOptions.dir → outDir
 * - build.OutputOptions.intro/outro → banner/footer
 * - build.tsdown → tsdown 专属配置透传（默认值之上覆盖）
 */
export async function buildWithTsdown() {
  if (!global.lvyConfig) global.lvyConfig = {}
  if (!global.lvyConfig.build) global.lvyConfig.build = {}

  const buildCfg = global.lvyConfig.build
  const OutputOptions =
    typeof buildCfg === 'object' && buildCfg.OutputOptions
      ? buildCfg.OutputOptions
      : ({} as Record<string, any>)
  const inputDir = buildCfg['input'] || OutputOptions['input'] || 'src'
  const outputDir = buildCfg['dir'] || OutputOptions['dir'] || 'lib'
  const tsdownCfg =
    typeof buildCfg === 'object' && buildCfg.tsdown && typeof buildCfg.tsdown === 'object'
      ? buildCfg.tsdown
      : ({} as Record<string, any>)

  // 共享插件（assets/styles）
  // 注意：别名不能走插件解析 —— unbundle 模式下产物中的
  // import 不会被改写为相对路径，必须使用 tsdown 内置 alias（resolve.alias）
  const plugins: any[] = []
  if (typeof global.lvyConfig?.assets !== 'boolean') {
    plugins.push(lvyAssets(global.lvyConfig?.assets ?? {}))
  }
  if (typeof global.lvyConfig?.styles !== 'boolean') {
    plugins.push(lvyStylesCSSImport(global.lvyConfig?.styles ?? {}))
  }

  let tsdown: typeof import('tsdown')
  try {
    tsdown = await import('tsdown')
  } catch (err) {
    console.error('[lvyjs] 使用 tsdown 引擎需要安装 tsdown 依赖')
    throw err
  }

  const entryGlob = convertPath(`${inputDir}/**/*.{ts,js,jsx,tsx}`)
  const ignoreDts = convertPath(`${inputDir}/**/*.d.ts`)

  // 转换 lvyjs 别名配置（entries）为 tsdown 内置 alias（Record）
  const aliasRecord: Record<string, string> = {}
  if (typeof global.lvyConfig?.alias !== 'boolean') {
    const entries = global.lvyConfig?.alias?.entries
    if (Array.isArray(entries)) {
      for (const { find, replacement } of entries) {
        aliasRecord[find] = replacement
      }
    }
  }

  // 用户自定义插件与内置共享插件合并，避免覆盖导致样式/资源处理失效
  const userPlugins = Array.isArray(tsdownCfg.plugins) ? tsdownCfg.plugins : []
  const finalPlugins = [...plugins, ...userPlugins]
  const restCfg = { ...tsdownCfg }
  delete restCfg.plugins

  await tsdown.build({
    entry: [entryGlob, `!${ignoreDts}`],
    outDir: outputDir,
    unbundle: true,
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    root: inputDir,
    dts: true,
    // 构建前清理输出目录，避免旧产物与本次构建混用（可用 tsdown: { clean: false } 关闭）
    clean: true,
    report: true,
    minify: false,
    sourcemap: OutputOptions['sourcemap'] ?? false,
    alias: Object.keys(aliasRecord).length > 0 ? aliasRecord : undefined,
    banner: OutputOptions['intro'],
    footer: OutputOptions['outro'],
    outputOptions: {
      assetFileNames: 'assets/[name]-[hash][extname]'
    },
    plugins: finalPlugins,
    ...restCfg
  })
}
