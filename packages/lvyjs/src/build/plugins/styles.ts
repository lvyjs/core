import { basename, dirname, resolve } from 'node:path'
import { applyAlias, stylesRegExp } from '../../config'
import { compileCSS } from '../../postcss'
import type { TsdownPlugin } from 'tsdown'

export type LvyStylesCSSImportOptions = { filter?: RegExp }

// 虚拟模块 id：避免被构建引擎（如 tsdown 的 css-guard）按扩展名拦截
const virtualPrefix = '\0lvy-css:'
const virtualIds = new Map<string, string>()
const originalToVirtual = new Map<string, string>()

/**
 * 自研样式插件：
 * 复用 lvyjs 自身的 CSS 编译管线（compileCSS，含 LESS/SASS 与 PostCSS），
 * 将样式文件编译为 CSS 资源并导出其文件路径。
 * 基于 Rolldown 插件 API 实现。
 *
 * @param options
 */
export const lvyStylesCSSImport = (options?: LvyStylesCSSImportOptions): TsdownPlugin => {
  const include = options?.filter ?? stylesRegExp
  const filter = (id: string) => include.test(id)
  return {
    name: 'lvy-css',
    resolveId(source, importer) {
      const normalized = applyAlias(source)
      if (filter(normalized) && importer) {
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
    async load(id) {
      const original = virtualIds.get(id)
      if (!original) return null
      this.addWatchFile(original)
      const { css } = await compileCSS(original)
      // 确保最后生产的css文件
      const refeId = this.emitFile({
        // 属于静态资源
        type: 'asset',
        name: basename(`${original}.css`),
        // 内容
        source: css
      })
      return [
        `const reg = ['win32'].includes(process.platform) ? /^file:\\/\\/\\// : /^file:\\/\\// ;`,
        `const fileUrl = import.meta.ROLLUP_FILE_URL_${refeId}.replace(reg, '');`,
        'export default fileUrl;'
      ].join('\n')
    }
  }
}
