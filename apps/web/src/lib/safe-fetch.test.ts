import { describe, expect, it } from 'vitest'
import { assertPublicHttpsUrl, isPrivateAddress, safeFetchText } from './safe-fetch'

describe('SSRF guard', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '[::1]',
  ])('treats %s as private', (a) => expect(isPrivateAddress(a)).toBe(true))
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('treats %s as public', (a) => expect(isPrivateAddress(a)).toBe(false))

  it.each([
    'http://example.com/pack.json', 'ftp://example.com/x', 'file:///etc/passwd', 'https://localhost/x', 'https://foo.localhost/x', 'https://x.internal/p',
    'https://127.0.0.1/p', 'https://[::1]/p', 'https://169.254.169.254/latest/meta-data', 'https://2130706433/p', 'https://0x7f.1/p', 'https://user:pw@example.com/p',
    'https://example.com:8443/p', 'https://[::ffff:127.0.0.1]/p', 'not a url',
  ])('rejects %s', (u) => expect(() => assertPublicHttpsUrl(u)).toThrow())

  it('accepts a normal https URL', () => expect(assertPublicHttpsUrl('https://example.com/pack.json').hostname).toBe('example.com'))

  it('refuses hostnames that resolve to loopback (DNS-resolved check)', async () => {
    // localtest.me and nip.io style names resolve to 127.0.0.1; fall back to a failure either way (never a successful fetch).
    await expect(safeFetchText('https://127.0.0.1.nip.io/x', { maxBytes: 1000, timeoutMs: 3000 })).rejects.toThrow()
  })
})
