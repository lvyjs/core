export const assetsRegExp = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/
export const stylesRegExp = /\.(css|scss|less|sass)$/

/**
 * 支持的配置文件名列表（按优先级排序）
 */
export const configFiles = [
  'lvy.config.ts',
  'lvy.config.js',
  'lvy.config.mjs',
  'lvy.config.cjs',
  'lvy.config.tsx'
]
/**
 *
 * @param val
 * @returns
 */
export const createAlias = val => {
  const alias = {}
  if (!Array.isArray(val.entries)) {
    return alias
  }
  // 遍历 entries 数组
  val.entries.forEach(entry => {
    alias[entry.find] = entry.replacement
  })
  return alias
}

/**
 * 将导入路径中的 lvyjs 别名（entries）替换为真实路径
 * 供构建插件在 resolveId 阶段使用：
 * tsdown 的内置 alias 在插件 resolveId 之后才生效，
 * 样式/资源插件必须自行完成别名归一化
 *
 * @param source 原始导入路径
 */
export const applyAlias = (source: string): string => {
  const alias = global.lvyConfig?.alias
  if (!alias || typeof alias === 'boolean' || !Array.isArray(alias.entries)) {
    return source
  }
  for (const { find, replacement } of alias.entries) {
    if (source.startsWith(find)) {
      return source.replace(find, replacement)
    }
  }
  return source
}

export const isWin32 = () => {
  return ['win32'].includes(process.platform)
}
export const convertPath = (inputPath: string) => {
  return isWin32() ? inputPath.replace(/\\/g, '/') : inputPath
}
