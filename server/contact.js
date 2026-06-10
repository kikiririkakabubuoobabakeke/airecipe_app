import {
  isSupabaseServiceRoleConfigured,
  supabase,
} from './supabase.js'

function requireSupabaseAdmin() {
  if (!supabase || !isSupabaseServiceRoleConfigured) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for contact operations')
  }

  return supabase
}

function normalizeText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export async function submitContactMessageForUser(user, input) {
  const client = requireSupabaseAdmin()
  const subject = normalizeText(input?.subject, 120)
  const message = normalizeText(input?.message, 4000)

  if (!subject) {
    throw new Error('subject is required')
  }

  if (!message) {
    throw new Error('message is required')
  }

  const { data, error } = await client
    .from('contact_messages')
    .insert({
      user_id: user.id,
      user_email: user.email ?? null,
      subject,
      message,
      page_url: normalizeText(input?.pageUrl, 1000) || null,
      user_agent: normalizeText(input?.userAgent, 500) || null,
      status: 'open',
    })
    .select(
      'contact_id, user_id, user_email, subject, message, page_url, user_agent, status, created_at',
    )
    .single()

  if (error) {
    throw new Error(`Failed to save contact message: ${error.message}`)
  }

  return normalizeContactMessage(data)
}

export async function getContactMessagesForAdmin(user) {
  if (!user?.isAdmin) {
    throw new Error('Admin permission is required')
  }

  const client = requireSupabaseAdmin()
  const { data, error } = await client
    .from('contact_messages')
    .select(
      'contact_id, user_id, user_email, subject, message, page_url, user_agent, status, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`Failed to fetch contact messages: ${error.message}`)
  }

  return (data ?? []).map(normalizeContactMessage)
}

function normalizeContactMessage(message) {
  return {
    contactId: message.contact_id,
    userId: message.user_id,
    userEmail: message.user_email,
    subject: message.subject,
    message: message.message,
    pageUrl: message.page_url,
    userAgent: message.user_agent,
    status: message.status,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
  }
}
