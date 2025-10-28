/**
 * Laravel Connector - Usage Examples
 * 
 * This file demonstrates various use cases and patterns
 * for using the laravel-connector package.
 */

import {createApi, createSanctumApi} from 'laravel-connector'

// ============================================================================
// BASIC API CLIENT
// ============================================================================

/**
 * Create a basic API client
 */
const basicApi = createApi({
  url: 'https://api.example.com',
  headers: {
    'X-App-Version': '1.0.0'
  }
})

/**
 * Simple GET request
 */
async function fetchUsers() {
  const response = await basicApi.get('/users', {
    params: {
      page: 1,
      limit: 20,
      sort: 'name'
    }
  })

  if (response.success) {
    console.log('Users:', response.data)
  } else {
    console.error('Error:', response.errors)
  }
}

/**
 * POST request with body
 */
async function createUser() {
  const response = await basicApi.post('/users', {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin'
  })

  if (response.success) {
    console.log('User created:', response.data)
  }
}

// ============================================================================
// LARAVEL SANCTUM CLIENT
// ============================================================================

/**
 * Create a Sanctum API client
 */
const sanctumApi = createSanctumApi({
  url: 'https://api.example.com',
  withCredentials: true,
  useCsrfToken: true,
  csrfCookiePath: '/sanctum/csrf-cookie'
})

/**
 * Complete authentication flow
 */
async function authenticationFlow() {
  // Initialize session (optional - happens automatically)
  await sanctumApi.initialize()

  // Login
  const loginResponse = await sanctumApi.post('/login', {
    email: 'user@example.com',
    password: 'password'
  })

  if (loginResponse.success) {
    console.log('Logged in successfully')

    // Fetch authenticated user
    const userResponse = await sanctumApi.get('/user')
    console.log('User:', userResponse.data)

    // Update profile
    await sanctumApi.put('/user/profile', {
      name: 'Updated Name'
    })

    // Logout
    await sanctumApi.post('/logout')
    sanctumApi.clearCsrfToken()
  }
}

// ============================================================================
// ADVANCED CONFIGURATION
// ============================================================================

/**
 * API client with retry logic and custom timeout
 */
const resilientApi = createApi({
  url: 'https://api.example.com',
  timeout: 5000,      // 5 second timeout
  retries: 3,         // Retry up to 3 times
  retryDelay: 1000    // Wait 1 second between retries
})

/**
 * Make a request that might fail
 */
async function resilientRequest() {
  const response = await resilientApi.get('/unstable-endpoint')
  
  if (response.success) {
    console.log('Request succeeded (possibly after retries)')
  } else {
    console.log('Request failed after all retries')
  }
}

// ============================================================================
// INTERCEPTORS
// ============================================================================

/**
 * Add authentication interceptor
 */
function setupAuthInterceptor() {
  const removeInterceptor = sanctumApi.getInterceptors().use({
    onRequest: async (config) => {
      // Add token from localStorage
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
      }
      
      // Add request timestamp
      config.headers['X-Request-Time'] = new Date().toISOString()
      
      return config
    },
    
    onResponse: async (response) => {
      // Log successful requests
      console.log('Request completed:', response.status)
      return response
    },
    
    onError: async (error) => {
      // Handle authentication errors
      if (error.status === 401) {
        console.log('Unauthorized - redirecting to login')
        window.location.href = '/login'
      }
      
      // Log errors
      console.error('Request failed:', error.message)
      
      return error
    }
  })

  // Remove interceptor when needed
  return removeInterceptor
}

/**
 * Add global loading indicator
 */
function setupLoadingInterceptor() {
  let activeRequests = 0

  sanctumApi.getInterceptors().use({
    onRequest: async (config) => {
      activeRequests++
      if (activeRequests === 1) {
        showLoadingIndicator()
      }
      return config
    },
    
    onResponse: async (response) => {
      activeRequests--
      if (activeRequests === 0) {
        hideLoadingIndicator()
      }
      return response
    },
    
    onError: async (error) => {
      activeRequests--
      if (activeRequests === 0) {
        hideLoadingIndicator()
      }
      return error
    }
  })
}

function showLoadingIndicator() {
  console.log('Loading...')
  // Implementation here
}

function hideLoadingIndicator() {
  console.log('Done loading')
  // Implementation here
}

// ============================================================================
// TYPESCRIPT EXAMPLES
// ============================================================================

