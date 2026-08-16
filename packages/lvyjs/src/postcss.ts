import fs from 'fs'
import postcss from 'postcss'
import { createRequire } from 'module'
import { join, dirname, resolve, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import { convertPath, createAlias } from './config'

const require = createRequire(import.meta.url)

const config = {
  css: null,
  sass: null,
  less: null,
  scss: null
}

interface AliasConfig {
  [key: string]: string
}

export default function LessAliasPlugin(aliases: AliasConfig) {
  return {
    install: function (less: any, pluginManager: any) {
      const AliasFileManager = new less.FileManager()
      AliasFileManager.loadFile = function (
        filename: string,
        currentDirectory: string,
        options: any,
        environment: any
      ) {
        // 替换路径中的别名
        for (const alias in aliases) {
          if (filename.startsWith(alias)) {
            filename = filename.replace(alias, aliases[alias])
            break
          }
        }
        const fullPath = isAbsolute(filename) ? filename : resolve(currentDirectory, filename)
        return less.FileManager.prototype.loadFile.call(
          this,
          fullPath,
          currentDirectory,
          options,
          environment
        )
      }
      // 注册自定义文件管理器
      pluginManager.addFileManager(AliasFileManager)
    },
    minVersion: [3, 0] // 支持的最低 LESS 版本
  }
}

/**
 * Sass 别名 importer：
 * 让 `@import '@src/xxx.scss'` / `@use '@src/xxx.scss'` 在 Sass 编译阶段
 * 就能解析别名（Sass 默认不认 lvyjs 的 alias 配置）。
 * findFileUrl 返回 file:// URL 后，Sass 会自行从文件系统加载。
 */
const createSassAliasImporter = () => {
  return {
    findFileUrl(url: string) {
      const alias = global.lvyConfig?.alias
      if (typeof alias === 'boolean' || !Array.isArray(alias?.entries)) {
        return null
      }
      for (const { find, replacement } of alias.entries) {
        if (url.startsWith(find)) {
          return pathToFileURL(url.replace(find, replacement))
        }
      }
      return null
    }
  }
}

/**
 * 只做预处理器编译（less/sass/scss），不做 PostCSS。
 * 供 compileCSS 与 postcss-import 的 load 钩子共用：
 * 内联 .scss/.less/.sass 时先编译，避免原始源码混进产物。
 */
const compilePreprocessor = async (inputPath: string): Promise<string> => {
  const typing = /\.sass$/.test(inputPath)
    ? 'sass'
    : /\.less$/.test(inputPath)
      ? 'less'
      : /\.scss$/.test(inputPath)
        ? 'scss'
        : 'css'
  if (typing === 'less') {
    const less = require('less')
    const lessResult = await less.render(fs.readFileSync(inputPath, 'utf-8'), {
      filename: inputPath,
      plugins: [LessAliasPlugin(createAlias(global.lvyConfig?.alias))] // 使用插件
    })
    return lessResult.css
  }
  if (typing === 'sass' || typing === 'scss') {
    const sass = require('sass')
    // 使用现代 API，避免 legacy-js-api 弃用告警；importers 支持别名解析
    return sass.compile(inputPath, { importers: [createSassAliasImporter()] }).css
  }
  return fs.readFileSync(inputPath, 'utf-8')
}

/**
 *
 * @param configPath
 * @param typing
 * @returns
 */
const loadPostcssConfig = (configPath: string, typing: string) => {
  if (config[typing]) {
    return {
      plugins: config[typing]
    }
  }
  const plugins: any[] = []
  let aliasEntries: any[] = []
  if (typeof global.lvyConfig?.alias != 'boolean') {
    aliasEntries = global.lvyConfig.alias?.entries || []
  }

  const includeKeys = ['postcss-import', 'postcss-url', 'autoprefixer']

  //
  if (aliasEntries.length > 0) {
    // 创建 postcss-import 插件并配置别名解析
    try {
      plugins.push(
        require('postcss-import')({
          resolve: (id, basedir) => {
            // 检查别名
            for (const entry of aliasEntries) {
              if (id.startsWith(entry.find)) {
                const aliasedPath = id.replace(entry.find, entry.replacement)
                return convertPath(resolve(basedir, aliasedPath))
              }
            }
            return id // 默认返回原始路径
          },
          load: async (filename: string) => {
            // 预处理器文件内联前先编译，避免原始 scss/less 文本进入产物
            return compilePreprocessor(filename)
          }
        })
      )
    } catch (err) {
      console.error(err)
    }
    try {
      plugins.push(
        require('postcss-url')({
          url: asset => {
            // 使用 resolve 逻辑处理 URL
            for (const entry of aliasEntries) {
              if (asset.url.startsWith(entry.find)) {
                const aliasedPath = asset.url.replace(entry.find, entry.replacement)
                return convertPath(aliasedPath)
              }
            }
            return convertPath(asset.url)
          }
        })
      )
    } catch (err) {
      console.error(err)
    }
  }
  for (let i = 2; i < includeKeys.length; i++) {
    plugins.push(require(includeKeys[i])({}))
  }
  try {
    if (fs.existsSync(configPath)) {
      const cfg = require(configPath)
      // 添加其他插件
      if (!Array.isArray(cfg.plugins)) {
        const keys = Object.keys(cfg.plugins)
        for (const key of keys) {
          try {
            if (includeKeys.includes(key)) continue
            const pluginConfig = cfg.plugins[key]
            const plugin = require(key)
            if (typeof plugin === 'function') {
              plugins.push(plugin(pluginConfig))
            } else {
              throw new Error(`插件 ${key} 不是有效的 PostCSS 插件函数`)
            }
          } catch (err) {
            console.error(`加载 PostCSS 插件 ${key} 失败:`, err)
          }
        }
      } else {
        plugins.push(...cfg.plugins)
      }
    }
  } catch (err) {
    console.error('加载 PostCSS 配置失败:', err)
  }
  config[typing] = plugins
  return {
    plugins: config[typing]
  }
}

export type CSSCompileResult = {
  css: string
  dependencies: string[]
}

/**
 * 编译单个样式文件，返回编译后的 CSS 内容与依赖文件列表
 * 开发模式（postCSS）与打包模式（tsdown 样式插件）共用
 *
 * @param inputPath 样式文件绝对路径
 */
export const compileCSS = async (inputPath: string): Promise<CSSCompileResult> => {
  const configPath = join(process.cwd(), 'postcss.config.cjs')

  let typing: string = 'css'
  let parser: any = undefined

  if (/\.sass$/.test(inputPath)) {
    typing = 'sass'
  } else if (/\.less$/.test(inputPath)) {
    typing = 'less'
  } else if (/\.scss$/.test(inputPath)) {
    typing = 'scss'
  }

  const postcssConfig = loadPostcssConfig(configPath, typing)
  if (!postcssConfig) return { css: '', dependencies: [] }

  const css = await compilePreprocessor(inputPath)
  const result = await postcss(postcssConfig.plugins).process(css, {
    parser: parser,
    from: inputPath,
    to: inputPath
  })
  if (result.warnings().length) {
    result.warnings().forEach(warn => {
      console.warn(warn.toString())
    })
  }
  const dependencies = result.messages.filter(msg => msg.type === 'dependency').map(msg => msg.file)
  return {
    css: result.css,
    dependencies
  }
}

/**
 *
 * @param inputPath
 * @param outputPath
 * @returns
 */
const postCSS = (inputPath: string, outputPath: string) => {
  const readAndProcessCSS = async () => {
    const { css, dependencies } = await compileCSS(inputPath)
    fs.mkdirSync(dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, css)
    for (const dep of dependencies) {
      fs.watch(dep, eventType => {
        if (eventType === 'change') {
          readAndProcessCSS()
        }
      })
    }
  }
  readAndProcessCSS()
  fs.watch(inputPath, eventType => {
    if (eventType === 'change') {
      readAndProcessCSS()
    }
  })
}

export { postCSS }
