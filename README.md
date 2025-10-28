# Laravel Connector

A modern, type-safe TypeScript HTTP client for Laravel APIs with first-class Laravel Sanctum support.

## Features

- ✅ **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔐 **Laravel Sanctum**: Built-in CSRF token handling and cookie-based authentication
- 🔄 **Automatic Retries**: Configurable retry logic for failed requests
- ⚡ **Interceptors**: Request and response interceptors for custom logic
- 🎯 **Unwrapping**: Automatic response unwrapping for Laravel's data wrapper
- ⏱️ **Timeout Support**: Request timeout with AbortController
- 🧪 **Well Tested**: Comprehensive test coverage with Vitest
- 📦 **Tree-shakeable**: ESM and CJS support with optimal bundle size

## Installation

```bash
npm install laravel-connector
# or
pnpm add laravel-connector
# or
yarn add laravel-connector
```

## Quick Start

### Basic API Client

```typescript
import {createApi} from 'laravel-connector'

const api = createApi({
  url: 'https://api.example.com',
  headers: {
    'X-Custom-Header': 'value'
  }
})

// Make requests
const response = await api.get('/users')
if (response.success) {
  console.log(response.data)
}
```

### Laravel Sanctum Client

```typescript
import {createSanctumApi} from 'laravel-connector'

const api = createSanctumApi({
  url: 'https://api.example.com',
  withCredentials: true,
  useCsrfToken: true,
  csrfCookiePath: '/sanctum/csrf-cookie'
})

// Authenticate
await api.post('/login', {
  email: 'user@example.com',
  password: 'password'
})

// Make authenticated requests
const response = await api.get('/user')
```

## Configuration

### Api Configuration

```typescript
interface Config {
  url: string                    // Base API URL (required)
  headers?: Record<string, string> // Default headers
  unwrap?: boolean               // Auto-unwrap {data: ...} responses (default: true)
  timeout?: number               // Request timeout in ms (default: 30000)
  retries?: number               // Number of retry attempts (default: 0)
  retryDelay?: number            // Delay between retries in ms (default: 1000)
}
```

### Sanctum Configuration

```typescript
interface SanctumConfig extends Config {
  useCsrfToken?: boolean         // Enable CSRF protection (default: true)
  withCredentials?: boolean      // Include credentials (default: true)
  csrfCookiePath?: string        // CSRF cookie endpoint (default: '/sanctum/csrf-cookie')
}
```

## Usage Examples

### HTTP Methods

```typescript
// GET request
const users = await api.get('/users', {
  params: {page: 1, limit: 10}
})

// POST request
const newUser = await api.post('/users', {
  name: 'John Doe',
  email: 'john@example.com'
})

// PUT request
const updated = await api.put('/users/1', {
  name: 'Jane Doe'
})

// PATCH request
const patched = await api.patch('/users/1', {
  email: 'jane@example.com'
})

// DELETE request
await api.delete('/users/1')
```

### Response Handling

```typescript
const response = await api.get('/users')

if (response.success) {
  console.log('Data:', response.data)
  console.log('Status:', response.status)
} else {
  console.error('Error:', response.errors)
  console.error('Status:', response.status)
}
```

### Request Interceptors

```typescript
// Add authentication token to all requests
const removeInterceptor = api.getInterceptors().use({
  onRequest: async (config) => {
    const token = await getToken()
    config.headers['Authorization'] = `Bearer ${token}`
    return config
  }
})

// Remove interceptor when done
removeInterceptor()
```

### Response Interceptors

```typescript
// Transform all successful responses
api.getInterceptors().use({
  onResponse: async (response) => {
    return {
      ...response,
      data: transformData(response.data)
    }
  }
})
```

### Error Interceptors

```typescript
// Handle errors globally
api.getInterceptors().use({
  onError: async (error) => {
    if (error.status === 401) {
      // Redirect to login
      window.location.href = '/login'
    }
    return error
  }
})
```

### Retry Logic

```typescript
const api = createApi({
  url: 'https://api.example.com',
  retries: 3,           // Retry up to 3 times
  retryDelay: 1000      // Wait 1s between retries
})

// Make request with retries
const response = await api.get('/flaky-endpoint')

// Skip retry for specific request
const noRetry = await api.get('/no-retry', {
  skipRetry: true
})
```

