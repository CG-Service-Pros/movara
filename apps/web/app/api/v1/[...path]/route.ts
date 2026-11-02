import { handleApi } from '@/api/router'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path: string[] }> }
const run = async (req: Request, { params }: Ctx) => handleApi(req, (await params).path)

export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE }
