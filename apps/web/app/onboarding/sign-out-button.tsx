'use client'

import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="font-[550] text-accent-text hover:underline"
      onClick={async () => {
        await authClient.signOut()
        router.replace('/sign-in')
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
