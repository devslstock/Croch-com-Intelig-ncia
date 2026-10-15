import { useEffect, useMemo, useRef, useState } from 'react'
import { chartToPngBlob, type RenderOptions } from './chart/render'
import { ChartCanvas } from './components/ChartCanvas'
import { CropPicker, FULL_CROP, type Crop } from './components/CropPicker'
import { generateChart } from './engine/client'
import { MAX_COLORS, MAX_WIDTH, MIN_COLORS, MIN_WIDTH } from './engine/pipeline'
import { shoppingSheetToPng } from './chart/shoppingPng'
import { YarnLegend } from './components/YarnLegend'
import { KIND_LABEL, YARN_PALETTES } from './yarn/library'
import { matchPalette, shoppingList } from './yarn/yarn'
import { DEFAULT_PARAMS, type ChartResult, type EngineParams, type RawImage, type StartSide } from './engine/types'

const MAX_SIDE = 1600

interface Loaded {
  bitmap: ImageBitmap
  url: string
  name: string
}

/** Recorta a área escolhida e limita o lado maior a 1.600 px. O EXIF já é aplicado pelo createImageBitmap. */
function cropToRaw(bitmap: ImageBitmap, crop: Crop): RawImage {
  const sx = Math.round(crop.x * bitmap.width)
  const sy = Math.round(crop.y * bitmap.height)
  const sw = Math.max(1, Math.round(crop.w * bitmap.width))
  const sh = Math.max(1, Math.round(crop.h * bitmap.height))
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
  const { data, width, height } = ctx.getImageData(0, 0, dw, dh)
  return { data, width, height }
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [params, setParams] = useState<EngineParams>(DEFAULT_PARAMS)
  const [startSide, setStartSide] = useState<StartSide>(() => (localStorage.getItem('tramado:side') as StartSide) || 'right')
  const [symbols, setSymbols] = useState(false)
  const [zoom, setZoom] = useState(14)
  const [chart, setChart] = useState<ChartResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yarnId, setYarnId] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const run = useRef(0)

  useEffect(() => {
    localStorage.setItem('tramado:side', startSide)
  }, [startSide])

  useEffect(() => () => { if (loaded) URL.revokeObjectURL(loaded.url) }, [loaded])

  // Gera de novo (com pequena espera) sempre que foto, recorte ou ajustes mudam.
  useEffect(() => {
    if (!loaded) return
    const id = ++run.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const raw = cropToRaw(loaded.bitmap, crop)
        const result = await generateChart(raw, params)
        if (id === run.current) {
          setChart(result)
          setPicked({})
          setError(null)
        }
      } catch (e) {
        if (id === run.current) setError(e instanceof Error ? e.message : 'Não foi possível gerar o gráfico')
      } finally {
        if (id === run.current) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [loaded, crop, params])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      setLoaded({ bitmap, url: URL.createObjectURL(file), name: file.name.replace(/\.[^.]+$/, '') })
      setCrop(FULL_CROP)
      setChart(null)
    } catch {
      setError('Não consegui abrir essa foto. Tente um JPG ou PNG.')
    }
  }

  const yarn = YARN_PALETTES.find((y) => y.id === yarnId)
  const matches = useMemo(() => (chart && yarn ? matchPalette(chart, yarn, picked) : []), [chart, yarn, picked])
  const shopping = useMemo(() => shoppingList(matches), [matches])
  const legendLabels = useMemo(() => Object.fromEntries(matches.map((m) => [m.letter, `${m.best.yarn.code} ${m.best.yarn.name}`.trim()])), [matches])
  const options: RenderOptions = useMemo(() => ({ cell: zoom, symbols, startSide, legend: false }), [zoom, symbols, startSide])
  const set = <K extends keyof EngineParams>(k: K, v: EngineParams[K]) => setParams((p) => ({ ...p, [k]: v }))

  const aspect = loaded ? loaded.bitmap.width / loaded.bitmap.height : 1
  const centered34 = (): Crop => {
    // Recorte 3:4 (retrato) centralizado, em frações da foto.
    const target = 3 / 4
    if (aspect > target) {
      const w = target / aspect
      return { x: (1 - w) / 2, y: 0, w, h: 1 }
    }
    const h = aspect / target
    return { x: 0, y: (1 - h) / 2, w: 1, h }
  }

  const download = async () => {
    if (!chart) return
    const blob = await chartToPngBlob(chart, { cell: 20, symbols: true, startSide, legendLabels })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${loaded?.name || 'grafico'}-tramado.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const downloadShopping = async () => {
    if (!chart || !yarn) return
    const d = new Date()
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    const blob = await shoppingSheetToPng({
      title: `Lista de compras · ${loaded?.name || 'Gráfico'} · ${date}`,
      yarnName: `${yarn.brand} ${yarn.line}`.trim(),
      width: chart.width,
      height: chart.height,
      items: shopping,
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${loaded?.name || 'grafico'}-lista-de-compras.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Tramado</h1>
        <p>Sua foto vira gráfico de crochê</p>
      </header>

      <main>
        <section className="card">
          <label className="btn btn--primary">
            {loaded ? 'Trocar foto' : 'Escolher foto'}
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <p className="hint">A foto fica no seu celular: ela não é enviada nem guardada.</p>

          {loaded && (
            <>
              <CropPicker src={loaded.url} aspect={aspect} crop={crop} onChange={setCrop} />
              <div className="row">
                <button className="btn" onClick={() => setCrop(FULL_CROP)}>Foto inteira</button>
                <button className="btn" onClick={() => setCrop(centered34())}>Recorte 3:4</button>
              </div>
              <p className="hint">Arraste sobre a foto para escolher a área.</p>
            </>
          )}
        </section>

        {loaded && (
          <section className="card">
            <h2>Ajustes</h2>
            <label className="field">
              <span>Largura: {params.width} pontos</span>
              <input type="range" min={MIN_WIDTH} max={MAX_WIDTH} value={params.width} onChange={(e) => set('width', Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Cores: {params.colors}</span>
              <input type="range" min={MIN_COLORS} max={MAX_COLORS} value={params.colors} onChange={(e) => set('colors', Number(e.target.value))} />
            </label>
            <div className="row">
              <label className="field">
                <span>Estilo</span>
                <select value={params.style} onChange={(e) => set('style', e.target.value as EngineParams['style'])}>
                  <option value="realista">Realista</option>
                  <option value="pb">Preto e branco</option>
                </select>
              </label>
              <label className="field">
                <span>Carreira 1 começa pela</span>
                <select value={startSide} onChange={(e) => setStartSide(e.target.value as StartSide)}>
                  <option value="right">Direita</option>
                  <option value="left">Esquerda</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Fio</span>
              <select value={yarnId} onChange={(e) => { setYarnId(e.target.value); setPicked({}) }}>
                <option value="">Cores livres (sem fio)</option>
                {(['croche', 'ponto-cruz'] as const).map((kind) => {
                  const list = YARN_PALETTES.filter((y) => y.kind === kind)
                  if (list.length === 0) {
                    return kind === 'croche' ? <option key={kind} disabled>Crochê: tabela de cores ainda não incluída</option> : null
                  }
                  return (
                    <optgroup key={kind} label={KIND_LABEL[kind]}>
                      {list.map((y) => (
                        <option key={y.id} value={y.id}>{y.brand} {y.line}</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={params.cleanSpeckles} onChange={(e) => set('cleanSpeckles', e.target.checked)} />
              Limpar pontos soltos
            </label>
          </section>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        {chart && (
          <section className="card">
            <h2>
              Gráfico {chart.width} × {chart.height} <small>({(chart.width * chart.height).toLocaleString('pt-BR')} pontos)</small>
              {busy && <span className="busy"> · atualizando…</span>}
            </h2>
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} />
                Símbolos nos pontos
              </label>
              <label className="field field--inline">
                <span>Zoom</span>
                <input type="range" min={4} max={28} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </label>
            </div>
            <div className="chart-scroll">
              <ChartCanvas chart={chart} options={options} />
            </div>

            <h3>Cores{yarn ? ` · ${yarn.brand} ${yarn.line}` : ''}</h3>
            {yarn ? (
              <YarnLegend chart={chart} yarn={yarn} matches={matches} onChoose={(letter, code) => setPicked((p) => ({ ...p, [letter]: code }))} />
            ) : (
            <ul className="legend">
              {chart.palette.map((p) => (
                <li key={p.letter}>
                  <span className="swatch" style={{ background: p.hex }} />
                  <b>{p.letter}</b> {p.symbol} <span>{p.count.toLocaleString('pt-BR')} pontos</span>
                </li>
              ))}
            </ul>
            )}
            {yarn && (
              <>
                <h3>Lista de compras</h3>
                <table className="shop">
                  <thead><tr><th>Fio</th><th>Cores</th><th>Pontos</th></tr></thead>
                  <tbody>
                    {shopping.map((i) => (
                      <tr key={i.yarn.code}>
                        <td><span className="chip__dot" style={{ background: i.yarn.hex }} /> <b>{i.yarn.code}</b> {i.yarn.name}</td>
                        <td>{i.letters.join(', ')}</td>
                        <td>{i.stitches.toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn" onClick={downloadShopping}>Baixar lista de compras (PNG)</button>
              </>
            )}
            <button className="btn btn--primary" onClick={download}>Baixar imagem (PNG)</button>
          </section>
        )}

        {!loaded && <p className="empty">Escolha uma foto para ver o gráfico aparecer.</p>}
      </main>
    </div>
  )
}
