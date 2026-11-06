# SKEBOB AI API

The static frontend is hosted on GitHub Pages. The chat API runs on Cloudflare Workers AI. Supabase is the planned system for user accounts and persistent data.

## Planned architecture

- GitHub Pages: static website.
- Supabase Auth: sign-in and user sessions (Google is a supported provider).
- Supabase Postgres: profiles and chat history, protected with Row Level Security (RLS).
- Cloudflare Worker + Workers AI: server-side AI chat endpoint.
- Telegram sign-in: a later integration, with server-side verification of Telegram's signed login data.

Supabase Auth manages identities and sessions. Do not build a parallel password table or store OAuth access tokens in the application database.

## Current status

- The Worker chat endpoint is a prototype and calls Workers AI.
- supabase/schema.sql is a database foundation only; it has not been applied to a Supabase project.
- The frontend does not yet have Supabase sign-in wired in.
- Chat history is not yet saved to Supabase.
- Google and Telegram sign-in, per-user quotas, media generation, PRO, credits, and payments are not implemented.

## Supabase setup (later step)

1. Create a Supabase project on the free plan, subject to its current limits and terms.
2. Review supabase/schema.sql before applying it in the Supabase SQL Editor.
3. Configure Google OAuth in Supabase Auth and the Google Cloud project.
4. Add the Supabase project URL and publishable key to the frontend only after RLS policies are reviewed and tested.
5. Implement and test sign-in, profile creation, and chat-history access before enabling these features publicly.

Do not put a Supabase secret/service-role key, OAuth client secret, or Telegram bot token in index.html, a public repository, or any browser code. Never share those secrets in chat.

## Cloudflare Worker

1. Select the Cloudflare Workers Free plan; do not upgrade for this prototype.
2. Deploy this folder as skebob-ai-api.
3. The Worker AI binding is configured in wrangler.toml.
4. Set API_BASE_URL in the root index.html to the deployed Worker URL.
5. Recheck Cloudflare's current model availability and free usage limits before launch.

The free tiers have quotas and may change. Do not promise unlimited AI or zero operating cost at every usage level. No OpenAI API key is needed for this prototype.

## Security notes

- The Worker checks the published site's exact Origin and validates request size and message structure.
- The browser must never receive provider secrets.
- Supabase RLS must remain enabled for every exposed table. Policies and grants must be tested; RLS is not a substitute for careful server-side validation.
- Add robust abuse controls and authenticated per-user quotas before public launch. The current chat prototype is not production-ready.
- Chat history can contain personal information. Tell users what is stored and provide a deletion path before enabling persistence.
- Payment verification and paid features are a separate later phase. Never grant credits based only on a browser redirect.
