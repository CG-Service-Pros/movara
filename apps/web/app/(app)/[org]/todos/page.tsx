import { actingPersonId, getTodo, listMeetings, listTodos, todayIn } from '@movara/core'
import { Page } from '@/components/shell/page'
import { TodosView } from '@/components/todos/todos-view'
import { peopleAndTeams, resolveSources } from '@/components/issues/server'
import { getMyTeams, requireModule } from '@/lib/ctx'

export default async function TodosPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ view?: string; id?: string; new?: string }> }) {
  const { org: slug } = await params
  const sp = await searchParams
  const { ctx, org, terms } = await requireModule(slug, 'todos')
  const [{ people, teams }, myTeams, rows, live] = await Promise.all([peopleAndTeams(ctx), getMyTeams(slug), listTodos(ctx, { limit: 500 }), listMeetings(ctx, { status: 'live' })])
  const labelFor = (type: string) => (type === 'issue' ? terms.t('issue').toLowerCase() : type === 'priority' ? terms.t('priority').toLowerCase() : type === 'headline' ? terms.t('headline').toLowerCase() : type === 'metric' ? terms.t('metric').toLowerCase() : undefined)
  const resolve = await resolveSources(ctx, labelFor, rows.map((t) => t.source))
  const todos = rows.map((t) => ({
    id: t.id, title: t.title, description: t.description, ownerId: t.ownerId, teamId: t.teamId, dueDate: t.dueDate, status: t.status,
    doneAt: t.doneAt?.toISOString() ?? null, source: resolve(t.source), actorAgent: t.createdByActor?.type === 'agent',
  }))
  const target = sp.id ? await getTodo(ctx, sp.id).catch(() => null) : null
  const me = actingPersonId(ctx)
  return (
    <Page title={terms.t('todo', 'plural')}>
      <TodosView
        orgSlug={slug}
        todos={todos}
        people={people}
        teams={teams}
        myTeamIds={myTeams.map((t) => t.id)}
        meId={me}
        today={todayIn(org)}
        liveTeamIds={[...new Set(live.map((m) => m.teamId))]}
        initialView={target && target.ownerId !== me ? 'all' : sp.view === 'team' || sp.view === 'all' ? sp.view : 'my'}
        initialSelectedId={target?.id ?? null}
        openNew={sp.new === '1'}
        labels={{ todo: terms.t('todo'), todos: terms.t('todo', 'plural') }}
      />
    </Page>
  )
}
