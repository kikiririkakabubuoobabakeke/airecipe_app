import { memo } from 'react'
import { useI18n } from '../lib/useI18n'

type SummaryItem = {
  label: string
  value: string
  note: string
  isLoading?: boolean
}

export const SummaryGrid = memo(function SummaryGrid({
  items,
}: {
  items: SummaryItem[]
}) {
  const { t } = useI18n()

  return (
    <section className="summary-grid" aria-label={t('home.summary.aria')}>
      {items.map((item) => (
        <article key={item.label} aria-busy={item.isLoading || undefined}>
          <span>{item.label}</span>
          <strong>{item.isLoading ? '...' : item.value}</strong>
          <small>{item.isLoading ? t('common.loading') : item.note}</small>
        </article>
      ))}
    </section>
  )
})