### Timeout

```typescript
const api = createApi({
  url: 'https://api.example.com',
  timeout: 5000  // 5 second default timeout
})

// Override timeout for specific request
const response = await api.get('/slow-endpoint', {
  timeout: 10000  // 10 second timeout
})
```

### Custom Headers

```typescript
// Set default headers
api.setDefaultHeaders({
  'Authorization': 'Bearer token',
  'X-Custom': 'value'
})

// Add headers to specific request
const response = await api.get('/users', {
  headers: {
    'X-Request-ID': 'unique-id'
  }
})
```

### Query Parameters

```typescript
// Simple parameters
await api.get('/users', {
  params: {
    page: 1,
    limit: 10,
    sort: 'name'
  }
})
// GET /users?page=1&limit=10&sort=name

// Array parameters
await api.get('/users', {
  params: {
    ids: [1, 2, 3]
  }
})
// GET /users?ids=1&ids=2&ids=3

// Null/undefined values are skipped
await api.get('/users', {
  params: {
    filter: null,      // Skipped
    search: undefined  // Skipped
  }
})
```

### Laravel Sanctum Features

```typescript
const api = createSanctumApi({
  url: 'https://api.example.com'
})

// Initialize session (optional - happens automatically)
await api.initialize()

// Check if CSRF token is cached
if (api.hasCsrfToken()) {
  console.log('Session is active')
}

// Manually set CSRF token (useful for SSR)
api.setCsrfToken('token-from-cookie')

// Clear CSRF token (e.g., on logout)
api.clearCsrfToken()

// Get current CSRF token
const token = await api.getCsrfToken()
```

### Unwrapping Responses

Laravel often wraps responses in a `data` property. The connector automatically unwraps these:

```typescript
// Laravel returns: {data: {id: 1, name: "John"}}
// You get: {id: 1, name: "John"}

const response = await api.get('/users/1')
console.log(response.data) // {id: 1, name: "John"}

// Disable unwrapping
const api = createApi({
  url: 'https://api.example.com',
  unwrap: false
})

const response = await api.get('/users/1')
console.log(response.data) // {data: {id: 1, name: "John"}}
```

### Error Handling

```typescript
const response = await api.get('/users')

if (!response.success) {
  // Handle different error types
  if (response.status === 404) {
    console.log('Resource not found')
  } else if (response.status === 422) {
    console.log('Validation errors:', response.errors)
  } else if (response.status === null) {
    console.log('Network error:', response.errors)
  }
}
```

## TypeScript Support

The connector is fully typed with generics support:

```typescript
interface User {
  id: number
  name: string
  email: string
}

const response = await api.get<User>('/users/1')
if (response.success) {
  // response.data is typed as User
  console.log(response.data.name)
}

// Array responses
const users = await api.get<User[]>('/users')
if (users.success) {
  // users.data is typed as User[]
  users.data.forEach(user => console.log(user.name))
}
```

## Testing

The package includes comprehensive tests using Vitest:

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## API Reference

### Api Class

#### Methods

- `get<T>(endpoint, options?)` - GET request
- `post<T>(endpoint, body?, options?)` - POST request
- `put<T>(endpoint, body?, options?)` - PUT request
- `patch<T>(endpoint, body?, options?)` - PATCH request
- `delete<T>(endpoint, options?)` - DELETE request
- `request<T>(endpoint, options)` - Generic request
- `setDefaultHeaders(headers)` - Update default headers
- `getDefaultHeaders()` - Get current default headers
- `getInterceptors()` - Get interceptor manager

### SanctumApi Class

Extends `Api` with additional methods:

- `getCsrfToken()` - Fetch CSRF token
- `setCsrfToken(token)` - Manually set CSRF token
- `clearCsrfToken()` - Clear cached CSRF token
- `hasCsrfToken()` - Check if token is cached
- `initialize()` - Initialize Sanctum session

### Response Object

```typescript
interface Response<T> {
  data: T | null      // Response data
  errors: any         // Error message or validation errors
  success: boolean    // Request success status
  status: number | null // HTTP status code
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
