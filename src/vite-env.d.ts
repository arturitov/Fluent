/// <reference types="vite/client" />

/** Injected at build time — short commit sha + build timestamp. */
declare const __BUILD_VERSION__: string

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
