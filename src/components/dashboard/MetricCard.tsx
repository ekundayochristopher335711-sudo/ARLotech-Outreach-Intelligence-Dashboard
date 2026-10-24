import { Card } from '@/components/ui/Card'
import { type ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  change?: string
  icon: ReactNode
  loading?: boolean
}

export function MetricCard({ label, value, change, icon, loading }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-arlotech/10 text-arlotech">
          {icon}
        </div>
        {change && (
          <span className="text-xs font-medium text-green-600">{change}</span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-slate-800">
          {loading ? (
            <span className="skeleton w-12" />
          ) : (
            value
          )}
        </p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  )
}
