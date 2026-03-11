import clsx from 'clsx'
import type { PropsWithChildren, ReactNode } from 'react'

interface SectionCardProps extends PropsWithChildren {
  className?: string
  description: string
  eyebrow: string
  title: ReactNode
}

export const SectionCard = ({
  className,
  children,
  description,
  eyebrow,
  title,
}: SectionCardProps) => (
  <section
    className={clsx(
      'rounded-[30px] border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.16)] backdrop-blur transition',
      className,
    )}
  >
    <p className="mb-2 text-xs uppercase tracking-[0.32em] text-cyan-200/70">
      {eyebrow}
    </p>
    <h2 className="text-xl font-semibold text-[color:var(--text-strong)]">
      {title}
    </h2>
    <p className="mt-2 max-w-2xl text-sm text-[color:var(--text-soft)]">
      {description}
    </p>
    <div className="mt-6">{children}</div>
  </section>
)
