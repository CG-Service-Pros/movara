import type { HandlerMap } from '../types'
import { handlers as org } from './org'
import { handlers as people } from './people'
import { handlers as teams } from './teams'
import { handlers as agents } from './agents'
import { handlers as approvals } from './approvals'
import { handlers as audit } from './audit'
import { handlers as priorities } from './priorities'
import { handlers as scorecard } from './scorecard'
import { handlers as issues } from './issues'
import { handlers as todos } from './todos'
import { handlers as headlines } from './headlines'
import { handlers as meetings } from './meetings'
import { handlers as vision } from './vision'
import { handlers as chart } from './chart'
import { handlers as search } from './search'

/** Every area's handlers merged. Feature agents only edit their own area file, never this registry. */
export const handlers: HandlerMap = {
  ...org, ...people, ...teams, ...agents, ...approvals, ...audit,
  ...priorities, ...scorecard, ...issues, ...todos, ...headlines, ...meetings, ...vision, ...chart, ...search,
}
