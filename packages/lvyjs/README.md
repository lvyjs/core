# LVY

基于 tsx、tsdown 构建的，为 Node.js 应用设计的开发与打包工具

| Project | Status                | Description |
| ------- | --------------------- | ----------- |
| [lvyjs] | [![lvyjs-s]][lvyjs-p] | 打包工具    |

[lvyjs]: https://github.com/lemonade-lab/alemonjs/tree/main/packages/lvyjs
[lvyjs-s]: https://img.shields.io/npm/v/lvyjs.svg
[lvyjs-p]: https://www.npmjs.com/package/lvyjs

文档： https://lemonade-lab.github.io/lvyjs.dev/

## 安装

```sh
npm install lvyjs -D
```

## 快速开始

### tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@src/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "extends": "lvyjs/tsconfig.json"
}
```

### lvy.config.ts

```ts
import { defineConfig } from 'lvyjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  alias: {
    entries: [{ find: '@src', replacement: join(__dirname, 'src') }]
  }
})
```

### 开发

```sh
# lvy <入口文件> [其他参数]
npx lvy src/index.ts
```

### 打包

对 src 目录打包并输出到 lib 目录：

```sh
npx lvy build
```

## 配置项

### env

注入环境变量到 `process.env`：

```ts
export default defineConfig({
  env: {
    MY_VAR: 'hello'
  }
})
```

### alias

路径别名配置：

```ts
export default defineConfig({
  alias: {
    entries: [{ find: '@src', replacement: join(__dirname, 'src') }]
  }
})
```

### assets

自定义静态资源识别规则（默认识别 `.png|.jpg|.jpeg|.gif|.svg|.webp|.ico`）：

```ts
export default defineConfig({
  assets: {
    filter: /\.(png|jpg|jpeg|gif|svg|webp|ico|yaml|txt|ttf)$/
  }
})
```

### styles

自定义样式文件识别规则（默认识别 `.css|.scss|.less|.sass`）：

```ts
export default defineConfig({
  styles: {
    filter: /\.(css|scss|less|sass)$/
  }
})
```

### watch

监听文件/目录变化，自动重启开发进程。支持 glob 模式：

```ts
// 简写 - 字符串数组
export default defineConfig({
  watch: ['src/**/*.yaml', 'public']
})

// 完整写法 - 自定义防抖延迟
export default defineConfig({
  watch: {
    paths: ['src/**/*.{yaml,json}', 'config'],
    delay: 1000 // 防抖延迟，默认 500ms
  }
})
```

### build

打包配置（tsdown 引擎，基于 Rolldown，需要 Node.js 22.18+）：

```ts
export default defineConfig({
  build: {
    input: 'src', // 输入目录，默认 src
    dir: 'lib', // 输出目录，默认 lib
    // tsdown 专属配置（可选），在默认映射之上覆盖
    tsdown: {
      minify: false
    }
  }
})
```

- 输出到 `lib` 目录，保持源码目录结构（`unbundle` 模式），并生成 `.d.ts` 声明文件
- CJS/JSON 由 Rolldown 内置处理，无需额外插件
- 样式/静态资源使用 lvyjs 自研插件，与开发模式共用同一套编译管线
- 别名由 tsdown 内置 `alias` 处理，产物中的导入会改写为相对路径
- `build.OutputOptions` 兼容旧配置：`input` / `dir` / `intro` / `outro` / `sourcemap`

## 静态资源

导入图片等静态资源时，返回文件的绝对路径：

```ts
import { readFileSync } from 'fs'
// 得到该文件的绝对路径，类型 string
import img_logo from '../logo.png'
const data = readFileSync(img_logo)
```

支持别名路径：

```ts
import img_logo from '@src/assets/img/logo.png'
```

## 样式文件

导入样式文件时，返回编译后 CSS 文件的绝对路径：

```ts
import { readFileSync } from 'fs'
// 得到编译后 CSS 文件的绝对路径
import cssURL from '@src/assets/style.css'
// 完整的单文件 CSS 数据（内部引用已合并）
const data = readFileSync(cssURL, 'utf-8')
```

内置支持 CSS 处理。如需 LESS、SASS/SCSS 支持：

```sh
yarn add less sass -D
```

### 样式文件中的引用

**CSS**

```css
@import url('@src/assets/test2.css');
@import url('./test2.css');
/* 支持别名 */
```

**SCSS**

```scss
@import url('@src/assets/test3.scss');
@import url('./test3.scss');
@use './test3.scss';
```

**LESS**

```less
@import './test1.css';
```

## PostCSS

通过 `postcss.config.cjs` 配置 PostCSS 插件。内置支持 `postcss-import`、`postcss-url`、`autoprefixer`。

### 压缩

```sh
yarn add cssnano -D
```

```cjs
// postcss.config.cjs
module.exports = {
  plugins: {
    cssnano: {
      preset: 'default'
    }
  }
}
```

### Tailwind CSS

```sh
yarn add tailwindcss -D
```

```cjs
// postcss.config.cjs
module.exports = {
  plugins: {
    tailwindcss: {}
  }
}
```

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}']
}
```
