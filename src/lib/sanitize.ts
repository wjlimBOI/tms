import xss, { IFilterXSSOptions } from 'xss'

const xssOptions: IFilterXSSOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
}

/**
 * Sanitize a single string by stripping all HTML/script tags.
 */
export const sanitize = (input: string): string => {
  if (!input || typeof input !== 'string') return ''
  return xss(input.trim(), xssOptions)
}

/**
 * Recursively sanitize all string values in an object or array.
 * Returns the same type as the input.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitize(value)
    } else if (value && typeof value === 'object') {
      result[key] = sanitizeObject(value)
    } else {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Sanitize email: trim, lowercase, and remove dangerous characters.
 */
export const sanitizeEmail = (email: string): string => {
  if (!email || typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Sanitize phone: allow only digits, spaces, plus, and hyphen.
 */
export const sanitizePhone = (phone: string): string => {
  if (!phone || typeof phone !== 'string') return ''
  return phone.replace(/[^\d\s\+\-]/g, '').trim()
}