/**
 * Define your data types
 */
interface User {
  id: number
  name: string
  email: string
  created_at: string
}

interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  total: number
  per_page: number
}

/**
 * Type-safe request
 */
async function fetchTypedUsers() {
  const response = await basicApi.get<PaginatedResponse<User>>('/users', {
    params: {page: 1}
  })

  if (response.success && response.data) {
    // response.data is typed as PaginatedResponse<User>
    response.data.data.forEach(user => {
      console.log(user.name) // TypeScript knows this is a string
    })
  }
}

/**
 * Type-safe POST request
 */
async function createTypedUser() {
  const response = await basicApi.post<User>('/users', {
    name: 'Jane Doe',
    email: 'jane@example.com'
  })

  if (response.success && response.data) {
    // response.data is typed as User
    console.log(`User ${response.data.name} created with ID ${response.data.id}`)
  }
}

// ============================================================================
// ERROR HANDLING PATTERNS
// ============================================================================

/**
 * Comprehensive error handling
 */
async function handleErrors() {
  const response = await basicApi.post('/users', {
    name: 'Test User'
  })

  if (!response.success) {
    // Check status code
    switch (response.status) {
      case 422:
        // Validation errors
        console.error('Validation failed:', response.errors)
        break
        
      case 404:
        console.error('Resource not found')
        break
        
      case 500:
        console.error('Server error')
        break
        
      case null:
        // Network error (no response from server)
        console.error('Network error:', response.errors)
        break
        
      default:
        console.error(`Error ${response.status}:`, response.errors)
    }
  }
}

/**
 * Retry specific requests manually
 */
async function manualRetry() {
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    const response = await basicApi.get('/critical-endpoint')
    
    if (response.success) {
      return response.data
    }
    
    attempts++
    if (attempts < maxAttempts) {
      console.log(`Attempt ${attempts} failed, retrying...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  throw new Error('Failed after all retries')
}

// ============================================================================
// REAL-WORLD PATTERNS
// ============================================================================

/**
 * API Service class pattern
 */
class UserService {
  private api = createSanctumApi({
    url: process.env.API_URL || 'https://api.example.com'
  })

  async getAll(page = 1) {
    return this.api.get<PaginatedResponse<User>>('/users', {
      params: {page}
    })
  }

  async getById(id: number) {
    return this.api.get<User>(`/users/${id}`)
  }

  async create(data: Omit<User, 'id' | 'created_at'>) {
    return this.api.post<User>('/users', data)
  }

  async update(id: number, data: Partial<User>) {
    return this.api.put<User>(`/users/${id}`, data)
  }

  async delete(id: number) {
    return this.api.delete(`/users/${id}`)
  }
}

/**
 * Use the service
 */
async function useUserService() {
  const userService = new UserService()

  // Get all users
  const users = await userService.getAll(1)
  
  // Create user
  const newUser = await userService.create({
    name: 'New User',
    email: 'new@example.com'
  })
  
  // Update user
  if (newUser.success && newUser.data) {
    await userService.update(newUser.data.id, {
      name: 'Updated Name'
    })
  }
}

/**
 * Repository pattern
 */
class Repository<T> {
  constructor(
    private api: ReturnType<typeof createSanctumApi>,
    private endpoint: string
  ) {}

  async findAll(params?: Record<string, any>) {
    return this.api.get<T[]>(this.endpoint, {params})
  }

  async findById(id: number) {
    return this.api.get<T>(`${this.endpoint}/${id}`)
  }

  async create(data: Partial<T>) {
    return this.api.post<T>(this.endpoint, data)
  }

  async update(id: number, data: Partial<T>) {
    return this.api.put<T>(`${this.endpoint}/${id}`, data)
  }

  async delete(id: number) {
    return this.api.delete(`${this.endpoint}/${id}`)
  }
}

/**
 * Use the repository
 */
const api = createSanctumApi({url: 'https://api.example.com'})
const userRepository = new Repository<User>(api, '/users')

async function useRepository() {
  const users = await userRepository.findAll({active: true})
  const user = await userRepository.findById(1)
}

// ============================================================================
// EXPORT EXAMPLES
// ============================================================================

export {
  basicApi,
  sanctumApi,
  resilientApi,
  UserService,
  Repository,
  fetchUsers,
  createUser,
  authenticationFlow,
  setupAuthInterceptor,
  setupLoadingInterceptor
}
