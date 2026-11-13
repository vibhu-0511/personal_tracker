import { supabase } from '../supabaseClient.js'
import { apiUrl as joinUrl, createApiFetch } from './base.js'

const BASE = import.meta.env.VITE_API_BASE || ''

export const apiUrl = (path) => joinUrl(path, BASE)

async function getToken() {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || null
  } catch {
    return null
  }
}

export const apiFetch = createApiFetch({ base: BASE, getToken })
