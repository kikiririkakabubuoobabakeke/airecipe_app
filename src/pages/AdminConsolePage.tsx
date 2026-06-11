import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import {
  fetchAdminContactMessages,
  sendAdminContactReply,
  type ContactMessage,
} from '../lib/contactApi'
import { useI18n } from '../lib/useI18n'
import type { AuthUser } from '../lib/authApi'
import type { AppDestination } from '../types/ui'

type AdminConsolePageProps = {
  user: AuthUser
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

type ReplyTarget =
  | { type: 'single'; contactIds: string[]; subject: string }
  | { type: 'selected'; contactIds: string[]; subject: string }
  | { type: 'allUsers'; contactIds: []; subject: string }

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function AdminConsolePage({
  user,
  onNavigate,
}: AdminConsolePageProps) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [isLoading, setIsLoading] = useState(user.isAdmin)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [replyTitle, setReplyTitle] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replyFeedback, setReplyFeedback] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  useEffect(() => {
    if (!user.isAdmin) {
      return
    }

    let isMounted = true

    fetchAdminContactMessages()
      .then((result) => {
        if (isMounted) {
          setMessages(result.contactMessages)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        console.error('[vite] Admin contact fetch failed:', error)
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : t('admin.fetchFailed'),
          )
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [t, user.isAdmin])

  function openReplyModal(target: ReplyTarget) {
    const title =
      target.type === 'allUsers'
        ? t('admin.allUsersReplyTitle')
        : target.type === 'selected'
          ? ''
          : t('message.replyTitle', { subject: target.subject })

    setReplyTarget(target)
    setReplyTitle(title)
    setReplyBody('')
    setReplyFeedback('')
  }

  function closeReplyModal() {
    if (isSendingReply) {
      return
    }

    setReplyTarget(null)
    setReplyFeedback('')
  }

  function toggleSelectedContact(contactId: string, selected: boolean) {
    setSelectedContactIds((current) => {
      const next = new Set(current)

      if (selected) {
        next.add(contactId)
      } else {
        next.delete(contactId)
      }

      if (!selected && next.size === 0) {
        setIsSelectionMode(false)
      }

      return next
    })
  }

  function handleSelectAllContacts() {
    setSelectedContactIds(new Set(messages.map((message) => message.contactId)))
    setIsSelectionMode(true)
  }

  function handleExitSelection() {
    setSelectedContactIds(new Set())
    setIsSelectionMode(false)
  }

  async function handleReplySubmit(event: FormEvent) {
    event.preventDefault()

    if (!replyTarget) {
      return
    }

    const title = replyTitle.trim()
    const body = replyBody.trim()

    if (!body) {
      setReplyFeedback(t('admin.replyRequired'))
      return
    }

    setIsSendingReply(true)
    setReplyFeedback('')

    try {
      await sendAdminContactReply({
        contactIds: replyTarget.contactIds,
        target: replyTarget.type === 'allUsers' ? 'allUsers' : 'contacts',
        title,
        body,
      })
      if (replyTarget.type !== 'allUsers') {
        const repliedIds = new Set(replyTarget.contactIds)
        setMessages((current) =>
          current.map((item) =>
            repliedIds.has(item.contactId)
              ? { ...item, status: 'replied', updatedAt: new Date().toISOString() }
              : item,
          ),
        )
      }
      setSelectedContactIds(new Set())
      setIsSelectionMode(false)
      setReplyFeedback(t('admin.replySuccess'))
      setReplyTarget(null)
    } catch (error) {
      console.error('[vite] Admin contact reply failed:', error)
      setReplyFeedback(
        error instanceof Error ? error.message : t('admin.replyFailed'),
      )
    } finally {
      setIsSendingReply(false)
    }
  }

  return (
    <>
      <main className="settings-page admin-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('admin.eyebrow')}</p>
            <h1>{t('admin.title')}</h1>
            <p className="settings-lead">{t('admin.subtitle')}</p>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <Icon name="arrow" />
            </div>
            <span>{t('common.backHome')}</span>
          </button>
        </div>

        {!user.isAdmin ? (
          <section className="panel settings-section">
            <p className="status-message error-message" role="alert">
              {t('admin.forbidden')}
            </p>
          </section>
        ) : (
          <section className="panel settings-section admin-console">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('admin.contactEyebrow')}</p>
                <h2>{t('admin.contactTitle')}</h2>
              </div>
              <span className="status-pill">
                {t('admin.contactCount', { count: messages.length })}
              </span>
            </div>

            {isLoading ? (
              <p className="status-message" role="status">
                {t('admin.loading')}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="status-message error-message" role="alert">
                {errorMessage}
              </p>
            ) : null}

            {!isLoading && !errorMessage && messages.length === 0 ? (
              <p className="settings-note">{t('admin.empty')}</p>
            ) : null}

            <div className="fridge-bulk-actions admin-bulk-actions">
              {isSelectionMode ? (
                <>
                  <span>
                    {t('admin.selectedCount', {
                      count: selectedContactIds.size,
                    })}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={selectedContactIds.size === 0}
                    onClick={() =>
                      openReplyModal({
                        type: 'selected',
                        contactIds: Array.from(selectedContactIds),
                        subject: t('admin.selectedSubject'),
                      })
                    }
                  >
                    {t('admin.replySelected')}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleSelectAllContacts}
                    disabled={messages.length === 0}
                  >
                    {t('admin.selectAll')}
                  </button>
                  <button
                    type="button"
                    className="secondary-button fridge-selection-cancel"
                    onClick={handleExitSelection}
                  >
                    {t('fridge.selection.exit')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsSelectionMode(true)}
                  disabled={messages.length === 0}
                >
                  {t('fridge.selection.select')}
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  openReplyModal({
                    type: 'allUsers',
                    contactIds: [],
                    subject: t('admin.allUsersSubject'),
                  })
                }
              >
                {t('admin.replyAllUsers')}
              </button>
            </div>

            <div className="admin-message-list">
              {messages.map((message) => (
                <article
                  className="admin-message-card admin-message-card--clickable"
                  key={message.contactId}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    openReplyModal({
                      type: 'single',
                      contactIds: [message.contactId],
                      subject: message.subject,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openReplyModal({
                        type: 'single',
                        contactIds: [message.contactId],
                        subject: message.subject,
                      })
                    }
                  }}
                >
                  <div className="admin-message-card__header">
                    {isSelectionMode ? (
                      <input
                        type="checkbox"
                        aria-label={t('admin.selectMessage', {
                          subject: message.subject,
                        })}
                        checked={selectedContactIds.has(message.contactId)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          toggleSelectedContact(
                            message.contactId,
                            event.currentTarget.checked,
                          )
                        }
                      />
                    ) : null}
                    <div>
                      <h3>{message.subject}</h3>
                      <p>
                        {message.userEmail ?? t('admin.unknownUser')} /{' '}
                        {formatDateTime(message.createdAt)}
                      </p>
                    </div>
                    <span className="status-pill">{message.status}</span>
                  </div>
                  <p className="admin-message-card__body">{message.message}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {replyTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeReplyModal()
            }
          }}
        >
          <form
            className="cook-modal admin-reply-modal"
            aria-labelledby="admin-reply-title"
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleReplySubmit}
          >
            <p className="eyebrow">{t('admin.replyLabel')}</p>
            <h2 id="admin-reply-title">
              {replyTarget.type === 'allUsers'
                ? t('admin.replyAllUsers')
                : replyTarget.type === 'selected'
                  ? t('admin.replySelected')
                  : replyTarget.subject}
            </h2>
            <p className="settings-note">
              {replyTarget.type === 'allUsers'
                ? t('admin.replyAllUsersDescription')
                : t('admin.replyTargetCount', {
                    count: replyTarget.contactIds.length,
                  })}
            </p>

            <label className="settings-field">
              <span>{t('admin.replyTitleLabel')}</span>
              <input
                value={replyTitle}
                onChange={(event) => setReplyTitle(event.target.value)}
                disabled={isSendingReply}
              />
            </label>

            <label className="settings-field">
              <span>{t('admin.replyBodyLabel')}</span>
              <textarea
                rows={6}
                value={replyBody}
                placeholder={t('admin.replyPlaceholder')}
                disabled={isSendingReply}
                onChange={(event) => setReplyBody(event.target.value)}
              />
            </label>

            {replyFeedback ? (
              <p className="status-message" role="alert">
                {replyFeedback}
              </p>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeReplyModal}
                disabled={isSendingReply}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSendingReply}
              >
                {isSendingReply ? t('admin.replySending') : t('admin.replySubmit')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
