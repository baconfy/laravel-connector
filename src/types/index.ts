export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface Config {
  url: string
  headers?: Record<string, string>
  unwrap?: boolean
  timeout?: number
  retries?: number
  retryDelay?: number
}

export interface SanctumConfig extends Config {
  useCsrfToken?: boolean
  withCredentials?: boolean
  csrfCookiePath?: string
}

export interface Response<T = any> {
  data: T | null
  errors: any
  success: boolean
  status: number | null
}

export interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  params?: Record<string, any>
  timeout?: number
  method?: HttpMethod
  skipRetry?: boolean

  [key: string]: any
}

export interface ApiError {
  message: string
  status: number | null
  errors?: any
  data?: any
}

export interface Interceptor<T = any> {
  onRequest?: (config: InterceptorRequestConfig) => InterceptorRequestConfig | Promise<InterceptorRequestConfig>
  onResponse?: (response: Response<T>) => Response<T> | Promise<Response<T>>
  onError?: (error: ApiError) => ApiError | Promise<ApiError>
}

export interface InterceptorRequestConfig {
  url: string
  method: HttpMethod
  headers: Record<string, string> | undefined
  body?: any
  credentials?: RequestCredentials
  signal?: AbortSignal | null | undefined
}
