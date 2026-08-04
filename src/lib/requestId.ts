// lib/requestId.ts
import { randomUUID } from "crypto";

export function generateRequestId(): string {
  return randomUUID();
}

// Store request ID in a global context (AsyncLocalStorage for Next.js)
import { AsyncLocalStorage } from "async_hooks";

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function getRequestId(): string | null {
  return requestContext.getStore()?.requestId || null;
}