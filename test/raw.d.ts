// Vite "?raw" imports, used to read public/_headers inside the Workers test runtime.
declare module '*?raw' {
  const content: string
  export default content
}
