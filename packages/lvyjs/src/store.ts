import { existsSync } from 'fs'
import { join } from 'path'
import { Alias } from './typing'

export type Options = {
  env?: {
    [key: string]: string
  }
  /**
   * 别名
   */
  alias?:
    | {
        /**
         * 别名规则
         */
        entries?: Alias[]
      }
    | false
  /**
   * 静态资源识别
   */
  assets?:
    | {
        /**
         * 过滤得到指定格式的文件识别之为静态资源
         */
        filter?: RegExp
      }
    | false
  /**
   * styles文件解析器
   */
  styles?:
    | {
        /**
         * 过滤得到指定格式的文件识别之为静态资源
         */
        filter?: RegExp
      }
    | false
  /**
   * 监听文件/目录变化，自动重启开发进程
   * @example
   * watch: ['src/config.yaml', 'public']
   * watch: { paths: ['src/config.yaml'], delay: 500 }
   */
  watch?:
    | string[]
    | {
        /**
         * 要监听的文件或目录路径（相对于项目根目录）
         */
        paths: string[]
        /**
         * 防抖延迟（毫秒），默认 500
         */
        delay?: number
      }
    | false
  /**
   * 打包时配置
   */
  build?:
    | {
        /**
         * 输入目录，默认 src
         */
        input?: string
        /**
         * 输出目录，默认 lib
         */
        dir?: string
        /**
         * tsdown 专属配置，在默认映射之上透传覆盖
         */
        tsdown?: Record<string, any> | false
        /**
         * 兼容旧配置：input/dir/intro/outro/sourcemap
         * （旧版本配置的 OutputOptions 别名，仅保留 lvyjs 映射的字段）
         */
        OutputOptions?: {
          /**
           * 默认 src
           */
          input?: string
          /**
           * 默认 lib
           */
          dir?: string
          /**
           * 产物头部内容
           */
          intro?: string
          /**
           * 产物尾部内容
           */
          outro?: string
          /**
           * 是否生成 sourcemap，默认 false
           */
          sourcemap?: boolean
        }
      }
    | false
}

/**
 *
 */
export const initConfig = async () => {
  if (!global.lvyConfig) global.lvyConfig = {}
  const configFiles = [
    'lvy.config.ts',
    'lvy.config.js',
    'lvy.config.mjs',
    'lvy.config.cjs',
    'lvy.config.tsx'
  ]
  let configDir = ''
  for (const file of configFiles) {
    if (existsSync(file)) {
      configDir = file
      break
    }
  }
  if (configDir !== '') {
    const v = await import(`file://${join(process.cwd(), configDir)}`)
    if (v?.default) {
      global.lvyConfig = v.default
      if (global.lvyConfig?.env) {
        for (const key in global.lvyConfig.env) {
          process.env[key] = String(global.lvyConfig.env[key])
        }
      }
      process.env.NODE_ENV = process.env?.NODE_ENV || 'development'
    }
  }
}

/**
 * @returns
 */
export const getOptions = () => global.lvyConfig

/**
 * @param param0
 * @returns
 */
export const defineConfig = (options?: Options) => options
