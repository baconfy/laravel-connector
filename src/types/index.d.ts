export interface Config {
  baseUrl: string
  headers?: Record<string, string>
  unwrap?: boolean
}

export interface SanctumConfig extends Config {
  useCsrfToken?: boolean
  withCredentials?: boolean
}

export interface Response<T = any> {
  data: T | null
  errors: any
  loading: boolean
  status: number | null
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, any>
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'