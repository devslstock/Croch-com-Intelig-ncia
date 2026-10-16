import { APP_NAME, DEV_NAME, DEV_SITE } from '../brand'

/** Rodapé de todas as telas. O ano acompanha o calendário. */
export function Footer() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} {APP_NAME.toUpperCase()}. Todos os direitos reservados.</p>
      <p>
        Desenvolvido pela {DEV_NAME} (<a href={`https://${DEV_SITE}`} target="_blank" rel="noopener noreferrer">{DEV_SITE}</a>)
      </p>
    </footer>
  )
}
