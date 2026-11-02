'use client'

import { BarChart3 } from 'lucide-react'
import { Button } from '@motion/ui/button'
import { EmptyState } from '@motion/ui/empty-state'
import { useAct, type TeamLite } from '../issues/common'
import { createScorecardAction } from '@/app/(app)/[org]/scorecard/actions'

export function ScorecardEmpty({ orgSlug, teams, defaultTeamId, label }: { orgSlug: string; teams: TeamLite[]; defaultTeamId: string; label: string }) {
  const { act, pending } = useAct()
  const team = teams.find((t) => t.id === defaultTeamId)
  return (
    <EmptyState
      icon={<BarChart3 />}
      title={`No ${label.toLowerCase()} yet`}
      description="Track a handful of weekly numbers per team. Agents can report values straight from your tools."
      action={team ? <Button variant="primary" loading={pending} onClick={() => act(() => createScorecardAction(orgSlug, team.id), { success: `${label} created` })}>Create {label.toLowerCase()} for {team.name}</Button> : undefined}
    />
  )
}
