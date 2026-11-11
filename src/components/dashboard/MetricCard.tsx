import { Card } from '@/components/ui/Card'
import { type ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  change?: string
  icon: ReactNode
  loading?: boolean
  descriptor?: string
}

export function MetricCard({ label, value, change, icon, loading, descriptor }: MetricCardProps) {
  return (
    <Card className="p-3 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-arlotech/10 text-arlotech">
          {icon}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        {loading ? (
          <span className="text-2xl font-bold text-slate-900">
            <span className="skeleton w-20" />
          </span>
        ) : (
          <span className="text-2xl font-bold text-slate-900">{value}</span>
        )}
        {change && (
          <span className="text-xs font-medium text-green-600">{change}</span>
        )}
      </div>
      {descriptor && (
        <p className="mt-1 text-xs text-slate-400">{descriptor}</p>
      )}
    </Card>
  )
}
