import type {Config, HttpMethod, RequestOptions, Response} from './types'

export class Api {
  private readonly baseUrl: string
  private csrfToken: string | null = null
  private readonly withCredentials: boolean
  private defaultHeaders: Record<string, string>

  constructor(config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.withCredentials = config.withCredentials ?? true
    this.defaultHeaders = config.headers ?? {}
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

      let data: any = null
      const contentType = response.headers.get('content-type')

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        return {
          data: null,
          errors: data?.errors || data?.message || data || 'Unknown error',
          loading: false,
          status: response.status
        }
      }

      return {
        data: data as T,
        errors: null,
        loading: false,
        status: response.status
      }
    } catch (error) {
      return {
        data: null,
        errors: error instanceof Error ? error.message : 'Request error',
        loading: false,
        status: null
      }
    }
  }

  /**
   * GET Request
   */
  async get<T = any>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'GET'})
  }

  /**
   * POST Reqeust
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