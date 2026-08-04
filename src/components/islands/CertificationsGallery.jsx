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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {certifications.map((cert) => (
          <div key={cert.id} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-5 text-center shadow-[0_18px_45px_rgba(60,28,120,0.14)]">
            {cert.badgeImage ? (
              <button
                type="button"
                onClick={() => setSelectedCert(cert)}
                className="mx-auto block rounded-lg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                aria-label={`View ${cert.name} certificate full size`}
              >
                <ResponsivePicture
                  image={cert.badgeImage}
                  alt={`${cert.name} certificate`}
                  className="mx-auto h-20 w-auto object-contain"
                />
              </button>
            ) : (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                <BadgeCheck className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
            <h3 className="mt-3 text-sm font-semibold text-brand-ink">{cert.name}</h3>
            <p className="mt-1 text-xs text-slate-600">{cert.issuer}</p>
            {cert.issuedDate ? <p className="mt-1 text-xs text-slate-500">{formatCertDate(cert.issuedDate)}</p> : null}
          </div>
        ))}
      </div>

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
