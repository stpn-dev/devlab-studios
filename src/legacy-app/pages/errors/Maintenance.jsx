import { Link } from 'react-router-dom'
import GlassCard from '../../../components/GlassCard'
import PrimaryButton from '../../../components/PrimaryButton'
import SectionHeader from '../../../components/SectionHeader'
import AnimatedIcon from '../../../components/icons/AnimatedIcon'
import { ERROR_MESSAGES } from '../../../config/errorMessages'
import { Wrench, RotateCw, Mail, Phone } from '../../../components/icons/icons'

function Maintenance() {
  const { title, message, details } = ERROR_MESSAGES.MAINTENANCE_MODE

  return (
    <div className="space-y-8">
      <SectionHeader title={title} subtitle={message} align="center" />

      <GlassCard className="p-8">
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <AnimatedIcon
              icon={Wrench}
              size={64}
              color="text-navy-300"
              animationType="pulse"
              ariaLabel="Under maintenance"
            />
          </div>

          <div className="space-y-3">
            <p className="text-lg text-slate-200/85">{details}</p>
            <p className="text-sm text-slate-200/70">
              Thank you for your patience. We're making improvements to serve you better.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
            <PrimaryButton onClick={() => window.location.reload()}>
              <RotateCw size={16} />
              Refresh Page
            </PrimaryButton>
            <PrimaryButton to="/contact" variant="secondary">
              Contact Us
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-200/70">
          In the meantime, you can reach out to us directly:
        </p>
        <div className="inline-flex gap-2">
          <a
            href="mailto:stpnrey.agustinez@gmail.com"
            className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 hover:border-navy-300/50"
          >
            <AnimatedIcon
              icon={Mail}
              size={16}
              color="text-white group-hover:text-navy-300"
              animationType="none"
              ariaLabel={null}
            />
            Email
          </a>
          <a
            href="tel:+639262372965"
            className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 hover:border-navy-300/50"
          >
            <AnimatedIcon
              icon={Phone}
              size={16}
              color="text-white group-hover:text-navy-300"
              animationType="none"
              ariaLabel={null}
            />
            Call
          </a>
        </div>
      </div>
    </div>
  )
}

export default Maintenance
