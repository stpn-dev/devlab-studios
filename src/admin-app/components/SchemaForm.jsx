import { useState } from 'react'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500'

/**
 * Escape hatch for nested array/object props (e.g. a block's stats.items
 * or imageGallery.images) that don't have a dedicated widget yet — edits
 * raw JSON instead of silently dropping the data. Keeps its own text state
 * so invalid-while-typing JSON doesn't get clobbered by the parsed value,
 * resyncing only when `value` itself changes identity (e.g. a version
 * restore swaps in a whole new object) — adjusting state during render
 * instead of in an effect, per https://react.dev/learn/you-might-not-need-an-effect.
 */
function JsonField({ fieldId, value, onChange }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? [], null, 2))
  const [error, setError] = useState(null)
  const [prevValue, setPrevValue] = useState(value)

  if (value !== prevValue) {
    setPrevValue(value)
    setText(JSON.stringify(value ?? [], null, 2))
    setError(null)
  }

  function handleChange(nextText) {
    setText(nextText)
    try {
      const parsed = JSON.parse(nextText)
      setError(null)
      onChange(parsed)
    } catch {
      setError('Invalid JSON — changes here are not saved until this is fixed.')
    }
  }

  return (
    <div>
      <textarea
        id={fieldId}
        className={`${inputClass} font-mono text-xs`}
        rows={6}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}

function Field({ field, fieldId, value, onChange }) {
  const commonProps = {
    id: fieldId,
    name: field.name,
    className: inputClass,
  }

  if (field.type === 'textarea') {
    return <textarea {...commonProps} rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  }

  if (field.type === 'boolean') {
    return (
      <input
        id={fieldId}
        name={field.name}
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  }

  if (field.type === 'number') {
    return <input {...commonProps} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
  }

  if (field.type === 'select') {
    return (
      <select {...commonProps} value={value ?? ''} onChange={(e) => onChange(field.options.some((o) => typeof o.value === 'number') ? Number(e.target.value) : e.target.value)}>
        {field.options.map((option) => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'date') {
    return <input {...commonProps} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  }

  if (field.type === 'json') {
    return <JsonField fieldId={fieldId} value={value} onChange={onChange} />
  }

  return <input {...commonProps} type={field.type === 'url' ? 'url' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
}

/**
 * Renders a form from a field-descriptor array (see lib/fieldDescriptors.js)
 * instead of hand-built JSX per content type — the core "schema-driven, not
 * ad-hoc CRUD" mechanism every collection/singleton editor in this admin
 * shares.
 *
 * `idPrefix` must be unique per rendered instance (e.g. the item's id or
 * list index) — this form gets rendered once per item in a collection
 * list, and without it every instance would emit the same `id`/`htmlFor`,
 * breaking label association (and picking the wrong field under
 * automation/assistive tech) for every item after the first.
 */
function SchemaForm({ fields, value, onChange, idPrefix = 'form' }) {
  function setFieldValue(name, fieldValue) {
    onChange({ ...value, [name]: fieldValue })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const fieldId = `${idPrefix}-${field.name}`
        return (
          <div key={field.name} className={field.type === 'textarea' || field.type === 'json' ? 'flex flex-col gap-1.5 sm:col-span-2' : 'flex flex-col gap-1.5'}>
            <label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              {field.label}
              {field.required ? <span className="text-rose-600">*</span> : null}
            </label>
            <Field field={field} fieldId={fieldId} value={value[field.name]} onChange={(next) => setFieldValue(field.name, next)} />
            {field.help ? <p className="text-xs text-slate-500">{field.help}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

export default SchemaForm
