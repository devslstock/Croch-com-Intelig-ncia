/** Imprime uma imagem PNG: abre em um quadro escondido e chama a impressão do navegador. */
export function printImage(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:10mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style></head><body><img src="${url}" alt="Gráfico"></body></html>`
  frame.onload = () => {
    const w = frame.contentWindow
    const img = w?.document.querySelector('img')
    const go = () => {
      w?.focus()
      w?.print()
      setTimeout(() => {
        frame.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
    }
    if (img && !img.complete) img.onload = go
    else go()
  }
  document.body.appendChild(frame)
}
