import { useEffect, useMemo, useRef, useState } from 'react'
import PrimaryButton from '../PrimaryButton'
import AnimatedIcon from '../icons/AnimatedIcon'
import { ERROR_MESSAGES } from '../../config/errorMessages'
import { User, Mail, MessageSquare, Send, Check, AlertCircle, Loader2 } from '../icons/icons'

const initialForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
}

// Cloudflare's published "always passes" testing sitekey — safe as a
// default so the widget renders in dev/preview before a real one is
// configured. Server-side verification is skipped entirely until
// TURNSTILE_SECRET_KEY is set (see src/worker/turnstile.js), so this
// default has no security implication either way.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

function useTurnstile() {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    let cancelled = false

    function renderWidget() {
      if (cancelled || !containerRef.current || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (nextToken) => setToken(nextToken),
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      })
    }

    if (window.turnstile) {
      renderWidget()
    } else if (!document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = renderWidget
      document.head.appendChild(script)
    } else {
      document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)?.addEventListener('load', renderWidget)
    }

    return () => {
      cancelled = true
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
  }, [])

  function reset() {
    setToken('')
    if (window.turnstile && widgetIdRef.current !== null) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }

  return { containerRef, token, reset }
}

function ContactForm() {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const turnstile = useTurnstile()

  const config = useMemo(
    () => ({
      apiUrl: import.meta.env.VITE_CONTACT_API_URL || '/api/contact',
    }),
    [],
  )

  const validate = () => {
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = 'Full name is required.'
    if (!form.email.trim()) nextErrors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email.'
    if (!form.subject.trim()) nextErrors.subject = 'Subject is required.'
    if (!form.message.trim()) nextErrors.message = 'Message is required.'
    return nextErrors
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validation = validate()
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      setStatus({
        type: 'error',
        message: ERROR_MESSAGES.CONTACT_VALIDATION_ERROR.message,
      })
      return
    }

    if (!config.apiUrl) {
      setStatus({
        type: 'error',
        message: 'Contact endpoint is missing. Check your .env settings.',
      })
      return
    }

    setIsSubmitting(true)
    setStatus(null)

    try {
      const payload = {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
        source: 'devlabstudios-contact-form',
        turnstileToken: turnstile.token,
      }

      const requestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }

      const response = await fetch(config.apiUrl, requestInit)
      if (!response.ok) {
        throw new Error(`Form submission failed with status ${response.status}`)
      }

      setStatus({
        type: 'success',
        message: 'Message sent successfully. You should receive a confirmation email shortly.',
      })
      setForm(initialForm)
      setErrors({})
    } catch (err) {
      // User-safe error message
      setStatus({
        type: 'error',
        message: ERROR_MESSAGES.CONTACT_SEND_ERROR.message,
      })
      if (import.meta.env.DEV) {
        console.error('[Contact Form Error]', err)
      }
    } finally {
      setIsSubmitting(false)
      turnstile.reset()
    }
  }

  return (
    <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-8">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-brand-ink" htmlFor="name">
              <AnimatedIcon icon={User} size={16} color="text-brand-teal" animationType="none" ariaLabel={null} />
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-brand-ink placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 transition"
              placeholder="Your name"
            />
            {errors.name ? <p className="text-sm text-rose-700">{errors.name}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-brand-ink" htmlFor="email">
              <AnimatedIcon icon={Mail} size={16} color="text-brand-teal" animationType="none" ariaLabel={null} />
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-brand-ink placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 transition"
              placeholder="name@email.com"
            />
            {errors.email ? <p className="text-sm text-rose-700">{errors.email}</p> : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-ink" htmlFor="subject">
            <AnimatedIcon icon={MessageSquare} size={16} color="text-brand-teal" animationType="none" ariaLabel={null} />
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            value={form.subject}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-brand-ink placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 transition"
            placeholder="Project inquiry, support, collaboration"
          />
          {errors.subject ? <p className="text-sm text-rose-700">{errors.subject}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-ink" htmlFor="message">
            <AnimatedIcon icon={MessageSquare} size={16} color="text-brand-teal" animationType="none" ariaLabel={null} />
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows="5"
            value={form.message}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-brand-ink placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 transition"
            placeholder="Share context, goals, timelines, and success criteria."
          />
          {errors.message ? <p className="text-sm text-rose-700">{errors.message}</p> : null}
        </div>

        <div ref={turnstile.containerRef} />

        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={isSubmitting} className="px-6 py-3">
            {isSubmitting ? (
              <>
                <span>Sending…</span>
                <AnimatedIcon icon={Loader2} size={16} color="inherit" animationType="spin" ariaLabel={null} />
              </>
            ) : (
              <>
                <span>Send Message</span>
                <AnimatedIcon icon={Send} size={16} color="inherit" animationType="hover-slide" ariaLabel={null} />
              </>
            )}
          </PrimaryButton>
          <span className="text-sm text-slate-600">Responses will be routed via Zoho.</span>
        </div>

        {status ? (
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
              status.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
            }`}
            role="status"
            aria-live="polite"
          >
            <AnimatedIcon
              icon={status.type === 'success' ? Check : AlertCircle}
              size={18}
              color="inherit"
              animationType={status.type === 'success' ? 'pulse' : 'none'}
              ariaLabel={null}
            />
            <span>{status.message}</span>
          </div>
        ) : null}
      </form>
    </section>
  )
}

export default ContactForm
