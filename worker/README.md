# SKEBOB AI API

The static frontend is hosted on GitHub Pages. The chat API runs on Cloudflare Workers AI. Supabase is the planned database for user profiles and persistent chat history.

## Planned architecture

- GitHub Pages: static website.
- Telegram: the only account sign-in method planned for SKEBOB AI.
- Cloudflare Worker: verifies Telegram's signed login data on the server, manages the app session, and calls Workers AI.
- Supabase Postgres: profiles and chat history, protected with Row Level Security (RLS).

There will be no Google sign-in or email/password sign-in in this plan. Telegram user IDs must never be trusted just because the browser sends them; the backend must validate Telegram's signature and freshness before creating or looking up an account.

## Current status

- The Worker chat endpoint is a prototype and calls Workers AI.
- supabase/schema.sql is a database foundation only; it has not been applied to a Supabase project.
- Telegram sign-in and secure app-session issuance are not implemented.
- The frontend does not yet connect to Supabase.
- Chat history is not yet saved to Supabase.
- Per-user quotas, media generation, PRO, credits, and payments are not implemented.

## Supabase setup (later step)

1. Create a Supabase project on the free plan, subject to its current limits and terms.
2. Review supabase/schema.sql before applying it in the Supabase SQL Editor.
3. Implement Telegram login verification in the trusted backend.
4. Configure a secure, short-lived signed JWT/session so Supabase can apply RLS using the authenticated user's internal UUID. Keep signing credentials in backend secrets only; confirm the supported signing-key configuration for the project before implementation.
5. Test account creation, session expiry/revocation, RLS, and chat-history access before enabling these features publicly.

Do not put a Supabase secret/service-role key, JWT signing secret, or Telegram bot token in index.html, a public repository, or any browser code. Never share those secrets in chat.

## Cloudflare Worker

1. Select the Cloudflare Workers Free plan; do not upgrade for this prototype.
2. Deploy this folder as skebob-ai-api.
3. The Worker AI binding is configured in wrangler.toml.
4. Set API_BASE_URL in the root index.html to the deployed Worker URL.
5. Recheck Cloudflare's current model availability and free usage limits before launch.

The free tiers have quotas and may change. Do not promise unlimited AI or zero operating cost at every usage level. No OpenAI API key is needed for this prototype.

## Security notes

- The Worker checks the published site's exact Origin and validates request size and message structure.
- Telegram login data must be verified server-side, including its signature and authentication timestamp.
- The browser must never receive provider secrets or session-signing credentials.
- Supabase RLS must remain enabled for every exposed table. Policies and grants must be tested; RLS is not a substitute for careful server-side validation.
- Add robust abuse controls and authenticated per-user quotas before public launch. The current chat prototype is not production-ready.
- Chat history can contain personal information. Tell users what is stored and provide a deletion path before enabling persistence.
- Payment verification and paid features are a separate later phase. Never grant credits based only on a browser redirect.
