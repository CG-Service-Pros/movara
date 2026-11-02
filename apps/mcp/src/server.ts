import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createTerms, getLiveState, getTerms, listMeetings, listTeams, type Ctx, type Terms } from '@motion/core'
import type { Db } from '@motion/db'
import { allowed } from './scopes'
import { json, text, toolError } from './format'
import { orgOverview, quarterView, teamScorecard } from './overview'
import { registerPrompts } from './prompts'
import { buildTools } from './tools'

export const MCP_SERVER_NAME = 'motion'
export const MCP_SERVER_VERSION = '0.1.0'

export type MotionMcpOptions = {
  db: Db
  /** Authenticated context of the connecting agent (API key, OAuth client, …). Called once per server (session). */
  resolveCtx: () => Ctx | Promise<Ctx>
  /** Live-meeting poll interval for resource subscriptions (ms). Default 2000. */
  pollMs?: number
}

const MEETING_URI = /^motion:\/\/meeting\/([0-9a-f-]{36})\/live$/i

/**
 * One McpServer per session. Tool descriptions, prompts and labels are rendered from the org's terminology at
 * creation; the tool list is filtered by the agent's scopes. Tool names are canonical and never change.
 */
export async function createMotionMcpServer(opts: MotionMcpOptions): Promise<McpServer> {
  const ctx = await opts.resolveCtx()
  let terms: Terms
  try {
    terms = await getTerms(ctx)
  } catch {
    terms = createTerms() // no `read` scope: Standard vocabulary
  }
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      capabilities: { resources: { subscribe: true, listChanged: false }, tools: {}, prompts: {} },
      instructions: `Motion: the company's operating system (${terms.t('priority', 'plural')}, ${terms.t('scorecard')}, ${terms.t('issue', 'plural')}, ${terms.t('todo', 'plural')}, meetings). Call org_overview first. Writes accept requestId (idempotency) and expectedVersion. Changes that need a person return { needsApproval, approvalId }: poll approval_status.`,
    },
  )

  // ---- tools (filtered by scope)
  for (const t of buildTools(terms)) {
    if (!allowed(ctx, t.scope)) continue
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.shape,
        annotations: { readOnlyHint: !!t.readOnly, openWorldHint: false, ...(t.readOnly ? {} : { destructiveHint: false }) },
      },
      (async (args: unknown) => {
        try {
          return text(await t.run(ctx, args ?? {}))
        } catch (e) {
          return toolError(e)
        }
      }) as never,
    )
  }

  // ---- resources
  const canRead = allowed(ctx, 'read')
  const asJson = (uri: URL, v: unknown) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: json(v) }] })
  if (canRead) {
    server.registerResource('org-overview', 'motion://org/overview', { description: 'Organization, vocabulary, current quarter/week, teams, your role', mimeType: 'application/json' },
      async (uri) => asJson(uri, await orgOverview(ctx, terms)))
    server.registerResource('quarter-current', 'motion://quarter/current', { description: `Current quarter: ${terms.t('priority', 'plural')} with status and progress`, mimeType: 'application/json' },
      async (uri) => asJson(uri, await quarterView(ctx, terms)))
    server.registerResource('team-scorecard', new ResourceTemplate('motion://team/{id}/scorecard', {
      list: async () => ({ resources: (await listTeams(ctx)).map((t) => ({ uri: `motion://team/${t.id}/scorecard`, name: `${t.name} ${terms.t('scorecard')}`, mimeType: 'application/json' })) }),
    }), { description: `A team's ${terms.t('scorecard')}: ${terms.t('metric', 'plural')} by period with on/off-track`, mimeType: 'application/json' },
      async (uri, v) => asJson(uri, await teamScorecard(ctx, String(v.id))))
    server.registerResource('meeting-live', new ResourceTemplate('motion://meeting/{id}/live', {
      list: async () => ({ resources: (await listMeetings(ctx, { status: 'live' })).map((m) => ({ uri: `motion://meeting/${m.id}/live`, name: `Live: ${m.seriesName}`, mimeType: 'application/json' })) }),
    }), { description: `Live state of a running ${terms.t('weekly_meeting')} (agenda timers, focus ${terms.t('issue', 'plural')}, presence). Subscribe for pushes.`, mimeType: 'application/json' },
      async (uri, v) => {
        const s = await getLiveState(ctx, String(v.id))
        return asJson(uri, s)
      })
  }

  // ---- subscriptions: poll live-state `rev` (meetings) or content (others) and notify
  const subs = new Map<string, ReturnType<typeof setInterval>>()
  const stop = () => { for (const h of subs.values()) clearInterval(h); subs.clear() }
  const poll = (uri: string) => {
    const m = MEETING_URI.exec(uri)
    let rev: number | undefined
    let last: string | undefined
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        if (m) {
          const s = await getLiveState(ctx, m[1]!, rev === undefined ? {} : { sinceRev: rev })
          if (s) {
            const first = rev === undefined
            rev = s.rev
            if (!first) await server.server.sendResourceUpdated({ uri })
          }
        } else {
          const body = json(uri === 'motion://org/overview' ? await orgOverview(ctx, terms) : uri === 'motion://quarter/current' ? await quarterView(ctx, terms) : await teamScorecard(ctx, /^motion:\/\/team\/([^/]+)\/scorecard$/.exec(uri)?.[1] ?? ''))
          if (last !== undefined && last !== body) await server.server.sendResourceUpdated({ uri })
          last = body
        }
      } catch {
        /* resource gone or transient error: keep polling */
      } finally {
        busy = false
      }
    }
    void tick()
    const h = setInterval(tick, m ? (opts.pollMs ?? 2000) : 15_000)
    h.unref?.()
    subs.set(uri, h)
  }
  server.server.setRequestHandler(SubscribeRequestSchema, async (req) => {
    const uri = req.params.uri
    if (canRead && !subs.has(uri)) poll(uri)
    return {}
  })
  server.server.setRequestHandler(UnsubscribeRequestSchema, async (req) => {
    const h = subs.get(req.params.uri)
    if (h) clearInterval(h)
    subs.delete(req.params.uri)
    return {}
  })
  const prevClose = server.server.onclose
  server.server.onclose = () => { stop(); prevClose?.() }

  registerPrompts(server, terms)
  return server
}
