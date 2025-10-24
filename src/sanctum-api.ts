import {Api} from "./api";
import {HttpMethod, RequestOptions, Response, SanctumConfig} from "./types";

export class SanctumApi extends Api {
  private csrfToken: string | null = null
  private readonly useCsrfToken: boolean
  private readonly withCredentials: boolean

  /**
   * Constructs a new instance of the class with the provided configuration.
   *
   * @param {SanctumConfig} config - The configuration object for initializing the instance.
   * @return {void} This constructor does not return any value.
   */
  constructor(config: SanctumConfig) {
    super(config)

    this.withCredentials = config.withCredentials ?? true
    this.useCsrfToken = config.useCsrfToken ?? true

    this.getCsrfToken()
  }

  /**
   * Retrieves the CSRF token either from the cached value or by requesting it from the server.
   * If the token is not already cached, it attempts to fetch the token from the `/sanctum/csrf-cookie` endpoint
   * and extracts it from the browser's cookies.
   *
   * @return {Promise<string | null>} A promise that resolves to the CSRF token as a string if available, or null if it cannot be retrieved.
   */
  private async getCsrfToken(): Promise<string | null> {
    if (!this.useCsrfToken) return null
    if (this.csrfToken) return this.csrfToken

    let token = null;

    try {
      const response = await fetch(`${this.baseUrl}/sanctum/csrf-cookie`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      })

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

      if (token) this.csrfToken = token
      return this.csrfToken

    } catch (error) {
      console.error('CSRF Token request error:', error)
      return null
    }
  }

  /**
   * Clears the CSRF token by setting it to null.
   *
   * @return {void} No return value.
   */
  clearCsrfToken(): void {
    this.csrfToken = null
  }

  /**
   * Sends an HTTP request to the specified endpoint with the provided options.
   *
   * @param {string} endpoint - The endpoint URL for the request.
   * @param {RequestOptions} [options] - Additional options for the request, such as method, headers, body, and query parameters.
   * @return {Promise<Response>} A promise that resolves to the response object containing data, errors, loading status, and HTTP status.
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

/**
 * Creates and returns an instance of the SanctumApi class using the provided configuration.
 *
 * @param {SanctumConfig} config - The configuration object to initialize the Api instance.
 * @return {SanctumApi} A new instance of the Api class configured with the given settings.
 */
export function createSanctumApi(config: SanctumConfig): SanctumApi {
  return new SanctumApi(config)
}