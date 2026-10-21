import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AppBar } from '../components/AppBar'
import { Stepper } from '../components/Stepper'
import { photoPalette } from '../embroidery/palette'
import { STITCH_HINT, STITCH_LABEL } from '../embroidery/palette'
import { sheetGrid } from '../embroidery/pdfPages'
import {
  embroideryStore, FONTS, HOOP_LABEL, HOOP_SIZES, hoopCm, newProject, newText,
  type EmbProject, type HoopShape, type TextItem,
} from '../embroidery/project'
import { buildLineLayer, buildRiscoPdf, canvasSize, canvasToPng, composeRisco, photoRaw, renderFull, setTextFont } from '../embroidery/render'
import { MAX_DETAIL, MIN_DETAIL } from '../embroidery/risco'
import { KIND_LABEL, YARN_PALETTES, defaultYarnId } from '../yarn/library'

const PREVIEW_SIDE = 900
const MAX_PHOTO = 1000
type Tab = 'foto' | 'texto' | 'apagar' | 'cores'

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
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
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

/** Bordado: foto → risco (contornos) → ajustes (foto, textos, borracha) → PDF em tamanho real + cores dos fios. */
export function Embroidery({ initial, onBack, onSaved }: { initial?: EmbProject; onBack: () => void; onSaved?: () => void }) {
  const { user } = useAuth()
  const store = useMemo(() => embroideryStore(user?.id ?? 'x', window.localStorage), [user?.id])
  const [project, setProject] = useState<EmbProject | null>(initial ?? null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [lines, setLines] = useState<HTMLCanvasElement | null>(null)
  const [tab, setTab] = useState<Tab>('foto')
  const [selected, setSelected] = useState<string | null>(null)
  const [brush, setBrush] = useState(0.025)
  const [mirror, setMirror] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [colors, setColors] = useState(6)
  const display = useRef<HTMLCanvasElement>(null)
  const measure = useRef<CanvasRenderingContext2D | null>(null)
  const drag = useRef<{ kind: 'photo' | 'text' | 'erase'; x: number; y: number; id?: string; stroke?: number } | null>(null)

  const photo = project?.photo
  useEffect(() => {
    if (!photo) { setBitmap(null); return }
    let alive = true
    fetch(photo).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((b) => alive && setBitmap(b)).catch(() => alive && setMsg({ ok: false, text: 'Não consegui abrir a foto guardada.' }))
    return () => { alive = false }
  }, [photo])

  const hoop = project?.hoop
  const view = project?.view
  const detail = project?.detail ?? 0
  const size = hoop ? canvasSize(hoop, PREVIEW_SIDE) : { w: 1, h: 1 }

  const raw = useMemo(
    () => (bitmap && hoop && view ? photoRaw(bitmap, hoop, view, PREVIEW_SIDE) : null),
    [bitmap, hoop?.shape, hoop?.cm, view?.zoom, view?.x, view?.y], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // As linhas são recalculadas (com pequena espera) quando a foto, o enquadramento ou o detalhe mudam.
  useEffect(() => {
    if (!raw) return
    const t = setTimeout(() => setLines(buildLineLayer(raw, detail)), 50)
    return () => clearTimeout(t)
  }, [raw, detail])

  // Borracha e textos só redesenham por cima das linhas.
  useEffect(() => {
    const c = display.current
    if (!c || !lines || !project) return
    const out = composeRisco(lines, project, size.w, size.h)
    c.width = size.w
    c.height = size.h
    c.getContext('2d')!.drawImage(out, 0, 0)
  }, [lines, project?.strokes, project?.texts, project?.hoop, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const yarn = YARN_PALETTES.find((y) => y.id === project?.yarnId) ?? YARN_PALETTES.find((y) => y.kind === 'ponto-cruz')
  const items = useMemo(() => (raw && yarn ? photoPalette(raw, yarn, colors) : []), [raw, yarn, colors])

  if (!user) return null

  const patch = (p: Partial<EmbProject>) => setProject((cur) => (cur ? { ...cur, ...p } : cur))
  const patchText = (id: string, p: Partial<TextItem>) => setProject((cur) => (cur ? { ...cur, texts: cur.texts.map((t) => (t.id === id ? { ...t, ...p } : t)) } : cur))
  const sel = project?.texts.find((t) => t.id === selected) ?? null

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await shrink(file)
      const yarnId = defaultYarnId() || (YARN_PALETTES.find((y) => y.kind === 'ponto-cruz')?.id ?? '')
      setProject(newProject(dataUrl, `Meu bordado · ${today()}`, yarnId))
      setLines(null)
      setSelected(null)
      setMsg(null)
      setTab('foto')
    } catch {
      setMsg({ ok: false, text: 'Não consegui abrir essa foto. Tente um JPG ou PNG.' })
    }
  }

  // Posição do toque em fração da área do bastidor.
  const frac = (e: React.PointerEvent) => {
    const r = display.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const hitText = (fx: number, fy: number): TextItem | null => {
    if (!project) return null
    if (!measure.current) measure.current = document.createElement('canvas').getContext('2d')
    const ctx = measure.current!
    const k = size.h / size.w
    for (const t of [...project.texts].reverse()) {
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
    if (!project || !lines) return
    const p = frac(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tab === 'foto') drag.current = { kind: 'photo', x: p.x, y: p.y }
    else if (tab === 'texto') {
      const t = hitText(p.x, p.y)
      setSelected(t?.id ?? null)
      if (t) drag.current = { kind: 'text', x: p.x, y: p.y, id: t.id }
    } else if (tab === 'apagar') {
      const stroke = { r: brush, pts: [[p.x, p.y]] as Array<[number, number]> }
      setProject((cur) => (cur ? { ...cur, strokes: [...cur.strokes, stroke] } : cur))
      drag.current = { kind: 'erase', x: p.x, y: p.y, stroke: project.strokes.length }
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !project) return
    const p = frac(e)
    if (d.kind === 'photo') {
      const dx = p.x - d.x
      const dy = p.y - d.y
      d.x = p.x
      d.y = p.y
      setProject((cur) => (cur ? { ...cur, view: { ...cur.view, x: cur.view.x + dx, y: cur.view.y + dy } } : cur))
    } else if (d.kind === 'text' && d.id) {
      const dx = p.x - d.x
      const dy = p.y - d.y
      d.x = p.x
      d.y = p.y
      setProject((cur) => (cur ? { ...cur, texts: cur.texts.map((t) => (t.id === d.id ? { ...t, x: t.x + dx, y: t.y + dy } : t)) } : cur))
    } else if (d.kind === 'erase' && d.stroke !== undefined) {
      if (Math.hypot(p.x - d.x, p.y - d.y) < 0.004) return
      d.x = p.x
      d.y = p.y
      setProject((cur) => {
        if (!cur) return cur
        const strokes = cur.strokes.slice()
        const s = strokes[d.stroke!]
        if (s) strokes[d.stroke!] = { ...s, pts: [...s.pts, [p.x, p.y]] }
        return { ...cur, strokes }
      })
    }
  }
  const onUp = () => { drag.current = null }

  const addText = () => {
    const t = newText('Seu texto')
    setProject((cur) => (cur ? { ...cur, texts: [...cur.texts, t] } : cur))
    setSelected(t.id)
    setTab('texto')
  }

  const save = () => {
    if (!project) return
    try {
      const saved = store.save({ ...project, name: project.name.trim() || `Meu bordado · ${today()}` })
      setProject(saved)
      setMsg({ ok: true, text: 'Salvo neste aparelho.' })
      onSaved?.()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível salvar.' })
    }
  }

  const exportAs = async (kind: 'pdf' | 'png') => {
    if (!project || !bitmap) return
    setBusy(kind)
    setMsg(null)
    try {
      await new Promise((r) => setTimeout(r, 30)) // deixa o aviso aparecer antes do cálculo pesado
      const full = renderFull(bitmap, project, mirror)
      const base = project.name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'bordado'
      if (kind === 'png') download(await canvasToPng(full), `${base}-risco.png`)
      else download(await buildRiscoPdf(full, project), `${base}-risco.pdf`)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.' })
    } finally {
      setBusy(null)
    }
  }

  const sheets = hoop ? sheetGrid(hoopCm(hoop).w, hoopCm(hoop).h) : { cols: 1, rows: 1 }
  const nSheets = sheets.cols * sheets.rows
  const round = hoop?.shape === 'redondo'

  return (
    <div className="studio-page">
      <AppBar title="Bordado" onBack={onBack} />
      <div className="studio studio--flat">
        <aside className="studio__side" aria-label="Opções do bordado">
          {project && (
            <>
              <label className="field">
                <span className="side-label">Nome do bordado</span>
                <input className="input" value={project.name} onChange={(e) => patch({ name: e.target.value })} />
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
                      onClick={() => patch({ hoop: { shape: s, cm: HOOP_SIZES[s].includes(project.hoop.cm) ? project.hoop.cm : HOOP_SIZES[s][2] } })}
                    >
                      {HOOP_LABEL[s]}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span className="hint">{project.hoop.shape === 'redondo' ? 'Diâmetro' : project.hoop.shape === 'quadrado' ? 'Lado' : 'Largura'}</span>
                  <select value={project.hoop.cm} onChange={(e) => patch({ hoop: { ...project.hoop, cm: Number(e.target.value) } })}>
                    {HOOP_SIZES[project.hoop.shape].map((cm) => (
                      <option key={cm} value={cm}>{cm} cm{project.hoop.shape === 'retangular' ? ` × ${hoopCm({ shape: 'retangular', cm }).h} cm` : ''}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="side-label">Detalhes do risco</span>
                <input type="range" min={MIN_DETAIL} max={MAX_DETAIL} value={project.detail} onChange={(e) => patch({ detail: Number(e.target.value) })} />
                <span className="hint">Menos detalhes = só o essencial. Mais detalhes = mais linhas.</span>
              </label>
            </>
          )}
        </aside>

        <main className="studio__main">
          <div className="toolbar">
            <label className="btn">
              {project ? 'Trocar foto' : 'Escolher foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {project && <button className="btn btn--primary" onClick={save}>Salvar</button>}
          </div>
          {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}

          {!project && (
            <div className="card dropzone">
              <p><b>Escolha uma foto</b> para criar o risco do bordado: só as linhas, prontas para passar ao tecido.</p>
              <label className="btn btn--primary">
                Escolher foto
                <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
              <p className="hint">A foto e o risco ficam no seu aparelho. Funciona sem internet.</p>
            </div>
          )}

          {project && (
            <>
              <div className="viewtabs" role="tablist" aria-label="O que ajustar">
                {([['foto', '🖼 Foto'], ['texto', '✏️ Texto'], ['apagar', '🧽 Apagar'], ['cores', '🧵 Fios']] as Array<[Tab, string]>).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'viewtab viewtab--on' : 'viewtab'} onClick={() => setTab(id)}>{label}</button>
                ))}
              </div>

              <section className="card embcard">
                <div className={`emb-stage${round ? ' emb-stage--round' : ''}`} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
                  <canvas
                    ref={display}
                    className={`emb-canvas emb-canvas--${tab}`}
                    aria-label="Risco do bordado"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  />
                  {!lines && <span className="emb-wait">Criando o risco…</span>}
                </div>

                {tab === 'foto' && (
                  <div className="emb-tools">
                    <p className="hint">Arraste o risco para enquadrar a foto no bastidor.</p>
                    <label className="field field--inline">
                      <span>Zoom</span>
                      <input type="range" min={1} max={3} step={0.02} value={project.view.zoom} onChange={(e) => patch({ view: { ...project.view, zoom: Number(e.target.value) } })} />
                    </label>
                    <button className="btn btn--sm" onClick={() => patch({ view: { zoom: 1, x: 0, y: 0 } })}>Centralizar</button>
                  </div>
                )}

                {tab === 'texto' && (
                  <div className="emb-tools">
                    <div className="row row--gap">
                      <button className="btn btn--sm btn--primary" onClick={addText}>+ Adicionar texto</button>
                      {sel && (
                        <button className="btn btn--sm" onClick={() => { patch({ texts: project.texts.filter((t) => t.id !== sel.id) }); setSelected(null) }}>Apagar texto</button>
                      )}
                    </div>
                    {sel ? (
                      <>
                        <label className="field">
                          <span className="side-label">Texto</span>
                          <input className="input" value={sel.text} onChange={(e) => patchText(sel.id, { text: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="side-label">Letra</span>
                          <select value={sel.font} onChange={(e) => patchText(sel.id, { font: e.target.value as TextItem['font'] })}>
                            {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                        </label>
                        <label className="field field--inline"><span>Tamanho</span>
                          <input type="range" min={0.04} max={0.4} step={0.005} value={sel.size} onChange={(e) => patchText(sel.id, { size: Number(e.target.value) })} />
                        </label>
                        <label className="field field--inline"><span>Girar</span>
                          <input type="range" min={-90} max={90} step={1} value={sel.rotate} onChange={(e) => patchText(sel.id, { rotate: Number(e.target.value) })} />
                        </label>
                        <p className="hint">Arraste o texto sobre o risco para mudar de lugar.</p>
                      </>
                    ) : (
                      <p className="hint">{project.texts.length === 0 ? 'Adicione uma frase ou um nome.' : 'Toque em um texto no risco para editar.'}</p>
                    )}
                  </div>
                )}

                {tab === 'apagar' && (
                  <div className="emb-tools">
                    <p className="hint">Passe o dedo ou o mouse sobre as linhas que não quer bordar.</p>
                    <label className="field field--inline"><span>Borracha</span>
                      <input type="range" min={0.008} max={0.08} step={0.002} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                    </label>
                    <div className="row row--gap">
                      <button className="btn btn--sm" disabled={project.strokes.length === 0} onClick={() => patch({ strokes: project.strokes.slice(0, -1) })}>Desfazer</button>
                      <button className="btn btn--sm" disabled={project.strokes.length === 0} onClick={() => patch({ strokes: [] })}>Restaurar tudo</button>
                    </div>
                  </div>
                )}

                {tab === 'cores' && (
                  <div className="emb-tools">
                    <label className="field">
                      <span className="side-label">Fio</span>
                      <select value={project.yarnId} onChange={(e) => patch({ yarnId: e.target.value })}>
                        {YARN_PALETTES.filter((y) => y.kind === 'ponto-cruz').map((y) => (
                          <option key={y.id} value={y.id}>{y.brand} {y.line} · {y.colors.length} cores</option>
                        ))}
                      </select>
                      <span className="hint">{KIND_LABEL['ponto-cruz']}</span>
                    </label>
                    <Stepper label="Quantas cores" unit="cores" value={colors} min={2} max={12} onChange={setColors} />
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
                )}
              </section>

              <section className="card embcard">
                <h2 className="section-title">Levar para o tecido</h2>
                <p className="hint">
                  O PDF sai em <b>tamanho real</b> ({hoopCm(project.hoop).w} × {hoopCm(project.hoop).h} cm), com o contorno do bastidor e o centro marcados.{' '}
                  {nSheets === 1 ? 'Cabe em 1 folha A4.' : `Ocupa ${nSheets} folhas A4 (${sheets.cols} × ${sheets.rows}), com marcas para colar.`} Imprima a 100%, sem ajustar à página.
                </p>
                <label className="check">
                  <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
                  Espelhar (para riscar pelo verso do papel)
                </label>
                <div className="row row--gap">
                  <button className="btn btn--primary" disabled={!lines || busy !== null} onClick={() => void exportAs('pdf')}>{busy === 'pdf' ? 'Gerando…' : '📄 Baixar PDF'}</button>
                  <button className="btn" disabled={!lines || busy !== null} onClick={() => void exportAs('png')}>{busy === 'png' ? 'Gerando…' : '⬇ Baixar imagem'}</button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
