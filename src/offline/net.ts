/** O aparelho avisa que está sem internet? */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Espera no máximo `ms`: se a conexão estiver lenta demais, devolve o erro de `onTimeout` em vez de travar a tela. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
