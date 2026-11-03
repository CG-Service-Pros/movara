import type { Bundle } from './types'

const nameOf = (b: Bundle, id: string | null) => b.people.find((p) => p.id === id)?.name ?? 'unassigned'
const list = (rows: string[], max = 12) => (rows.length ? rows.slice(0, max).join('; ') + (rows.length > max ? `; +${rows.length - max} more` : '') : 'none')

/** What Coach should know about the live meeting right now (sent as page state with every message). */
export function meetingNote(b: Bundle, sectionLabel: string, kind: string): string {
  const { live } = b
  const parts = [`Live meeting "${live.name}" for team ${b.teamName}, status ${live.status}. Current section ${live.sectionIndex + 1} of ${live.agenda.length}: ${sectionLabel}. Meeting id ${live.meetingId}.`]
  const issueTitle = (id: string) => b.issues.find((i) => i.id === id)?.title ?? id
  if (kind === 'scorecard' && b.scorecard) {
    const off = b.scorecard.metrics.filter((m) => m.status === 'off')
    parts.push(`Scorecard ${b.scorecard.period}: ${b.scorecard.onTrack} on track, ${b.scorecard.offTrack} off track, ${b.scorecard.missing} missing. Off track: ${list(off.map((m) => `${m.title} (${m.valueLabel ?? 'no value'}, goal ${m.goalLabel})`))}.`)
  } else if (kind === 'priorities') {
    parts.push(`Priorities: ${list(b.priorities.map((p) => `${p.title} [${p.status}, ${p.milestonesDone}/${p.milestonesTotal} milestones, owner ${nameOf(b, p.ownerId)}${p.id ? `, id ${p.id}` : ''}]`))}.`)
  } else if (kind === 'ids') {
    const cur = live.ids.currentIssueId
    parts.push(`Issue solving, step ${live.ids.step}. ${cur ? `Discussing: "${issueTitle(cur)}" (id ${cur})${b.issues.find((i) => i.id === cur)?.description ? `. Description: ${b.issues.find((i) => i.id === cur)!.description}` : ''}.` : 'No issue is being discussed yet.'}`)
    parts.push(`Focus queue: ${list(live.ids.focusIssueIds.map(issueTitle))}. Solved so far: ${live.ids.solvedIssueIds.length}. Open issues: ${list(b.issues.filter((i) => i.status === 'open').slice(0, 8).map((i) => `${i.title} (id ${i.id})`), 8)}.`)
  } else if (kind === 'wrapup') {
    const fresh = b.todos.filter((t) => live.newTodoIds.includes(t.id))
    parts.push(`New to-dos captured in this meeting: ${list(fresh.map((t) => `${t.title} (${nameOf(b, t.ownerId)}${t.dueDate ? `, due ${t.dueDate}` : ''})`))}. Issues solved: ${live.ids.solvedIssueIds.map(issueTitle).join('; ') || 'none'}. Discussed: ${live.ids.discussedIssueIds.length}.`)
  } else if (kind === 'prioritysetting' && b.priorityPlan) {
    parts.push(`Planning quarter ${b.priorityPlan.quarter}. Priorities so far: ${list(b.priorityPlan.items.map((p) => `${p.title} (${p.level}, owner ${nameOf(b, p.ownerId)})`))}.`)
  }
  return parts.join(' ').slice(0, 1900)
}

/** One-click prompts per section kind. `null` = no strip (e.g. the check-in). */
export function sectionCoach(b: Bundle, kind: string): { label: string; prompt: string; mode: 'meeting' | 'planning' } | null {
  const P = b.labels.priority?.p.toLowerCase() ?? 'priorities'
  const cur = b.live.ids.currentIssueId ? b.issues.find((i) => i.id === b.live.ids.currentIssueId) : undefined
  switch (kind) {
    case 'scorecard':
      return { label: "Summarize what's off track", prompt: "Summarize what's off track on our scorecard right now, in a few lines I can read aloud, and name the one or two that deserve discussion.", mode: 'meeting' }
    case 'priorities':
      return { label: `Which ${P} are at risk?`, prompt: `Which of our ${P} are at risk? Look at status and milestone progress, and say what to ask each owner.`, mode: 'meeting' }
    case 'ids':
      return {
        label: 'Help us IDS this issue',
        prompt: cur
          ? `Help us IDS the issue we're on: "${cur.title}". Frame the Identify, Discuss and Solve questions for it, and tell me what to ask first.`
          : 'Help us IDS. Look at our open issues, suggest which to take first, and frame the Identify, Discuss and Solve questions for the top one.',
        mode: 'meeting',
      }
    case 'wrapup':
      return { label: 'Draft the recap', prompt: 'Draft the recap for this meeting: what we decided, the to-dos with owners and due dates, and one line of cascading message for the rest of the company.', mode: 'meeting' }
    case 'prioritysetting':
      return { label: 'Suggest priorities from the vision and issues', prompt: `Suggest ${P} for this quarter from our vision plan and our open issues. For each give an owner suggestion, a clear definition of done and 2 to 4 milestones, and say which vision goal or issue it serves.`, mode: 'planning' }
    default:
      return null
  }
}
