'use client'

import * as React from 'react'
import { Toaster as Sonner, toast } from 'sonner'

export type ToasterProps = React.ComponentProps<typeof Sonner>

/** Mount once near the root. Themed with tokens; follows [data-theme] via CSS variables. Fire with `toast('Saved')`. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !bg-raised !text-ink !shadow-pop !border-0 !text-sm !font-[500]',
          description: '!text-body',
          actionButton: '!bg-accent !text-white',
          cancelButton: '!bg-canvas !text-body',
        },
      }}
      {...props}
    />
  )
}

export { toast }
