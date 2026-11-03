import { notFound } from 'next/navigation'

/** Unknown URLs under /{org} render the in-shell 404 (see ../not-found.tsx). */
export default function CatchAll() {
  notFound()
}
