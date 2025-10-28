import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {SanctumApi, createSanctumApi} from '../src'

describe('SanctumApi', () => {
  let api: SanctumApi

  beforeEach(() => {
    api = createSanctumApi({
      url: 'https://api.example.com',
      withCredentials: true,
      useCsrfToken: true,
      csrfCookiePath: '/sanctum/csrf-cookie'
    })

    global.fetch = vi.fn()

    // Clear document.cookie if it exists
    if (typeof document !== 'undefined') {
      Object.defineProperty(document, 'cookie', {
        writable: true,
        configurable: true,
        value: ''
      })
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should set default Sanctum configuration', () => {
      expect((api as any).withCredentials).toBe(true)
      expect((api as any).useCsrfToken).toBe(true)
      expect((api as any).csrfCookiePath).toBe('/sanctum/csrf-cookie')
    })

    it('should accept custom configuration', () => {
      const customApi = createSanctumApi({
        url: 'https://api.example.com',
        withCredentials: false,
        useCsrfToken: false,
        csrfCookiePath: '/custom/csrf'
      })

      expect((customApi as any).withCredentials).toBe(false)
      expect((customApi as any).useCsrfToken).toBe(false)
      expect((customApi as any).csrfCookiePath).toBe('/custom/csrf')
    })
  })

  describe('getCsrfToken', () => {
    it('should return null when CSRF token is disabled', async () => {
      const noCsrfApi = createSanctumApi({
        url: 'https://api.example.com',
        useCsrfToken: false
      })

      const token = await noCsrfApi.getCsrfToken()
      expect(token).toBeNull()
    })

    it('should fetch CSRF token from cookie endpoint', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=test-token-123'

      const token = await api.getCsrfToken()

      expect(token).toBe('test-token-123')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/sanctum/csrf-cookie',
        expect.objectContaining({
          credentials: 'include'
        })
      )
    })

    it('should decode URL-encoded CSRF token', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=test%2Btoken%3D123'

      const token = await api.getCsrfToken()

      expect(token).toBe('test+token=123')
    })

    it('should cache CSRF token', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=cached-token'

      const token1 = await api.getCsrfToken()
      const token2 = await api.getCsrfToken()

      expect(token1).toBe(token2)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should handle concurrent token requests', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=concurrent-token'

      const [token1, token2, token3] = await Promise.all([
        api.getCsrfToken(),
        api.getCsrfToken(),
        api.getCsrfToken()
      ])

      expect(token1).toBe('concurrent-token')
      expect(token2).toBe('concurrent-token')
      expect(token3).toBe('concurrent-token')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should return null on fetch failure', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const token = await api.getCsrfToken()

      expect(token).toBeNull()
    })
  })

  describe('clearCsrfToken', () => {
    it('should clear cached CSRF token', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=token-1'
      await api.getCsrfToken()

      document.cookie = 'XSRF-TOKEN=token-2'
      api.clearCsrfToken()

      const newToken = await api.getCsrfToken()
      expect(newToken).toBe('token-2')
    })
  })

  describe('setCsrfToken', () => {
    it('should manually set CSRF token', () => {
      api.setCsrfToken('manual-token')

      expect(api.hasCsrfToken()).toBe(true)
      expect((api as any).csrfToken).toBe('manual-token')
    })

    it('should clear promise when setting token', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const promise = api.getCsrfToken()
      api.setCsrfToken('new-token')

      // The promise should resolve with the old fetch
      await promise

      // But the current token should be the new one
      expect((api as any).csrfToken).toBe('new-token')
    })
  })

  describe('hasCsrfToken', () => {
    it('should return false when no token is cached', () => {
      expect(api.hasCsrfToken()).toBe(false)
    })

    it('should return true when token is cached', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=cached-token'

      await api.getCsrfToken()

      expect(api.hasCsrfToken()).toBe(true)
    })
  })

  describe('request', () => {
    it('should include CSRF token in POST requests', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const requestMockResponse = {
        ok: true,
        status: 201,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1}})
      }

      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(requestMockResponse as any)

      await api.post('/users', {name: 'John'})

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token'
          }),
          credentials: 'include'
        })
      )
    })

    it('should include CSRF token in PUT requests', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const requestMockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1}})
      }

      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(requestMockResponse as any)

      await api.put('/users/1', {name: 'Jane'})

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token'
          })
        })
      )
    })

    it('should include CSRF token in PATCH requests', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const requestMockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1}})
      }

      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(requestMockResponse as any)

      await api.patch('/users/1', {name: 'Jane'})

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token'
          })
        })
      )
    })

    it('should include CSRF token in DELETE requests', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const requestMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      }

      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(requestMockResponse as any)

      await api.delete('/users/1')

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token'
          })
        })
      )
    })

    it('should not fetch CSRF token for GET requests', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: []})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.get('/users')

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should clear CSRF token on 419 response', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const errorMockResponse = {
        ok: false,
        status: 419,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'CSRF token mismatch'})
      }

      document.cookie = 'XSRF-TOKEN=expired-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(errorMockResponse as any)

      await api.post('/users', {name: 'John'})

      expect(api.hasCsrfToken()).toBe(false)
    })

    it('should clear CSRF token on 401 response', async () => {
      const csrfMockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      const errorMockResponse = {
        ok: false,
        status: 401,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'Unauthenticated'})
      }

      document.cookie = 'XSRF-TOKEN=invalid-token'

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(csrfMockResponse as any)
        .mockResolvedValueOnce(errorMockResponse as any)

      await api.post('/users', {name: 'John'})

      expect(api.hasCsrfToken()).toBe(false)
    })

    it('should use credentials: include when withCredentials is true', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: []})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.get('/users')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include'
        })
      )
    })

    it('should use credentials: same-origin when withCredentials is false', async () => {
      const noCredentialsApi = createSanctumApi({
        url: 'https://api.example.com',
        withCredentials: false
      })

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: []})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await noCredentialsApi.get('/users')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'same-origin'
        })
      )
    })
  })

  describe('initialize', () => {
    it('should initialize and fetch CSRF token', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers()
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      document.cookie = 'XSRF-TOKEN=init-token'

      const result = await api.initialize()

      expect(result).toBe(true)
      expect(api.hasCsrfToken()).toBe(true)
    })

    it('should return true when CSRF is disabled', async () => {
      const noCsrfApi = createSanctumApi({
        url: 'https://api.example.com',
        useCsrfToken: false
      })

      const result = await noCsrfApi.initialize()

      expect(result).toBe(true)
    })

    it('should return false on initialization failure', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const result = await api.initialize()

      expect(result).toBe(false)
    })
  })
})
