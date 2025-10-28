import {ApiError, Config, HttpMethod, InterceptorRequestConfig, RequestOptions, Response} from './types'
import {InterceptorManager} from './interceptors/InterceptorManager'
import {delay, isAbortError, isRetryableStatus, mergeHeaders, safeStringify} from './utils/helpers'

export class Api {
  protected readonly url: string
  protected readonly unwrap: boolean
  protected readonly timeout: number
  protected readonly retries: number
  protected readonly retryDelay: number
  protected defaultHeaders: Record<string, string>
  protected interceptors: InterceptorManager

  /**
   * Creates a new instance of the class with the specified configuration.
   *
   * @param {Config} config - The configuration object for initializing the instance.
   * @param {string} config.url - The base URL for the instance, which will have trailing slashes removed.
   * @param {Object} [config.headers] - Optional default headers to include in requests.
   * @param {boolean} [config.unwrap=true] - Whether to automatically unwrap single 'data' property responses.
   * @param {number} [config.timeout=30000] - Request timeout in milliseconds.
   * @param {number} [config.retries=0] - Number of retry attempts for failed requests.
   * @param {number} [config.retryDelay=1000] - Delay between retry attempts in milliseconds.
   *
   * @return {void}
   */
  constructor(config: Config) {
    this.url = config.url.replace(/\/$/, '')
    this.defaultHeaders = config.headers ?? {}
    this.unwrap = config.unwrap ?? true
    this.timeout = config.timeout ?? 30000
    this.retries = config.retries ?? 0
    this.retryDelay = config.retryDelay ?? 1000
    this.interceptors = new InterceptorManager()
  }

