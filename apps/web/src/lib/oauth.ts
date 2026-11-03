import 'server-only'
import { SCOPES } from '@movara/core'

/** Public origin of the app (no trailing slash). Same precedence as the Better Auth config. */
export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export const MCP_RESOURCE_PATH = '/mcp'

export const OAUTH_ENDPOINTS = () => ({
  issuer: appUrl(),
  authorization: `${appUrl()}/oauth/authorize`,
  token: `${appUrl()}/api/auth/oauth2/token`,
  registration: `${appUrl()}/api/auth/oauth2/register`,
  consent: `${appUrl()}/api/auth/oauth2/consent`,
  resource: `${appUrl()}${MCP_RESOURCE_PATH}`,
  resourceMetadata: `${appUrl()}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`,
})

/** RFC 8414 authorization-server metadata. */
export function authorizationServerMetadata() {
  const e = OAUTH_ENDPOINTS()
  return {
    issuer: e.issuer,
    authorization_endpoint: e.authorization,
    token_endpoint: e.token,
    registration_endpoint: e.registration,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [...SCOPES],
  }
}

/** RFC 9728 protected-resource metadata for the MCP endpoint. */
export function protectedResourceMetadata() {
  const e = OAUTH_ENDPOINTS()
  return {
    resource: e.resource,
    authorization_servers: [e.issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Movara MCP',
  }
}

/** MCP clients that run in a browser (inspector, web connectors) need CORS on discovery, registration and token calls. */
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version',
  'access-control-max-age': '86400',
} as const

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...extra } })

export const preflight = () => new Response(null, { status: 204, headers: CORS })
