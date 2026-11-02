/**
 * Motion MCP server (placeholder). Tools are NOT implemented yet.
 *
 * Plan (docs/mcp-tools.md): `@modelcontextprotocol/sdk` with streamable HTTP + stdio transports.
 * Every tool is a thin adapter over `@motion/core` (`execute(ctx, command, input, { requestId, expectedVersion })`),
 * authenticated with `authenticateApiKey(db, key)` (static keys) or OAuth 2.1, with tool descriptions
 * rendered from the org's terminology via `getTerms(ctx)`.
 */
export const MCP_SERVER_NAME = 'motion'
export const MCP_SERVER_VERSION = '0.0.0'

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error(`${MCP_SERVER_NAME} MCP server skeleton: no tools implemented yet.`)
}
