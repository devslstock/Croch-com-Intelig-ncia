import { useEffect, useMemo, useRef, useState } from 'react'
import { APP_SLUG } from '../brand'
import { chartToPngBlob, type RenderOptions } from '../chart/render'
import { shoppingSheetToPng } from '../chart/shoppingPng'
import { AppBar } from '../components/AppBar'
import { ChartCanvas, type ViewMode } from '../components/ChartCanvas'
import { ChartThumb } from '../components/ChartThumb'
import { CropPicker, FULL_CROP, type Crop } from '../components/CropPicker'
import { PlainLegend } from '../components/PlainLegend'
import { Stepper } from '../components/Stepper'
import { fitCell, useViewport } from '../hooks/useViewport'
import { YarnLegend } from '../components/YarnLegend'
import { generateChart } from '../engine/client'
import { MAX_COLORS, MAX_WIDTH, MIN_COLORS, MIN_WIDTH } from '../engine/pipeline'
import { DEFAULT_PARAMS, type ChartResult, type EngineParams, type RawImage, type StartSide, type Style } from '../engine/types'
import type { SavedChart, SavedChartInput } from '../storage/charts'
import { KIND_LABEL, YARN_PALETTES, defaultYarnId } from '../yarn/library'
import { matchPalette, shoppingList } from '../yarn/yarn'

const MAX_SIDE = 1600
const PREVIEW = { width: 28, colors: 8 }

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

const pad = (n: number) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export interface ConverterProps {
  onBack: () => void
  onSave: (input: SavedChartInput) => Promise<SavedChart>
  /** Chamado depois de salvar: a tela segue para o editor. */
  onSaved: (saved: SavedChart) => void
}

