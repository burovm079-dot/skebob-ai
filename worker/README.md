# SKEBOB AI API

The static frontend is hosted on GitHub Pages. The chat API and Telegram OIDC code exchange run on Cloudflare Workers. Supabase is the planned database for user profiles and persistent chat history.

## Planned architecture

- GitHub Pages: static website.
- Telegram: the only account sign-in method planned for SKEBOB AI.
- Cloudflare Worker: exchanges Telegram authorization codes, validates Telegram ID-token signatures and claims, issues a signed application session token, and calls Workers AI.
- Supabase Postgres: profiles and chat history, protected with Row Level Security (RLS).

There will be no Google sign-in or email/password sign-in in this plan. Telegram user IDs must never be trusted just because the browser sends them; the backend validates Telegram's signed ID token before returning a profile.

## Current status

- The Worker has a prototype chat endpoint and a Telegram OIDC code-exchange endpoint.
- The OIDC exchange uses the registered redirect URI, PKCE verifier, nonce, Telegram JWKS signature verification, and issuer/audience/expiry checks.
- The frontend has a Telegram sign-in button and a callback page, but both still need the deployed Worker URL configured.
- The Worker is not deployed yet. Telegram credentials and session-signing secret are not configured.
- The signed app session token is issued but is not yet used to protect chat requests or restore a session after a new browser session. Do not treat sign-in as production-ready.
- supabase/schema.sql is a database foundation only; it has not been applied to a Supabase project.
- The frontend does not yet connect to Supabase.
- Chat history is not yet saved to Supabase.
- Per-user quotas, media generation, PRO, credits, and payments are not implemented.

## Telegram Login configuration

The BotFather configuration must include:

- Trusted Origin: `https://burovm079-dot.github.io`
- Redirect URI: `https://burovm079-dot.github.io/auth/callback/`
- Client ID: the public Telegram OIDC client identifier for the bot.

The frontend uses Authorization Code Flow with PKCE (S256). The callback checks the returned state against the browser's temporary session state. The Worker exchanges the authorization code server-side and validates the ID token using Telegram's published JWKS.

## Cloudflare Worker

1. Deploy this folder as `skebob-ai-api` on Cloudflare Workers.
2. Keep the AI binding configured in wrangler.toml.
3. In Worker Variables, set:
   - `ALLOWED_ORIGIN=https://burovm079-dot.github.io`
   - `TELEGRAM_CLIENT_ID` to the Client ID shown by BotFather.
   - `TELEGRAM_REDIRECT_URI=https://burovm079-dot.github.io/auth/callback/`
4. Add these as encrypted Worker secrets, not ordinary public variables:
   - `TELEGRAM_CLIENT_SECRET` — Client Secret from BotFather.
   - `AUTH_SESSION_SECRET` — a newly generated, long random signing secret.
5. After deployment, copy the Worker URL into `API_BASE_URL` in both `index.html` and `auth/callback/index.html`.
6. Test the full login flow with a test account before enabling it for users.

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
