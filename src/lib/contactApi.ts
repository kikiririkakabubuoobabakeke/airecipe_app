import { getJson, postJson } from './apiClient'

export type ContactMessage = {
  contactId: string
  userId: string | null
  userEmail: string | null
  subject: string
  message: string
  pageUrl: string | null
  userAgent: string | null
  status: string
  createdAt: string
  updatedAt?: string | null
}

export type UserMessage = {
  messageId: string
  contactId: string | null
  userId: string
  userEmail: string | null
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export async function submitContactMessage(input: {
  subject: string
  message: string
  pageUrl?: string | null
}) {
  return postJson<{
    contactMessage: ContactMessage
  }>('/api/contact', input)
}

export async function fetchAdminContactMessages() {
  return getJson<{
    contactMessages: ContactMessage[]
  }>('/api/admin/contact-messages')
}

export async function sendAdminContactReply(input: {
  contactId?: string
  contactIds?: string[]
  target?: 'contacts' | 'allUsers'
  title?: string
  body: string
}) {
  return postJson<{
    userMessages: UserMessage[]
  }>('/api/admin/contact-messages/reply', input)
}

export async function fetchUserMessages() {
  return getJson<{
    messages: UserMessage[]
  }>('/api/messages')
}

export async function markUserMessagesRead(messageIds?: string[]) {
  return postJson<{
    messages: UserMessage[]
  }>('/api/messages/read', { messageIds })
}
