import { useState } from 'react'
import ImageModal from '../ImageModal'
import ResponsivePicture from '../ResponsivePicture'
import { BadgeCheck } from '../icons/icons'

function formatCertDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function CertificationsGallery({ certifications }) {
  const [selectedCert, setSelectedCert] = useState(null)

  return (
    <>
      <ul className="space-y-3">
        {certifications.map((cert) => (
          <li
            key={cert.id}
            className="flex items-center gap-4 rounded-2xl bg-white/0 p-3 shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_16px_36px_rgba(60,28,120,0.18)]"
          >
            {cert.badgeImage ? (
              <button
                type="button"
                onClick={() => setSelectedCert(cert)}
                className="flex-shrink-0 overflow-hidden rounded-xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                aria-label={`View ${cert.name} certificate full size`}
              >
                <ResponsivePicture
                  image={cert.badgeImage}
                  alt={`${cert.name} certificate`}
                  className="h-16 w-16 object-cover sm:h-20 sm:w-20"
                />
              </button>
            ) : (
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-brand-mint text-brand-teal sm:h-20 sm:w-20">
                <BadgeCheck className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-brand-ink">{cert.name}</h3>
              <p className="text-xs text-slate-600">{cert.issuer}</p>
              {cert.issuedDate ? <p className="mt-0.5 text-xs text-slate-500">{formatCertDate(cert.issuedDate)}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      <ImageModal
        image={selectedCert?.badgeImageFull || selectedCert?.badgeImage || null}
        alt={selectedCert ? `${selectedCert.name} certificate` : ''}
        caption={selectedCert ? `${selectedCert.name} — ${selectedCert.issuer}` : ''}
        isOpen={Boolean(selectedCert)}
        onClose={() => setSelectedCert(null)}
      />
    </>
  )
}

export default CertificationsGallery
