'use client'

import * as React from 'react'

/**
 * Shell-wide UI state: whether the signed-in person can write in this org (viewers cannot run any command,
 * so write controls are hidden rather than offered and refused), and "focus mode" for a running meeting
 * (the agenda replaces the app navigation, per docs/design-plan.md §1.5).
 */
type ShellState = { canWrite: boolean; focus: boolean; setFocus: (on: boolean) => void }
const ShellContext = React.createContext<ShellState>({ canWrite: true, focus: false, setFocus: () => {} })

export function ShellProvider({ canWrite, children }: { canWrite: boolean; children: React.ReactNode }) {
  const [focus, setFocus] = React.useState(false)
  const value = React.useMemo(() => ({ canWrite, focus, setFocus }), [canWrite, focus])
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

/** False for viewers: hide create/edit/delete affordances. The server still enforces roles. */
export const useCanWrite = () => React.useContext(ShellContext).canWrite
export const useShellFocus = () => React.useContext(ShellContext).focus

/** Hide the app navigation while `on` (e.g. a live meeting). Restores it on unmount. */
export function useFocusMode(on: boolean) {
  const { setFocus } = React.useContext(ShellContext)
  React.useEffect(() => {
    setFocus(on)
    return () => setFocus(false)
  }, [on, setFocus])
}
