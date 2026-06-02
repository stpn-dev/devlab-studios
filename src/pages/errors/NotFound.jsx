import { Link } from 'react-router-dom'
import GlassCard from '../../components/GlassCard'
import PrimaryButton from '../../components/PrimaryButton'
import SectionHeader from '../../components/SectionHeader'
import AnimatedIcon from '../../components/icons/AnimatedIcon'
import { ERROR_MESSAGES } from '../../config/errorMessages'
import { AlertTriangle, Home, ArrowLeft, MessageSquare, User, Briefcase } from '../../components/icons/icons'

function NotFound() {
  const { title, message } = ERROR_MESSAGES.NOT_FOUND

  return (
    <div className="space-y-8">
      <SectionHeader title={title} subtitle={message} align="center" />

      <GlassCard className="p-8">
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <AnimatedIcon
              icon={AlertTriangle}
              size={64}
              color="text-navy-300"
              animationType="float"
              ariaLabel="404 Error"
            />
          </div>

          <div className="text-6xl font-bold text-navy-300">404</div>

          <div className="space-y-2">
            <p className="text-lg text-slate-200/85">
              The page you're looking for isn't here. It might have been moved or deleted.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <PrimaryButton to="/">
              <Home size={16} />
              Go Home
            </PrimaryButton>
            <PrimaryButton variant="secondary" onClick={() => window.history.back()}>
              <ArrowLeft size={16} />
              Go Back
            </PrimaryButton>
            <PrimaryButton to="/contact" variant="ghost">
              <MessageSquare size={16} />
              Contact Support
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-4">
        <h3 className="text-center text-lg font-semibold text-white">Quick Links</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link to="/about" className="block group">
            <GlassCard className="h-full p-5 transition-all group-hover:border-navy-300/50">
              <div className="flex items-center gap-2">
                <AnimatedIcon
                  icon={User}
                  size={18}
                  color="text-navy-300"
                  animationType="none"
                  ariaLabel={null}
                />
                <p className="text-sm font-semibold text-navy-300">About</p>
              </div>
              <p className="mt-1 text-sm text-slate-200/85">Learn about DevLab Studios</p>
            </GlassCard>
          </Link>
          <Link to="/profile" className="block group">
            <GlassCard className="h-full p-5 transition-all group-hover:border-navy-300/50">
              <div className="flex items-center gap-2">
                <AnimatedIcon
                  icon={Briefcase}
                  size={18}
                  color="text-navy-300"
                  animationType="none"
                  ariaLabel={null}
                />
                <p className="text-sm font-semibold text-navy-300">Profile</p>
              </div>
              <p className="mt-1 text-sm text-slate-200/85">View founder profile and work</p>
            </GlassCard>
          </Link>
          <Link to="/contact" className="block group">
            <GlassCard className="h-full p-5 transition-all group-hover:border-navy-300/50">
              <div className="flex items-center gap-2">
                <AnimatedIcon
                  icon={MessageSquare}
                  size={18}
                  color="text-navy-300"
                  animationType="none"
                  ariaLabel={null}
                />
                <p className="text-sm font-semibold text-navy-300">Contact</p>
              </div>
              <p className="mt-1 text-sm text-slate-200/85">Get in touch</p>
            </GlassCard>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default NotFound
