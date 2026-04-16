# Gemini Frontend Integration

The old frontend-only Gemini summary route has been removed as part of the production deployment cleanup.

## Current state

- There is no longer a Next.js API route for Gemini in the frontend.
- There is no committed frontend Gemini API key configuration.
- Gemini-powered route selection now lives only in the FastAPI backend through `/select_best_route`.

## Why this changed

- It removes an unused API surface from the frontend.
- It keeps Gemini credentials on the backend only.
- It simplifies Vercel deployment and avoids duplicate AI integrations.
