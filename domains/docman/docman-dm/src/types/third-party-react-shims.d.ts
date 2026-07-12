declare module 'react' {
  export function createElement(type: any, props?: any, ...children: any[]): any
}

declare module 'react-dom/server' {
  export function renderToStaticMarkup(element: any): string
}

declare module 'react-markdown' {
  const ReactMarkdown: any
  export default ReactMarkdown
}

declare module 'remark-gfm' {
  const remarkGfm: any
  export default remarkGfm
}
