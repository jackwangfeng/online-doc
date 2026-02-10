declare module 'katex' {
  export interface KatexOptions {
    displayMode?: boolean
    throwOnError?: boolean
    errorColor?: string
    macros?: Record<string, string>
    colorIsTextColor?: boolean
    maxSize?: number
    maxExpand?: number
    strict?: boolean | 'warn' | 'ignore' | ((errorCode: string, errorMsg: string, token: any) => void)
    trust?: boolean
    output?: 'html' | 'mathml' | 'htmlAndMathml'
  }

  export function renderToString(
    expression: string,
    options?: KatexOptions
  ): string

  export function render(
    expression: string,
    element: HTMLElement,
    options?: KatexOptions
  ): void
}
