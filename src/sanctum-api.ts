import {Api} from './api'
import {HttpMethod, RequestOptions, Response, SanctumConfig} from './types'

export class SanctumApi extends Api {
  private csrfToken: string | null = null
  private csrfPromise: Promise<string | null> | null = null
  private readonly useCsrfToken: boolean
  private readonly withCredentials: boolean
  private readonly csrfCookiePath: string

  /**
   * Creates a new instance of SanctumApi with Laravel Sanctum support
   *
   * @param {SanctumConfig} config - The configuration object for Sanctum
   * @param {string} config.url - The base URL for the API
   * @param {boolean} [config.useCsrfToken=true] - Whether to use CSRF token protection
   * @param {boolean} [config.withCredentials=true] - Whether to include credentials in requests
   * @param {string} [config.csrfCookiePath=/sanctum/csrf-cookie] - The path to fetch CSRF cookie
   */
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
   * @returns {Promise<string | null>} The CSRF token or null if disabled/failed
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
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (!response.ok) {
          return null
        }

        let token: string | null = null

        // Try to get token from document cookies (browser environment)
        if (typeof document !== 'undefined' && document.cookie) {
          const cookies = document.cookie.split(';')
          const csrfCookie = cookies.find(c => c.trim().startsWith('XSRF-TOKEN='))

          if (csrfCookie) {
            token = decodeURIComponent(csrfCookie.split('=')[1])
          }
        } else {
          // Try to get token from Set-Cookie header (server environment)
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
   * Useful when the token becomes invalid or on logout
   */
  clearCsrfToken(): void {
    this.csrfToken = null
    this.csrfPromise = null
  }

  /**
   * Manually sets the CSRF token
   * Useful when you have the token from another source
   *
   * @param {string | null} token - The CSRF token to set
   */
  setCsrfToken(token: string | null): void {
    this.csrfToken = token
    this.csrfPromise = null
  }

  /**
   * Checks if a CSRF token is currently cached
   *
   * @return {boolean} True if a token is cached
   */
  hasCsrfToken(): boolean {
    return this.csrfToken !== null
  }

  /**
   * Sends an HTTP request with Sanctum CSRF token and credentials
   * Automatically fetches CSRF token for state-changing requests
   *
   * @param {string} endpoint - The endpoint URL for the request
   * @param {RequestOptions} [options] - Additional options for the request
   * @return {Promise<Response<T>>} A promise that resolves to the response
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<Response<T>> {
    const method = (options.method?.toUpperCase() ?? 'GET') as HttpMethod

    // Fetch CSRF token for state-changing requests
    if (this.useCsrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      await this.getCsrfToken()
    }

    const updatedOptions: RequestOptions = {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        ...(this.csrfToken ? {'X-XSRF-TOKEN': this.csrfToken} : {})
      },
      credentials: this.withCredentials ? 'include' : (options.credentials ?? 'same-origin')
    }

    const response = await super.request<T>(endpoint, updatedOptions)

    // Clear CSRF token on 419 (CSRF token mismatch) or 401 (Unauthenticated)
    if (response.status === 419 || response.status === 401) {
      this.clearCsrfToken()
    }

    return response
  }

  /**
   * Initializes the Sanctum session by fetching the CSRF token
   * This can be called on app initialization to warm up the session
   *
   * @return {Promise<boolean>} True if initialization was successful
   */
  async initialize(): Promise<boolean> {
    if (!this.useCsrfToken) return true

    const token = await this.getCsrfToken()
    return token !== null
  }
}

/**
 * Creates and returns an instance of the SanctumApi class using the provided configuration.
 *
 * @param {SanctumConfig} config - The configuration object to initialize the SanctumApi instance.
 * @return {SanctumApi} A new instance of the SanctumApi class configured with the given settings.
 */
export function createSanctumApi(config: SanctumConfig): SanctumApi {
  return new SanctumApi(config)
}