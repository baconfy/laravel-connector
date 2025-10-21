import {Config, HttpMethod, RequestOptions, Response} from "./types";

export class Api {
  protected readonly baseUrl: string
  protected defaultHeaders: Record<string, string>

  /**
   * Creates a new instance of the class with the specified configuration.
   *
   * @param {Config} config - The configuration object for initializing the instance.
   * @param {string} config.baseUrl - The base URL for the instance, which will have trailing slashes removed.
   * @param {Object} [config.headers] - Optional default headers to include in requests.
   *
   * @return {void}
   */
  constructor(config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.defaultHeaders = config.headers ?? {}
  }

  /**
   * Builds a complete URL by combining the base URL, the specified endpoint, and optional query parameters.
   *
   * @param {string} endpoint - The endpoint path to append to the base URL.
   * @param {Record<string, any>} [params] - Optional query parameters as key-value pairs to be included in the URL.
   * @return {string} The complete URL as a string with the constructed query parameters, if provided.
   */
  protected buildUrl(endpoint: string, params?: Record<string, any>): string {
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
   * Sends an HTTP request to the specified endpoint with the provided options.
   *
   * @param {string} endpoint - The endpoint URL for the request.
   * @param {RequestOptions} [options] - Additional options for the request, such as method, headers, body, and query parameters.
   * @return {Promise<Response>} A promise that resolves to the response object containing data, errors, loading status, and HTTP status.
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<Response<T>> {
    const method = (options.method?.toUpperCase() ?? 'GET') as HttpMethod
    const url = this.buildUrl(endpoint, options.params)
    const credentials = options.credentials ?? 'same-origin'

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.defaultHeaders,
      ...(options.headers as Record<string, string>)
    }

    try {
      const response = await fetch(url, {...options, method, headers, credentials})

      let data: any
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

      return {data: data as T, errors: null, loading: false, status: response.status}
    } catch (error) {
      return {data: null, errors: error instanceof Error ? error.message : 'Request error', loading: false, status: null}
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
    return this.request<T>(endpoint, {...options, method: 'POST', body: body ? JSON.stringify(body) : undefined})
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
    return this.request<T>(endpoint, {...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined})
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
    return this.request<T>(endpoint, {...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined})
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