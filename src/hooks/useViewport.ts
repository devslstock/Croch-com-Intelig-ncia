import { useEffect, useState } from 'react'

export interface Viewport {
  w: number
  h: number
}

/** Tamanho da janela, atualizado ao girar o celular ou redimensionar. */
export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return v
}

/** Tamanho do ponto (em px) para o gráfico inteiro caber na largura da tela. Só vale no celular/tablet. */
export function fitCell(vw: number, chartWidth: number, max = 14, min = 4): number {
  const margins = 56 + 60 // folgas da página + margem dos números do gráfico
  return Math.max(min, Math.min(max, Math.floor((vw - margins) / chartWidth)))
}
