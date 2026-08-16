import { getOptions } from '../store'
import { buildWithTsdown } from './tsdown'

export * from './plugins/index'
export { buildWithTsdown } from './tsdown'

/**
 * 构建入口：tsdown 引擎（基于 Rolldown）
 */
export async function buildAndRun() {
  const buildCfg = getOptions()?.build
  if (typeof buildCfg === 'boolean') return
  await buildWithTsdown()
}
