export interface Config {
  baseUrl: string
  useCsrfToken?: boolean
  withCredentials?: boolean
  headers?: Record<string, string>
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