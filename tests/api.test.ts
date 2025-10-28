import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {Api, createApi} from '../src'

describe('Api', () => {
  let api: Api

  beforeEach(() => {
    api = createApi({
      url: 'https://api.example.com',
      headers: {'X-Custom': 'test'}
    })

    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should remove trailing slash from URL', () => {
      const apiWithSlash = createApi({url: 'https://api.example.com/'})
      expect((apiWithSlash as any).url).toBe('https://api.example.com')
    })

    it('should set default configuration', () => {
      expect((api as any).url).toBe('https://api.example.com')
      expect((api as any).unwrap).toBe(true)
      expect((api as any).timeout).toBe(30000)
      expect((api as any).retries).toBe(0)
    })

    it('should accept custom configuration', () => {
      const customApi = createApi({
        url: 'https://api.example.com',
        unwrap: false,
        timeout: 5000,
        retries: 3,
        retryDelay: 500
      })

      expect((customApi as any).unwrap).toBe(false)
      expect((customApi as any).timeout).toBe(5000)
      expect((customApi as any).retries).toBe(3)
      expect((customApi as any).retryDelay).toBe(500)
    })
  })

  describe('buildUrl', () => {
    it('should build URL without parameters', () => {
      const url = (api as any).buildUrl('/users')
      expect(url).toBe('https://api.example.com/users')
    })

    it('should build URL with query parameters', () => {
      const url = (api as any).buildUrl('/users', {page: 1, limit: 10})
      expect(url).toBe('https://api.example.com/users?page=1&limit=10')
    })

    it('should skip null and undefined parameters', () => {
      const url = (api as any).buildUrl('/users', {page: 1, filter: null, sort: undefined})
      expect(url).toBe('https://api.example.com/users?page=1')
    })

    it('should handle array parameters', () => {
      const url = (api as any).buildUrl('/users', {ids: [1, 2, 3]})
      expect(url).toBe('https://api.example.com/users?ids=1&ids=2&ids=3')
    })
  })

  describe('request', () => {
    it('should make a successful GET request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'John'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.get('/users/1')

      expect(response.success).toBe(true)
      expect(response.status).toBe(200)
      expect(response.data).toEqual({id: 1, name: 'John'})
      expect(response.errors).toBeNull()
    })

    it('should handle error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'Not found'})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.get('/users/999')

      expect(response.success).toBe(false)
      expect(response.status).toBe(404)
      expect(response.data).toBeNull()
      expect(response.errors).toBe('Not found')
    })

    it('should unwrap single data property responses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'John'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.get('/users/1')

      expect(response.data).toEqual({id: 1, name: 'John'})
    })

    it('should not unwrap when disabled', async () => {
      const noUnwrapApi = createApi({
        url: 'https://api.example.com',
        unwrap: false
      })

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'John'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await noUnwrapApi.get('/users/1')

      expect(response.data).toEqual({data: {id: 1, name: 'John'}})
    })

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const response = await api.get('/users')

      expect(response.success).toBe(false)
      expect(response.data).toBeNull()
      expect(response.errors).toBe('Network error')
    })

    it('should include default headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: []})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.get('/users')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'test'
          })
        })
      )
    })
  })

  describe('HTTP methods', () => {
    it('should make POST request with body', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'John'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.post('/users', {name: 'John'})

      expect(response.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({name: 'John'})
        })
      )
    })

    it('should make PUT request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'Jane'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.put('/users/1', {name: 'Jane'})

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PUT'
        })
      )
    })

    it('should make PATCH request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {id: 1, name: 'Jane'}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.patch('/users/1', {name: 'Jane'})

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PATCH'
        })
      )
    })

    it('should make DELETE request', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.delete('/users/1')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'DELETE'
        })
      )
    })
  })

  describe('headers', () => {
    it('should set default headers', () => {
      api.setDefaultHeaders({'Authorization': 'Bearer token'})

      expect(api.getDefaultHeaders()).toMatchObject({
        'X-Custom': 'test',
        'Authorization': 'Bearer token'
      })
    })

    it('should merge headers correctly', () => {
      api.setDefaultHeaders({'Authorization': 'Bearer token'})

      const headers = api.getDefaultHeaders()
      expect(headers['X-Custom']).toBe('test')
      expect(headers['Authorization']).toBe('Bearer token')
    })
  })

  describe('interceptors', () => {
    it('should run request interceptors', async () => {
      const requestInterceptor = vi.fn((config) => {
        config.headers['X-Intercepted'] = 'true'
        return config
      })

      api.getInterceptors().use({
        onRequest: requestInterceptor
      })

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: []})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      await api.get('/users')

      expect(requestInterceptor).toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Intercepted': 'true'
          })
        })
      )
    })

    it('should run response interceptors', async () => {
      const responseInterceptor = vi.fn((response) => {
        return {...response, data: {modified: true}}
      })

      api.getInterceptors().use({
        onResponse: responseInterceptor
      })

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {original: true}})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.get('/users')

      expect(responseInterceptor).toHaveBeenCalled()
      expect(response.data).toEqual({modified: true})
    })

    it('should run error interceptors', async () => {
      const errorInterceptor = vi.fn((error) => {
        return {...error, message: 'Intercepted error'}
      })

      api.getInterceptors().use({
        onError: errorInterceptor
      })

      const mockResponse = {
        ok: false,
        status: 500,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'Server error'})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const response = await api.get('/users')

      expect(errorInterceptor).toHaveBeenCalled()
      expect(response.errors).toBe('Intercepted error')
    })
  })

  describe('retry logic', () => {
    it('should retry on retryable status codes', async () => {
      const apiWithRetry = createApi({
        url: 'https://api.example.com',
        retries: 2,
        retryDelay: 10
      })

      const mockFailure = {
        ok: false,
        status: 503,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'Service unavailable'})
      }

      const mockSuccess = {
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({data: {success: true}})
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFailure as any)
        .mockResolvedValueOnce(mockSuccess as any)

      const response = await apiWithRetry.get('/users')

      expect(response.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should not retry when skipRetry is true', async () => {
      const apiWithRetry = createApi({
        url: 'https://api.example.com',
        retries: 2
      })

      const mockFailure = {
        ok: false,
        status: 503,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({message: 'Service unavailable'})
      }

      vi.mocked(global.fetch).mockResolvedValueOnce(mockFailure as any)

      const response = await apiWithRetry.get('/users', {skipRetry: true})

      expect(response.success).toBe(false)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })
})
