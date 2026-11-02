import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@motion/ui/card'

/** A titled Home card with an optional count and "view all" link. */
export function Section({ title, meta, href, linkLabel = 'View all', children, flush }: { title: ReactNode; meta?: ReactNode; href?: string; linkLabel?: string; children: ReactNode; flush?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2">
          {title}
          {meta != null && <span className="text-sm font-[500] text-faint">{meta}</span>}
        </CardTitle>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 rounded text-sm font-[500] text-body outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50">
            {linkLabel} <ArrowRight size={13} strokeWidth={1.8} />
          </Link>
        )}
      </CardHeader>
      <CardBody className={flush ? 'p-2' : 'px-4 py-1'}>{children}</CardBody>
    </Card>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="px-2 py-5 text-center text-sm text-faint">{children}</p>
}
