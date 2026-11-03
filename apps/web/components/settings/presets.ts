import type { ScopePreset } from '@movara/core'

export type PresetChoice = ScopePreset | 'custom'

export const PRESET_INFO: { key: PresetChoice; label: string; description: string }[] = [
  { key: 'personal_assistant', label: 'Personal assistant', description: 'Reads everything, manages its owner’s own to-dos, and pushes meeting notes for review.' },
  { key: 'notes_integration', label: 'Notes integration', description: 'Reads everything and pushes meeting notes and action items for review (Granola, Plaud, n8n).' },
  { key: 'team_operator', label: 'Team operator', description: 'Works across to-dos, issues, headlines, metrics, priorities and meetings. Vision and chart changes need approval.' },
  { key: 'read_only', label: 'Read only', description: 'Can look at everything the owner can see. Cannot change anything.' },
  { key: 'custom', label: 'Custom', description: 'Start read-only and choose scopes one by one.' },
]

export const presetLabel = (p: string | null | undefined) => PRESET_INFO.find((x) => x.key === p)?.label ?? 'Custom'
