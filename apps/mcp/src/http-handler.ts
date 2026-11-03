import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ACCESS_TOKEN_PREFIX, authenticateApiKey, authenticateOAuthToken, isMotionError, type Ctx } from '@motion/core'
import type { Db } from '@motion/db'
import { createMotionMcpServer } from './server'

type Session = { transport: WebStandardStreamableHTTPServerTransport; actorId: string; orgId: string; lastUsed: number }

export type McpHttpHandlerOptions = {
  /** Database getter (called per request; the Next app passes its shared handle). */
  getDb: () => Promise<Db>
  /** Idle sessions are dropped after this many ms. Default 30 min. */
  sessionTtlMs?: number
  pollMs?: number
  /**
   * URL of the OAuth protected-resource metadata document (RFC 9728), e.g. https://app/.well-known/oauth-protected-resource/mcp.
   * Advertised in `WWW-Authenticate` so OAuth-capable MCP clients (Claude, ChatGPT, Cursor) can discover the authorization server.
   */
  resourceMetadataUrl?: string | (() => string | undefined)
}

const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const unauthorized = (message: string, resourceMetadata?: string, invalid = true) =>
  rpcError(401, -32001, message, {
    'www-authenticate': `Bearer realm="motion"${invalid ? ', error="invalid_token"' : ''}${resourceMetadata ? `, resource_metadata="${resourceMetadata}"` : ''}`,
  })

export const bearerOf = (req: Request): string | null => {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
  return m ? m[1]!.trim() : null
}

/**
 * Streamable-HTTP MCP endpoint as a web-standard `(Request) => Response` handler. Stateful: an `initialize` request
 * creates a session (its own McpServer, so tool descriptions use the org terminology at session start). Every request
 * is authenticated with a Bearer API key (which also stamps the agent's last_seen) and must belong to the session's agent.
 */
export function createMcpHttpHandler(opts: McpHttpHandlerOptions) {
  const sessions = new Map<string, Session>()
  const ttl = opts.sessionTtlMs ?? 30 * 60_000
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [id, s] of sessions) if (now - s.lastUsed > ttl) void s.transport.close().finally(() => sessions.delete(id))
  }, 60_000)
  sweeper.unref?.()

  return async function handle(req: Request): Promise<Response> {
    const key = bearerOf(req)
    const rm = typeof opts.resourceMetadataUrl === 'function' ? opts.resourceMetadataUrl() : opts.resourceMetadataUrl
    if (!key) return unauthorized('Missing Authorization: Bearer <api key or OAuth access token>', rm, false)
    const db = await opts.getDb()
    let ctx: Ctx
    try {
      ctx = key.startsWith(ACCESS_TOKEN_PREFIX) ? await authenticateOAuthToken(db, key) : await authenticateApiKey(db, key)
    } catch (e) {
      if (isMotionError(e)) return unauthorized(e.message, rm)
      throw e
    }

    const sid = req.headers.get('mcp-session-id')
    if (sid) {
      const s = sessions.get(sid)
      if (!s) return rpcError(404, -32001, 'Unknown or expired session; send initialize again')
      if (s.actorId !== ctx.actor.id || s.orgId !== ctx.orgId) return rpcError(403, -32003, 'Session belongs to a different agent')
      s.lastUsed = Date.now()
      return s.transport.handleRequest(req)
    }

    if (req.method !== 'POST') return rpcError(400, -32000, 'Missing Mcp-Session-Id header')
    const body = await req.json().catch(() => null)
    const isInit = (m: any) => m?.method === 'initialize'
    if (!(Array.isArray(body) ? body.some(isInit) : isInit(body))) return rpcError(400, -32000, 'Send an initialize request first')

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, actorId: ctx.actor.id, orgId: ctx.orgId, lastUsed: Date.now() })
      },
      onsessionclosed: (id) => {
        sessions.delete(id)
      },
    })
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }
    const server = await createMotionMcpServer({ db, resolveCtx: () => ctx, pollMs: opts.pollMs })
    await server.connect(transport)
    return transport.handleRequest(req, { parsedBody: body })
  }
}

/** One handler per process (survives Next dev HMR). */
export function sharedMcpHttpHandler(getDb: () => Promise<Db>, opts: Omit<McpHttpHandlerOptions, 'getDb'> = {}) {
  const g = globalThis as unknown as { __motionMcpHandler?: ReturnType<typeof createMcpHttpHandler> }
  return (g.__motionMcpHandler ??= createMcpHttpHandler({ getDb, ...opts }))
}
