import { isBuiltin } from 'node:module'
import type { TsdownPlugin } from 'tsdown'

export type LvyExternalOptions = {
  /**
   * 别名前缀（find）列表。以这些前缀开头的裸导入由别名解析处理，不外部化。
   */
  aliasFinds?: string[]
  /**
   * tsdown deps.alwaysBundle 模式，命中的依赖仍按用户意图打包。
   */
  alwaysBundle?: string[] | RegExp
}

// 匹配 npm 包名（含 scope 与子路径）：pkg、@scope/pkg、pkg/sub/path
const packageSpecifier = /^(?:@[a-zA-Z0-9-][a-zA-Z0-9-._]*\/)?[a-zA-Z0-9-][a-zA-Z0-9-._]*(?:\/|$)/

const matchAlwaysBundle = (patterns: string[] | RegExp | undefined, source: string): boolean => {
  if (!patterns) return false
  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    if (pattern instanceof RegExp) {
      if (pattern.test(source)) return true
    } else if (pattern === source || source.startsWith(`${pattern}/`)) {
      return true
    }
  }
  return false
}

/**
 * 默认外部化插件：
 * 把未被别名/资源/样式插件处理的裸包导入标记为外部依赖。
 * Node.js 库的默认预期是不把 dependencies 打进产物，
 * 产物保留 `import ... from 'pkg'`，交由运行时的依赖解析。
 *
 * 注意不能使用 tsdown 的 deps.neverBundle：
 * 它会在别名/资源/样式插件之前把 `@src/...` 等裸导入一并外部化，
 * 导致产物中残留无法解析的别名引用。
 *
 * 通过 build.bundleDeps: true 可关闭本插件（前端类应用场景）。
 */
export const lvyExternal = (options?: LvyExternalOptions): TsdownPlugin => {
  const aliasFinds = options?.aliasFinds ?? []
  return {
    name: 'lvy-external',
    resolveId(source) {
      if (source[0] === '.' || source[0] === '\0' || source.startsWith('data:')) return null
      if (isBuiltin(source)) return null
      if (matchAlwaysBundle(options?.alwaysBundle, source)) return null
      // 别名导入交给内置 alias 解析，不能外部化
      if (aliasFinds.some(find => source.startsWith(find))) return null
      if (packageSpecifier.test(source)) {
        return { id: source, external: true }
      }
      return null
    }
  }
}
