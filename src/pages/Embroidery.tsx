import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AppBar } from '../components/AppBar'
import { Stepper } from '../components/Stepper'
import { ELEMENTS, ELEMENT_CATEGORIES, type ElementCategory } from '../embroidery/elements'
import { Superseded } from '../embroidery/engine/client'
import { METHODS, PARAM_SPECS, defaultParams, normalizeParams, type EngineParams, type MethodId } from '../embroidery/engine/params'
import { curvedRotateFor, hitCurved, hitElement, normalizeRegion, regionBigEnough } from '../embroidery/geometry'
import { History } from '../embroidery/history'
import { photoPalette, STITCH_HINT, STITCH_LABEL } from '../embroidery/palette'
import { sheetGrid } from '../embroidery/pdfPages'
import {
  embroideryStore, FONTS, HOOP_LABEL, HOOP_SIZES, hoopCm, newElement, newProject, newText, projectMethod, projectParams,
  type EmbOptions, type EmbProject, type HoopShape, type Region, type RegionShape, type TextItem,
} from '../embroidery/project'
import {
  buildLineLayer, buildRiscoPdf, canvasSize, canvasToPng, composeRisco, detectFaceRegions, drawPhoto, photoRaw, renderFull, setTextFont, textWidthPx,
} from '../embroidery/render'
import { checkDimensions, checkFile, uploadLimits } from '../embroidery/validate'
import { KIND_LABEL, YARN_PALETTES, defaultYarnId } from '../yarn/library'

const previewSide = (m: MethodId) => (m === 'classico' ? 900 : 720)
const MAX_PHOTO = 1000

type Tab = 'bastidor' | 'ajustar' | 'elementos' | 'texto' | 'cores'
type Tool = 'borracha' | 'area' | 'manter' | 'espessura' | null

const TABS: Array<[Tab, string, string]> = [
  ['bastidor', '⭕', 'Bastidor'],
  ['ajustar', '🎚', 'Ajustar'],
  ['elementos', '✿', 'Elementos'],
  ['texto', 'A', 'Texto'],
  ['cores', '🧵', 'Fios'],
]

/** O que mexe na história (desfazer e refazer). A foto e o nome ficam de fora. */
type Snap = Pick<EmbProject, 'hoop' | 'view' | 'method' | 'params' | 'detail' | 'strokes' | 'regions' | 'keep' | 'texts' | 'elements'>
const snap = (p: EmbProject): Snap => ({ hoop: p.hoop, view: p.view, method: p.method, params: p.params, detail: p.detail, strokes: p.strokes, regions: p.regions, keep: p.keep, texts: p.texts, elements: p.elements })

