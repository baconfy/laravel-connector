export interface Config {
  baseUrl: string
  withCredentials?: boolean
  headers?: Record<string, string>
  auth?: AuthConfig
}

export interface AuthConfig {
  tokenKey?: string
  storage?: 'localStorage' | 'sessionStorage' | 'memory'
  autoRefresh?: boolean
  refreshEndpoint?: string
  onTokenExpired?: () => void | Promise<void>
  onTokenRefreshed?: (token: string) => void | Promise<void>
}

export interface Response<T = any> {
  data: T | null
  errors: any
  loading: boolean
  status: number | null
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, any>
  skipAuth?: boolean
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface AuthTokens {
  token: string
  refreshToken?: string
  expiresAt?: number
}