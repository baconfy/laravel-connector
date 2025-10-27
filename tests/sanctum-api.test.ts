import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {SanctumConfig} from '../src'
import {createSanctumApi, SanctumApi} from '../src'

// Helper to create a complete Response mock
const createMockResponse = (data: any, status: number, ok: boolean) => {
  const jsonData = JSON.stringify(data)
  return {
    ok,
    status,
    headers: new Headers({'content-type': 'application/json'}),
    json: async () => data,
    text: async () => jsonData,
    blob: async () => new Blob([jsonData]),
    arrayBuffer: async () => new TextEncoder().encode(jsonData).buffer,
    formData: async () => new FormData(),
    clone: function() { return this },
    body: null,
    bodyUsed: false,
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: ''
  } as Response
}

describe('SanctumApi (Laravel Specific)', () => {
  let api: SanctumApi

  const mockConfig: SanctumConfig = {baseUrl: 'https://api.example.com'}

  beforeEach(() => {
    if (typeof document !== 'undefined') document.cookie = ''
    global.fetch = vi.fn()
  })

  describe('Credentials Management', () => {
    it('should include credentials when withCredentials is true (default)', async () => {
      // Mock CSRF fetch in constructor
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(null, 204, true))
        .mockResolvedValueOnce(createMockResponse({}, 200, true))

      api = createSanctumApi(mockConfig)

      await api.get('/test')

      // Second call should be the GET request with credentials
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({credentials: 'include'})
      )
    })

    it('should use same-origin when withCredentials is explicitly false', async () => {
      // Mock CSRF fetch in constructor
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(null, 204, true))
        .mockResolvedValueOnce(createMockResponse({}, 200, true))

      const noCredentialsSanctumApi = createSanctumApi({
        baseUrl: 'https://api.example.com',
        withCredentials: false
      })

      await noCredentialsSanctumApi.get('/test')

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          credentials: 'same-origin'
        })
      )
    })
  })

  describe('CSRF Token Handling (Laravel Sanctum)', () => {
    it('should fetch CSRF token before POST request and include X-XSRF-TOKEN header', async () => {
      if (typeof document !== 'undefined') {
        document.cookie = 'XSRF-TOKEN=test-csrf-token%3B'
      }

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // Constructor CSRF fetch
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // POST CSRF fetch
        .mockResolvedValueOnce(createMockResponse({success: true}, 200, true)) // POST request

      api = createSanctumApi(mockConfig)

      await api.post('/test', {data: 'test'})

      // First call: constructor CSRF fetch
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Second call: POST CSRF fetch (because cookie wasn't set during constructor)
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Third call: actual POST with token
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token;'
          })
        })
      )
    })

    it('should cache CSRF token for subsequent requests (CSRF fetch only happens in constructor)', async () => {
      if (typeof document !== 'undefined') {
        document.cookie = 'XSRF-TOKEN=cached-token'
      }

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // Constructor CSRF fetch
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // POST 1 CSRF check (token not cached from constructor)
        .mockResolvedValueOnce(createMockResponse({success: true}, 200, true)) // POST 1
        .mockResolvedValueOnce(createMockResponse({success: true}, 200, true)) // POST 2 (uses cached token)

      api = createSanctumApi(mockConfig)

      await api.post('/test1', {})
      await api.post('/test2', {})

      // Total: 1 CSRF (constructor) + 1 CSRF (first POST) + 2 POSTs = 4
      expect(global.fetch).toHaveBeenCalledTimes(4)

      // First call is constructor CSRF
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Second call is CSRF check before first POST
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Both POSTs should include cached token
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/test1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'cached-token'
          })
        })
      )

      expect(global.fetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/test2',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'cached-token'
          })
        })
      )
    })

    it('should clear CSRF token and fetch again on next request', async () => {
      if (typeof document !== 'undefined') {
        document.cookie = 'XSRF-TOKEN=token-to-clear'
      }

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // Constructor CSRF
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // POST 1 CSRF check
        .mockResolvedValueOnce(createMockResponse({step: 1}, 200, true)) // POST 1
        .mockResolvedValueOnce(createMockResponse(null, 204, true)) // CSRF after clear
        .mockResolvedValueOnce(createMockResponse({step: 2}, 200, true)) // POST 2

      api = createSanctumApi(mockConfig)

      await api.post('/test', {})
      api.clearCsrfToken()
      await api.post('/test', {})

      // Total: 1 CSRF (constructor) + 1 CSRF (POST 1) + 1 POST + 1 CSRF (after clear) + 1 POST = 5
      expect(global.fetch).toHaveBeenCalledTimes(5)

      // Verify CSRF was fetched in constructor
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Verify CSRF was checked before first POST
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )

      // Verify CSRF was fetched again after clear
      expect(global.fetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )
    })

    it('should skip CSRF fetch when useCsrfToken is false', async () => {
      global.fetch = vi.fn().mockResolvedValue(createMockResponse({success: true}, 200, true))

      const apiNoCsrf = createSanctumApi({
        baseUrl: 'https://api.example.com',
        useCsrfToken: false
      })

      await apiNoCsrf.post('/test', {})

      // Should only have 1 call (the POST), no CSRF fetch
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Should not include CSRF token header
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-XSRF-TOKEN': expect.any(String)
          })
        })
      )
    })
  })
})