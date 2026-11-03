/**
 * A self-contained 404 page returned by proxy.ts for full page loads of unknown org URLs.
 * (Rewriting to the in-shell 404 needs an absolute URL, and Next compares it with the server's bind address,
 * so behind Docker/0.0.0.0 or a reverse proxy it would be treated as external. A direct Response is robust.)
 * Styled with the app's tokens; no scripts, no external requests.
 */
const PALETTE = {
  light: { canvas: '#f6f7f9', surface: '#ffffff', line: '#e6e8ec', ink: '#15181d', body: '#646b76', faint: '#6b727d', accent: '#2449c4' },
  dark: { canvas: '#111215', surface: '#17181c', line: '#26282e', ink: '#eef0f3', body: '#9aa1ab', faint: '#808792', accent: '#9db1ff' },
}

export function notFoundResponse({ slug, theme, head }: { slug: string; theme: 'light' | 'dark'; head: boolean }): Response {
  const c = PALETTE[theme]
  const home = `/${encodeURIComponent(slug)}`
  const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found · Movara</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:${c.canvas};color:${c.body};font:13px/1.5 'Inter Variable',Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
  main{width:min(380px,calc(100vw - 32px));box-sizing:border-box;padding:24px;border-radius:12px;background:${c.surface};box-shadow:0 0 0 1px ${c.line},0 1px 2px rgba(16,24,40,.04);text-align:center}
  .brand{margin:0 0 16px;font-weight:650;color:${c.ink}}
  h1{margin:0;font-size:17px;font-weight:650;color:${c.ink}}
  p{margin:6px 0 0}
  a{display:inline-block;margin-top:16px;font-weight:550;color:${c.accent};text-decoration:none}
  a:hover,a:focus-visible{text-decoration:underline}
  a:focus-visible{outline:2px solid ${c.accent};outline-offset:3px;border-radius:4px}
</style>
</head>
<body>
<main>
  <p class="brand">Movara</p>
  <h1>Page not found</h1>
  <p>It may have been deleted, or it is not part of this organization.</p>
  <a href="${home}">Back to home</a>
</main>
</body>
</html>`
  return new Response(head ? null : html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  })
}
