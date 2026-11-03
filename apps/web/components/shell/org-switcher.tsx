'use client'

import { Check, ChevronDown, LogOut, Moon, Plus, Settings, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@movara/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'

export type OrgSwitcherProps = {
  orgSlug: string
  wordmark: string
  logoLight?: string
  logoDark?: string
  orgs: { slug: string; name: string }[]
  user: { name: string; email: string }
  initialTheme: 'light' | 'dark'
}

/** The org wordmark (or logo) with the switcher menu: orgs, settings, theme, sign out. */
export function OrgSwitcher({ orgSlug, wordmark, logoLight, logoDark, orgs, user, initialTheme }: OrgSwitcherProps) {
  const router = useRouter()
  const [theme, setTheme] = useState(initialTheme)

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    document.cookie = `movara-theme=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left outline-none hover:bg-nav-active focus-visible:bg-nav-active" aria-label={`${wordmark}, organization menu`}>
        {logoLight ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoLight} alt={wordmark} className={`logo-light h-4 max-w-[120px] object-contain ${logoDark ? 'has-dark' : ''}`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoDark && <img src={logoDark} alt={wordmark} className="logo-dark h-4 max-w-[120px] object-contain" />}
          </>
        ) : (
          <span className="truncate text-[14px] font-[650] tracking-[-0.015em] text-ink">{wordmark}</span>
        )}
        <ChevronDown size={12} strokeWidth={1.8} className="shrink-0 text-icon" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.slug} onSelect={() => router.push(`/${o.slug}`)} icon={o.slug === orgSlug ? <Check /> : <span className="size-[15px]" />}>
            {o.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => router.push('/onboarding')} icon={<Plus />}>
          New organization
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`/${orgSlug}/settings/general`)} icon={<Settings />}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            toggleTheme()
          }}
          icon={theme === 'dark' ? <Sun /> : <Moon />}
        >
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut()
            router.replace('/sign-in')
            router.refresh()
          }}
          icon={<LogOut />}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
