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

export async function sendContactReplyForAdmin(user, input) {
  if (!user?.isAdmin) {
    throw new Error('Admin permission is required')
  }

  const client = requireSupabaseAdmin()
  const contactIds = Array.from(
    new Set(
      [
        normalizeText(input?.contactId, 80),
        ...(Array.isArray(input?.contactIds)
          ? input.contactIds.map((id) => normalizeText(id, 80))
          : []),
      ].filter(Boolean),
    ),
  )
  const body = normalizeText(input?.body, 4000)
  const title = normalizeText(input?.title, 160) || 'お問い合わせへの返信'
  const sendToAllUsers = input?.target === 'allUsers'

  if (!sendToAllUsers && contactIds.length === 0) {
    throw new Error('contactId is required')
  }

  if (!body) {
    throw new Error('body is required')
  }

  if (sendToAllUsers) {
    const { data: users, error: usersError } = await client
      .from('users')
      .select('user_id, user_mail')
      .not('user_id', 'is', null)

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    const rows = (users ?? []).map((targetUser) => ({
      contact_id: null,
      user_id: targetUser.user_id,
      user_email: targetUser.user_mail ?? null,
      title,
      body,
      sender_user_id: user.id,
    }))

    if (!rows.length) {
      throw new Error('target users are missing')
    }

    const { data, error } = await client
      .from('user_messages')
      .insert(rows)
      .select(
        'message_id, contact_id, user_id, user_email, title, body, read_at, created_at',
      )

    if (error) {
      throw new Error(`Failed to send user messages: ${error.message}`)
    }

    return (data ?? []).map(normalizeUserMessage)
  }

  const { data: contactMessages, error: contactError } = await client
    .from('contact_messages')
    .select('contact_id, user_id, user_email, subject')
    .in('contact_id', contactIds)

  if (contactError) {
    throw new Error(`Failed to fetch contact messages: ${contactError.message}`)
  }

  const validMessages = (contactMessages ?? []).filter((message) =>
    Boolean(message.user_id),
  )

  if (!validMessages.length) {
    throw new Error('contact message user is missing')
  }

  const { data, error } = await client
    .from('user_messages')
    .insert(validMessages.map((contactMessage) => ({
      contact_id: String(contactMessage.contact_id),
      user_id: contactMessage.user_id,
      user_email: contactMessage.user_email ?? null,
      title,
      body,
      sender_user_id: user.id,
    })))
    .select(
      'message_id, contact_id, user_id, user_email, title, body, read_at, created_at',
    )

  if (error) {
    throw new Error(`Failed to send user messages: ${error.message}`)
  }

  await client
    .from('contact_messages')
    .update({
      status: 'replied',
      updated_at: new Date().toISOString(),
    })
    .in('contact_id', validMessages.map((message) => message.contact_id))

  return (data ?? []).map(normalizeUserMessage)
}

export async function getMessagesForUser(userId) {
  const client = requireSupabaseAdmin()
  const { data, error } = await client
    .from('user_messages')
    .select(
      'message_id, contact_id, user_id, user_email, title, body, read_at, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`Failed to fetch user messages: ${error.message}`)
  }

  return (data ?? []).map(normalizeUserMessage)
}

export async function markMessagesReadForUser(userId, messageIds = null) {
  const client = requireSupabaseAdmin()
  let query = client
    .from('user_messages')
    .update({
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .is('read_at', null)

  if (Array.isArray(messageIds) && messageIds.length > 0) {
    query = query.in('message_id', messageIds)
  }

  const { error } = await query

  if (error) {
    throw new Error(`Failed to mark user messages read: ${error.message}`)
  }

  return getMessagesForUser(userId)
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

function normalizeUserMessage(message) {
  return {
    messageId: message.message_id,
    contactId: message.contact_id,
    userId: message.user_id,
    userEmail: message.user_email,
    title: message.title,
    body: message.body,
    readAt: message.read_at,
    createdAt: message.created_at,
  }
}
