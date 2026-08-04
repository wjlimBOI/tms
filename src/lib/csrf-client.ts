// lib/csrf-client.ts
import { getCsrfToken } from "next-auth/react";

let cachedToken: string | null = null;

export async function getCsrfHeader(): Promise<{ "x-csrf-token": string }> {
  if (!cachedToken) {
    cachedToken = (await getCsrfToken()) as string;
  }
  return { "x-csrf-token": cachedToken };
}