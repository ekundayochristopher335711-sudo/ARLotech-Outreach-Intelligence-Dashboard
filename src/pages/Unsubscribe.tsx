import { unsubscribeSubmissionUrl } from '@/lib/unsubscribe'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export function UnsubscribePage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const isValidToken = token.length > 0 && token.length <= 4096
  const actionUrl = supabaseUrl ? unsubscribeSubmissionUrl(token, supabaseUrl) : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Arlotech Digital Solutions</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Unsubscribe from outreach emails</h1>
        {isValidToken && actionUrl ? (
          <>
            <p className="mt-3 text-slate-600">
              Confirm below to stop receiving future outreach emails at this address.
            </p>
            <form
              className="mt-6"
              method="post"
              action={actionUrl}
            >
              <input type="hidden" name="confirm" value="unsubscribe" />
              <button
                className="rounded-md bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                type="submit"
              >
                Confirm unsubscribe
              </button>
            </form>
          </>
        ) : (
          <p className="mt-3 text-slate-600">
            {!isValidToken
              ? 'This unsubscribe link is missing or invalid. Please use the link from the email.'
              : 'Unsubscribe is temporarily unavailable. Please try again later.'}
          </p>
        )}
      </section>
    </main>
  )
}
