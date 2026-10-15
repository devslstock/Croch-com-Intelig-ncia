import { useEffect, useMemo, useRef, useState } from 'react'
import { printImage } from '../chart/print'
import { chartToPngBlob, MARGIN, type RenderOptions } from '../chart/render'
import { shoppingSheetToPng } from '../chart/shoppingPng'
import { AppBar } from '../components/AppBar'
import { ChartCanvas, type CellEvent, type ViewMode } from '../components/ChartCanvas'
import { CrochetPanel, type CrochetState } from '../components/CrochetPanel'
import { PlainLegend } from '../components/PlainLegend'
import { YarnLegend } from '../components/YarnLegend'
import { rowGuide } from '../editor/crochetRows'
import { EMPTY_HISTORY, floodFill, paintCell, pushHistory, recount, redo, stampMask, undo, type History } from '../editor/edit'
import { renderText, type LetterChoice, type Placement } from '../editor/font'
import type { ChartResult, PaletteEntry, StartSide } from '../engine/types'
import { decodeGrid, type SavedChart, type SavedChartInput } from '../storage/charts'
import { KIND_LABEL, YARN_PALETTES } from '../yarn/library'
import { matchPalette, shoppingList } from '../yarn/yarn'

type Tool = 'lapis' | 'balde' | 'pegar' | 'texto'
type SaveStatus = 'salvo' | 'pendente' | 'salvando' | 'erro'
interface Doc {
  grid: Uint8Array
  history: History
}

const TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'lapis', icon: '✏️', label: 'Lápis' },
  { id: 'balde', icon: '🪣', label: 'Balde' },
  { id: 'pegar', icon: '💧', label: 'Pegar cor' },
  { id: 'texto', icon: '🔤', label: 'Texto' },
]
const LETTERS: Array<{ id: LetterChoice; label: string }> = [
  { id: 'auto', label: 'Automática' },
  { id: 'fina', label: 'Fina' },
  { id: 'grossa', label: 'Grossa' },
  { id: 'grande', label: 'Grande' },
]
const PLACES: Array<{ id: Placement; label: string }> = [
  { id: 'topo', label: 'Em cima' },
  { id: 'meio', label: 'No meio' },
  { id: 'base', label: 'Embaixo' },
]
const STATUS_TEXT: Record<SaveStatus, string> = { salvo: 'Salvo', pendente: 'Alterações…', salvando: 'Salvando…', erro: 'Não salvou' }

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

/** Células de (x0,y0) a (x1,y1), em linha reta (Bresenham): evita falhas ao arrastar rápido com o lápis. */
function lineCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    out.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return out
}

export interface EditorProps {
  saved: SavedChart
  startInCrochetar?: boolean
  onBack: () => void
  onSave: (input: SavedChartInput) => Promise<SavedChart>
}

