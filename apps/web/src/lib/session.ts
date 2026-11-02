import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { getAuth } from './auth'

/** The signed-in Better Auth session ({ user, session }) or null. Cached per request. */
export const getSession = cache(async () => {
  const auth = await getAuth()
  return auth.api.getSession({ headers: await headers() })
})
