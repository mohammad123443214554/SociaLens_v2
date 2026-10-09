'use client'

import { useEffect, useState } from 'react'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')

  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth
      if (width < 640) setBreakpoint('mobile')
      else if (width < 1024) setBreakpoint('tablet')
      else setBreakpoint('desktop')
    }

    checkBreakpoint()
    window.addEventListener('resize', checkBreakpoint)
    return () => window.removeEventListener('resize', checkBreakpoint)
  }, [])

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
  }
}
