import {ApiError, Interceptor, InterceptorRequestConfig, Response} from '../types'

export class InterceptorManager {
  private interceptors: Interceptor[] = []

  /**
   * Adds an interceptor to the manager
   *
   * @param {Interceptor} interceptor - The interceptor to add
   * @return {() => void} A function to remove the interceptor
   */
  use(interceptor: Interceptor): () => void {
    this.interceptors.push(interceptor)
    
    return () => {
      const index = this.interceptors.indexOf(interceptor)
      if (index !== -1) {
        this.interceptors.splice(index, 1)
      }
    }
  }

  /**
   * Runs all request interceptors
   *
   * @param {InterceptorRequestConfig} config - The request configuration
   * @return {Promise<InterceptorRequestConfig>} The modified request configuration
   */
  async runRequestInterceptors(config: InterceptorRequestConfig): Promise<InterceptorRequestConfig> {
    let currentConfig = config

    for (const interceptor of this.interceptors) {
      if (interceptor.onRequest) {
        currentConfig = await interceptor.onRequest(currentConfig)
      }
    }

    return currentConfig
  }

  /**
   * Runs all response interceptors
   *
   * @param {Response<T>} response - The response object
   * @return {Promise<Response<T>>} The modified response object
   */
  async runResponseInterceptors<T>(response: Response<T>): Promise<Response<T>> {
    let currentResponse = response

    for (const interceptor of this.interceptors) {
      if (interceptor.onResponse) {
        currentResponse = await interceptor.onResponse(currentResponse)
      }
    }

    return currentResponse
  }

  /**
   * Runs all error interceptors
   *
   * @param {ApiError} error - The error object
   * @return {Promise<ApiError>} The modified error object
   */
  async runErrorInterceptors(error: ApiError): Promise<ApiError> {
    let currentError = error

    for (const interceptor of this.interceptors) {
      if (interceptor.onError) {
        currentError = await interceptor.onError(currentError)
      }
    }

    return currentError
  }

  /**
   * Clears all interceptors
   */
  clear(): void {
    this.interceptors = []
  }

  /**
   * Gets the number of registered interceptors
   *
   * @return {number} The number of interceptors
   */
  size(): number {
    return this.interceptors.length
  }
}
