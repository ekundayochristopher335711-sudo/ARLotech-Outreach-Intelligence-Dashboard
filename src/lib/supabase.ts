import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getCurrentUserId() {
	const { data, error } = await supabase.auth.getSession()
	if (error) throw error
	if (!data.session?.user?.id) throw new Error('You must be signed in to access this data')
	return data.session.user.id
}
