import { createDb, migrate } from './client'
import { resetDatabase } from './reset'
import { seedDemo, DEMO_LOGIN } from './seed'

const cmd = process.argv[2]
const url = process.env.DATABASE_URL

async function main() {
  if (cmd === 'migrate') {
    const db = createDb(url)
    await migrate(db)
    console.log('migrated')
    await db.$close()
  } else if (cmd === 'seed') {
    const db = createDb(url)
    await migrate(db)
    const r = await seedDemo(db)
    console.log(r.created ? `seeded demo org "vindex" (login ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password})` : 'demo org already present, nothing to do')
    await db.$close()
  } else if (cmd === 'reset') {
    const { db } = await resetDatabase(url)
    console.log(`reset and seeded (login ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password})`)
    await db.$close()
  } else {
    console.error('usage: cli.ts migrate | seed | reset')
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