/** Ajustes sugeridos por tipo de foto (só pontos de partida: dá para refinar depois). */
const KIND_PRESET: Record<EmbOptions['kind'], Partial<EngineParams>> = {
  pessoas: { detailPreserve: 55, smoothing: 40 },
  pet: { detailPreserve: 70, detail: 62, smoothing: 35 },
  outros: { detailPreserve: 50 },
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
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** Reduz a foto (já com o EXIF aplicado) para guardar no aparelho. */
async function shrink(file: File): Promise<string> {
  const limits = uploadLimits()
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ok = checkFile(file.size, head, limits)
  if (!ok.ok) throw new Error(ok.message)
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não consegui abrir essa foto: o arquivo parece estar corrompido.')
  }
  const dim = checkDimensions(bmp.width, bmp.height, limits)
  if (!dim.ok) {
    bmp.close()
    throw new Error(dim.message)
  }
  const k = Math.min(1, MAX_PHOTO / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}

const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

type Drag =
  | { kind: 'photo' | 'element' | 'text' | 'stroke'; x: number; y: number; id?: string; stroke?: number }
  | { kind: 'region'; x: number; y: number; x0: number; y0: number }

/** Bordado: foto → risco (contornos) → editor (bastidor, ajustes, elementos, texto, fios) → PDF em tamanho real. */
export function Embroidery({ initial, file, embedded, onBack, onSaved }: { initial?: EmbProject; file?: File | null; embedded?: boolean; onBack: () => void; onSaved?: () => void }) {
  const { user } = useAuth()
  const store = useMemo(() => embroideryStore(user?.id ?? 'x', window.localStorage), [user?.id])
  const [project, setProject] = useState<EmbProject | null>(initial ?? null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [lines, setLines] = useState<HTMLCanvasElement | null>(null)
  const [tab, setTab] = useState<Tab>('ajustar')
  const [tool, setTool] = useState<Tool>(null)
  const [shape, setShape] = useState<RegionShape>('elipse')
  const [selText, setSelText] = useState<string | null>(null)
  const [selEl, setSelEl] = useState<string | null>(null)
  const [cat, setCat] = useState<ElementCategory | 'Todas'>('Todas')
  const [brush, setBrush] = useState(0.025)
  const [mirror, setMirror] = useState(false)
  const [hideHoop, setHideHoop] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [colors, setColors] = useState(6)
  const [showOriginal, setShowOriginal] = useState(false)
  const [regen, setRegen] = useState(0)
  const [working, setWorking] = useState(false)
  const [needsWizard, setNeedsWizard] = useState(false)
  const [wiz, setWiz] = useState<EmbOptions>({ kind: 'pessoas', face: 'com', background: 'nao' })
  const [dragRegion, setDragRegionState] = useState<Region | null>(null)
  const regionRef = useRef<Region | null>(null)
  // A área em arrasto também fica numa referência: ao soltar o dedo, a função de soltar pode ter sido criada antes do último movimento.
  const setDragRegion = (r: Region | null) => {
    regionRef.current = r
    setDragRegionState(r)
  }
  const [, setHistTick] = useState(0)
  const display = useRef<HTMLCanvasElement>(null)
  const measure = useRef<CanvasRenderingContext2D | null>(null)
  const drag = useRef<Drag | null>(null)
  const lineRun = useRef(0)
  const hist = useRef(new History<Snap>())
  const pRef = useRef<EmbProject | null>(project)
  pRef.current = project

  // ---- edição com histórico
  const commit = (next: EmbProject) => {
    pRef.current = next
    setProject(next)
  }
  const begin = (group = '') => {
    const cur = pRef.current
    if (!cur) return
    hist.current.record(snap(cur), group)
    setHistTick((n) => n + 1)
  }
  /** Muda o projeto e guarda o passo para desfazer (mudanças seguidas do mesmo `group` viram um passo só). */
  const edit = (group: string, fn: (p: EmbProject) => EmbProject) => {
    const cur = pRef.current
    if (!cur) return
    begin(group)
    commit(fn(cur))
  }
  /** Muda sem guardar passo (durante um arrasto, cujo início já foi guardado). */
  const mutate = (fn: (p: EmbProject) => EmbProject) => {
    const cur = pRef.current
    if (cur) commit(fn(cur))
  }
  const undo = () => {
    const cur = pRef.current
    const prev = cur && hist.current.undo(snap(cur))
    if (cur && prev) commit({ ...cur, ...prev })
    setHistTick((n) => n + 1)
  }
  const redo = () => {
    const cur = pRef.current
    const next = cur && hist.current.redo(snap(cur))
    if (cur && next) commit({ ...cur, ...next })
    setHistTick((n) => n + 1)
  }

  const photo = project?.photo
  useEffect(() => {
    if (!photo) { setBitmap(null); return }
    let alive = true
    fetch(photo).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((b) => alive && setBitmap(b)).catch(() => alive && setMsg({ ok: false, text: 'Não consegui abrir a foto guardada.' }))
    return () => { alive = false }
  }, [photo])

  const hoop = project?.hoop
  const view = project?.view
  const method = project ? projectMethod(project) : 'E'
  const params = project ? projectParams(project) : defaultParams()
  const side = previewSide(method)
  const size = hoop ? canvasSize(hoop, side) : { w: 1, h: 1 }
  const paramsKey = JSON.stringify(params)

  // Foto inteira: guarda a proporção da foto assim que ela abre.
  useEffect(() => {
    if (bitmap && project && project.hoop.shape === 'foto' && !project.hoop.aspect) commit({ ...project, hoop: { ...project.hoop, aspect: bitmap.width / bitmap.height } })
  }, [bitmap, project?.hoop.shape]) // eslint-disable-line react-hooks/exhaustive-deps

  const raw = useMemo(
    () => (bitmap && hoop && view ? photoRaw(bitmap, hoop, view, side) : null),
    [bitmap, hoop?.shape, hoop?.cm, hoop?.aspect, view?.zoom, view?.x, view?.y, side], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // As linhas são recalculadas, em segundo plano e com espera, quando a foto, o enquadramento, o método ou os ajustes mudam.
  useEffect(() => {
    if (!raw || !project || needsWizard) return
    const id = ++lineRun.current
    const t = setTimeout(async () => {
      setWorking(true)
      try {
        const layer = await buildLineLayer(raw, project)
        if (id === lineRun.current) { setLines(layer); setMsg((m) => (m && !m.ok ? null : m)) }
      } catch (e) {
        if (e instanceof Superseded) return
        if (id === lineRun.current) setMsg({ ok: false, text: 'Não foi possível gerar o risco com esse método. Tente outro método ou outra foto.' })
      } finally {
        if (id === lineRun.current) setWorking(false)
      }
    }, method === 'classico' ? 60 : 180)
    return () => clearTimeout(t)
  }, [raw, method, paramsKey, regen, needsWizard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apagados, elementos e textos só redesenham por cima das linhas.
  useEffect(() => {
    const c = display.current
    if (!c || !project || needsWizard) return
    if (showOriginal) {
      if (!bitmap) return
      c.width = size.w
      c.height = size.h
      drawPhoto(c.getContext('2d')!, bitmap, size.w, size.h, project.view)
      return
    }
    if (!lines) return
    const out = composeRisco(lines, project, size.w, size.h)
    c.width = size.w
    c.height = size.h
    c.getContext('2d')!.drawImage(out, 0, 0)
  }, [lines, showOriginal, bitmap, needsWizard, project?.view, project?.strokes, project?.regions, project?.keep, project?.texts, project?.elements, project?.hoop, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const yarn = YARN_PALETTES.find((y) => y.id === project?.yarnId) ?? YARN_PALETTES.find((y) => y.kind === 'ponto-cruz')
  const items = useMemo(() => (raw && yarn && tab === 'cores' ? photoPalette(raw, yarn, colors) : []), [raw, yarn, colors, tab])

  const onFileRef = useRef<(f: File | undefined) => Promise<void>>()
  useEffect(() => {
    if (file) void onFileRef.current?.(file)
  }, [file])

  if (!user) return null

  const patch = (p: Partial<EmbProject>, group = '') => edit(group, (cur) => ({ ...cur, ...p }))
  const sliderParam = (k: keyof EngineParams, v: number) => edit('param:' + k, (cur) => ({ ...cur, params: { ...cur.params, [k]: v } as Partial<EngineParams> }))
  const patchText = (id: string, p: Partial<TextItem>, group: string) => edit('text:' + id + ':' + group, (cur) => ({ ...cur, texts: cur.texts.map((t) => (t.id === id ? { ...t, ...p } : t)) }))
  const patchEl = (id: string, p: Partial<NonNullable<EmbProject['elements']>[number]>, group: string) => edit('el:' + id + ':' + group, (cur) => ({ ...cur, elements: (cur.elements ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)) }))
  const sel = project?.texts.find((t) => t.id === selText) ?? null
  const selElement = project?.elements?.find((e) => e.id === selEl) ?? null

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const dataUrl = await shrink(f)
      const yarnId = defaultYarnId() || (YARN_PALETTES.find((y) => y.kind === 'ponto-cruz')?.id ?? '')
      const np = newProject(dataUrl, `Meu bordado · ${today()}`, yarnId)
      hist.current.reset()
      commit(np)
      setLines(null)
      setSelText(null)
      setSelEl(null)
      setTool(null)
      setMsg(null)
      setTab('ajustar')
      setNeedsWizard(true)
      setHistTick((n) => n + 1)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message ? e.message : 'Não consegui abrir essa foto. Tente um JPG, PNG ou WebP.' })
    }
  }
  onFileRef.current = onFile

  /** Fim das perguntas iniciais: ajusta o risco ao que a pessoa escolheu e cria. */
  const finishWizard = async () => {
    const cur = pRef.current
    if (!cur) return
    const next = normalizeParams({ ...cur.params, ...KIND_PRESET[wiz.kind] })
    if (wiz.face === 'com') next.detail = Math.min(100, next.detail + 10)
    next.background = wiz.background === 'nao' ? 75 : 0 // "não desenhar o fundo": simplifica o fundo ao máximo
    commit({ ...cur, params: next, opts: wiz, regions: [] })
    setNeedsWizard(false)
    if (wiz.face === 'sem') {
      const regs = bitmap ? await detectFaceRegions(bitmap, cur.hoop, cur.view) : null
      if (regs && regs.length > 0) {
        mutate((p) => ({ ...p, regions: regs }))
        setMsg({ ok: true, text: 'Rosto apagado. Se precisar, ajuste com "Apagar área".' })
      } else {
        setTab('ajustar')
        setTool('area')
        setMsg({ ok: true, text: 'Este aparelho não reconhece rostos sozinho: arraste um círculo sobre o rosto para apagá-lo.' })
      }
    }
  }

  // Posição do toque em fração da área do bastidor.
  const frac = (e: React.PointerEvent) => {
    const r = display.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const measureCtx = () => {
    if (!measure.current) measure.current = document.createElement('canvas').getContext('2d')
    return measure.current!
  }

  const hitText = (cur: EmbProject, fx: number, fy: number): TextItem | null => {
    const ctx = measureCtx()
    const k = size.h / size.w
    for (const t of [...cur.texts].reverse()) {
      if (t.curve === 'curvo') {
        if (hitCurved(t, size.w, size.h, textWidthPx(ctx, t, size.w), fx, fy)) return t
        continue
      }
      setTextFont(ctx, t, size.w)
      const bw = ctx.measureText(t.text || ' ').width / size.w
      const bh = t.size * 1.25
      const dx = fx - t.x
      const dy = (fy - t.y) * k
      const a = (-t.rotate * Math.PI) / 180
      const rx = dx * Math.cos(a) - dy * Math.sin(a)
      const ry = dx * Math.sin(a) + dy * Math.cos(a)
      if (Math.abs(rx) <= bw / 2 + 0.02 && Math.abs(ry) <= bh / 2 + 0.02) return t
    }
    return null
  }

  const onDown = (e: React.PointerEvent) => {
    const cur = pRef.current
    if (!cur || needsWizard || showOriginal) return
    const p = frac(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tab === 'bastidor') {
      begin()
      drag.current = { kind: 'photo', x: p.x, y: p.y }
    } else if (tab === 'elementos') {
      const el = [...(cur.elements ?? [])].reverse().find((x) => hitElement(x, size.w, size.h, p.x, p.y))
      setSelEl(el?.id ?? null)
      if (el) {
        begin()
        drag.current = { kind: 'element', x: p.x, y: p.y, id: el.id }
      }
    } else if (tab === 'texto') {
      const t = hitText(cur, p.x, p.y)
      setSelText(t?.id ?? null)
      if (t) {
        begin()
        drag.current = { kind: 'text', x: p.x, y: p.y, id: t.id }
      }
    } else if (tab === 'ajustar') {
      if (tool === 'borracha') {
        begin()
        commit({ ...cur, strokes: [...cur.strokes, { r: brush, pts: [[p.x, p.y]] }] })
        drag.current = { kind: 'stroke', x: p.x, y: p.y, stroke: cur.strokes.length }
      } else if (tool === 'area' || tool === 'manter') {
        drag.current = { kind: 'region', x: p.x, y: p.y, x0: p.x, y0: p.y }
        setDragRegion(normalizeRegion(shape, p.x, p.y, p.x, p.y))
      }
    }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !pRef.current) return
    const p = frac(e)
    const dx = p.x - d.x
    const dy = p.y - d.y
    if (d.kind === 'photo') {
      d.x = p.x
      d.y = p.y
      mutate((cur) => ({ ...cur, view: { ...cur.view, x: cur.view.x + dx, y: cur.view.y + dy } }))
    } else if (d.kind === 'element') {
      d.x = p.x
      d.y = p.y
      mutate((cur) => ({ ...cur, elements: (cur.elements ?? []).map((el) => (el.id === d.id ? { ...el, x: el.x + dx, y: el.y + dy } : el)) }))
    } else if (d.kind === 'text') {
      d.x = p.x
      d.y = p.y
      mutate((cur) => ({
        ...cur,
        texts: cur.texts.map((t) => {
          if (t.id !== d.id) return t
          // Texto curvo em volta do bastidor: arrastar gira em volta do centro.
          if (t.curve === 'curvo' && (t.place === 'acima' || t.place === 'abaixo')) return { ...t, rotate: curvedRotateFor(t, size.w, size.h, p.x, p.y) }
          return { ...t, x: t.x + dx, y: t.y + dy }
        }),
      }))
    } else if (d.kind === 'stroke' && d.stroke !== undefined) {
      if (Math.hypot(dx, dy) < 0.004) return
      d.x = p.x
      d.y = p.y
      mutate((cur) => {
        const strokes = cur.strokes.slice()
        const s = strokes[d.stroke!]
        if (s) strokes[d.stroke!] = { ...s, pts: [...s.pts, [p.x, p.y]] }
        return { ...cur, strokes }
      })
    } else if (d.kind === 'region') {
      setDragRegion(normalizeRegion(shape, d.x0, d.y0, p.x, p.y))
    }
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'region' && regionRef.current) {
      const r = regionRef.current
      setDragRegion(null)
      if (regionBigEnough(r)) {
        if (tool === 'manter') edit('', (cur) => ({ ...cur, keep: r }))
        else edit('', (cur) => ({ ...cur, regions: [...(cur.regions ?? []), r] }))
      }
    }
  }

  const addText = () => {
    const t = newText('Seu texto')
    edit('', (cur) => ({ ...cur, texts: [...cur.texts, t] }))
    setSelText(t.id)
    setTab('texto')
  }
  const addElement = (kind: string) => {
    const el = newElement(kind)
    edit('', (cur) => ({ ...cur, elements: [...(cur.elements ?? []), el] }))
    setSelEl(el.id)
  }
  const hasErasing = !!project && (project.strokes.length > 0 || (project.regions?.length ?? 0) > 0 || !!project.keep)
  const restore = () => edit('', (cur) => ({ ...cur, strokes: [], regions: [], keep: undefined }))

  const save = () => {
    const cur = pRef.current
    if (!cur) return
    try {
      const saved = store.save({ ...cur, name: cur.name.trim() || `Meu bordado · ${today()}` })
      commit(saved)
      setMsg({ ok: true, text: 'Salvo neste aparelho.' })
      onSaved?.()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível salvar.' })
    }
  }

  const exportAs = async (kind: 'pdf' | 'png' | 'share') => {
    const cur = pRef.current
    if (!cur || !bitmap) return
    setBusy(kind)
    setMsg(null)
    try {
      await new Promise((r) => setTimeout(r, 30)) // deixa o aviso aparecer antes do cálculo pesado
      const full = await renderFull(bitmap, cur, mirror, !hideHoop)
      const base = cur.name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'bordado'
      if (kind === 'png') download(await canvasToPng(full), `${base}-risco.png`)
      else {
        const pdf = await buildRiscoPdf(full, cur)
        if (kind === 'pdf') download(pdf, `${base}-risco.pdf`)
        else {
          // Compartilhar: o aparelho abre o seletor (e-mail, WhatsApp...). O arquivo não passa por nenhum servidor nosso.
          const f = new File([pdf], `${base}-risco.pdf`, { type: 'application/pdf' })
          if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: cur.name })
          else download(pdf, `${base}-risco.pdf`)
        }
      }
      setMenu(false)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.' })
    } finally {
      setBusy(null)
    }
  }

  const cm = hoop ? hoopCm(hoop) : { w: 0, h: 0 }
  const sheets = hoop ? sheetGrid(cm.w, cm.h) : { cols: 1, rows: 1 }
  const nSheets = sheets.cols * sheets.rows
  const round = hoop?.shape === 'redondo'
  const usesParam = (k: keyof EngineParams) => !!METHODS.find((m) => m.id === method)?.uses.includes(k)

  // ------------------------------------------------------------------ perguntas iniciais
  const wizard = project && needsWizard && (
    <section className="card emb-wiz" aria-label="Como será o seu risco">
      <img className="emb-wiz__photo" src={project.photo} alt="Sua foto" />
      <h2>O que você vai bordar?</h2>
      <p className="hint">Isso ajusta o risco ao seu tipo de foto. Você pode refinar tudo depois.</p>
      <div className="seg seg--3" role="radiogroup" aria-label="Tipo de foto">
        {([['pessoas', '👤 Pessoas'], ['pet', '🐾 Pet'], ['outros', '✨ Outros']] as Array<[EmbOptions['kind'], string]>).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={wiz.kind === id} className={wiz.kind === id ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setWiz({ ...wiz, kind: id })}>{label}</button>
        ))}
      </div>

      <h2>Escolha o estilo</h2>
      <div className="emb-choice" role="radiogroup" aria-label="Rosto">
        <button role="radio" aria-checked={wiz.face === 'com'} className={wiz.face === 'com' ? 'emb-choice__opt emb-choice__opt--on' : 'emb-choice__opt'} onClick={() => setWiz({ ...wiz, face: 'com' })}>
          <b>Com rosto</b>
          <span>Mantém os traços do rosto, com mais detalhes.</span>
        </button>
        <button role="radio" aria-checked={wiz.face === 'sem'} className={wiz.face === 'sem' ? 'emb-choice__opt emb-choice__opt--on' : 'emb-choice__opt'} onClick={() => setWiz({ ...wiz, face: 'sem' })}>
          <b>Sem rosto</b>
          <span>Risco minimalista, mais fácil de bordar. O rosto é apagado (sozinho, se o aparelho souber, ou marcado por você).</span>
        </button>
      </div>

      <h2>Desenhar o fundo da imagem?</h2>
      <div className="seg" role="radiogroup" aria-label="Fundo">
        {([['nao', 'Não'], ['sim', 'Sim']] as Array<[EmbOptions['background'], string]>).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={wiz.background === id} className={wiz.background === id ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setWiz({ ...wiz, background: id })}>{label}</button>
        ))}
      </div>
      <p className="hint">Não: risco mais limpo, focando nos elementos principais.</p>

      <div className="row row--gap">
        {!embedded && (
          <label className="btn">
            Trocar foto
            <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        )}
        <button className="btn btn--primary" onClick={() => void finishWizard()}>Criar risco</button>
      </div>
    </section>
  )

  // ------------------------------------------------------------------ painéis das abas
  const panelBastidor = project && (
    <div className="emb-tools">
      <label className="field">
        <span className="side-label">Nome do bordado</span>
        <input className="input" value={project.name} onChange={(e) => commit({ ...project, name: e.target.value })} />
      </label>
      <div>
        <span className="side-label">Bastidor</span>
        <div className="seg seg--3" role="radiogroup" aria-label="Formato do bastidor">
          {(Object.keys(HOOP_SIZES) as HoopShape[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={project.hoop.shape === s}
              className={project.hoop.shape === s ? 'seg__btn seg__btn--on' : 'seg__btn'}
              onClick={() => patch({ hoop: { shape: s, cm: HOOP_SIZES[s].includes(project.hoop.cm) ? project.hoop.cm : HOOP_SIZES[s][2], aspect: s === 'foto' && bitmap ? bitmap.width / bitmap.height : undefined } })}
            >
              {HOOP_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="hint">{project.hoop.shape === 'redondo' ? 'Diâmetro' : project.hoop.shape === 'quadrado' ? 'Lado' : project.hoop.shape === 'foto' ? 'Lado maior' : 'Largura'}</span>
          <select value={project.hoop.cm} onChange={(e) => patch({ hoop: { ...project.hoop, cm: Number(e.target.value) } })}>
            {HOOP_SIZES[project.hoop.shape].map((c) => (
              <option key={c} value={c}>{c} cm{project.hoop.shape === 'retangular' || project.hoop.shape === 'foto' ? ` (${hoopCm({ ...project.hoop, cm: c }).w} × ${hoopCm({ ...project.hoop, cm: c }).h} cm)` : ''}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">Arraste o desenho para enquadrar a foto dentro do bastidor.</p>
      <label className="field field--inline">
        <span>Zoom da foto</span>
        <input type="range" min={1} max={3} step={0.02} value={project.view.zoom} onChange={(e) => edit('view-zoom', (cur) => ({ ...cur, view: { ...cur.view, zoom: Number(e.target.value) } }))} />
      </label>
      <div className="row row--gap">
        <button className="btn btn--sm" onClick={() => patch({ view: { zoom: 1, x: 0, y: 0 } })}>Centralizar</button>
        {!embedded && (
          <label className="btn btn--sm">
            Trocar foto
            <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </div>
  )

  const panelAjustar = project && (
    <div className="emb-tools">
      <div className="emb-actions">
        <button className={tool === 'borracha' || tool === 'area' ? 'btn emb-act emb-act--on' : 'btn emb-act'} onClick={() => setTool(tool === 'borracha' ? null : 'borracha')}>🧽 Borracha</button>
        <button className={tool === 'espessura' ? 'btn emb-act emb-act--on' : 'btn emb-act'} onClick={() => setTool(tool === 'espessura' ? null : 'espessura')}>☰ Espessura</button>
        <button className="btn emb-act" disabled={!hasErasing} onClick={restore}>↺ Restaurar</button>
        <button className={tool === 'manter' ? 'btn emb-act emb-act--on' : 'btn emb-act'} onClick={() => setTool(tool === 'manter' ? null : 'manter')}>✂ Remover fundo</button>
      </div>

      {(tool === 'borracha' || tool === 'area') && (
        <div className="emb-sub">
          <div className="seg" role="radiogroup" aria-label="Tipo de borracha">
            <button role="radio" aria-checked={tool === 'borracha'} className={tool === 'borracha' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setTool('borracha')}>Pincel</button>
            <button role="radio" aria-checked={tool === 'area'} className={tool === 'area' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setTool('area')}>Apagar área</button>
          </div>
          {tool === 'borracha' ? (
            <>
              <p className="hint">Passe o dedo ou o mouse sobre as linhas que não quer bordar.</p>
              <label className="field field--inline"><span>Tamanho</span>
                <input type="range" min={0.008} max={0.08} step={0.002} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
              </label>
            </>
          ) : (
            <>
              <p className="hint">Arraste sobre a foto para marcar o que apagar de uma vez (por exemplo, o rosto).</p>
              <div className="seg" role="radiogroup" aria-label="Formato da área">
                <button role="radio" aria-checked={shape === 'elipse'} className={shape === 'elipse' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setShape('elipse')}>Círculo</button>
                <button role="radio" aria-checked={shape === 'retangulo'} className={shape === 'retangulo' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setShape('retangulo')}>Retângulo</button>
              </div>
            </>
          )}
        </div>
      )}

      {tool === 'manter' && (
        <div className="emb-sub">
          <p className="hint">Marque a parte que fica: tudo fora dela é apagado. Marque de novo para trocar a área.</p>
          <div className="seg" role="radiogroup" aria-label="Formato da área">
            <button role="radio" aria-checked={shape === 'elipse'} className={shape === 'elipse' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setShape('elipse')}>Círculo</button>
            <button role="radio" aria-checked={shape === 'retangulo'} className={shape === 'retangulo' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setShape('retangulo')}>Retângulo</button>
          </div>
          {project.keep && <button className="btn btn--sm" onClick={() => edit('', (cur) => ({ ...cur, keep: undefined }))}>Voltar a mostrar o fundo</button>}
        </div>
      )}

      {tool === 'espessura' && (
        <div className="emb-sub">
          {usesParam('lineWidth') ? (
            <label className="field">
              <span className="side-label">{PARAM_SPECS.lineWidth.label} <small>{params.lineWidth}</small></span>
              <input type="range" min={0} max={100} value={params.lineWidth} onChange={(e) => sliderParam('lineWidth', Number(e.target.value))} />
              <span className="hint">{PARAM_SPECS.lineWidth.hint}</span>
            </label>
          ) : (
            <p className="hint">O método "Clássico" não tem espessura. Escolha outro método abaixo.</p>
          )}
        </div>
      )}

      <details className="fold">
        <summary>Método e ajustes do risco</summary>
        <div className="fold__body">
          <label className="field">
            <span className="side-label">Método do risco</span>
            <select value={method} onChange={(e) => patch({ method: e.target.value as MethodId })}>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <span className="hint">{METHODS.find((m) => m.id === method)?.description}</span>
          </label>
          {METHODS.find((m) => m.id === method)?.uses.map((k) => (
            <label className="field" key={k}>
              <span className="side-label">{PARAM_SPECS[k].label} <small>{params[k]}</small></span>
              <input type="range" min={PARAM_SPECS[k].min} max={PARAM_SPECS[k].max} value={params[k]} onChange={(e) => sliderParam(k, Number(e.target.value))} />
              <span className="hint">{PARAM_SPECS[k].hint}</span>
            </label>
          ))}
          <div className="row row--gap">
            <button className="btn btn--sm" onClick={() => patch({ params: defaultParams() })}>Restaurar padrão</button>
            <button className="btn btn--sm" onClick={() => setRegen((n) => n + 1)} disabled={working}>Gerar de novo</button>
          </div>
        </div>
      </details>

      <div className="row row--gap">
        <button className={showOriginal ? 'btn btn--sm btn--primary' : 'btn btn--sm'} aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
          {showOriginal ? 'Ver o risco' : 'Ver a foto original'}
        </button>
      </div>
    </div>
  )

  const panelElementos = project && (
    <div className="emb-tools">
      <div className="pills" role="tablist" aria-label="Categorias">
        {(['Todas', ...ELEMENT_CATEGORIES] as Array<ElementCategory | 'Todas'>).map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'pill pill--on' : 'pill'} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="emb-grid" role="list">
        {ELEMENTS.filter((e) => cat === 'Todas' || e.category === cat).map((e) => (
          <button key={e.id} className="emb-thumb-btn" role="listitem" title={e.label} aria-label={`Adicionar ${e.label}`} onClick={() => addElement(e.id)}>
            <svg viewBox="0 0 100 100" aria-hidden><path d={e.d} fill="none" stroke="#3b3b3b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>
      {selElement ? (
        <div className="emb-sub">
          <div className="emb-actions">
            <button className="btn btn--sm" onClick={() => patchEl(selElement.id, { flipX: !selElement.flipX }, 'flipx')}>⇋ Espelhar</button>
            <button className="btn btn--sm" onClick={() => patchEl(selElement.id, { flipY: !selElement.flipY }, 'flipy')}>⇅ Virar</button>
            <button className="btn btn--sm" onClick={() => { const c = newElement(selElement.kind, Math.min(0.95, selElement.x + 0.05), Math.min(0.95, selElement.y + 0.05), selElement.size); edit('', (cur) => ({ ...cur, elements: [...(cur.elements ?? []), { ...selElement, id: c.id, x: c.x, y: c.y }] })); setSelEl(c.id) }}>⧉ Duplicar</button>
            <button className="btn btn--sm" onClick={() => { edit('', (cur) => ({ ...cur, elements: (cur.elements ?? []).filter((x) => x.id !== selElement.id) })); setSelEl(null) }}>🗑 Apagar</button>
          </div>
          <label className="field field--inline"><span>Tamanho</span>
            <input type="range" min={0.05} max={1} step={0.01} value={selElement.size} onChange={(e) => patchEl(selElement.id, { size: Number(e.target.value) }, 'size')} />
          </label>
          <label className="field field--inline"><span>Girar</span>
            <input type="range" min={-180} max={180} step={1} value={selElement.rotate} onChange={(e) => patchEl(selElement.id, { rotate: Number(e.target.value) }, 'rot')} />
          </label>
          <p className="hint">Arraste o desenho sobre o risco para mudar de lugar.</p>
        </div>
      ) : (
        <p className="hint">{(project.elements?.length ?? 0) === 0 ? 'Toque em um desenho para colocá-lo no risco.' : 'Toque em um desenho no risco para editar.'}</p>
      )}
    </div>
  )

  const curved = sel?.curve === 'curvo'
  const panelTexto = project && (
    <div className="emb-tools">
      <div className="row row--gap">
        <button className="btn btn--sm btn--primary" onClick={addText}>+ Adicionar texto</button>
        {project.texts.map((t, i) => (
          <button key={t.id} className={t.id === selText ? 'btn btn--sm emb-act--on' : 'btn btn--sm'} onClick={() => setSelText(t.id)} aria-label={`Texto ${i + 1}`}>{i + 1}</button>
        ))}
        {sel && (
          <button className="btn btn--sm" onClick={() => { edit('', (cur) => ({ ...cur, texts: cur.texts.filter((t) => t.id !== sel.id) })); setSelText(null) }}>🗑 Apagar</button>
        )}
      </div>
      {sel ? (
        <>
          <label className="field">
            <span className="side-label">Texto</span>
            <input className="input" value={sel.text} onChange={(e) => patchText(sel.id, { text: e.target.value }, 'text')} />
          </label>
          <label className="field">
            <span className="side-label">Letra</span>
            <select value={sel.font} onChange={(e) => patchText(sel.id, { font: e.target.value as TextItem['font'] }, 'font')}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="field field--inline"><span>Tamanho</span>
            <input type="range" min={0.04} max={0.4} step={0.005} value={sel.size} onChange={(e) => patchText(sel.id, { size: Number(e.target.value) }, 'size')} />
          </label>
          <div className="seg" role="radiogroup" aria-label="Forma do texto">
            <button role="radio" aria-checked={!curved} className={!curved ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => patchText(sel.id, { curve: 'reto', rotate: Math.max(-90, Math.min(90, sel.rotate)) }, 'curve')}>— Reto</button>
            <button role="radio" aria-checked={curved} className={curved ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => patchText(sel.id, { curve: 'curvo' }, 'curve')}>⌒ Curvo</button>
          </div>
          {curved && (
            <>
              <div className="seg seg--3" role="radiogroup" aria-label="Posição do texto curvo">
                {([['acima', 'Acima'], ['centro', 'Centro'], ['abaixo', 'Abaixo']] as const).map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={(sel.place ?? 'centro') === id} className={(sel.place ?? 'centro') === id ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => patchText(sel.id, { place: id }, 'place')}>{label}</button>
                ))}
              </div>
              <label className="field field--inline"><span>Curvatura</span>
                <input type="range" min={0.15} max={0.6} step={0.01} value={sel.radius ?? 0.36} onChange={(e) => patchText(sel.id, { radius: Number(e.target.value) }, 'radius')} />
              </label>
            </>
          )}
          <label className="field field--inline"><span>Girar</span>
            <input type="range" min={curved ? -180 : -90} max={curved ? 180 : 90} step={1} value={sel.rotate} onChange={(e) => patchText(sel.id, { rotate: Number(e.target.value) }, 'rot')} />
          </label>
          <p className="hint">{curved && (sel.place === 'acima' || sel.place === 'abaixo') ? 'Arraste em volta do bastidor para girar o texto.' : 'Arraste o texto sobre o risco para mudar de lugar.'}</p>
        </>
      ) : (
        <p className="hint">{project.texts.length === 0 ? 'Adicione uma frase ou um nome.' : 'Toque em um texto no risco para editar.'}</p>
      )}
    </div>
  )

  const panelCores = project && (
    <div className="emb-tools">
      <label className="field">
        <span className="side-label">Fio</span>
        <select value={project.yarnId} onChange={(e) => commit({ ...project, yarnId: e.target.value })}>
          {YARN_PALETTES.filter((y) => y.kind === 'ponto-cruz').map((y) => (
            <option key={y.id} value={y.id}>{y.brand} {y.line} · {y.colors.length} cores</option>
          ))}
        </select>
        <span className="hint">{KIND_LABEL['ponto-cruz']}</span>
      </label>
      <Stepper label="Quantas cores" unit="cores" value={colors} min={1} max={12} onChange={setColors} />
      <ul className="emb-yarns">
        {items.map((it) => (
          <li key={it.yarn.code}>
            <span className="emb-sw" style={{ background: it.yarn.hex }} aria-hidden />
            <span className="emb-yarn__main">
              <b>{yarn?.brand} {it.yarn.code}</b> <small>{it.yarn.name}</small>
              <small>{STITCH_LABEL[it.stitch]} · {STITCH_HINT[it.stitch]}</small>
            </span>
            <span className="emb-yarn__pct">{Math.max(1, Math.round(it.share * 100))}%</span>
          </li>
        ))}
      </ul>
      <p className="hint">As cores vêm da parte da foto que está dentro do bastidor. O ponto sugerido é só um ponto de partida: use o que preferir.</p>
    </div>
  )

  const panels: Record<Tab, React.ReactNode> = { bastidor: panelBastidor, ajustar: panelAjustar, elementos: panelElementos, texto: panelTexto, cores: panelCores }
  const interacting = tab === 'bastidor' || tab === 'elementos' || tab === 'texto' || (tab === 'ajustar' && (tool === 'borracha' || tool === 'area' || tool === 'manter'))
  const cursor = tab === 'bastidor' ? 'grab' : tool === 'borracha' ? 'crosshair' : tool === 'area' || tool === 'manter' ? 'crosshair' : 'pointer'

  // ------------------------------------------------------------------ editor
  const editor = project && !needsWizard && (
    <div className="emb-ed">
      <div className="emb-top">
        <div className="emb-top__group">
          <button className="emb-ibtn" onClick={undo} disabled={!hist.current.canUndo} aria-label="Desfazer" title="Desfazer">↶</button>
          <button className="emb-ibtn" onClick={redo} disabled={!hist.current.canRedo} aria-label="Refazer" title="Refazer">↷</button>
        </div>
        <div className="emb-top__group">
          <button className="emb-ibtn emb-ibtn--main" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="dialog" aria-label="Baixar" title="Baixar">⬇</button>
          <button className="emb-ibtn" onClick={save} aria-label="Salvar" title="Salvar neste aparelho">💾</button>
        </div>
        {menu && (
          <div className="emb-menu" role="dialog" aria-label="Baixar">
            <label className="emb-toggle">
              <span>Ocultar bastidor</span>
              <input type="checkbox" checked={hideHoop} onChange={(e) => setHideHoop(e.target.checked)} />
            </label>
            <label className="emb-toggle">
              <span>Espelhar (riscar pelo verso)</span>
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
            </label>
            <p className="hint">
              Tamanho real: {cm.w} × {cm.h} cm. {nSheets === 1 ? 'Cabe em 1 folha A4.' : `Ocupa ${nSheets} folhas A4 (${sheets.cols} × ${sheets.rows}), com marcas para colar.`} Imprima a 100%.
            </p>
            {canShareFiles() && <button className="btn" disabled={!lines || busy !== null} onClick={() => void exportAs('share')}>{busy === 'share' ? 'Gerando…' : '✉ Enviar (e-mail, WhatsApp…)'}</button>}
            <button className="btn btn--primary" disabled={!lines || busy !== null} onClick={() => void exportAs('pdf')}>{busy === 'pdf' ? 'Gerando…' : 'Baixar PDF (A4)'}</button>
            <button className="btn" disabled={!lines || busy !== null} onClick={() => void exportAs('png')}>{busy === 'png' ? 'Gerando…' : 'Baixar imagem (PNG)'}</button>
          </div>
        )}
      </div>

      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}

      <div className="emb-zoomwrap" style={{ touchAction: interacting && zoomPct === 100 ? 'none' : 'auto' }}>
        <div
          className={`emb-stage${round ? ' emb-stage--round' : ''}${hideHoop ? ' emb-stage--nohoop' : ''}`}
          style={{ aspectRatio: `${size.w} / ${size.h}`, width: `${zoomPct}%`, maxWidth: `${(560 * zoomPct) / 100}px` }}
        >
          <canvas
            ref={display}
            className="emb-canvas"
            style={{ cursor, touchAction: interacting ? 'none' : 'auto' }}
            aria-label="Risco do bordado"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {project.keep && !dragRegion && <span className={`emb-region emb-region--keep emb-region--${project.keep.shape}`} style={regionStyle(project.keep)} aria-hidden />}
          {dragRegion && <span className={`emb-region emb-region--${dragRegion.shape}`} style={regionStyle(dragRegion)} aria-hidden />}
          {!lines && !showOriginal && <span className="emb-wait">Criando o risco…</span>}
          {working && lines && !showOriginal && <span className="emb-busy">atualizando…</span>}
        </div>
      </div>
      <p className="emb-note">Medidas baseadas em papel A4 · bastidor de {cm.w} × {cm.h} cm</p>

      <div className="emb-zoomrow">
        <button className="emb-ibtn" onClick={() => setZoomPct((z) => Math.max(100, z - 20))} disabled={zoomPct <= 100} aria-label="Diminuir zoom">−</button>
        <input type="range" min={100} max={300} step={10} value={zoomPct} onChange={(e) => setZoomPct(Number(e.target.value))} aria-label="Zoom" />
        <button className="emb-ibtn" onClick={() => setZoomPct((z) => Math.min(300, z + 20))} disabled={zoomPct >= 300} aria-label="Aumentar zoom">+</button>
        <span className="emb-zoomrow__pct">{zoomPct}%</span>
      </div>

      <section className="card emb-panel">{panels[tab]}</section>

      <nav className="emb-tabbar" role="tablist" aria-label="Ferramentas do bordado">
        {TABS.map(([id, icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'emb-tab emb-tab--on' : 'emb-tab'} onClick={() => setTab(id)}>
            <span aria-hidden>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  )

  if (embedded) {
    return (
      <div className="emb-embedded">
        {needsWizard ? msg && <p className="error" role="status">{msg.text}</p> : null}
        {wizard}
        {editor}
        {!project && msg && <p className="error" role="status">{msg.text}</p>}
      </div>
    )
  }

  return (
    <div className="studio-page">
      <AppBar title="Bordado" onBack={onBack} />
      <div className="emb-wrap">
        {!project && (
          <>
            {msg && <p className="error" role="status">{msg.text}</p>}
            <div className="card dropzone">
              <p><b>Escolha uma foto</b> para criar o risco do bordado: só as linhas, prontas para passar ao tecido.</p>
              <label className="btn btn--primary">
                Escolher foto
                <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
              <p className="hint">A foto e o risco ficam no seu aparelho. Funciona sem internet.</p>
            </div>
          </>
        )}
        {needsWizard && msg && <p className="error" role="status">{msg.text}</p>}
        {wizard}
        {editor}
      </div>
    </div>
  )
}

function regionStyle(r: Region): React.CSSProperties {
  return { left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`, width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%` }
}
