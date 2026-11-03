import type { Terms } from '@movara/core'

const humanize = (name: string) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const lc = (s: string) => s.toLowerCase()

const pickText = (input: any): string | null => {
  const v = input?.title ?? input?.text ?? input?.name ?? input?.description
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 90) : null
}

/** One line for the confirm card: what this write would do, in the org's words. */
export function describeAction(name: string, input: any, terms: Terms): string {
  const t = (k: Parameters<Terms['t']>[0]) => lc(terms.t(k))
  const detail = pickText(input)
  const withDetail = (head: string) => (detail ? `${head}: ${detail}` : head)
  switch (name) {
    case 'todo_create': return withDetail(`Create ${t('todo')}`)
    case 'todo_complete': return `Complete a ${t('todo')}`
    case 'issue_create': return withDetail(`Create ${t('issue')}`)
    case 'issue_solve': return `Mark ${t('issue')} solved`
    case 'issue_reopen': return `Reopen ${t('issue')}`
    case 'issue_move': return `Move ${t('issue')}`
    case 'priority_create': return withDetail(`Create ${t('priority')}`)
    case 'priority_set_status': return `Set ${t('priority')} status to ${terms.status(String(input?.status ?? ''))}`
    case 'milestone_add': return withDetail(`Add ${t('milestone')}`)
    case 'milestone_toggle': return `Update a ${t('milestone')}`
    case 'metric_create': return withDetail(`Create ${t('metric')}`)
    case 'metric_record_values': return `Record ${Array.isArray(input?.values) ? input.values.length : ''} ${t('metric')} value${Array.isArray(input?.values) && input.values.length === 1 ? '' : 's'}`.replace(/\s+/g, ' ')
    case 'headline_post': return withDetail(`Post ${t('headline')}`)
    case 'headline_cascade': return `Cascade ${t('headline')}`
    case 'vision_propose_change': return withDetail(`Propose ${t('vision_plan')} change${input?.section ? ` (${String(input.section)})` : ''}`)
    case 'chart_propose_change': return `Propose ${t('accountability_chart')} change`
    case 'meeting_start': return `Start the ${t('weekly_meeting')}`
    case 'meeting_next_section': return 'Move to the next section'
    case 'meeting_capture_notes': return 'Save meeting notes'
    default: return withDetail(humanize(name))
  }
}

const READ_TERMS: Record<string, Parameters<Terms['t']>[0]> = { priorities_list: 'priority', issues_list: 'issue', todos_list: 'todo', meetings_list: 'weekly_meeting' }

/** The chip shown after a read tool ran ("Looked at 8 priorities"). */
export function describeRead(name: string, input: any, result: any, terms: Terms): string {
  const term = READ_TERMS[name]
  if (term) {
    const n = Array.isArray(result?.items) ? result.items.length : null
    if (n !== null) return `Looked at ${n} ${lc(terms.t(term, n === 1 ? 'singular' : 'plural'))}`
  }
  switch (name) {
    case 'my_week': return 'Checked your week'
    case 'org_overview': return 'Checked the workspace'
    case 'scorecard_get': return `Looked at the ${lc(terms.t('scorecard'))}`
    case 'priority_get': return `Opened a ${lc(terms.t('priority'))}`
    case 'issue_get': return `Opened an ${lc(terms.t('issue'))}`
    case 'meeting_get': return `Looked at the ${lc(terms.t('weekly_meeting'))}`
    case 'meeting_prepare': return `Prepared the ${lc(terms.t('weekly_meeting'))} pre-read`
    case 'vision_get': return `Read the ${lc(terms.t('vision_plan'))}`
    case 'chart_get': return `Read the ${lc(terms.t('accountability_chart'))}`
    case 'search': return `Searched for "${String(input?.query ?? '').slice(0, 40)}"`
    case 'capture_pending_list': return 'Checked captured notes waiting for review'
    default: return `Used ${lc(humanize(name))}`
  }
}
