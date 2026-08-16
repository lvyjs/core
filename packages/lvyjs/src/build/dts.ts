import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative } from 'node:path'
import { convertPath } from '../config'

export type AliasEntry = {
  find: string
  replacement: string
}

export type DtsLooseOptions = {
  /**
   * 项目根目录（用于解析 typescript 与 tsconfig）
   */
  cwd: string
  /**
   * 源码目录（默认 src）
   */
  inputDir: string
  /**
   * 输出目录（默认 lib）
   */
  outputDir: string
  /**
   * 别名规则，用于把产物 d.ts 中的别名导入改写为相对路径
   */
  aliasEntries: AliasEntry[]
}

const walk = (dir: string): string[] => {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

/**
 * 把单个导入说明符中的别名改写为相对路径。
 * 目标文件默认补 `.js` 后缀，与 tsdown 的 JS 产物保持一致，
 * TypeScript 解析时会把 `.js` 对应到 `.d.ts`。
 */
const rewriteAliasSpecifier = (
  spec: string,
  filePath: string,
  inputDir: string,
  outputDir: string,
  aliasEntries: AliasEntry[]
): string => {
  for (const { find, replacement } of aliasEntries) {
    if (spec.startsWith(find)) {
      const sourceTarget = spec.replace(find, replacement)
      const relFromInput = relative(inputDir, sourceTarget)
      if (!relFromInput.startsWith('..') && !isAbsolute(relFromInput)) {
        // 别名目标在源码目录内：映射到输出目录（lib）再计算相对路径
        let targetInOutput = join(outputDir, relFromInput)
        if (!extname(targetInOutput)) {
          // 目录导入（如 '@src/db' → src/db/index.ts）解析到 index.js
          const sourceDir = join(inputDir, relFromInput)
          const hasIndex =
            existsSync(join(sourceDir, 'index.ts')) ||
            existsSync(join(sourceDir, 'index.tsx')) ||
            existsSync(join(sourceDir, 'index.js')) ||
            existsSync(join(sourceDir, 'index.jsx'))
          targetInOutput = hasIndex ? join(targetInOutput, 'index.js') : targetInOutput + '.js'
        }
        return './' + convertPath(relative(dirname(filePath), targetInOutput))
      }
      // 别名指向源码目录之外：退化为直接相对路径
      let target = sourceTarget
      if (!extname(target)) target += '.js'
      return './' + convertPath(relative(dirname(filePath), target))
    }
  }
  return spec
}

/**
 * 重写 d.ts 中的别名导入（from / import() / 副作用 import）。
 * tsc 生成声明时保留源码里的别名说明符，产物需要改写为相对路径才可发布。
 */
export const rewriteAliasImports = (
  code: string,
  filePath: string,
  inputDir: string,
  outputDir: string,
  aliasEntries: AliasEntry[]
): string => {
  const rewrite = (spec: string) =>
    rewriteAliasSpecifier(spec, filePath, inputDir, outputDir, aliasEntries)
  return code
    .replace(/(from\s*['"])([^'"]+)(['"])/g, (m, pre, spec, post) => pre + rewrite(spec) + post)
    .replace(
      /(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g,
      (m, pre, spec, post) => pre + rewrite(spec) + post
    )
    .replace(
      /(^|[;\s}])(import\s+['"])([^'"]+)(['"])/gm,
      (m, lead, pre, spec, post) => lead + pre + rewrite(spec) + post
    )
}

/**
 * 宽松 d.ts 生成：
 * 用项目自带的 tsc 独立产出声明文件，诊断只作为警告，
 * 无法生成（如推断类型引用依赖内部路径）的文件跳过并汇总提示，
 * 构建永不因 d.ts 失败。
 */
export const generateDtsLoose = async (options: DtsLooseOptions): Promise<void> => {
  const { cwd, inputDir, outputDir, aliasEntries } = options

  // 解析项目自己的 typescript（找不到时仅提示，不影响构建）
  const require = createRequire(join(cwd, 'package.json'))
  let typescriptDir: string
  let tscBin: string
  try {
    const pkgPath = require.resolve('typescript/package.json')
    typescriptDir = dirname(pkgPath)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const bin = pkg.bin?.tsc ?? pkg.bin
    tscBin = typeof bin === 'string' ? join(typescriptDir, bin) : join(typescriptDir, 'bin', 'tsc')
    if (!existsSync(tscBin)) {
      console.warn('[lvyjs] 未找到 typescript 的 tsc 可执行文件，跳过 d.ts 生成')
      return
    }
  } catch {
    console.warn('[lvyjs] 未找到 typescript 依赖，跳过 d.ts 生成（构建不受影响）')
    return
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'lvy-dts-'))
  // 打包只处理 build.input 目录内的文件：
  // 项目的 tsconfig（仅用于编辑器）可能 include 了目录外的文件，
  // 这里生成临时 build tsconfig 覆盖 include，只包含 inputDir。
  const lvyDir = join(cwd, '.lvy')
  const buildTsconfig = join(lvyDir, `tsconfig.build.${process.pid}.json`)
  try {
    const tsconfigPath = join(cwd, 'tsconfig.json')
    const include = [convertPath(join(relative(lvyDir, join(cwd, inputDir)), '**/*'))]
    const buildConfig: Record<string, unknown> = {
      files: [],
      include
    }
    if (existsSync(tsconfigPath)) buildConfig.extends = tsconfigPath
    mkdirSync(lvyDir, { recursive: true })
    writeFileSync(buildTsconfig, JSON.stringify(buildConfig, null, 2))

    const args = [
      '--noEmit',
      'false',
      '--declaration',
      '--emitDeclarationOnly',
      '--outDir',
      tempDir,
      '--rootDir',
      inputDir
    ]
    args.unshift('-p', buildTsconfig)

    await new Promise<void>(resolvePromise => {
      const child = spawn(process.execPath, [tscBin, ...args], { cwd, stdio: 'inherit' })
      child.on('exit', code => {
        if (code) console.warn(`[lvyjs] tsc 退出码 ${code}（部分文件可能未生成 d.ts，构建继续）`)
        resolvePromise()
      })
      child.on('error', err => {
        console.warn(`[lvyjs] 运行 tsc 失败: ${err.message}，跳过 d.ts 生成`)
        resolvePromise()
      })
    })

    if (!existsSync(tempDir)) return

    // 复制生成的 d.ts 到输出目录，并改写别名导入
    let copied = 0
    for (const file of walk(tempDir)) {
      if (!file.endsWith('.d.ts')) continue
      const dest = join(outputDir, relative(tempDir, file))
      mkdirSync(dirname(dest), { recursive: true })
      const code = rewriteAliasImports(
        readFileSync(file, 'utf-8'),
        dest,
        inputDir,
        outputDir,
        aliasEntries
      )
      writeFileSync(dest, code)
      copied++
    }

    // 汇总缺失文件（诊断噪声太大，只给结论与示例）
    const expected = walk(inputDir).filter(
      file => /\.(ts|tsx|js|jsx)$/.test(file) && !file.endsWith('.d.ts')
    )
    const generated = new Set(
      walk(tempDir)
        .filter(file => file.endsWith('.d.ts'))
        .map(file => relative(tempDir, file).replace(/\.d\.ts$/, ''))
    )
    const missing = expected.filter(file => {
      const rel = relative(inputDir, file).replace(/\.(ts|tsx|js|jsx)$/, '')
      return !generated.has(rel)
    })
    if (missing.length) {
      console.warn(
        `[lvyjs] ${missing.length} 个文件未生成 d.ts` +
          '：' +
          missing
            .slice(0, 3)
            .map(file => relative(cwd, file))
            .join(', ') +
          ' ...'
      )
    } else if (copied) {
      console.info(`[lvyjs] 已生成 ${copied} 个 .d.ts 文件`)
    }
  } finally {
    try {
      rmSync(buildTsconfig, { force: true })
      rmSync(lvyDir, { recursive: true, force: true })
    } catch {
      // 忽略清理失败
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
}
