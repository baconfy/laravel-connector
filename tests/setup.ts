import {beforeEach, vi} from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
  document.cookie.split(";").forEach((c) => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
  })
})

global.console.error = vi.fn()