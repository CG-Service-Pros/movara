import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Movara', template: '%s · Movara' },
  description: 'An agent-first operating system for running a company on a quarterly rhythm.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('movara-theme')?.value === 'dark' ? 'dark' : 'light'
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-base text-body antialiased">{children}</body>
    </html>
  )
}
