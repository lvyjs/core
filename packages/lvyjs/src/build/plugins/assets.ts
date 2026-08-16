import { dirname, basename, resolve } from 'path'
import { readFileSync } from 'fs'
import { assetsRegExp, applyAlias } from '../../config'
import type { TsdownPlugin } from 'tsdown'
export type LvyAssetsOptions = { filter?: RegExp }

// 虚拟模块 id：避免被构建引擎（如 tsdown 的 css-guard）按扩展名拦截
const virtualPrefix = '\0lvy-asset:'
const virtualIds = new Map<string, string>()
const originalToVirtual = new Map<string, string>()

/**
 * 静态资源插件：导入图片等资源时返回文件的绝对路径
 * 基于 Rolldown 插件 API 实现
 *
 * @param options
 */
export const lvyAssets = (options?: LvyAssetsOptions): TsdownPlugin => {
  const { filter = assetsRegExp } = options ?? {}
  return {
    name: 'lvy-assets',
    resolveId(source, importer) {
      const normalized = applyAlias(source)
      if (filter.test(normalized) && importer) {
        const original = resolve(dirname(importer), normalized)
        let virtualId = originalToVirtual.get(original)
        if (!virtualId) {
          virtualId = `${virtualPrefix}${virtualIds.size}`
          originalToVirtual.set(original, virtualId)
          virtualIds.set(virtualId, original)
        }
        return virtualId
      }
    },
    load(id) {
      const original = virtualIds.get(id)
      if (!original) return null
      this.addWatchFile(original)
      const referenceId = this.emitFile({
        type: 'asset',
        name: basename(original),
        source: readFileSync(original)
      })
      return [
        `const reg = ['win32'].includes(process.platform) ? /^file:\\/\\/\\// : /^file:\\/\\// ;`,
        `const fileUrl = import.meta.ROLLUP_FILE_URL_${referenceId}.replace(reg, '');`,
        'export default fileUrl;'
      ].join('\n')
    }
  }
}
