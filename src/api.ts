import type {AuthConfig, AuthTokens, Config, HttpMethod, RequestOptions, Response} from './types'

export class Api {
  private readonly baseUrl: string
  private csrfToken: string | null = null
  private readonly withCredentials: boolean
  private defaultHeaders: Record<string, string>
  private authConfig: AuthConfig
  private authTokens: AuthTokens | null = null
  private refreshPromise: Promise<boolean> | null = null

  constructor(config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.withCredentials = config.withCredentials ?? true
    this.defaultHeaders = config.headers ?? {}
    this.authConfig = {
      tokenKey: config.auth?.tokenKey ?? 'auth_token',
      storage: config.auth?.storage ?? 'localStorage',
      autoRefresh: config.auth?.autoRefresh ?? false,
      refreshEndpoint: config.auth?.refreshEndpoint ?? '/api/refresh',
      ...config.auth
    }

    this.loadTokenFromStorage()
  }

  /**
   * Load auth token from storage
   */
  private loadTokenFromStorage(): void {
    if (typeof window === 'undefined') return

    try {
      const storageData = this.getStorage()?.getItem(this.authConfig.tokenKey!)

      if (storageData) {
        const tokens: AuthTokens = JSON.parse(storageData)
        this.setAuthTokens(tokens, false)
      }
    } catch (error) {
      console.error('Error loading token from storage:', error)
    }
  }

  /**
   * Save token to storage
   */
  private saveTokenToStorage(tokens: AuthTokens): void {
    if (typeof window === 'undefined') return

    try {
      const storage = this.getStorage()

      if (storage) {
        storage.setItem(this.authConfig.tokenKey!, JSON.stringify(tokens))
      }
    } catch (error) {
      console.error('Error saving token to storage:', error)
    }
  }

  /**
   * Remove token from storage
   */
  private removeTokenFromStorage(): void {
    if (typeof window === 'undefined') return

    try {
      const storage = this.getStorage()

      if (storage) {
        storage.removeItem(this.authConfig.tokenKey!)
      }
    } catch (error) {
      console.error('Error removing token from storage:', error)
    }
  }

  /**
   * Get storage object
   */
  private getStorage(): Storage | null {
    if (typeof window === 'undefined') return null

    switch (this.authConfig.storage) {
      case 'localStorage':
        return window.localStorage
      case 'sessionStorage':
        return window.sessionStorage
      case 'memory':
        return null
      default:
        return window.localStorage
    }
  }

  /**
   * Check if the token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.authTokens?.expiresAt) return false
    return Date.now() >= this.authTokens.expiresAt
  }

  /**
   * Try to refresh the token
   */
  private async refreshToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = (async () => {
      try {
        if (!this.authTokens?.refreshToken) {
          return false
        }

        const response = await fetch(`${this.baseUrl}${this.authConfig.refreshEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.authTokens.refreshToken}`
          },
          credentials: this.withCredentials ? 'include' : 'same-origin'
        })

        if (!response.ok) {
          throw new Error('Token refresh failed')
        }

        const data = await response.json()

        const newTokens: AuthTokens = {
          token: data.token || data.access_token,
          refreshToken: data.refresh_token || this.authTokens.refreshToken,
          expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined
        }

        this.setAuthTokens(newTokens)

        if (this.authConfig.onTokenRefreshed) {
          await this.authConfig.onTokenRefreshed(newTokens.token)
        }

        return true
      } catch (error) {
        console.error('Token refresh error:', error)

        this.clearAuth()

        if (this.authConfig.onTokenExpired) {
          await this.authConfig.onTokenExpired()
        }

        return false
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  /**
   * Set authentication tokens
   */
  setAuthTokens(tokens: AuthTokens, save: boolean = true): void {
    this.authTokens = tokens

    this.setDefaultHeaders({'Authorization': `Bearer ${tokens.token}`})

    if (save) {
      this.saveTokenToStorage(tokens)
    }
  }

  /**
   * Defines only the token
   */
  setToken(token: string, expiresIn?: number): void {
    const tokens: AuthTokens = {token, expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : undefined}
    this.setAuthTokens(tokens)
  }

  /**
   * Returns the current token
   */
  getToken(): string | null {
    return this.authTokens?.token ?? null
  }

  /**
   * Check if you are authenticated
   */
  isAuthenticated(): boolean {
    return !!this.authTokens?.token && !this.isTokenExpired()
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.authTokens = null
    this.removeTokenFromStorage()

    const {Authorization, ...rest} = this.defaultHeaders

    this.defaultHeaders = rest
  }

  /**
   * Request the CSRF token of Laravel Sanctum
   */
  private async getCsrfToken(): Promise<string | null> {
    if (this.csrfToken) return this.csrfToken

    try {
      await fetch(`${this.baseUrl}/sanctum/csrf-cookie`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      })

      const cookies = document.cookie.split(';')
      const csrfCookie = cookies.find(c => c.trim().startsWith('XSRF-TOKEN='))

      if (csrfCookie) {
        this.csrfToken = decodeURIComponent(csrfCookie.split('=')[1])
      }

      return this.csrfToken
    } catch (error) {
      console.error('CSRF Token request error:', error)
      return null
    }
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    return url.toString()
  }

  /**
   * Execute api request
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<Response<T>> {
    const method = (options.method?.toUpperCase() ?? 'GET') as HttpMethod

    if (!options.skipAuth && this.authConfig.autoRefresh && this.isTokenExpired()) {
      const refreshed = await this.refreshToken()

      if (!refreshed) {
        return {data: null, errors: 'Token expired and refresh failed', loading: false, status: 401}
      }
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      await this.getCsrfToken()
    }

    const url = this.buildUrl(endpoint, options.params)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.defaultHeaders,
      ...options.headers as Record<string, string>
    }

    if (this.csrfToken) {
      headers['X-XSRF-TOKEN'] = this.csrfToken
    }

    try {
      const response = await fetch(url, {...options, method, headers, credentials: this.withCredentials ? 'include' : 'same-origin'})

      if (response.status === 401 && this.authConfig.autoRefresh && !options.skipAuth) {
        const refreshed = await this.refreshToken()

        if (refreshed) {
          return this.request<T>(endpoint, {...options, skipAuth: true})
        }
      }

      let data: any = null
      const contentType = response.headers.get('content-type')

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        return {data: null, errors: data?.errors || data?.message || data || 'Unknown error', loading: false, status: response.status}
      }

      return {data: data as T, errors: null, loading: false, status: response.status}
    } catch (error) {
      return {data: null, errors: error instanceof Error ? error.message : 'Request error', loading: false, status: null}
    }
  }

  /**
   * GET Request
   */
  async get<T = any>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'GET'})
  }

  /**
   * POST Request
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'POST', body: body ? JSON.stringify(body) : undefined})
  }

  /**
   * PUT Request
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined})
  }

  /**
   * PATCH Request
   */
  async patch<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined})
  }

  /**
   * DELETE Request
   */
  async delete<T = any>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'DELETE'})
  }

  /**
   * Clear o CSRF token
   */
  clearCsrfToken(): void {
    this.csrfToken = null
  }

  /**
   * Update headers
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = {...this.defaultHeaders, ...headers}
  }
}

export function createApi(config: Config): Api {
  return new Api(config)
}