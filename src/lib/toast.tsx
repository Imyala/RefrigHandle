import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

interface ToastApi {
  show: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const show = useCallback<ToastApi['show']>((message, tone = 'success') => {
    const id = ++idRef.current
    setToasts((cur) => [...cur, { id, message, tone }])
    setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id))
    }, 2500)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {toasts.map((t) => (
          <ToastPill key={t.id} toast={t} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastPill({ toast }: { toast: Toast }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const tone =
    toast.tone === 'error'
      ? 'bg-red-600 text-white'
      : toast.tone === 'info'
        ? 'bg-slate-800 text-white'
        : 'bg-emerald-600 text-white'

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-200 ${tone} ${
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      {toast.tone === 'success' && <span aria-hidden>✓</span>}
      {toast.tone === 'error' && <span aria-hidden>!</span>}
      <span>{toast.message}</span>
    </div>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
