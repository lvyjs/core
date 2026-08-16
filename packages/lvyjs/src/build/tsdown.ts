import { convertPath } from '../config'
import { lvyAssets, lvyStylesCSSImport, lvyExternal } from './plugins/index'
import { globalLogger, type Logger } from 'tsdown'
import { generateDtsLoose } from './dts'

const LogLevels = { silent: 0, error: 1, warn: 2, info: 3 } as const

/**
 * 包装 tsdown 的 logger，隐藏 `entry: ...` 这行日志。
 * tsdown 没有提供单独关闭 entry 打印的选项，只能通过 customLogger 注入。
 * 其余日志行为与 tsdown 默认保持一致，logLevel / failOnWarn / suppressWarnings 照常生效。
 */
const createFilteredLogger = (tsdownCfg: Record<string, any>): Logger => {
  const level = tsdownCfg?.logLevel ?? 'info'
  const levelValue = LogLevels[level] ?? LogLevels.info
  const options = {
    ...globalLogger.options,
    failOnWarn: tsdownCfg?.failOnWarn ?? false,
    suppressWarnings: tsdownCfg?.suppressWarnings
  }
  const isSuppressed = (message: string): boolean => {
    const patterns = options.suppressWarnings
    if (typeof patterns === 'function') return patterns(message)
    const list = Array.isArray(patterns) ? patterns : patterns ? [patterns] : []
    return list.some(pattern =>
      pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
    )
  }
  return {
    ...globalLogger,
    level: level in LogLevels ? level : 'info',
    options,
    info(...args: any[]) {
      if (levelValue < LogLevels.info) return
      const message = args.filter(arg => arg !== undefined && arg !== false).join(' ')
      // 隐藏 tsdown 的 entry 列表打印
      if (message.includes('entry:')) return
      globalLogger.info(...args)
    },
    success(...args: any[]) {
      if (levelValue < LogLevels.info) return
      globalLogger.success(...args)
    },
    warn(...args: any[]) {
      const message = args.filter(arg => arg !== undefined && arg !== false).join(' ')
      if (isSuppressed(message)) return
      if (options.failOnWarn) return this.error(...args)
      globalLogger.warn(...args)
    },
    warnOnce(...args: any[]) {
      const message = args.filter(arg => arg !== undefined && arg !== false).join(' ')
      if (isSuppressed(message)) return
      if (options.failOnWarn) return this.error(...args)
      globalLogger.warnOnce(...args)
    },
    error(...args: any[]) {
      globalLogger.error(...args)
    },
    clearScreen(type: 'error' | 'warn' | 'info') {
      globalLogger.clearScreen(type)
    }
  }
}

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
  // 宽松 d.ts：由 lvyjs 自己生成，诊断只作警告，构建不因 d.ts 失败
  const looseDts = buildCfg['dts'] === true || buildCfg['dts'] === 'loose'

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
  // Node.js 库默认不打包依赖：把未被别名/资源/样式插件处理的裸包导入外部化。
  // 使用 build.bundleDeps: true 关闭（例如前端类应用需要把依赖打进去）。
  if (buildCfg['bundleDeps'] !== true) {
    const aliasFinds: string[] = []
    if (typeof global.lvyConfig?.alias !== 'boolean') {
      const entries = global.lvyConfig?.alias?.entries
      if (Array.isArray(entries)) {
        for (const { find } of entries) {
          aliasFinds.push(find)
        }
      }
    }
    finalPlugins.push(
      lvyExternal({
        aliasFinds,
        alwaysBundle: tsdownCfg.deps?.alwaysBundle
      })
    )
  }
  const restCfg = { ...tsdownCfg }
  delete restCfg.plugins
  if (looseDts) delete restCfg.dts

  await tsdown.build({
    entry: [entryGlob, `!${ignoreDts}`],
    outDir: outputDir,
    unbundle: true,
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    root: inputDir,
    // 默认不生成 .d.ts 声明文件：应用项目通常不需要声明文件，
    // 且 rolldown-plugin-dts 对推断类型引用 node_modules 内部类型会报错。
    // 需要声明文件时通过 build.tsdown.dts: true 开启。
    dts: false,
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
    customLogger: createFilteredLogger(restCfg),
    plugins: finalPlugins,
    ...restCfg
  })

  if (looseDts) {
    const aliasEntries = Object.entries(aliasRecord).map(([find, replacement]) => ({
      find,
      replacement
    }))
    await generateDtsLoose({
      cwd: process.cwd(),
      inputDir,
      outputDir,
      aliasEntries
    })
  }
}
