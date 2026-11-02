import type { MeetingStats } from './types'

export type RecapHtmlInput = {
  orgName: string
  /** Org branding wordmark (falls back to the org name) and accent color (#rrggbb). */
  wordmark?: string | null
  accent?: string | null
  seriesName: string
  /** Display date of the meeting, e.g. "2026-11-02". */
  date: string
  stats: MeetingStats
  solved: string[]
  newTodos: { title: string; owner: string; dueDate: string | null }[]
  /** Org terminology (already resolved): plural/singular labels. */
  labels: { issues: string; todos: string; newTodos: string; solved: string; rating: string; duration: string; attendance: string }
  /** Link to the meeting in the app, if known. */
  url?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeColor = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#3b5bdb')

/** A plain, table-based HTML recap email: org wordmark in the accent color, the key numbers, solved items and new to-dos. */
export function renderRecapHtml(i: RecapHtmlInput): string {
  const accent = safeColor(i.accent)
  const stat = (label: string, value: string) =>
    `<td style="padding:0 20px 0 0;vertical-align:top"><div style="font-size:12px;color:#667085">${esc(label)}</div><div style="font-size:18px;font-weight:600;color:#101828">${esc(value)}</div></td>`
  const list = (items: string[]) =>
    `<ul style="margin:6px 0 0;padding-left:18px;color:#344054;font-size:14px;line-height:1.6">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`
  const s = i.stats
  const stats = [
    stat(i.labels.duration, `${s.durationMinutes} min`),
    stat(i.labels.rating, s.ratingAvg == null ? 'n/a' : `${s.ratingAvg} (${s.ratingCount})`),
    stat(`${i.labels.issues} ${i.labels.solved.toLowerCase()}`, `${s.issuesSolved}/${s.issuesTotal}`),
    stat(`${i.labels.todos} done`, `${s.todosDone}/${s.todosTotal}`),
    stat(i.labels.attendance, `${s.attendeeCount}/${s.invitedCount}`),
  ].join('')
  const section = (title: string, body: string) => `<div style="margin-top:22px"><div style="font-size:13px;font-weight:600;color:#101828">${esc(title)}</div>${body}</div>`
  return `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;border-top:4px solid ${accent}">
<tr><td style="padding:24px 28px">
<div style="font-size:14px;font-weight:700;letter-spacing:-0.01em;color:${accent}">${esc(i.wordmark || i.orgName)}</div>
<h1 style="margin:14px 0 2px;font-size:20px;line-height:1.3;color:#101828">${esc(i.seriesName)} recap</h1>
<div style="font-size:13px;color:#667085">${esc(i.date)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>${stats}</tr></table>
${i.solved.length ? section(`${i.labels.solved} ${i.labels.issues.toLowerCase()}`, list(i.solved.map(esc))) : ''}
${i.newTodos.length ? section(i.labels.newTodos, list(i.newTodos.map((t) => `${esc(t.title)} <span style="color:#667085">(${esc(t.owner)}${t.dueDate ? `, due ${esc(t.dueDate)}` : ''})</span>`))) : ''}
${i.url ? `<div style="margin-top:24px"><a href="${esc(i.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px">Open in ${esc(i.wordmark || i.orgName)}</a></div>` : ''}
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #eaecf0;font-size:12px;color:#98a2b3">Sent by ${esc(i.orgName)}. Change recap settings in the meeting.</td></tr>
</table></td></tr></table></body></html>`
}
