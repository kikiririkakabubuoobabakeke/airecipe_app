import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Topbar } from '../components/Topbar'
import { submitContactMessage } from '../lib/contactApi'
import { useI18n } from '../lib/useI18n'
import type { AppDestination } from '../types/ui'

type ContactPageProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

export function ContactPage({ onNavigate, onLogout }: ContactPageProps) {
  const { t } = useI18n()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setStatusMessage('')
    setErrorMessage('')

    if (!subject.trim()) {
      setErrorMessage(t('contact.subjectRequired'))
      return
    }

    if (!message.trim()) {
      setErrorMessage(t('contact.messageRequired'))
      return
    }

    setIsSubmitting(true)

    try {
      await submitContactMessage({
        subject,
        message,
        pageUrl: window.location.href,
      })
      setSubject('')
      setMessage('')
      setStatusMessage(t('contact.success'))
    } catch (error) {
      console.error('[vite] Contact submit failed:', error)
      setErrorMessage(
        error instanceof Error ? error.message : t('contact.failed'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="settings-page contact-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('contact.eyebrow')}</p>
            <h1>{t('contact.title')}</h1>
            <p className="settings-lead">{t('contact.subtitle')}</p>
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

        <form className="panel settings-section contact-form" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('contact.formEyebrow')}</p>
              <h2>{t('contact.formTitle')}</h2>
            </div>
          </div>

          {statusMessage ? (
            <p className="status-message success-message" role="status">
              {statusMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="status-message error-message" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <label className="settings-field">
            <span>{t('contact.subject')}</span>
            <input
              type="text"
              value={subject}
              maxLength={120}
              placeholder={t('contact.subjectPlaceholder')}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>{t('contact.message')}</span>
            <textarea
              rows={8}
              value={message}
              maxLength={4000}
              placeholder={t('contact.messagePlaceholder')}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <div className="contact-form__actions">
            <button
              type="submit"
              className="primary-button settings-save-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('contact.sending') : t('contact.submit')}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
