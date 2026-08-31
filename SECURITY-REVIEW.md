# Security review summary

Date: 2026-08-31

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | src/app/api/project-managers/route.ts | 21-39 | Broken access control: GET /api/project-managers exposes project manager contact data to any authenticated user | 9/10 |

## Finding details

The GET handler for `/api/project-managers` only checks whether a valid session exists. It does not verify the caller has the required admin permission before running a `SELECT` against `project_managers`.

This allows any authenticated user to enumerate contact records (`id`, `name`, `email`, `phone`) for project managers. The route should enforce the same authorization gate used by the write operations and return `403 Forbidden` for unauthorized callers.

## Recommended remediation

- Require an explicit admin-level authorization check before querying `project_managers`.
- Return a `403` response for non-authorized callers instead of returning contact data.
- Reuse the existing permission helper and keep access checks consistent across the project manager API.
