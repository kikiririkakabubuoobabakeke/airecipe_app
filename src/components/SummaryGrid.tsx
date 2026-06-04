import { useI18n } from '../lib/useI18n'

type SummaryItem = {
  label: string
  value: string
  note: string
}

export function SummaryGrid({ items }: { items: SummaryItem[] }) {
  const { t } = useI18n()

  return (
    <section className="summary-grid" aria-label={t('home.summary.aria')}>
      {items.map((item) => (
        <article key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.note}</small>
        </article>
      ))}
    </section>
  )
}
