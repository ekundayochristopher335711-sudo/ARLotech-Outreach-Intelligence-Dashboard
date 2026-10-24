import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps {
  label?: string
  error?: string
  hint?: string
  value?: string
  onChange?: (value: string) => void
  className?: string
  rows?: number
  placeholder?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, error, hint, value, onChange, className, rows = 3, placeholder },
    ref,
  ) => {
    return (
      <div className={cn('space-y-1', className)}>
        {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={rows}
          className={cn(
            'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 transition-colors resize-y',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            error && 'bg-red-50'
          )}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : 'false'}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
