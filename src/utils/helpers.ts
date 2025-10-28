/**
 * Creates a timeout promise that rejects after the specified duration
 *
 * @param {number} ms - The timeout duration in milliseconds
 * @return {Promise<never>} A promise that rejects with a timeout error
 */
export function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms)
  })
}

/**
 * Creates a delay promise that resolves after the specified duration
 *
 * @param {number} ms - The delay duration in milliseconds
 * @return {Promise<void>} A promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Checks if an error is an abort error
 *
 * @param {any} error - The error to check
 * @return {boolean} True if the error is an abort error
 */
export function isAbortError(error: any): boolean {
  return error?.name === 'AbortError' || error?.message?.includes('aborted')
}

/**
 * Checks if an HTTP status code is retryable
 *
 * @param {number | null} status - The HTTP status code
 * @return {boolean} True if the status is retryable
 */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true // Network errors
  return status === 408 || status === 429 || (status >= 500 && status < 600)
}

/**
 * Safely stringifies a value for JSON body
 *
 * @param {any} value - The value to stringify
 * @return {string | undefined} The stringified value or undefined
 */
export function safeStringify(value: any): string | undefined {
  if (value === undefined || value === null) return undefined
  
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/**
 * Merges headers objects safely
 *
 * @param {...Record<string, string>[]} headerObjects - Header objects to merge
 * @return {Record<string, string>} Merged headers
 */
export function mergeHeaders(...headerObjects: (Record<string, string> | undefined)[]): Record<string, string> | undefined {
  return headerObjects.reduce((acc, headers) => {
    if (!headers) return acc
    return { ...acc, ...headers }
  }, {})
}
