// CSS
declare module '*.css' {
  const src: string
  export default src
}
declare module '*.scss' {
  const src: string
  export default src
}
declare module '*.less' {
  const src: string
  export default src
}
declare module '*.sass' {
  const src: string
  export default src
}

// images
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
declare module '*.ico' {
  const src: string
  export default src
}

// lvyjs global config
// 注意：这里不能使用顶层 import/export（否则文件变成模块，
// TS7 在小程序里不会应用模块文件中的 ambient 通配声明，导致 *.css 等报 TS2307）。
// 用 import() 类型查询保持文件为纯脚本。
declare var lvyConfig: import('lvyjs').Options
