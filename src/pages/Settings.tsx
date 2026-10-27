import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getCurrentUserId, supabase } from '@/lib/supabase'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [editedProfile, setEditedProfile] = useState<{ id: string; fullName: string; companyName: string } | null>(null)

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['/profile'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const [{ data, error }, { data: userData, error: userError }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, company_name').eq('id', userId).maybeSingle(),
        supabase.auth.getSession(),
      ])
      if (error) throw error
      if (userError) throw userError
      return { profile: data, email: userData.session?.user?.email || '' }
    },
  })

  const fullName = editedProfile && profile?.profile && editedProfile.id === profile.profile.id
    ? editedProfile.fullName
    : profile?.profile?.full_name || ''
  const companyName = editedProfile && profile?.profile && editedProfile.id === profile.profile.id
    ? editedProfile.companyName
    : profile?.profile?.company_name || ''

  const saveMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), company_name: companyName.trim() })
        .eq('id', userId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Your profile could not be found. Sign out and back in, or ask an administrator to restore your profile.')
    },
    onSuccess: () => {
      toast.success('Profile settings saved')
      queryClient.invalidateQueries({ queryKey: ['/profile'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save settings'),
  })

  if (isLoading) {
    return <Card className="p-6"><div className="h-32 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load settings: {error.message}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account details and review available integrations.</p>
      </div>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Account profile</h2>
          <p className="mt-1 text-sm text-slate-500">These details are saved to your account profile.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700">Full name</label>
            <input id="profile-name" value={fullName} onChange={(event) => setEditedProfile({ id: profile?.profile?.id || '', fullName: event.target.value, companyName })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
          </div>
          <div className="space-y-1">
            <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700">Account email</label>
            <input id="profile-email" value={profile?.email || ''} disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="profile-company" className="block text-sm font-medium text-slate-700">Company name</label>
            <input id="profile-company" value={companyName} onChange={(event) => setEditedProfile({ id: profile?.profile?.id || '', fullName, companyName: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
          </div>
        </div>
        {!profile?.profile && (
          <p className="text-sm text-amber-700">A profile record has not been created for this account, so account details cannot be saved yet.</p>
        )}
        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !profile?.profile}>
            {saveMutation.isPending ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-2 p-6">
        <h2 className="text-lg font-semibold text-slate-800">Email integrations</h2>
        <p className="text-sm text-slate-600">No email provider is connected. Gmail, Outlook, and other external connections are not implemented yet, so drafts stay in this app and are not sent.</p>
        <p className="text-sm text-slate-500">Connect a provider only after its authentication and secure server-side send workflow have been configured.</p>
      </Card>
    </div>
  )
}
