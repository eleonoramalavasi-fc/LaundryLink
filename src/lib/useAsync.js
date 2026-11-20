import { useEffect, useState } from 'react'

// Runs an async loader whenever `deps` change. Keeps the previous data while reloading.
export function useAsync(load, deps) {
  const [state, setState] = useState({ data: undefined, error: null })
  useEffect(() => {
    let live = true
    load()
      .then((data) => live && setState({ data, error: null }))
      .catch((error) => live && setState((s) => ({ ...s, error })))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
