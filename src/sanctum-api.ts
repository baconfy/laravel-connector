import {Api} from "./api.js";
import {HttpMethod, RequestOptions, Response, SanctumConfig} from "./types/index.js";

export class SanctumApi extends Api {
  private csrfToken: string | null = null
  private csrfPromise: Promise<string | null> | null = null
  private readonly useCsrfToken: boolean
  private readonly withCredentials: boolean
  private readonly csrfCookiePath: string

  constructor(config: SanctumConfig) {
    super(config)

    this.withCredentials = config.withCredentials ?? true
    this.useCsrfToken = config.useCsrfToken ?? true
    this.csrfCookiePath = config.csrfCookiePath ?? '/sanctum/csrf-cookie'
  }

  /**
   * Retrieves the CSRF token lazily (only when needed)
   * Can be called manually to warm up the session
   * Uses a promise to prevent duplicate requests
   *
   * @returns Promise<string | null> The CSRF token or null if disabled/failed
   */
  async getCsrfToken(): Promise<string | null> {
    if (!this.useCsrfToken) return null
    if (this.csrfToken) return this.csrfToken

    // If already fetching, return the existing promise
    if (this.csrfPromise) {
      return this.csrfPromise
    }

    this.csrfPromise = (async () => {
      try {
        const response = await fetch(`${this.url}${this.csrfCookiePath}`, {
          headers: {'Accept': 'application/json'},
          credentials: 'include',
        })

        let token: string | null = null

        if (typeof document !== 'undefined' && document.cookie) {
          const cookies = document.cookie.split(';')
          const csrfCookie = cookies.find(c => c.trim().startsWith('XSRF-TOKEN='))

          if (csrfCookie) {
            token = decodeURIComponent(csrfCookie.split('=')[1])
          }
        } else {
          const setCookieHeader = response.headers.get('set-cookie')

          if (setCookieHeader) {
            const xsrfMatch = setCookieHeader.match(/XSRF-TOKEN=([^;]+)/)

            if (xsrfMatch && xsrfMatch[1]) {
              token = decodeURIComponent(xsrfMatch[1])
            }
          }
        }

        if (token) {
          this.csrfToken = token
        }

        return this.csrfToken
      } catch (error) {
        return null
      } finally {
        this.csrfPromise = null
      }
    })()

    return this.csrfPromise
  }

  /**
   * Clears the CSRF token cache
   */
  clearCsrfToken(): void {
    this.csrfToken = null
    this.csrfPromise = null
  }

  /**
   * Sends an HTTP request with Sanctum CSRF token
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<Response<T>> {
    const method = (options.method?.toUpperCase() ?? 'GET') as HttpMethod

    if (this.useCsrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      await this.getCsrfToken()
    }

    const updatedOptions: RequestOptions = {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        ...(this.csrfToken ? {'X-XSRF-TOKEN': this.csrfToken} : {})
      },
      credentials: this.withCredentials ? 'include' : 'same-origin'
    }

    return super.request<T>(endpoint, updatedOptions)
  }
}

export function createSanctumApi(config: SanctumConfig): SanctumApi {
  return new SanctumApi(config)
}