'use client'

import { useState } from 'react'

/**
 * Run `onChange` during render when `value` changes (React's "adjusting state when a prop changes" pattern:
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
 * Use it instead of `useEffect(() => setX(...), [value])`: React re-renders immediately with the new state
 * instead of committing a stale frame first. `onChange` may only set state of the calling component.
 */
export function useOnChange<T>(value: T, onChange: (next: T, prev: T) => void) {
  const [prev, setPrev] = useState(value)
  if (!Object.is(prev, value)) {
    setPrev(value)
    onChange(value, prev)
  }
}
