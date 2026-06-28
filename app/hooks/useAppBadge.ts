import { useEffect } from 'react'

export function useAppBadge(pendingCount: number) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return

    if (pendingCount > 0) {
      navigator.setAppBadge(pendingCount).catch(() => {})
    } else {
      navigator.clearAppBadge().catch(() => {})
    }

    return () => {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [pendingCount])
}