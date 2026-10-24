import { cn } from '@/lib/utils'

interface SelectProps {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export function Select({
  label,
  error,
  options,
  value,
  onChange,
  className,
  placeholder = 'Select an option',
}: SelectProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 transition-colors',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          error && 'bg-red-50'
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
