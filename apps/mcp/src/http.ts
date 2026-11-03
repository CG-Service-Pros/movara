import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createDb, migrate, seedIfEmpty } from '@movara/db'
import { createMcpHttpHandler } from './http-handler'

/** Standalone streamable-HTTP MCP server. Env: DATABASE_URL (postgres:// or pglite://dir), PORT (3333). */
async function main() {
  const db = createDb(process.env.DATABASE_URL)
  await migrate(db)
  const seed = process.env.MOVARA_SEED_DEMO ? process.env.MOVARA_SEED_DEMO !== '0' : db.$driver === 'pglite'
  if (seed) await seedIfEmpty(db)
  const handle = createMcpHttpHandler({ getDb: async () => db })
  const port = Number(process.env.PORT ?? 3333)

  const toRequest = (req: IncomingMessage): Request => {
    const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url}`
    const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers: req.headers as Record<string, string> }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req) as unknown as ReadableStream
      init.duplex = 'half'
    }
    return new Request(url, init)
  }
  const send = async (res: ServerResponse, r: Response, onClose: () => void) => {
    res.writeHead(r.status, Object.fromEntries(r.headers))
    if (!r.body) return res.end()
    const reader = r.body.getReader()
    res.on('close', () => { onClose(); void reader.cancel().catch(() => {}) })
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } catch {
      /* client went away */
    }
    res.end()
  }

  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    try {
      if (path === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
        return
      }
      if (path !== '/mcp' && path !== '/') {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found; the MCP endpoint is /mcp"}')
        return
      }
      await send(res, await handle(toRequest(req)), () => {})
    } catch (e) {
      console.error('[movara-mcp]', e)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end('{"error":"internal"}')
    }
  })
  server.listen(port, () => console.error(`[movara-mcp] streamable HTTP on http://localhost:${port}/mcp (${db.$driver})`))
  const shutdown = () => { server.close(); void db.$close().finally(() => process.exit(0)) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
