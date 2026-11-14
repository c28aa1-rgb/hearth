import { Dialog } from './Dialog'

export function ConfirmDialog({ open, title, body, confirm, onConfirm, onCancel }: {
  open: boolean
  title: string
  body: string
  confirm: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} label={title} width={400}>
      <h2 className="dialog-title">{title}</h2>
      <p className="dialog-body">{body}</p>
      <div className="dialog-actions">
        <button className="btn quiet" onClick={onCancel}>Cancel</button>
        <button className="btn danger-solid" onClick={onConfirm} autoFocus>{confirm}</button>
      </div>
    </Dialog>
  )
}
