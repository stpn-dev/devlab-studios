import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Client-side only, from the canonical public URL, rendered as an inline
// <svg> -- per spec §10, no external QR service call. The markup string
// comes entirely from the `qrcode` library given a URL this app constructed
// itself (never raw user input), so injecting it via dangerouslySetInnerHTML
// is safe here.
export default function PublicLinkQRCode({ url }) {
  const [svgMarkup, setSvgMarkup] = useState(null)
  const [renderedUrl, setRenderedUrl] = useState(null)

  if (renderedUrl !== url) {
    setRenderedUrl(url)
    setSvgMarkup(null)
  }

  useEffect(() => {
    let ignore = false
    QRCode.toString(url, { type: 'svg', width: 160, margin: 1 })
      .then((markup) => {
        if (!ignore) setSvgMarkup(markup)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [url])

  if (!svgMarkup) return null

  return <div data-testid="public-link-qr" className="h-40 w-40" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
}
