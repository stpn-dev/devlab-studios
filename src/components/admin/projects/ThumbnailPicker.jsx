// src/components/admin/projects/ThumbnailPicker.jsx
import { Check, AlertCircle } from '../../icons/icons'
import { brandingAssets } from '../../../config/branding.js'

export default function ThumbnailPicker({ galleryImages, onSelect, onClear }) {
  const hasImages = Array.isArray(galleryImages) && galleryImages.length > 0
  const selected = hasImages ? galleryImages.find((image) => image.isThumbnail) : null

  if (!hasImages) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
        <AlertCircle size={20} className="text-slate-400" />
        Add gallery images first — no thumbnail selection possible yet.
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-2">
        {galleryImages.map((image) => (
          <button
            key={image.id}
            type="button"
            data-testid="thumbnail-picker-tile"
            onClick={() => onSelect(image.id)}
            className={`relative overflow-hidden rounded-md border-2 transition ${
              image.isThumbnail ? 'border-slate-900' : 'border-transparent hover:border-slate-300'
            }`}
          >
            <img src={image.url} alt="" className="h-16 w-full object-cover" />
            {image.isThumbnail ? (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                <Check size={18} className="text-white" />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={!selected}
        className="justify-self-start text-xs font-semibold text-slate-500 underline decoration-dotted hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Clear thumbnail (show logo instead)
      </button>
      {!selected ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <img src={brandingAssets.logoOnlyUrl} alt="" className="h-4 w-4" />
          No thumbnail selected — the logo will show on the public site.
        </p>
      ) : null}
    </div>
  )
}
