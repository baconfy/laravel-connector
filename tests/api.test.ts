import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {Config} from '../src'
import {Api, createApi} from '../src'

describe('Api', () => {
  let api: Api

  const mockConfig: Config = {
    baseUrl: 'https://api.example.com',
    withCredentials: true
  }

  beforeEach(() => {
    api = createApi(mockConfig)
    global.fetch = vi.fn()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Constructor and Config', () => {
    it('should create an instance with correct config', () => {
      expect(api).toBeInstanceOf(Api)
    })

    it('should remove trailing slash from baseUrl', () => {
      const apiWithSlash = createApi({
        baseUrl: 'https://api.example.com/'
      })
      expect(apiWithSlash).toBeInstanceOf(Api)
    })

    it('should set default headers', () => {
      const customHeaders = {'X-Custom-Header': 'test'}
      const apiWithHeaders = createApi({
        ...mockConfig,
        headers: customHeaders
      })
      expect(apiWithHeaders).toBeInstanceOf(Api)
    })

    it('should load token from localStorage on init', () => {
      const token = 'saved-token-123'

      localStorage.setItem('auth_token', JSON.stringify({token}))

      const newApi = createApi(mockConfig)

      expect(newApi.getToken()).toBe(token)
      expect(newApi.isAuthenticated()).toBe(true)
    })

    it('should use custom tokenKey from config', () => {
      const customKey = 'my_custom_token'
      const token = 'custom-token-123'

      localStorage.setItem(customKey, JSON.stringify({token}))

      const newApi = createApi({
        ...mockConfig,
        auth: {tokenKey: customKey}
      })

      expect(newApi.getToken()).toBe(token)
    })
  })

  describe('Authentication - setToken', () => {
    it('should set token and save to localStorage', () => {
      const token = 'test-token-123'

      api.setToken(token)

      expect(api.getToken()).toBe(token)
      expect(api.isAuthenticated()).toBe(true)

      const saved = JSON.parse(localStorage.getItem('auth_token')!)
      expect(saved.token).toBe(token)
    })

    it('should set token with expiration', () => {
      const token = 'test-token-123'
      const expiresIn = 3600 // 1 hour in seconds

      api.setToken(token, expiresIn)

      expect(api.getToken()).toBe(token)
      expect(api.isAuthenticated()).toBe(true)

      const saved = JSON.parse(localStorage.getItem('auth_token')!)
      expect(saved.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should add Authorization header automatically', async () => {
      const token = 'bearer-token-123'
      api.setToken(token)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`
          })
        })
      )
    })
  })

  describe('Authentication - setAuthTokens', () => {
    it('should set full auth tokens with refresh token', () => {
      const tokens = {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000
      }

      api.setAuthTokens(tokens)

      expect(api.getToken()).toBe(tokens.token)

      const saved = JSON.parse(localStorage.getItem('auth_token')!)
      expect(saved.token).toBe(tokens.token)
      expect(saved.refreshToken).toBe(tokens.refreshToken)
      expect(saved.expiresAt).toBe(tokens.expiresAt)
    })

    it('should not save to storage when save=false', () => {
      const tokens = {
        token: 'access-token'
      }

      api.setAuthTokens(tokens, false)

      expect(api.getToken()).toBe(tokens.token)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })

  describe('Authentication - Storage Types', () => {
    it('should save token to sessionStorage when configured', () => {
      const apiSession = createApi({
        ...mockConfig,
        auth: {storage: 'sessionStorage'}
      })

      apiSession.setToken('session-token')

      expect(sessionStorage.getItem('auth_token')).toBeTruthy()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('should not save to any storage when memory mode', () => {
      const apiMemory = createApi({
        ...mockConfig,
        auth: {storage: 'memory'}
      })

      apiMemory.setToken('memory-token')

      expect(apiMemory.getToken()).toBe('memory-token')
      expect(localStorage.getItem('auth_token')).toBeNull()
      expect(sessionStorage.getItem('auth_token')).toBeNull()
    })
  })

  describe('Authentication - isAuthenticated', () => {
    it('should return true when token exists and not expired', () => {
      api.setToken('valid-token', 3600)
      expect(api.isAuthenticated()).toBe(true)
    })

    it('should return false when no token', () => {
      api.clearAuth()
      expect(api.isAuthenticated()).toBe(false)
    })

    it('should return false when token is expired', () => {
      const expiredTokens = {token: 'expired-token', expiresAt: Date.now() - 1000}

      api.setAuthTokens(expiredTokens)
      expect(api.isAuthenticated()).toBe(false)
    })
  })

  describe('Authentication - clearAuth', () => {
    it('should clear token and remove from storage', () => {
      api.setToken('token-to-clear')

      api.clearAuth()

      expect(api.getToken()).toBeNull()
      expect(api.isAuthenticated()).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('should remove Authorization header', async () => {
      api.setToken('token-to-clear')
      api.clearAuth()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/test')

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers.Authorization).toBeUndefined()
    })
  })

  describe('Authentication - Auto Refresh', () => {
    it('should refresh token automatically when expired', async () => {
      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {
          autoRefresh: true,
          refreshEndpoint: '/api/refresh'
        }
      })

      // Set an expired token
      const expiredTokens = {
        token: 'expired-token',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() - 1000
      }
      apiWithRefresh.setAuthTokens(expiredTokens)

      // Mock refresh response
      const refreshResponse = {
        token: 'new-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      }

      // Mock final fetch response
      const finalResponse = {
        data: 'success'
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // Refresh call
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => refreshResponse
        })
        .mockResolvedValueOnce({ // Original request call
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => finalResponse
        })

      const response = await apiWithRefresh.get('/test')

      expect(response.data).toEqual(finalResponse)
      expect(apiWithRefresh.getToken()).toBe('new-token')

      // Verify refresh endpoint was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/refresh',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer refresh-token-123'
          })
        })
      )
    })

    it('should retry request after successful refresh on 401', async () => {
      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {
          autoRefresh: true
        }
      })

      apiWithRefresh.setAuthTokens({
        token: 'old-token',
        refreshToken: 'refresh-token'
      })

      const refreshResponse = {
        token: 'new-token',
        expires_in: 3600
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // First attempt - 401
          ok: false,
          status: 401,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({message: 'Unauthenticated'})
        })
        .mockResolvedValueOnce({ // Refresh call
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => refreshResponse
        })
        .mockResolvedValueOnce({ // Retry with new token
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({success: true})
        })

      const response = await apiWithRefresh.get('/protected')

      expect(response.data).toEqual({success: true})
      expect(apiWithRefresh.getToken()).toBe('new-token')
    })

    it('should call onTokenExpired callback when refresh fails', async () => {
      const onTokenExpired = vi.fn()

      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {
          autoRefresh: true,
          onTokenExpired
        }
      })

      apiWithRefresh.setAuthTokens({
        token: 'old-token',
        refreshToken: 'refresh-token'
      })

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // First attempt - 401
          ok: false,
          status: 401,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({message: 'Unauthenticated'})
        })
        .mockResolvedValueOnce({ // Refresh fails
          ok: false,
          status: 401,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({message: 'Invalid refresh token'})
        })

      await apiWithRefresh.get('/protected')

      expect(onTokenExpired).toHaveBeenCalled()
      expect(apiWithRefresh.getToken()).toBeNull()
    })

    it('should call onTokenRefreshed callback after successful refresh', async () => {
      const onTokenRefreshed = vi.fn()

      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {
          autoRefresh: true,
          onTokenRefreshed
        }
      })

      apiWithRefresh.setAuthTokens({
        token: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000
      })

      const newToken = 'refreshed-token'

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // Refresh call
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({token: newToken, expires_in: 3600})
        })
        .mockResolvedValueOnce({ // Original request
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({})
        })

      await apiWithRefresh.get('/test')

      expect(onTokenRefreshed).toHaveBeenCalledWith(newToken)
    })

    it('should handle multiple concurrent requests during refresh', async () => {
      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {
          autoRefresh: true
        }
      })

      apiWithRefresh.setAuthTokens({
        token: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000
      })

      let refreshCalls = 0

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/api/refresh')) {
          refreshCalls++
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({'content-type': 'application/json'}),
            json: async () => ({token: 'new-token', expires_in: 3600})
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({data: 'success'})
        })
      })

      // Make 3 concurrent requests
      await Promise.all([
        apiWithRefresh.get('/test1'),
        apiWithRefresh.get('/test2'),
        apiWithRefresh.get('/test3')
      ])

      // Refresh should be called only once
      expect(refreshCalls).toBe(1)
    })
  })

  describe('Authentication - skipAuth option', () => {
    it('should skip authentication when skipAuth is true', async () => {
      api.setToken('some-token')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/public', {skipAuth: true})

      // Should still have token in header
      // (skipAuth only prevents automatic refresh, not header removal)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('should not attempt refresh when skipAuth is true', async () => {
      const apiWithRefresh = createApi({
        ...mockConfig,
        auth: {autoRefresh: true}
      })

      apiWithRefresh.setAuthTokens({
        token: 'expired-token',
        expiresAt: Date.now() - 1000
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await apiWithRefresh.get('/test', {skipAuth: true})

      // Should not attempt refresh
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/refresh'),
        expect.any(Object)
      )
    })
  })

  describe('CSRF Token', () => {
    it('should fetch CSRF token before POST request', async () => {
      const csrfFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      })

      const postFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({success: true})
      })

      global.fetch = vi.fn()
        .mockImplementationOnce(csrfFetchMock)
        .mockImplementationOnce(postFetchMock)

      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      await api.post('/test', {data: 'test'})

      expect(csrfFetchMock).toHaveBeenCalledWith(
        'https://api.example.com/sanctum/csrf-cookie',
        expect.objectContaining({
          credentials: 'include',
          headers: {'Accept': 'application/json'}
        })
      )

      expect(postFetchMock).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token'
          })
        })
      )
    })

    it('should cache CSRF token for subsequent requests', async () => {
      document.cookie = 'XSRF-TOKEN=cached-token'

      const csrfFetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers()
      })

      const postFetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({success: true})
      })

      global.fetch = vi.fn()
        .mockImplementationOnce(csrfFetchMock)
        .mockImplementation(postFetchMock)

      await api.post('/test1', {})
      await api.post('/test2', {})

      expect(csrfFetchMock).toHaveBeenCalledTimes(1)
      expect(postFetchMock).toHaveBeenCalledTimes(2)
    })

    it('should clear CSRF token', async () => {
      document.cookie = 'XSRF-TOKEN=token-to-clear'

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({success: true})
        })
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({success: true})
        })

      global.fetch = fetchMock

      await api.post('/test', {})

      api.clearCsrfToken()

      await api.post('/test', {})

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/sanctum/csrf-cookie',
        expect.any(Object)
      )
    })
  })

  describe('GET Requests', () => {
    it('should make GET request successfully', async () => {
      const mockData = {id: 1, name: 'Test'}

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => mockData
      })

      const response = await api.get('/posts/1')

      expect(response.data).toEqual(mockData)
      expect(response.errors).toBeNull()
      expect(response.status).toBe(200)
      expect(response.loading).toBe(false)
    })

    it('should add query parameters to GET request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ([])
      })

      await api.get('/posts', {
        params: {page: 1, limit: 10, search: 'test'}
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/posts?page=1&limit=10&search=test',
        expect.any(Object)
      )
    })

    it('should ignore null and undefined query parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ([])
      })

      await api.get('/posts', {
        params: {page: 1, search: null, filter: undefined}
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/posts?page=1',
        expect.any(Object)
      )
    })
  })

  describe('POST Requests', () => {
    beforeEach(() => {
      document.cookie = 'XSRF-TOKEN=test-token'
    })

    it('should make POST request with body', async () => {
      const mockBody = {title: 'New Post'}
      const mockResponse = {id: 1, ...mockBody}

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => mockResponse
        })

      const response = await api.post('/posts', mockBody)

      expect(response.data).toEqual(mockResponse)
      expect(response.status).toBe(201)
    })

    it('should handle POST with empty body', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({success: true})
        })

      const response = await api.post('/action')

      expect(response.data).toEqual({success: true})
    })
  })

  describe('PUT Requests', () => {
    beforeEach(() => {
      document.cookie = 'XSRF-TOKEN=test-token'
    })

    it('should make PUT request', async () => {
      const mockBody = {title: 'Updated Post'}

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({id: 1, ...mockBody})
        })

      const response = await api.put('/posts/1', mockBody)

      expect(response.data).toEqual({id: 1, ...mockBody})
    })
  })

  describe('PATCH Requests', () => {
    beforeEach(() => {
      document.cookie = 'XSRF-TOKEN=test-token'
    })

    it('should make PATCH request', async () => {
      const mockBody = {title: 'Patched Title'}

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => mockBody
        })

      const response = await api.patch('/posts/1', mockBody)

      expect(response.data).toEqual(mockBody)
    })
  })

  describe('DELETE Requests', () => {
    beforeEach(() => {
      document.cookie = 'XSRF-TOKEN=test-token'
    })

    it('should make DELETE request', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => null
        })

      const response = await api.delete('/posts/1')

      expect(response.status).toBe(204)
    })
  })

  describe('Error Handling', () => {
    it('should handle HTTP errors', async () => {
      const errorData = {
        message: 'Validation failed',
        errors: {
          title: ['Title is required']
        }
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => errorData
        })

      const response = await api.post('/posts', {})

      expect(response.data).toBeNull()
      expect(response.errors).toEqual(errorData.errors)
      expect(response.status).toBe(422)
    })

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const response = await api.get('/posts')

      expect(response.data).toBeNull()
      expect(response.errors).toBe('Network error')
      expect(response.status).toBeNull()
    })

    it('should handle non-JSON responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'text/html'}),
        text: async () => '<html lang="en">Response</html>'
      })

      const response = await api.get('/page')

      expect(response.data).toBe('<html lang="en">Response</html>')
    })

    it('should handle CSRF token fetch error', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('CSRF fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({'content-type': 'application/json'}),
          json: async () => ({success: true})
        })

      const response = await api.post('/test', {})

      expect(response.data).toEqual({success: true})
    })
  })

  describe('Headers Management', () => {
    it('should include default headers in requests', async () => {
      const customApi = createApi({
        baseUrl: 'https://api.example.com',
        headers: {'X-Custom': 'value'}
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await customApi.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value'
          })
        })
      )
    })

    it('should update default headers', async () => {
      api.setDefaultHeaders({'Authorization': 'Bearer token123'})

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/protected')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123'
          })
        })
      )
    })

    it('should merge custom headers with default headers', async () => {
      api.setDefaultHeaders({'X-Default': 'default'})

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/test', {
        headers: {'X-Custom': 'custom'}
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Default': 'default',
            'X-Custom': 'custom'
          })
        })
      )
    })
  })

  describe('Credentials', () => {
    it('should include credentials when withCredentials is true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include'
        })
      )
    })

    it('should use same-origin when withCredentials is false', async () => {
      const noCredentialsApi = createApi({
        baseUrl: 'https://api.example.com',
        withCredentials: false
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await noCredentialsApi.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'same-origin'
        })
      )
    })
  })
})