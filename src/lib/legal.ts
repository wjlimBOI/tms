// Single source of truth for the currently published Terms of Service
// version, referenced by /terms (display) and the forced first-login
// change-password flow (acceptance recording). Bump this whenever the
// content of src/app/terms/page.tsx materially changes.
export const CURRENT_TERMS_VERSION = "2.0";

// Single source of truth for the currently published Privacy Policy
// version, referenced by /privacy (display) and admin/security's
// Compliance tab (so it can show which document version it was last
// reviewed against). Bump this whenever the content of
// src/app/privacy/page.tsx materially changes.
export const CURRENT_PRIVACY_VERSION = "2.1";
