import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Terms } from '@motion/core'

const msg = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] })

export function registerPrompts(server: McpServer, terms: Terms) {
  const P = terms.t('priority'), Ps = terms.t('priority', 'plural'), M = terms.t('metric'), Ms = terms.t('metric', 'plural')
  const I = terms.t('issue'), Is = terms.t('issue', 'plural'), T = terms.t('todo'), Ts = terms.t('todo', 'plural')
  const WM = terms.t('weekly_meeting'), SC = terms.t('scorecard'), V = terms.t('vision_plan')

  server.registerPrompt('weekly-meeting-prep', {
    description: `Prepare the team's ${WM}: off-track ${Ms} and ${Ps}, ${Is} to prioritize, overdue ${Ts}.`,
    argsSchema: { teamId: z.string().optional().describe('Team id (default: leadership team from org_overview)') },
  }, ({ teamId }) => msg(`Prepare the next ${WM}${teamId ? ` for team ${teamId}` : ''}.
1. Call org_overview to learn the teams and vocabulary${teamId ? '' : ' and pick the leadership team'}.
2. Call meetings_list (status upcoming) and then meeting_prepare for the next meeting.
3. Summarize in this order: off-track ${Ms} (value vs goal), off-track ${Ps}, headlines to review, overdue ${Ts} by owner, then the open ${Is} ranked.
4. Recommend the top 3 ${Is} to discuss and why. Do not change anything; offer to post ${Ts} or ${Is} afterwards.
Use the words "${P}", "${M}", "${I}", "${T}" with the user.`))

  server.registerPrompt('issue-triage', {
    description: `Triage open ${Is}: dedupe, rank, assign owners, move long-term ones.`,
    argsSchema: { teamId: z.string().optional() },
  }, ({ teamId }) => msg(`Triage the open ${Is}${teamId ? ` of team ${teamId}` : ''}.
1. issues_list (status open) for the short-term list, then horizon long.
2. Find duplicates and vague titles; propose a rewrite for each. State the underlying problem, not the solution.
3. Propose a ranking (most impactful first), and which ones are long-term (use issue_move with horizon long).
4. Apply only what the user confirms: issue_move to move, issue_solve for resolved ones. Never drop an ${I} without asking.`))

  server.registerPrompt('quarterly-planning', {
    description: `Plan the quarter's ${Ps} from the ${V} and last quarter's results.`,
    argsSchema: { quarter: z.string().optional().describe('YYYY-Qn, default next quarter') },
  }, ({ quarter }) => msg(`Help plan ${quarter ?? 'the next quarter'}.
1. vision_get for the one-year plan and quarterly section; priorities_list for the previous quarter (what was done / not_done and why).
2. scorecard_get to see which ${Ms} drive the goals.
3. Draft 3-7 company ${Ps}, each with an owner, a due date and 3-5 ${terms.t('milestone', 'plural')}. Use the write-a-good-priority prompt for the shape.
4. Show the draft and ask for confirmation, then create them with priority_create (one call each, with a requestId). Propose ${V} updates only through vision_propose_change (needs approval).`))

  server.registerPrompt('write-a-good-priority', {
    description: `How to phrase a ${P}: specific, owned, measurable, 90 days.`,
    argsSchema: { idea: z.string().optional().describe('Rough idea to turn into a priority') },
  }, ({ idea }) => msg(`Turn ${idea ? `this idea: "${idea}"` : 'the idea the user gives you'} into a good ${P}.
A good ${P} is: one owner (a person, not a team); finishable within 90 days; specific and verifiable ("Launch the referral program to 20 customers", not "Improve marketing"); starts with a verb; has 3-5 ${terms.t('milestone', 'plural')} that are each checkable and dated; and says what "done" means.
Output title, one-sentence description (the definition of done), owner, due date and ${terms.t('milestone', 'plural')}. Ask for anything missing before calling priority_create.`))

  server.registerPrompt('metric-from-hubspot', {
    description: `Example integration: pull a number from HubSpot and record it as a ${M} value.`,
    argsSchema: { metricTitle: z.string().optional(), hubspotQuery: z.string().optional().describe('What to count in HubSpot, e.g. "new qualified leads this week"') },
  }, ({ metricTitle, hubspotQuery }) => msg(`Record a ${M} value from HubSpot.
1. Use the HubSpot tools (another MCP server) to compute: ${hubspotQuery ?? 'the number the user describes'} for the last full week.
2. scorecard_get to find the ${M} "${metricTitle ?? '<title>'}" and its goal; create it with metric_create if missing.
3. Call metric_record_values with [{ metricTitle, periodStart: <Monday of that week, ISO date>, value, note: "From HubSpot, <query>" }] and a stable requestId like "hubspot-<metric>-<periodStart>" so reruns do not duplicate.
4. Report the value against the goal using the ${SC} status.`))
}
