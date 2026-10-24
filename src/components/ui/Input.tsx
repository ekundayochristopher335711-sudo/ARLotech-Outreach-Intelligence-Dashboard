import { type ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps {
  label?: string
  error?: string
  hint?: string
  children: ReactNode
  className?: string
  id?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, children, className, id }, ref) => {
    return (
      <div className={cn('space-y-1', className)}>
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 transition-colors',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              error && 'bg-red-50',
              !error && !label && 'pr-3'
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        {error && (
          <p id={`${id}-error`} className="text-xs text-red-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {children}
      </div>
    )
  },
)

Input.displayName = 'Input'
