import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

let currentUserId = null
supabase.auth.onAuthStateChange((_event, session) => {
  currentUserId = session?.user?.id ?? null
})

export function getUserId() {
  return currentUserId
}
