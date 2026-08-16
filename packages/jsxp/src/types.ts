import type { BrowserContext, BrowserContextOptions, Page as PlaywrightPage } from 'playwright-core'
import { GoToOptions, ScreenshotOptions } from 'puppeteer-core'
import React from 'react'

export type BrowserEngine = 'playwright' | 'puppeteer'

export type PlaywrightRequestResourceType =
  | 'document'
  | 'stylesheet'
  | 'image'
  | 'media'
  | 'font'
  | 'script'
  | 'texttrack'
  | 'xhr'
  | 'fetch'
  | 'eventsource'
  | 'websocket'
  | 'manifest'
  | 'other'

/**
 * 无头浏览器渲染函数配置参数
 */
export type RenderOptions = {
  preferredEngine?: BrowserEngine
  goto?: GoToOptions
  selector?: string
  screenshot?: Readonly<ScreenshotOptions> & {
    encoding: 'base64'
  }
  bufferFromEncoding?: BufferEncoding
  playwright?: {
    context?: BrowserContextOptions
    colorScheme?: 'light' | 'dark' | 'no-preference' | null
    media?: 'screen' | 'print' | null
    waitForFonts?: boolean
    waitForNetworkIdle?: boolean
    waitForSelectorTimeout?: number
    waitForStableFrames?: number
    stableFrameIntervalMs?: number
    maxContextPoolSize?: number
    retryOnBrowserError?: boolean
    network?: {
      allowUrlPatterns?: string[]
      blockUrlPatterns?: string[]
      blockResourceTypes?: PlaywrightRequestResourceType[]
    }
    locatorScreenshot?: Record<string, unknown>
    diagnostics?: {
      enabled?: boolean
      includeTrace?: boolean
      includeScreenshot?: boolean
      tracePath?: string
      screenshotPath?: string
    }
  }
}

export type PlaywrightPageHandler<TResult> = (
  page: PlaywrightPage,
  context: BrowserContext
) => TResult | Promise<TResult>

/**
 * 组件编译选项
 */
export type ComponentCreateOptionsType =
  | { component: React.ReactNode; html?: never; element?: never; propsCall?: never }
  | { html: string; component?: never; element?: never; propsCall?: never }
  | ComponentCreateWithElement<any>

/**
 * 路由配置项：component 直接传 ReactNode，或 element + propsCall 动态渲染
 */
export type RouteOption =
  { component: React.ReactNode; element?: never; propsCall?: never } | RouteWithElement<any>

export type RouteWithElement<P extends Record<string, any>> = {
  component?: never
  element: React.ComponentType<P>
  propsCall?: () => P | Promise<P>
}

export type ComponentCreateWithElement<P extends Record<string, any>> = {
  component?: never
  html?: never
  element: React.ComponentType<P>
  propsCall?: () => P | Promise<P>
}

/**
 * 辅助函数：定义单条路由，保留 element → propsCall 的类型推导
 */
export function route<P extends Record<string, any>>(opt: RouteWithElement<P>): RouteOption
export function route(opt: { component: React.ReactNode }): RouteOption
export function route(opt: RouteOption): RouteOption {
  return opt
}

/**
 * 工程配置选项
 */
export type JSXPOptions = {
  port?: number
  path?: string
  host?: string
  prefix?: string
  statics?: string | string[]
  routes?: Record<string, RouteOption>
}

export type ObtainProps<T> =
  T extends React.FC<infer P> ? P : T extends React.ComponentClass<infer P> ? P : never

export type RendersType = <
  ComponentsType extends Record<string, React.FC<any> | React.ComponentClass<any>>
>(
  Components: ComponentsType
) => <TKey extends keyof ComponentsType>(
  /**
   * 组件 key
   */
  key: TKey,
  /**
   * 组件 props
   */
  options: ObtainProps<ComponentsType[TKey]>,
  /**
   * 文件名名。默认为组件key
   */
  name?: string
) => Promise<Buffer | null>
