# PRD — Super 8 by Wyndham · 50th North Pub & Eatery — Unified System

## Original Problem
Private internal hospitality system with THREE surfaces from ONE backend + DB:
1. Main Web System (desktop PMS, sidebar nav) — hotel + bar management.
2. Bar Staff Mobile PWA (/bar-app) — dark mode, nightly inventory + sales entry, offline.
3. Owner Mobile PWA (/owner-app) — READ-ONLY, live WebSocket updates, dashboard-first.
Brand: Super 8 red #CC0000 + yellow #FFD700. Hotel & bar revenue ALWAYS separate.

## Architecture
- Backend: FastAPI + MongoDB (motor). Modules: core, auth, hotel, bar, reports, dashboard, admin, ai_assistant, server. JWT Bearer (24h). WebSocket /api/ws broadcasts all data-change events.
- Frontend: React + Tailwind + shadcn/ui. Routes: /login, /dashboard + modules, /bar-app, /owner-app. Fonts: Outfit / Plus Jakarta Sans / JetBrains Mono.
- AI: Emergent LLM key (OpenAI gpt-5.4), SSE streaming, live DB context injection, main web only.

## Personas
- Admin (full + Admin Settings via PIN), Manager (hotel+bar, no Admin Settings), Front Desk (hotel), Bar Staff (bar + bar PWA), Owner (owner PWA, read-only at API level).

## Implemented (2026-06-27)
- Auth + RBAC; owner read-only enforced server-side (require_write rejects owner → 403). Admin + owner seeded.
- Hotel: room setup (6 types, admin only), color-coded grid + ghost detection, availability blocking, reservations (check-in-now/future) with live 9% tax calc, edit/cancel/convert, standard + early checkout w/ refund, prepaid extension, housekeeping list, guest history, cash payouts + summary, manual log w/ PIN-gated edit/delete + audit.
- Bar: inventory setup (admin), nightly entry (auto used=open+recv-close, prefill opening from prev close), 3-field sales w/ NEGATIVE cash = tips owed, cash reconciliation + over/short, variance + below-par flags, late-entry, stock receiving, live inventory, item trends.
- Unified dashboard (separate hotel + bar panels), AI chat assistant (live data), unified Reports (hotel/bar/side-by-side · daily/weekly/monthly) with print + email(no-op) + admin edit w/ mandatory reason + audit.
- Admin Settings (PIN-gated): rooms, bar inventory, users, report emails, owner notification toggles, edit-logs viewer, change PIN.
- Bar Staff PWA: dark, number-pad inputs, item cards, localStorage autosave (30s) + offline submit queue + auto-sync, confirmation screen.
- Owner PWA: read-only dashboard, live WS updates + pull-to-refresh, hotel rooms/reservations, bar inventory/reports, missing-entry badge, 5-min auto-lock, Web Share PDF.
- PWA manifest + service worker (app-shell cache) for add-to-home-screen.

## Verified
- Backend 33/33 pytest pass (/app/backend/tests/test_super8_backend.py). Owner read-only, negative cash reconciliation, 9% tax, availability blocking, early-checkout refund, PIN gates all verified. Frontend critical flows verified by testing agent.

## Mocked / Deferred
- Report "Send by Email": no-op that logs recipients (no SMTP provider yet).
- Push notifications (FCM): deferred — owner uses WebSocket live updates + in-app red badge.
- Biometric unlock: auto-lock + tap-to-unlock placeholder (WebAuthn registration not implemented).

## Backlog (P1/P2)
- P1: Real email (Resend/SendGrid) for reports; FCM push for owner alerts.
- P1: Full WebAuthn biometric login on owner app.
- P2: IndexedDB (vs localStorage) for bar offline; report PDF rendering; replace native date inputs with shadcn Calendar; add DialogDescription for a11y.

## Next Actions
- Gather email provider keys to enable report emailing; confirm owner notification rules; optionally clear demo data to start empty.