export function Editor({ saved, startInCrochetar, onBack, onSave }: EditorProps) {
  const w = saved.width
  const h = saved.height
  const [doc, setDoc] = useState<Doc>(() => ({ grid: decodeGrid(saved.grid), history: EMPTY_HISTORY }))
  const docRef = useRef(doc)
  const [palette, setPalette] = useState<PaletteEntry[]>(saved.palette)
  const [tool, setTool] = useState<Tool>('lapis')
  const [color, setColor] = useState(0)
  const [zoom, setZoom] = useState(14)
  const [symbols, setSymbols] = useState(false)
  const [view, setView] = useState<ViewMode>('grafico')
  const [name, setName] = useState(saved.name)
  const [yarnId, setYarnId] = useState(saved.yarnId)
  const [picked, setPicked] = useState<Record<string, string>>(saved.picked)
  const [startSide, setStartSide] = useState<StartSide>(saved.startSide)
  const [crochet, setCrochet] = useState<CrochetState>({ progress: saved.progress, stitch: saved.progressStitch })
  const [mode, setMode] = useState<'editar' | 'crochetar'>(startInCrochetar ? 'crochetar' : 'editar')
  const [alternate, setAlternate] = useState(() => {
    try { return localStorage.getItem('tramado:alternate') !== 'false' } catch { return true }
  })
  const [text, setText] = useState('')
  const [letter, setLetter] = useState<LetterChoice>('auto')
  const [textMsg, setTextMsg] = useState<string | null>(null)
  const [status, setStatus] = useState<SaveStatus>('salvo')
  const [rev, setRev] = useState(0)
  const strokeNew = useRef(true)
  const last = useRef<{ x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const touch = () => setRev((r) => r + 1)
  const chart: ChartResult = useMemo(() => ({ width: w, height: h, grid: doc.grid, palette: recount(doc.grid, palette) }), [w, h, doc.grid, palette])
  const yarn = YARN_PALETTES.find((y) => y.id === yarnId)
  const matches = useMemo(() => (yarn ? matchPalette(chart, yarn, picked) : []), [chart, yarn, picked])
  const shopping = useMemo(() => shoppingList(matches), [matches])
  const legendLabels = useMemo(() => Object.fromEntries(matches.map((m) => [m.letter, `${m.best.yarn.code} ${m.best.yarn.name}`.trim()])), [matches])
  const yarnLabel = (i: number) => legendLabels[palette[i]?.letter] ?? ''

  // ---- edição ---------------------------------------------------------------
  const apply = (next: Doc) => {
    docRef.current = next
    setDoc(next)
    touch()
  }

  const onCell = (e: CellEvent) => {
    if (mode !== 'editar') return
    const cur = docRef.current
    if (e.phase === 'up') {
      strokeNew.current = true
      last.current = null
      return
    }
    const fresh = e.phase === 'down' || e.phase === 'tap'
    if (fresh) {
      strokeNew.current = true
      last.current = null
    }
    if (tool === 'pegar') {
      if (fresh) {
        setColor(cur.grid[e.y * w + e.x])
        setTool('lapis')
      }
      return
    }
    if (tool === 'balde') {
      if (fresh) {
        const next = floodFill(cur.grid, w, h, e.x, e.y, color)
        if (next) apply({ grid: next, history: pushHistory(cur.history, cur.grid) })
      }
      return
    }
    // Lápis (e Texto, que também desenha ponto a ponto ao tocar no gráfico).
    const from = last.current ?? { x: e.x, y: e.y }
    let g = cur.grid
    let changed = false
    for (const [x, y] of lineCells(from.x, from.y, e.x, e.y)) {
      const n = paintCell(g, w, h, x, y, color)
      if (n) {
        g = n
        changed = true
      }
    }
    last.current = { x: e.x, y: e.y }
    if (changed) {
      apply({ grid: g, history: strokeNew.current ? pushHistory(cur.history, cur.grid) : cur.history })
      strokeNew.current = false
    }
  }

  const doUndo = () => {
    const r = undo(docRef.current.history, docRef.current.grid)
    if (r) apply({ grid: r.grid, history: r.history })
  }
  const doRedo = () => {
    const r = redo(docRef.current.history, docRef.current.grid)
    if (r) apply({ grid: r.grid, history: r.history })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stamp = (placement: Placement) => {
    const r = renderText(text, letter, w)
    if (!r) {
      setTextMsg('Escreva algo com letras, números ou . , - + & ! / : (e <3 para coração).')
      return
    }
    const cur = docRef.current
    const next = stampMask(cur.grid, w, h, r.mask, placement, color)
    if (next) apply({ grid: next, history: pushHistory(cur.history, cur.grid) })
    setTextMsg(r.overflow || r.mask.h > h ? 'O texto não cabe inteiro: parte ficou de fora. Use letra menor ou um texto mais curto.' : null)
  }

  const changeColor = (letterOf: string, hex: string) => {
    setPalette((p) => p.map((e) => (e.letter === letterOf ? { ...e, hex } : e)))
    setPicked((p) => {
      if (!(letterOf in p)) return p
      const { [letterOf]: _drop, ...rest } = p
      return rest
    })
    touch()
  }

  // ---- salvar automaticamente ---------------------------------------------------
  const latest = useRef({ name, yarnId, picked, startSide, crochet, palette })
  latest.current = { name, yarnId, picked, startSide, crochet, palette }

  const saveNow = async () => {
    const l = latest.current
    setStatus('salvando')
    try {
      await onSave({
        id: saved.id,
        name: l.name.trim() || `Meu gráfico · ${today()}`,
        chart: { width: w, height: h, grid: docRef.current.grid, palette: recount(docRef.current.grid, l.palette) },
        yarnId: l.yarnId,
        picked: l.picked,
        startSide: l.startSide,
        progress: l.crochet.progress,
        progressStitch: l.crochet.stitch,
      })
      setStatus('salvo')
    } catch {
      setStatus('erro')
    }
  }

  useEffect(() => {
    if (rev === 0) return
    setStatus('pendente')
    const t = setTimeout(saveNow, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev])

  const goBack = async () => {
    if (status === 'pendente' || status === 'erro') await saveNow()
    onBack()
  }

  // ---- saídas -----------------------------------------------------------------
  const baseName = name.trim() || 'grafico'
  const pngOptions = { cell: 20, symbols: true, startSide, legendLabels }
  const downloadChart = async () => download(await chartToPngBlob(chart, pngOptions), `${baseName}-tramado.png`)
  const printChart = async () => printImage(await chartToPngBlob(chart, pngOptions))
  const downloadShopping = async () => {
    if (!yarn) return
    download(
      await shoppingSheetToPng({ title: `Lista de compras · ${baseName} · ${today()}`, yarnName: `${yarn.brand} ${yarn.line}`.trim(), width: w, height: h, items: shopping }),
      `${baseName}-lista-de-compras.png`,
    )
  }

  // ---- modo Crochetar -------------------------------------------------------------
  const guide = rowGuide(doc.grid, w, h, Math.min(h, crochet.progress + 1), startSide, alternate)
  const options: RenderOptions = useMemo(
    () => ({
      cell: zoom,
      symbols,
      startSide,
      legend: false,
      ...(mode === 'crochetar' ? { progress: crochet.progress, rowDone: { from: guide.from, count: crochet.stitch } } : {}),
    }),
    [zoom, symbols, startSide, mode, crochet.progress, crochet.stitch, guide.from],
  )

  // Mantém a carreira (e o próximo ponto) à vista, rolando só quando saem da área visível.
  useEffect(() => {
    if (mode !== 'crochetar') return
    const box = scrollRef.current
    if (!box) return
    const rowTop = MARGIN + (h - crochet.progress - 1) * zoom
    const pad = Math.min(60, box.clientHeight / 4)
    const nextX = MARGIN + (guide.from === 'right' ? w - 1 - crochet.stitch : crochet.stitch) * zoom
    const padX = Math.min(60, box.clientWidth / 4)
    let top = box.scrollTop
    let left = box.scrollLeft
    if (rowTop < top + pad || rowTop + zoom > top + box.clientHeight - pad) top = Math.max(0, rowTop - box.clientHeight / 2)
    if (nextX < left + padX || nextX > left + box.clientWidth - padX) left = Math.max(0, nextX - box.clientWidth / 2)
    // Uma única rolagem: duas rolagens suaves seguidas se cancelam e a imagem não chega à carreira.
    if (top !== box.scrollTop || left !== box.scrollLeft) box.scrollTo({ top, left, behavior: 'smooth' })
  }, [mode, crochet.progress, crochet.stitch, zoom, h, w, guide.from])

  const changeCrochet = (s: CrochetState) => {
    setCrochet(s)
    touch()
  }
  const changeAlternate = (v: boolean) => {
    setAlternate(v)
    try { localStorage.setItem('tramado:alternate', String(v)) } catch { /* sem armazenamento */ }
  }

  const canUndo = doc.history.past.length > 0
  const canRedo = doc.history.future.length > 0
  const crocheting = mode === 'crochetar'

  const panel = crocheting ? (
    <aside className="studio__side" aria-label="Crochetar">
      <CrochetPanel
        chart={chart}
        matches={matches}
        startSide={startSide}
        alternate={alternate}
        state={crochet}
        onChange={changeCrochet}
        onAlternate={changeAlternate}
        onExit={() => setMode('editar')}
        zoom={zoom}
        onZoom={setZoom}
      />
    </aside>
  ) : (
    <aside className="studio__side" aria-label="Cores e fios">
      <label className="field">
        <span className="side-label">Nome</span>
        <input className="input" value={name} onChange={(e) => { setName(e.target.value); touch() }} />
      </label>
      <p className="hint">{w} × {h} pontos · {(w * h).toLocaleString('pt-BR')} no total</p>

      <div>
        <span className="side-label">Começar a carreira 1 pela</span>
        <div className="seg" role="radiogroup" aria-label="Lado em que a carreira 1 começa">
          {(['right', 'left'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={startSide === s} className={startSide === s ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => { setStartSide(s); touch() }}>
              {s === 'right' ? 'Direita' : 'Esquerda'}
            </button>
          ))}
        </div>
      </div>

      <h2 className="side-title">Cores</h2>
      <label className="field">
        <span className="side-label">Fio</span>
        <select value={yarnId} onChange={(e) => { setYarnId(e.target.value); setPicked({}); touch() }}>
          <option value="">Cores livres (sem fio)</option>
          {(['croche', 'ponto-cruz'] as const).map((kind) => {
            const list = YARN_PALETTES.filter((y) => y.kind === kind)
            if (list.length === 0) return kind === 'croche' ? <option key={kind} disabled>Crochê: tabela de cores ainda não incluída</option> : null
            return (
              <optgroup key={kind} label={KIND_LABEL[kind]}>
                {list.map((y) => <option key={y.id} value={y.id}>{y.brand} {y.line} · {y.colors.length} cores</option>)}
              </optgroup>
            )
          })}
        </select>
      </label>
      <p className="hint">Cores aproximadas: confira com o novelo na loja. Para trocar um fio, toque numa das parecidas. Toque na cor para ajustar à mão.</p>

      {yarn ? (
        <YarnLegend chart={chart} yarn={yarn} matches={matches} onChoose={(l, code) => { setPicked((p) => ({ ...p, [l]: code })); touch() }} onColorChange={changeColor} />
      ) : (
        <PlainLegend chart={chart} onColorChange={changeColor} />
      )}
    </aside>
  )

  return (
    <div className="studio-page">
      <AppBar title={name || 'Gráfico'} onBack={goBack}>
        <span className={`savestate savestate--${status}`} role="status">{STATUS_TEXT[status]}</span>
        {!crocheting && <button className="btn btn--primary btn--sm" onClick={() => setMode('crochetar')}>Crochetar ▶</button>}
      </AppBar>

      <div className={crocheting ? 'studio studio--crochetar' : 'studio studio--editor'}>
        {crocheting && panel}

        <main className="studio__main">
          {!crocheting && (
            <div className="etoolbar" role="toolbar" aria-label="Ferramentas">
              <div className="etoolbar__group etoolbar__tools">
                {TOOLS.map((t) => (
                  <button key={t.id} className={tool === t.id ? 'tbtn tbtn--on' : 'tbtn'} aria-pressed={tool === t.id} aria-label={t.label} title={t.label} onClick={() => setTool(t.id)} disabled={view === 'croche'}>
                    <span aria-hidden>{t.icon}</span> <span className="tbtn__label">{t.label}</span>
                  </button>
                ))}
                <button className="tbtn" onClick={doUndo} disabled={!canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)"><span aria-hidden>↶</span> <span className="tbtn__label">Desfazer</span></button>
                <button className="tbtn" onClick={doRedo} disabled={!canRedo} aria-label="Refazer" title="Refazer (Ctrl+Y)"><span aria-hidden>↷</span> <span className="tbtn__label">Refazer</span></button>
              </div>
              <div className="etoolbar__group etoolbar__colors" role="radiogroup" aria-label="Cor para pintar">
                {chart.palette.map((p, i) => (
                  <button key={p.letter} role="radio" aria-checked={color === i} className={color === i ? 'dot dot--on' : 'dot'} style={{ background: p.hex }} title={`${p.letter}${yarnLabel(i) ? ' · ' + yarnLabel(i) : ''}`} aria-label={`Cor ${p.letter}`} onClick={() => setColor(i)} />
                ))}
              </div>
              <div className="etoolbar__group etoolbar__actions">
                <span className="zoomctl">
                  <button className="tbtn tbtn--icon" onClick={() => setZoom((z) => Math.max(4, z - 1))} aria-label="Diminuir o zoom">−</button>
                  <b>{zoom}</b>
                  <button className="tbtn tbtn--icon" onClick={() => setZoom((z) => Math.min(28, z + 1))} aria-label="Aumentar o zoom">+</button>
                </span>
                <label className="tbtn tbtn--check"><input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} /> Símbolos</label>
                <button className={view === 'croche' ? 'tbtn tbtn--on' : 'tbtn'} onClick={() => setView(view === 'croche' ? 'grafico' : 'croche')}>
                  {view === 'croche' ? '↩ Voltar ao gráfico' : '🧶 Como fica em crochê'}
                </button>
                <button className="tbtn" onClick={downloadChart}>⬇ Baixar imagem</button>
                <button className="tbtn" onClick={printChart}>🖨 Imprimir</button>
                <button className="tbtn" onClick={downloadShopping} disabled={!yarn} title={yarn ? '' : 'Escolha um fio para gerar a lista'}>🧾 Lista de compras</button>
              </div>
            </div>
          )}

          {!crocheting && tool === 'texto' && view === 'grafico' && (
            <section className="card textpanel" aria-label="Escrever texto">
              <label className="field">
                <span className="side-label">Escreva o nome, a frase ou a data</span>
                <textarea className="input textpanel__area" rows={2} placeholder={'EX.: ZOE <3\n12/10/2026'} value={text} onChange={(e) => { setText(e.target.value); setTextMsg(null) }} />
              </label>
              <div className="textpanel__row">
                <b>Letra</b>
                {LETTERS.map((l) => (
                  <button key={l.id} className={letter === l.id ? 'seg__btn seg__btn--on seg__btn--pill' : 'seg__btn seg__btn--pill'} aria-pressed={letter === l.id} onClick={() => setLetter(l.id)}>{l.label}</button>
                ))}
                <span className="textpanel__color">Cor: {palette[color]?.letter}{yarnLabel(color) ? ` · ${yarnLabel(color)}` : ''}</span>
              </div>
              <p className="hint">Escolha a cor acima e toque em Em cima, No meio ou Embaixo. Vale letra (com acento), número e / . , - + &amp; ! (escreva &lt;3 pro coração). Enter pula linha. Tocar no gráfico desenha ponto a ponto, como o lápis.</p>
              <div className="textpanel__row">
                <b>Colocar no gráfico:</b>
                {PLACES.map((p) => <button key={p.id} className="btn btn--sm btn--soft" onClick={() => stamp(p.id)}>{p.label}</button>)}
              </div>
              {textMsg && <p className="error" role="alert">{textMsg}</p>}
            </section>
          )}

          <section className="card chartcard">
            <div className="chart-scroll chart-scroll--tall" ref={scrollRef}>
              <ChartCanvas chart={chart} options={options} mode={view} onCell={crocheting ? undefined : onCell} />
            </div>
          </section>
        </main>

        {!crocheting && panel}
      </div>
    </div>
  )
}