  /**
   * Builds a complete URL by combining the base URL, the specified endpoint, and optional query parameters.
   *
   * @param {string} endpoint - The endpoint path to append to the base URL.
   * @param {Record<string, any>} [params] - Optional query parameters as key-value pairs to be included in the URL.
   * @return {string} The complete URL as a string with the constructed query parameters, if provided.
   */
  protected buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(`${this.url}${endpoint}`)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, String(v)))
          } else {
            url.searchParams.append(key, String(value))
          }
        }
      })
    }

    return url.toString()
  }

  /**
   * Performs the actual fetch request with timeout support
   *
   * @param {string} url - The URL to fetch
   * @param {RequestInit} options - Fetch options
   * @param {number} timeout - Timeout in milliseconds
   * @return {Promise<globalThis.Response>} The fetch response
   */
  protected async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<globalThis.Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      return await fetch(url, {...options, signal: options.signal ?? controller.signal})
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Sends an HTTP request to the specified endpoint with the provided options.
   * Includes support for interceptors, retries, and timeouts.
   *
   * @param {string} endpoint - The endpoint URL for the request.
   * @param {RequestOptions} [options] - Additional options for the request, such as method, headers, body, and query parameters.
   * @return {Promise<Response>} A promise that resolves to the response object containing data, errors, loading status, and HTTP status.
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<Response<T>> {
    const method = (options.method?.toUpperCase() ?? 'GET') as HttpMethod
    const url = this.buildUrl(endpoint, options.params)
    const credentials = options.credentials ?? 'same-origin'
    const requestTimeout = options.timeout ?? this.timeout
    const maxRetries = options.skipRetry ? 0 : this.retries

    const headers = mergeHeaders(
      {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      this.defaultHeaders,
      options.headers as Record<string, string>
    )

    let lastError: ApiError | null = null
    let attempt = 0

    while (attempt <= maxRetries) {
      try {
        let interceptorConfig: InterceptorRequestConfig = {
          url,
          method,
          headers,
          body: options.body,
          credentials,
          signal: options.signal
        }

        interceptorConfig = await this.interceptors.runRequestInterceptors(interceptorConfig)

        // Perform the request
        const fetchOptions: RequestInit = {
          method: interceptorConfig.method,
          headers: interceptorConfig.headers,
          credentials: interceptorConfig.credentials,
          signal: interceptorConfig.signal,
          body: interceptorConfig.body
        }

        const response = await this.fetchWithTimeout(interceptorConfig.url, fetchOptions, requestTimeout)

        // Parse response
        let data: any
        const contentType = response.headers.get('content-type')

        if (contentType?.includes('application/json')) {
          data = await response.json()
        } else {
          data = await response.text()
        }

        // Handle error responses
        if (!response.ok) {
          const error: ApiError = {
            message: data?.message || data?.errors || data || 'Unknown error',
            status: response.status,
            errors: data?.errors,
            data
          }

          const processedError = await this.interceptors.runErrorInterceptors(error)

          // Check if we should retry
          if (attempt < maxRetries && isRetryableStatus(response.status)) {
            lastError = processedError
            attempt++
            await delay(this.retryDelay * attempt)
            continue
          }

          return {
            errors: processedError.errors || processedError.message,
            status: processedError.status,
            success: false,
            data: null
          }
        }

        // Unwrap data if needed
        let finalData = data
        if (this.unwrap && data && typeof data === 'object' && 'data' in data && Object.keys(data).length === 1) {
          finalData = data.data
        }

        const successResponse: Response<T> = {
          data: finalData as T,
          errors: null,
          success: true,
          status: response.status
        }

        // Run response interceptors
        return await this.interceptors.runResponseInterceptors(successResponse)

      } catch (error) {
        // Don't retry on abort errors
        if (isAbortError(error)) {
          return {
            data: null,
            errors: 'Request aborted',
            success: false,
            status: null
          }
        }

        const apiError: ApiError = {
          message: error instanceof Error ? error.message : 'Request error',
          status: null
        }

        const processedError = await this.interceptors.runErrorInterceptors(apiError)

        // Check if we should retry
        if (attempt < maxRetries && isRetryableStatus(null)) {
          lastError = processedError
          attempt++
          await delay(this.retryDelay * attempt)
          continue
        }

        return {
          data: null,
          errors: processedError.message,
          success: false,
          status: processedError.status
        }
      }
    }

    // If we've exhausted all retries
    return {
      data: null,
      errors: lastError?.message || 'Request failed after retries',
      success: false,
      status: lastError?.status || null
    }
  }

  /**
   * Sends a GET request to the specified endpoint with the provided options.
   *
   * @param {string} endpoint - The API endpoint to send the GET request to.
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options] - Optional configuration for the request, excluding the method and body.
   * @return {Promise<Response>} A promise that resolves with the response of the GET request.
   */
  async get<T = any>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'GET'})
  }

  /**
   * Sends an HTTP POST request to the specified endpoint with the provided body and options.
   *
   * @param {string} endpoint - The URL or endpoint where the POST request should be sent.
   * @param {any} [body] - The request body to be sent with the POST request. It will be JSON-stringified if provided.
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options] - Optional request options excluding the 'method' and 'body' properties.
   * @return {Promise<Response>} - A promise resolving to the HTTP response containing the generic type T.
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: safeStringify(body)
    })
  }

  /**
   * Sends a PUT request to the specified endpoint with the provided request body and options.
   *
   * @param {string} endpoint - The API endpoint to which the PUT request is sent.
   * @param {any} [body] - The payload to be included in the request body. It will be serialized as JSON if provided.
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options] - Additional request options excluding the `method` and `body` properties.
   * @return {Promise<Response>} A promise that resolves to the server's response, typed for the expected response body.
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: safeStringify(body)
    })
  }

  /**
   * Sends an HTTP PATCH request to the specified endpoint with the provided body and options.
   *
   * @param {string} endpoint - The endpoint URL to send the PATCH request to.
   * @param {any} [body] - The request payload to be sent as the body of the PATCH request. Optional.
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options] - Additional request options excluding `method` and `body`. Optional.
   * @return {Promise<Response>} A promise that resolves to the response of the request, with the response data typed as `T`.
   */
  async patch<T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: safeStringify(body)
    })
  }

  /**
   * Sends a DELETE request to the specified endpoint with the provided options.
   *
   * @param {string} endpoint - The endpoint to send the DELETE request to.
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options] - The request options excluding method and body.
   * @return {Promise<Response>} A promise that resolves to the response of the DELETE request.
   */
  async delete<T = any>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Response<T>> {
    return this.request<T>(endpoint, {...options, method: 'DELETE'})
  }

  /**
   * Updates and sets the default headers used in requests by merging the given headers with existing ones.
   *
   * @param {Record<string, string>} headers - An object containing key-value pairs representing the headers to be added or updated.
   * @return {void} This method does not return a value.
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = {...this.defaultHeaders, ...headers}
  }

  /**
   * Gets the current default headers
   *
   * @return {Record<string, string>} The current default headers
   */
  getDefaultHeaders(): Record<string, string> {
    return {...this.defaultHeaders}
  }

  /**
   * Gets the interceptor manager for adding request/response interceptors
   *
   * @return {InterceptorManager} The interceptor manager instance
   */
  getInterceptors(): InterceptorManager {
    return this.interceptors
  }
}

/**
 * Creates and returns an instance of the Api class using the provided configuration.
 *
 * @param {Config} config - The configuration object to initialize the Api instance.
 * @return {Api} A new instance of the Api class configured with the given settings.
 */
export function createApi(config: Config): Api {
  return new Api(config)
}
