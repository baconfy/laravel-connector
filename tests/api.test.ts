import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Config} from '../src'
import {Api, createApi} from '../src'

describe('Api', () => {
  let api: Api

  const mockConfig: Config = {baseUrl: 'https://api.example.com', withCredentials: true}

  beforeEach(() => {
    api = createApi(mockConfig)
    global.fetch = vi.fn()
  })

  describe('Constructor and Config', () => {
    it('should create an instance with correct config', () => {
      expect(api).toBeInstanceOf(Api)
    })

    it('should remove trailing slash from baseUrl', () => {
      const apiWithSlash = createApi({baseUrl: 'https://api.example.com/'})
      expect(apiWithSlash).toBeInstanceOf(Api)
    })

    it('should set default headers', () => {
      const customHeaders = {'X-Custom-Header': 'test'}
      const apiWithHeaders = createApi({...mockConfig, headers: customHeaders})
      expect(apiWithHeaders).toBeInstanceOf(Api)
    })
  })

  describe('CSRF Token', () => {
    it('should fetch CSRF token before POST request', async () => {
      const csrfFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      })

      // Mock da resposta do POST
      const postFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({success: true})
      })

      global.fetch = vi.fn()
        .mockImplementationOnce(csrfFetchMock)
        .mockImplementationOnce(postFetchMock)

      // Define o cookie CSRF
      document.cookie = 'XSRF-TOKEN=test-csrf-token'

      await api.post('/test', {data: 'test'})

      // Verifica se chamou o endpoint do CSRF
      expect(csrfFetchMock).toHaveBeenCalledWith(
        'https://api.example.com/sanctum/csrf-cookie',
        expect.objectContaining({
          credentials: 'include',
          headers: {'Accept': 'application/json'}
        })
      )

      // Verifica se o POST foi feito com o token
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

      // Primeira requisição - deve buscar o token
      await api.post('/test1', {})

      // Segunda requisição - deve usar o token cacheado
      await api.post('/test2', {})

      // CSRF deve ser chamado apenas 1 vez
      expect(csrfFetchMock).toHaveBeenCalledTimes(1)
      // POST deve ser chamado 2 vezes
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

      // Deve buscar CSRF 2 vezes (antes e depois do clear)
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
        .mockResolvedValueOnce({ok: true, headers: new Headers()}) // CSRF
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
        text: async () => '<html>Response</html>'
      })

      const response = await api.get('/page')

      expect(response.data).toBe('<html>Response</html>')
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

      // Deve continuar com a requisição mesmo sem CSRF
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