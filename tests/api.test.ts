import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Config} from '../src'
import {Api, createApi} from '../src'

describe('Api', () => {
  let api: Api

  const mockConfig: Config = {baseUrl: 'https://api.example.com'}

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
      expect(response.success).toBe(true)
      expect(response.errors).toBeNull()
      expect(response.status).toBe(200)
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
    it('should make POST request with body', async () => {
      const mockBody = {title: 'New Post'}
      const mockResponse = {id: 1, ...mockBody}

      global.fetch = vi.fn().mockResolvedValueOnce({
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
      global.fetch = vi.fn().mockResolvedValueOnce({
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
    it('should make PUT request', async () => {
      const mockBody = {title: 'Updated Post'}

      global.fetch = vi.fn().mockResolvedValueOnce({
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
    it('should make PATCH request', async () => {
      const mockBody = {title: 'Patched Title'}

      global.fetch = vi.fn().mockResolvedValueOnce({
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
    it('should make DELETE request', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => null
      })

      const response = await api.delete('/posts/1')

      expect(response.status).toBe(204)
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
})