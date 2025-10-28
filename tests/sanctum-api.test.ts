import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {SanctumConfig} from '../src'
import {createSanctumApi, SanctumApi} from '../src'

describe('SanctumApi (Laravel Specific)', () => {
  let api: SanctumApi

  const mockConfig: SanctumConfig = {baseUrl: 'https://api.example.com'}

  beforeEach(() => {
    api = createSanctumApi(mockConfig)
    global.fetch = vi.fn()
    if (typeof document !== 'undefined') document.cookie = ''
    vi.spyOn(global, 'fetch').mockClear()
  })


  describe('Credentials Management', () => {
    it('should include credentials when withCredentials is true (default)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await api.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({credentials: 'include'})
      )
    })

    it('should use same-origin when withCredentials is explicitly false', async () => {
      const noCredentialsSanctumApi = createSanctumApi({
        baseUrl: 'https://api.example.com',
        withCredentials: false
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({})
      })

      await noCredentialsSanctumApi.get('/test')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'same-origin'
        })
      )
    })
  })

  describe('CSRF Token Handling (Laravel Sanctum)', () => {
    it('should fetch CSRF token before POST request and include X-XSRF-TOKEN header', async () => {
      const csrfFetchMock = vi.fn().mockResolvedValueOnce({ok: true, headers: new Headers()})

      const postFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({success: true})
      })

      global.fetch = vi.fn().mockImplementationOnce(csrfFetchMock).mockImplementationOnce(postFetchMock)

      if (typeof document !== 'undefined') {
        document.cookie = 'XSRF-TOKEN=test-csrf-token%3B'
      }

      await api.post('/test', {data: 'test'})

      expect(csrfFetchMock).toHaveBeenCalledWith('https://api.example.com/sanctum/csrf-cookie', expect.any(Object))
      expect(postFetchMock).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-XSRF-TOKEN': 'test-csrf-token;'
          })
        })
      )
    })

    it('should cache CSRF token for subsequent requests (CSRF fetch only 1 time)', async () => {
      if (typeof document !== 'undefined') {
        document.cookie = 'XSRF-TOKEN=cached-token'
      }

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

      global.fetch = vi.fn().mockImplementationOnce(csrfFetchMock).mockImplementation(postFetchMock)

      await api.post('/test1', {})
      await api.post('/test2', {})

      expect(csrfFetchMock).toHaveBeenCalledTimes(1)
      expect(postFetchMock).toHaveBeenCalledTimes(2)

      expect(global.fetch).toHaveBeenCalledWith(
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

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({ok: true, status: 200, headers: new Headers({'content-type': 'application/json'}), json: async () => ({step: 1})})
        .mockResolvedValueOnce({ok: true, headers: new Headers()})
        .mockResolvedValueOnce({ok: true, status: 200, headers: new Headers({'content-type': 'application/json'}), json: async () => ({step: 2})})

      global.fetch = fetchMock

      await api.post('/test', {})
      api.clearCsrfToken()
      await api.post('/test', {})

      expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/sanctum/csrf-cookie', expect.any(Object))
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('should skip CSRF fetch when useCsrfToken is false', async () => {
      const apiNoCsrf = createSanctumApi({
        baseUrl: 'https://api.example.com',
        useCsrfToken: false
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'content-type': 'application/json'}),
        json: async () => ({success: true})
      })

      await apiNoCsrf.post('/test', {})

      expect(global.fetch).toHaveBeenCalledTimes(1)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-XSRF-TOKEN': expect.any(String)
          })
        })
      )
    })
  })
})