export function Converter({ onBack, onSave, onSaved }: ConverterProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [params, setParams] = useState<EngineParams>(DEFAULT_PARAMS)
  const [startSide, setStartSide] = useState<StartSide>(() => (localStorage.getItem('tramado:side') as StartSide) || 'right')
  const [symbols, setSymbols] = useState(false)
  const [zoom, setZoom] = useState(14)
  const [zoomTouched, setZoomTouched] = useState(false)
  const viewport = useViewport()
  const [tab, setTab] = useState<ViewMode>('grafico')
  const [chart, setChart] = useState<ChartResult | null>(null)
  const [previews, setPreviews] = useState<Partial<Record<Style, ChartResult>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Abre já com um fio escolhido, para a legenda e as imagens sempre trazerem o número das linhas.
  const [yarnId, setYarnId] = useState(defaultYarnId)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [savedId, setSavedId] = useState<string | undefined>(undefined)
  const [name, setName] = useState(`Meu gráfico · ${today()}`)
  const [nameTouched, setNameTouched] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = useRef(0)
  const previewRun = useRef(0)

  useEffect(() => {
    localStorage.setItem('tramado:side', startSide)
  }, [startSide])

  useEffect(() => {
    try { localStorage.setItem('tramado:yarn', yarnId) } catch { /* sem armazenamento */ }
  }, [yarnId])

  useEffect(() => () => { if (loaded) URL.revokeObjectURL(loaded.url) }, [loaded])

  // No celular o gráfico começa inteiro na tela; a pessoa aproxima com o zoom quando quiser.
  useEffect(() => {
    if (zoomTouched || !chart) return
    setZoom(viewport.w < 900 ? fitCell(viewport.w, chart.width) : 14)
  }, [chart?.width, viewport.w, zoomTouched]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Miniaturas dos estilos (pequenas e rápidas): só mudam com a foto e o recorte.
  useEffect(() => {
    if (!loaded) return
    const id = ++previewRun.current
    const t = setTimeout(async () => {
      try {
        const raw = cropToRaw(loaded.bitmap, crop)
        const [realista, pb] = await Promise.all([
          generateChart(raw, { ...DEFAULT_PARAMS, ...PREVIEW, style: 'realista' }),
          generateChart(raw, { ...DEFAULT_PARAMS, ...PREVIEW, style: 'pb' }),
        ])
        if (id === previewRun.current) setPreviews({ realista, pb })
      } catch {
        /* miniaturas são enfeite: sem elas a tela continua funcionando */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [loaded, crop])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      setLoaded({ bitmap, url: URL.createObjectURL(file), name: file.name.replace(/\.[^.]+$/, '') })
      setCrop(FULL_CROP)
      setChart(null)
      setPreviews({})
      setError(null)
      setSavedId(undefined)
      setSaveMsg(null)
      if (!nameTouched) setName(`Meu gráfico · ${today()}`)
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

  const baseName = name.trim() || loaded?.name || 'grafico'

  const downloadChart = async () => {
    if (!chart) return
    download(await chartToPngBlob(chart, { cell: 20, symbols: true, startSide, legendLabels }), `${baseName}-${APP_SLUG}.png`)
  }

  const downloadShopping = async () => {
    if (!chart || !yarn) return
    const blob = await shoppingSheetToPng({
      title: `Lista de compras · ${baseName} · ${today()}`,
      yarnName: `${yarn.brand} ${yarn.line}`.trim(),
      width: chart.width,
      height: chart.height,
      items: shopping,
    })
    download(blob, `${baseName}-lista-de-compras.png`)
  }

  /** Ajuste manual: muda a cor no gráfico e o fio sugerido acompanha (a escolha manual de fio dessa cor é descartada). */
  const changeColor = (letter: string, hex: string) => {
    setChart((c) => (c ? { ...c, palette: c.palette.map((p) => (p.letter === letter ? { ...p, hex } : p)) } : c))
    setPicked((p) => {
      if (!(letter in p)) return p
      const { [letter]: _drop, ...rest } = p
      return rest
    })
    setSaveMsg(null)
  }

  const save = async () => {
    if (!chart) return
    try {
      const saved = await onSave({ id: savedId, name: name.trim() || `Meu gráfico · ${today()}`, chart, yarnId, picked, startSide })
      setSavedId(saved.id)
      onSaved(saved) // segue para o editor
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível salvar.' })
    }
  }

  const styleTiles: Array<{ id: Style; label: string }> = [
    { id: 'realista', label: 'Realista' },
    { id: 'pb', label: 'Preto e branco' },
  ]

  return (
    <div className="studio-page">
      <AppBar title="Foto em gráfico" onBack={onBack} />

      <div className="studio studio--flat">
        <aside className="studio__side" aria-label="Opções do gráfico">
          <label className="field">
            <span className="side-label">Nome do gráfico</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); setSaveMsg(null) }} />
          </label>

          <div>
            <span className="side-label">Estilo</span>
            <div className="styles" role="radiogroup" aria-label="Estilo do gráfico">
              {[styleTiles[0], null, styleTiles[1]].map((s) =>
                s ? (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={params.style === s.id}
                    className={params.style === s.id ? 'style-tile style-tile--on' : 'style-tile'}
                    onClick={() => set('style', s.id)}
                    disabled={!loaded}
                  >
                    <span className="style-tile__img">{previews[s.id] ? <ChartThumb chart={previews[s.id]!} /> : <span className="style-tile__empty" aria-hidden>▦</span>}</span>
                    <span>{s.label}</span>
                  </button>
                ) : (
                  <div key="fofinho" className="style-tile style-tile--soon" aria-disabled="true">
                    <span className="style-tile__img"><span className="style-tile__empty" aria-hidden>🧸</span></span>
                    <span>Fofinho</span>
                    <em className="badge badge--tiny">Em breve</em>
                  </div>
                ),
              )}
            </div>
          </div>

          <label className="field">
            <span className="side-label">Fio</span>
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
                      <option key={y.id} value={y.id}>{y.brand} {y.line} · {y.colors.length} cores</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </label>

          {loaded && (
            <details className="fold" open>
              <summary>Ajustes</summary>
              <div className="fold__body">
                <Stepper label="Tamanho" unit="pontos" value={params.width} min={MIN_WIDTH} max={MAX_WIDTH} onChange={(v) => set('width', v)} />
                <Stepper label="Cores" unit="cores" value={params.colors} min={MIN_COLORS} max={MAX_COLORS} onChange={(v) => set('colors', v)} />

                <div>
                  <span className="side-label">Recortar</span>
                  <CropPicker src={loaded.url} aspect={aspect} crop={crop} onChange={setCrop} />
                  <div className="row row--gap">
                    <button className="btn btn--sm" onClick={() => setCrop(FULL_CROP)}>Foto inteira</button>
                    <button className="btn btn--sm" onClick={() => setCrop(centered34())}>Recorte 3:4</button>
                  </div>
                  <p className="hint">Arraste sobre a foto para escolher a área.</p>
                </div>

                <div>
                  <span className="side-label">Começar a carreira 1 pela</span>
                  <div className="seg" role="radiogroup" aria-label="Lado em que a carreira 1 começa">
                    <button role="radio" aria-checked={startSide === 'right'} className={startSide === 'right' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setStartSide('right')}>Direita</button>
                    <button role="radio" aria-checked={startSide === 'left'} className={startSide === 'left' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setStartSide('left')}>Esquerda</button>
                  </div>
                </div>

                <label className="check">
                  <input type="checkbox" checked={params.cleanSpeckles} onChange={(e) => set('cleanSpeckles', e.target.checked)} />
                  Limpar pontos soltos
                </label>

                <button className="btn btn--outline" disabled title="Em breve">
                  Pintar pontos à mão <em className="badge badge--tiny">Em breve</em>
                </button>
              </div>
            </details>
          )}
        </aside>

        <main className="studio__main">
          <div className="toolbar">
            <label className="btn">
              {loaded ? 'Trocar foto' : 'Escolher foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button className="btn btn--primary" onClick={save} disabled={!chart}>{savedId ? 'Atualizar gráfico' : 'Salvar gráfico'}</button>
          </div>
          {saveMsg && <p className={saveMsg.ok ? 'ok' : 'error'} role="status">{saveMsg.text}</p>}
          {error && <p className="error" role="alert">{error}</p>}

          {!loaded && (
            <div className="card dropzone">
              <p><b>Escolha uma foto</b> para ver o gráfico aparecer.</p>
              <label className="btn btn--primary">
                Escolher foto
                <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <p className="hint">A foto fica no seu aparelho: ela não é enviada nem guardada.</p>
            </div>
          )}

          {chart && (
            <>
              <div className="viewtabs" role="tablist">
                <button role="tab" aria-selected={tab === 'grafico'} className={tab === 'grafico' ? 'viewtab viewtab--on' : 'viewtab'} onClick={() => setTab('grafico')}>Gráfico</button>
                <button role="tab" aria-selected={tab === 'croche'} className={tab === 'croche' ? 'viewtab viewtab--on' : 'viewtab'} onClick={() => setTab('croche')}>Em crochê</button>
              </div>

              <section className="card chartcard">
                <div className="chartcard__bar">
                  <span className="chartcard__info">
                    {chart.width} × {chart.height} pontos <small>({(chart.width * chart.height).toLocaleString('pt-BR')})</small>
                    {busy && <span className="busy"> · atualizando…</span>}
                  </span>
                  {tab === 'grafico' && (
                    <label className="check check--inline">
                      <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} />
                      Símbolos
                    </label>
                  )}
                  <label className="field field--inline">
                    <span>Zoom</span>
                    <input type="range" min={4} max={28} value={zoom} onChange={(e) => { setZoom(Number(e.target.value)); setZoomTouched(true) }} />
                  </label>
                </div>
                <div className="chart-scroll">
                  <ChartCanvas chart={chart} options={options} mode={tab} />
                </div>
              </section>

              <div className="results">
              <section className="card">
                <h2>Cores{yarn ? ` · ${yarn.brand} ${yarn.line}` : ''}</h2>
                {yarn ? (
                  <YarnLegend chart={chart} yarn={yarn} matches={matches} onChoose={(letter, code) => setPicked((p) => ({ ...p, [letter]: code }))} onColorChange={changeColor} />
                ) : (
                  <PlainLegend chart={chart} onColorChange={changeColor} />
                )}
                {!yarn && <p className="hint">Sem número de fio. Escolha um fio em “Fio” para ver o número das linhas.</p>}
              </section>

              {yarn && (
                <section className="card">
                  <h2>Lista de compras</h2>
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
                </section>
              )}

              <button className="btn btn--primary" onClick={downloadChart}>Baixar gráfico (PNG)</button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
