'use client'

import { Button } from '@motion/ui/button'
import { revokeKey } from '@/app/(app)/[org]/settings/actions'
import { useSave } from './use-save'

export function RevokeKeyButton({ slug, keyId }: { slug: string; keyId: string }) {
  const { save, pending } = useSave()
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => save(() => revokeKey(slug, keyId), 'Key revoked')}>Revoke</Button>
}
