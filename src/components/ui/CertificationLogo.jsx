// Imported with the `?url` suffix so Vite/Astro's asset pipeline resolves
// these to plain URL strings instead of ImageMetadata objects, matching the
// convention established in src/data/tools.js for `<img src>` consumption.
import ciscoLogo from '../../assets/tool-logos/cisco.svg?url'
import googleLogo from '../../assets/tool-logos/google.svg?url'
import owaspLogo from '../../assets/tool-logos/owasp.svg?url'
import { BadgeCheck } from '../icons/icons'

const ISSUER_LOGOS = {
  Cisco: ciscoLogo,
  Google: googleLogo,
  OWASP: owaspLogo,
}

/**
 * @param {{ issuer: string | null }} props
 */
function CertificationLogo({ issuer }) {
  const logo = issuer ? ISSUER_LOGOS[issuer] : null
  if (logo) {
    return <img src={logo} alt="" width={20} height={20} className="h-5 w-5 flex-shrink-0" />
  }
  return <BadgeCheck className="h-5 w-5 flex-shrink-0 text-brand-teal" aria-hidden="true" />
}

export default CertificationLogo
