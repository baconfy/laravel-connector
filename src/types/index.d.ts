export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface Config {
  url: string
  headers?: Record<string, string>
  unwrap?: boolean
}

export interface SanctumConfig extends Config {
  useCsrfToken?: boolean
  withCredentials?: boolean
  csrfCookiePath: string | null
}

export interface Response<T = any> {
  data: T | null
  errors: any
  success: boolean
  status: number | null
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, any>
}