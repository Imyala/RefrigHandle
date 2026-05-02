import { useEffect } from 'react'
import { useStore } from './store'

// Applies the active theme to <html> as a `dark` class.
// Listens to the system colour-scheme media query when theme is 'system'.
export function ThemeApplier() {
  const { state } = useStore()
  const theme = state.theme

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', isDark)
    }
    apply()

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => apply()
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }
  }, [theme])

  return null
}
