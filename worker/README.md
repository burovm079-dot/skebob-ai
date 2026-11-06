# SKEBOB AI API

The static frontend is hosted on GitHub Pages. Telegram OIDC code exchange is currently prototyped as a Supabase Edge Function named `quick-function`. Supabase Postgres is the planned database for user profiles and persistent chat history. Cloudflare Worker remains an optional, undeployed AI-chat prototype.

## Planned architecture

- GitHub Pages: static website.
- Telegram: the only account sign-in method planned for SKEBOB AI.
- Supabase Edge Function `quick-function`: exchanges Telegram authorization codes and validates Telegram ID-token signatures and claims.
- A future trusted session layer: creates and validates app sessions and connects Telegram identities to Supabase user UUIDs.
- Supabase Postgres: profiles and chat history, protected with Row Level Security (RLS).

There will be no Google sign-in or email/password sign-in in this plan. Telegram user IDs must never be trusted just because the browser sends them; the backend validates Telegram's signed ID token before returning a profile.

## Current status

- The Supabase Edge Function `quick-function` has been deployed manually by the project owner; its deployed source has not been independently inspected in this repository.
- The intended function flow exchanges Telegram authorization codes using the registered redirect URI and PKCE verifier, then validates the ID-token nonce, signature, issuer, and audience.
- The GitHub Pages frontend and callback page now target the Supabase function. Replace the public-key placeholder in both files with the project's public anon/publishable key before testing.
- The callback currently confirms Telegram identity only. It does not create a durable application session, write a profile to `app_users`, or grant authenticated access to the chat. Do not treat login as production-ready.
- The Cloudflare Worker is not deployed. The existing Supabase schema was applied to the owner's project according to the owner's report, but its policies and grants still need review and testing.
- The frontend does not yet connect to Supabase.
- Chat history is not yet saved to Supabase.
- Per-user quotas, media generation, PRO, credits, and payments are not implemented.

## Telegram Login configuration

The BotFather configuration must include:

- Trusted Origin: `https://burovm079-dot.github.io`
- Redirect URI: `https://burovm079-dot.github.io/auth/callback/`
- Client ID: the public Telegram OIDC client identifier for the bot.

The frontend uses Authorization Code Flow with PKCE (S256). The callback checks the returned state against the browser's temporary session state. The Supabase Edge Function exchanges the authorization code server-side and validates the ID token using Telegram's published JWKS.

## Supabase Edge Function

1. In Supabase Project Settings → API, copy only the public anon/publishable key.
2. Replace `REPLACE_WITH_SUPABASE_PUBLISHABLE_OR_ANON_KEY` in `index.html` and `auth/callback/index.html` with that public key. Never use a `service_role` or secret key in browser code.
3. Confirm the deployed `quick-function` has the server-side Telegram Client ID, Client Secret, and exact redirect URI configured as secrets.
4. In BotFather, register the trusted origin `https://burovm079-dot.github.io` and redirect URI `https://burovm079-dot.github.io/auth/callback/`.
5. Test only after checking the deployed function source and CORS settings. The callback currently verifies identity only; it does not create a persistent app session or save a profile.

Do not paste Client Secret or AUTH_SESSION_SECRET into chat, GitHub, source files, screenshots, or browser code. If a secret is exposed, rotate it immediately.

## Supabase setup (later step)

1. Create a Supabase project on the free plan, subject to its current limits and terms.
2. Review supabase/schema.sql before applying it in the Supabase SQL Editor.
3. Connect verified Telegram identities to internal user UUIDs in the trusted backend.
4. Configure Supabase authentication/session integration and RLS only after selecting and testing a supported signing-key approach for the project.
5. Test account creation, session expiry/revocation, RLS, and chat-history access before enabling these features publicly.

Do not put a Supabase secret/service-role key, JWT signing secret, or Telegram bot token in index.html, a public repository, or any browser code. Never share those secrets in chat.

## Free-tier limits

The free tiers have quotas and may change. Do not promise unlimited AI or zero operating cost at every usage level. No OpenAI API key is needed for this prototype. Recheck Cloudflare's current model availability and free usage limits before launch.

## Security notes

- The Worker checks the published site's exact Origin and validates request size and message structure.
- The Telegram callback and exchange are a prototype, not a completed production identity system.
- The issued signed session token is not yet enforced by the chat endpoint.
- Add robust abuse controls and authenticated per-user quotas before public launch. The current chat prototype is not production-ready.
- Supabase RLS must remain enabled for every exposed table. Policies and grants must be tested; RLS is not a substitute for careful server-side validation.
- Chat history can contain personal information. Tell users what is stored and provide a deletion path before enabling persistence.
- Payment verification and paid features are a separate later phase. Never grant credits based only on a browser redirect.
