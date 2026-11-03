'use client'

import { MessageSquare } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { useCoach } from '@/components/coach/coach-provider'

/** Opens Coach in vision-interview mode: it asks section by section and proposes edits for approval. */
export function BuildWithCoach({ primary }: { primary?: boolean }) {
  const { coachName, openCoach } = useCoach()
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      data-testid="build-with-coach"
      onClick={() =>
        openCoach({
          mode: 'vision',
          fresh: true,
          prompt: "Let's build or improve our vision plan together. Start by reading what we have so far, then interview me one section at a time.",
        })
      }
    >
      <MessageSquare size={14} strokeWidth={1.7} /> Build with {coachName}
    </Button>
  )
}
