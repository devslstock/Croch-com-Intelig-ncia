import { createContext, useContext } from 'react'

/** Atalhos de navegação que o menu da conta (AppBar) usa em qualquer tela. */
export interface Nav {
  goPlans(): void
  goAdmin(): void
}

export const NavContext = createContext<Nav>({ goPlans: () => undefined, goAdmin: () => undefined })
export const useNav = () => useContext(NavContext)
