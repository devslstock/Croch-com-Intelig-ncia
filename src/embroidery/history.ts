/**
 * Histórico para desfazer e refazer. Guarde o estado ANTES de cada mudança (`record`).
 * Mudanças seguidas do mesmo grupo (ex.: arrastar um controle) viram um único passo.
 */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private lastGroup = ''
  private lastAt = 0

  constructor(private limit = 100, private gapMs = 700) {}

  record(before: T, group = '', now = Date.now()) {
    if (group && group === this.lastGroup && now - this.lastAt < this.gapMs) {
      this.lastAt = now
      return
    }
    this.past.push(before)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.lastGroup = group
    this.lastAt = now
  }

  undo(current: T): T | undefined {
    const prev = this.past.pop()
    if (prev === undefined) return undefined
    this.future.push(current)
    this.lastGroup = ''
    return prev
  }

  redo(current: T): T | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(current)
    this.lastGroup = ''
    return next
  }

  reset() {
    this.past = []
    this.future = []
    this.lastGroup = ''
  }

  get canUndo() {
    return this.past.length > 0
  }

  get canRedo() {
    return this.future.length > 0
  }
}
