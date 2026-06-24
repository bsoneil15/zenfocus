# Threat Model

## Project Overview

This project is a production Pomodoro timer application with AI-generated ambient soundscapes. It uses a React/Vite frontend, an Express/Node backend, PostgreSQL via Drizzle ORM, Replit OIDC authentication, and Replit object storage for audio files. Signed-in users can create private soundscapes and access account-specific data; anonymous users can still reach some public API endpoints.

Production assumption for this scan: `NODE_ENV=production`, Replit terminates TLS for deployed traffic, and mockup/dev sandbox behavior is out of scope unless a path is clearly reachable in production.

## Assets

- **User identities and profile data** — Replit-authenticated user IDs, email addresses, names, and profile image URLs stored in the `users` table. Exposure would leak account-linked personal data.
- **Session state and authentication artifacts** — server-side session records and refresh/access-token-derived login state. Compromise would enable impersonation or persistence bypass.
- **Private soundscapes and prompts** — user-created prompts, generated audio URLs, and ownership metadata in `soundscapes`. These are user-authored artifacts and should not be exposed across accounts unless intentionally public.
- **Usage and activity data** — daily/hourly generation usage and stored Pomodoro session records. These are lower sensitivity than auth data but still should not be exposed or abusively modified without intent.
- **Application secrets and service credentials** — `SESSION_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, object-storage configuration, and webhook URLs. Exposure would directly affect confidentiality, integrity, or cost.
- **AI-generation quota and external API budget** — ElevenLabs/OpenAI-backed operations are cost-bearing and can be abused for denial of wallet if public controls fail.

## Trust Boundaries

- **Browser to Express API** — all client input is untrusted, including headers, route params, request bodies, and any client-maintained local state.
- **Express API to PostgreSQL** — API routes can read and mutate persisted user data. Broken authorization or unsafe query patterns here expose the full database.
- **Express API to object storage** — the app translates database ownership/visibility into object ACLs and `/objects/*` access decisions. Mismatch here can leak supposedly private audio.
- **Express API to external providers** — the server calls Replit OIDC, ElevenLabs, OpenAI, and optional webhook targets using privileged credentials.
- **Public to authenticated boundary** — public routes exist alongside user-specific routes. Server-side authorization must distinguish anonymous, authenticated, and owner-only actions.
- **Production to dev-only boundary** — Vite dev middleware, local attached assets, and other development scaffolding should be ignored unless production reachability is demonstrated.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/replit_integrations/auth/routes.ts`
- **Highest-risk code areas:** `server/replit_integrations/auth/`, `server/services/elevenlabs.ts`, `server/services/openai.ts`, `server/replit_integrations/object_storage/`, `server/storage.ts`, production static mounts in `server/index.ts`
- **Public surfaces:** `/api/soundscapes` (public rows only), `/api/soundscapes/:id` (public rows only unless owner session is present), `/api/rate-limit/status`, `/api/soundscapes/daily-limit`, `/api/soundscapes/hourly-limit`, `/api/health`, `/objects/*` (ACL-gated)
- **Authenticated/owner surfaces:** `/api/auth/user`, `/api/soundscapes/generate`, `/api/soundscapes/suggestions`, `/api/soundscapes/adopt`, `/api/soundscapes/mine`, `DELETE /api/soundscapes/:id`
- **Usually dev-only / lower-priority areas:** Vite setup in `server/vite.ts`, client-only localStorage state, mockup sandbox behavior. Legacy `attached_assets/` files are not mounted by the current production server code and should be ignored unless a future change reintroduces a static mount.

## Threat Categories

### Spoofing

Users authenticate through Replit OIDC and server-side sessions. Protected routes must require a valid authenticated session on every request, and any host-dependent callback or logout behavior must not let an attacker spoof trusted origins or bypass session checks.

### Tampering

The server accepts user-controlled prompts, session records, and route parameters. Input validation must happen server-side, ownership checks must gate destructive actions, and public clients must not be able to alter or create data in ways that undermine product rules, quota controls, or object ACLs.

### Information Disclosure

This application stores user profile data, private soundscape prompts, and private audio references. API responses, object-storage ACLs, logs, static mounts, and route-level authorization must prevent one user from learning another user’s personal data or private content. Error responses should stay generic and secrets must never appear in client code or logs.

### Denial of Service

AI generation endpoints can consume paid upstream quota. Public and authenticated cost-bearing endpoints must have durable rate limits and usage accounting that are hard to bypass across autoscaled instances, and external-service failures must fail closed without cascading into broad service instability or excessive retries. Operational provider-check endpoints must also be least-privilege and budget-protected so ordinary users cannot burn shared upstream quota.

### Elevation of Privilege

Authenticated users must not gain broader read access just because they are signed in. Routes returning account data, listing users, or serving private soundscape content must enforce least privilege server-side. Database visibility (`isPublic`, `ownerId`) and object-storage visibility must remain consistent so private assets do not become effectively public.
