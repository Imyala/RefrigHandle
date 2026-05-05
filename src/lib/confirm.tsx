import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { Button, Field, Modal, TextInput } from '../components/ui'

// Imperative confirm dialog. Replaces the OS-rendered window.confirm()
// and window.prompt() so the app's confirmation flows look consistent
// with the rest of the UI (themed Modal, dark mode, secondary/danger
// buttons). Pattern mirrors useToast — provider mounts a single Modal
// at the root, the hook returns a function that resolves a Promise
// when the user picks Confirm or Cancel.

export interface ConfirmOptions {
  title: string
  // Optional body text — supports a string or any ReactNode (render
  // bold callouts, lists, etc.).
  message?: ReactNode
  // Defaults to 'Confirm'. For dangerous actions (delete, erase, etc.)
  // pass danger: true to use the red Button variant.
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // When true, render a TextInput under the message and resolve with
  // the typed string instead of `true`. Cancel still resolves with
  // `null`. Use this for the soft-delete "reason" prompt.
  withReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
}

type ConfirmResult = boolean | string | null

interface OpenState extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null)
  const [reason, setReason] = useState('')

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<ConfirmResult>((resolve) => {
      setReason('')
      setOpen({ ...opts, resolve })
    })
  }, [])

  function close(result: ConfirmResult) {
    if (open) open.resolve(result)
    setOpen(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!open}
        title={open?.title ?? ''}
        onClose={() => close(open?.withReason ? null : false)}
      >
        {open?.message && (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {open.message}
          </div>
        )}
        {open?.withReason && (
          <div className="mt-3">
            <Field label={open.reasonLabel ?? 'Reason (optional)'}>
              <TextInput
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={open.reasonPlaceholder}
              />
            </Field>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            full
            onClick={() => close(open?.withReason ? null : false)}
          >
            {open?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={open?.danger ? 'danger' : 'primary'}
            full
            onClick={() => close(open?.withReason ? reason : true)}
          >
            {open?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
