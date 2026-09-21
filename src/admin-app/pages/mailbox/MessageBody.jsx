import { useMemo, useState } from 'react'

/**
 * Renders the body of an inbound message.
 *
 * THE HTML IS RENDERED IN A SANDBOXED IFRAME, AND THAT IS THE ACTUAL SECURITY
 * BOUNDARY — not the sanitizer that ran at ingest.
 *
 * `sandbox=""` (empty, every permission withheld) puts the content in an opaque
 * origin with scripting disabled, no access to this page's DOM or cookies, no
 * form submission, no top-level navigation and no popups. Even a total failure
 * of src/mailbox/inbound/sanitizeHtml.js cannot execute script in the admin
 * session from in here.
 *
 * `dangerouslySetInnerHTML` would have been fewer lines and would have made the
 * sanitizer the ONLY thing standing between a stranger's email and an
 * authenticated admin origin. One control is not a defence; this is the second
 * one, and it is the stronger of the two.
 *
 * The CSP inside the document is a third: nothing was going to be loaded anyway
 * because the sanitizer strips every remote reference, but if one were ever
 * missed, `default-src 'none'` stops the request — which also means a tracking
 * pixel cannot report that the message was opened.
 */

const FRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"

/** Styling for the framed document. Kept minimal — this is someone else's mail. */
const FRAME_STYLE = `
  html { color-scheme: light; }
  body {
    margin: 0;
    padding: 12px;
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1e293b;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  a { color: #0369a1; }
  blockquote {
    margin: 0 0 0 8px;
    padding-left: 10px;
    border-left: 3px solid #e2e8f0;
    color: #64748b;
  }
  table { border-collapse: collapse; max-width: 100%; }
  td, th { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
  pre { white-space: pre-wrap; }
`

function HtmlFrame({ html }) {
  const [expanded, setExpanded] = useState(false)

  // The whole document is assembled here rather than letting the iframe inherit
  // anything: an explicit charset stops a UTF-8 body being read as Latin-1, and
  // the CSP has to be inside the document because a sandboxed frame has no
  // response headers of its own.
  const srcDoc = useMemo(
    () =>
      [
        '<!doctype html><html><head><meta charset="utf-8">',
        `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`,
        `<style>${FRAME_STYLE}</style>`,
        '</head><body>',
        html,
        '</body></html>',
      ].join(''),
    [html],
  )

  return (
    <div>
      <iframe
        // Empty sandbox: no scripts, no same-origin, no forms, no navigation.
        // Adding `allow-scripts` and `allow-same-origin` together would undo
        // the sandbox entirely, which is the one combination never to reach for.
        sandbox=""
        srcDoc={srcDoc}
        title="Message content"
        referrerPolicy="no-referrer"
        className={`w-full rounded-lg border border-slate-200 bg-white transition-all ${expanded ? 'h-[70vh]' : 'h-72'}`}
      />
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-1 text-xs font-semibold text-slate-500 underline"
      >
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  )
}

/**
 * @param {{ message: object }} props
 */
function MessageBody({ message }) {
  const [showHtml, setShowHtml] = useState(Boolean(message.bodyHtml))

  const hasHtml = Boolean(message.bodyHtml)
  const hasText = Boolean(message.bodyText)

  return (
    <div className="space-y-2">
      {hasHtml && hasText ? (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowHtml(true)}
            className={`rounded px-2 py-0.5 font-semibold ${showHtml ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Formatted
          </button>
          <button
            type="button"
            onClick={() => setShowHtml(false)}
            className={`rounded px-2 py-0.5 font-semibold ${showHtml ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-white'}`}
          >
            Plain text
          </button>
        </div>
      ) : null}

      {showHtml && hasHtml ? (
        <HtmlFrame html={message.bodyHtml} />
      ) : hasText ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-700">{message.bodyText}</pre>
      ) : (
        <p className="text-sm italic text-slate-400">
          This message has no readable body.{' '}
          {message.rawKey ? 'Download the original to see what arrived.' : ''}
        </p>
      )}

      {message.strippedRemoteContent ? (
        // Said out loud, because a message missing its images otherwise reads
        // as broken rather than as edited.
        <p className="text-xs text-amber-700">
          Images and other remote content were removed when this message arrived. Nothing here loads from the
          internet, so the sender cannot tell that you opened it.
        </p>
      ) : null}

      {message.bodyTruncated ? (
        <p className="text-xs text-slate-500">
          This body was longer than we store. Download the original to read it in full.
        </p>
      ) : null}
    </div>
  )
}

export default MessageBody
