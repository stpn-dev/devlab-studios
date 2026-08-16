import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from '../../icons/icons'

function deriveFilenameFromUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''

  try {
    const normalized = new URL(value)
    return normalized.pathname.split('/').filter(Boolean).pop() || ''
  } catch {
    return value.split('/').filter(Boolean).pop() || ''
  }
}

export default function GalleryImageRow({ item, index, total, onUpdateAltText, onReplace, onRemove, onMove }) {
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <img
            src={item.url}
            alt={item.altText || `Gallery image ${index + 1}`}
            className="h-24 w-full object-cover"
          />
          {item.pending ? (
            <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Pending
            </span>
          ) : null}
          {item.isThumbnail ? (
            <span className="absolute right-1 top-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Thumbnail
            </span>
          ) : null}
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Alt Text
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-slate-500"
              value={item.altText}
              onChange={(event) => onUpdateAltText(index, event.target.value)}
              placeholder="Project screenshot detail"
            />
          </label>
          <p className="truncate text-xs text-slate-500">{item.filename || deriveFilenameFromUrl(item.url)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Slide {index + 1}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={14} />
            Up
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Down
            <ChevronRight size={14} />
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
            <RotateCw size={14} />
            Replace
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onReplace(index, file)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={item.isThumbnail}
            title={item.isThumbnail ? 'Choose a different thumbnail before removing this image.' : undefined}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
