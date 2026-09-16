import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Realtime is optional: missing local/build configuration retains API polling.
const configured = Boolean(url && key?.startsWith('sb_publishable_')
  && !url.includes('YOUR_PROJECT') && !key.includes('REPLACE_ME'))

function createOptionalClient() {
  if (!configured) return null
  try {
    return createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  } catch {
    return null
  }
}

export const supabase = createOptionalClient()
