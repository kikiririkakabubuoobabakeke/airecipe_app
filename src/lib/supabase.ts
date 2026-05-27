type SupabaseStatus = {
  ok: boolean
  configured: boolean
  message: string
}
//テストささ
export async function checkSupabaseConnection(): Promise<SupabaseStatus> {
  try {
    const response = await fetch('/api/supabase/status')

    if (!response.ok) {
      return {
        ok: false,
        configured: false,
        message: 'Supabase status API failed',
      }
    }

    return (await response.json()) as SupabaseStatus
  } catch {
    return {
      ok: false,
      configured: false,
      message: 'Supabase server is not reachable',
    }
  }
}

void checkSupabaseConnection().then((status) => {
  console.info(`[vite] ${status.message}`)
})
