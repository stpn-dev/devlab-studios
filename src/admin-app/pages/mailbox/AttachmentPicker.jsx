import { useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'

/**
 * Picks files for an outgoing message.
 *
 * UPLOADS IMMEDIATELY, RATHER THAN ON SEND. A 10 MB file attached to the Send
 * button means the operator writes the message, presses Send, and waits — with
 * no way to tell a slow upload from a broken one, and nothing to retry but the
 * whole message. Uploading on selection turns that into a progress state they
 * can watch and a file they can remove.
 *
 * The consequence is that an upload can exist with no message attached to it.
 * That is the unclaimed state the schema is built around: the bytes sit in R2
 * with `outbound_id` null until Send binds them, and an abandoned compose
 * leaves an orphan rather than a half-sent message.
 *
 * @param {{ attachmentIds: string[], onChange: (ids: string[]) => void, disabled?: boolean }} props
 */
function AttachmentPicker({ attachmentIds, onChange, disabled = false }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const total = files.reduce((sum, file) => sum + file.size, 0)

  async function add(event) {
    const chosen = Array.from(event.target.files ?? [])
    // Cleared immediately so choosing the same file twice in a row still fires
    // a change event.
    event.target.value = ''
    if (chosen.length === 0) return

    setBusy(true)
    setError(null)

    const added = []
    try {
      for (const file of chosen) {
        const form = new FormData()
        form.append('file', file)
        const { attachment } = await adminApi.upload('/api/admin/mailbox/outbound-attachments', form)
        added.push(attachment)
      }
    } catch (caught) {
      setError(caught.message)
    } finally {
      // Whatever DID upload is kept. Discarding them because a later file
      // failed would make the operator re-pick files that are already stored.
      if (added.length > 0) {
        const next = [...files, ...added]
        setFiles(next)
        onChange(next.map((file) => file.id))
      }
      setBusy(false)
    }
  }

  async function remove(id) {
    setError(null)
    const next = files.filter((file) => file.id !== id)
    setFiles(next)
    onChange(next.map((file) => file.id))

    try {
      await adminApi.delete(`/api/admin/mailbox/outbound-attachments/${id}`)
    } catch {
      // Already removed from the message, which is what the operator asked
      // for. A failed cleanup leaves an orphaned row, not a file that sends
      // anyway, so it is not worth an error message.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Attach files'}
        </button>
        {files.length > 0 ? (
          <span className="text-xs text-slate-500">
            {files.length} file{files.length === 1 ? '' : 's'} · {(total / 1024 / 1024).toFixed(1)} MB of 10 MB
          </span>
        ) : null}
        <input ref={inputRef} type="file" multiple onChange={add} className="hidden" />
      </div>

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
            >
              <span className="truncate text-slate-700" title={file.filename}>
                {file.filename}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-slate-500">{(file.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => remove(file.id)}
                  disabled={disabled}
                  className="font-semibold text-rose-700 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {attachmentIds.length > 0 ? (
        <p className="text-xs text-slate-500">
          Sent as separate files. The message body stays plain text.
        </p>
      ) : null}
    </div>
  )
}

export default AttachmentPicker
