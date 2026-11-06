# SKEBOB AI — Cloudflare AI Worker

The Worker is only the AI API. Telegram authentication and application sessions remain centralized in the Supabase Edge Function `quick-function`.

## Architecture

- GitHub Pages serves the static frontend.
- Telegram OIDC is completed by Supabase Edge Function `quick-function`.
- Supabase stores Telegram profiles and hashed application-session tokens.
- This Worker validates the opaque app-session token by calling `quick-function` with `action: "session"` before every model request.
- Cloudflare Workers AI generates the assistant response.

The Worker does not exchange Telegram authorization codes, issue sessions, or maintain a second identity system.

## Configure and deploy

1. Install Wrangler and authenticate with your Cloudflare account.
2. Check `ALLOWED_ORIGIN` and `SUPABASE_FUNCTION_URL` in `wrangler.toml`.
3. From the `worker` directory, set the Supabase **publishable** key as a Worker secret:
   `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY`
   Paste the publishable key into the Wrangler prompt. Never use a Supabase service-role or secret key.
4. Deploy from the `worker` directory with `npx wrangler deploy`. The `[ai]` binding enables Workers AI.
5. Copy the actual `workers.dev` URL from Cloudflare's deployment output.
6. Put that exact URL into `AI_API_URL` near the top of the script in the root `index.html`.
7. Publish the website branch only after the Worker is deployed and tested.

## Request contract

- Method: `POST`
- Header: `Authorization: Bearer <SKEBOB app session token>`
- JSON body: `{ "messages": [{ "role": "user", "content": "..." }] }`
- Successful response: `{ "reply": "..." }`

Only the exact GitHub Pages origin is allowed. Requests without a valid Supabase application session are rejected. The Worker enforces payload and message-size limits.

## Important limits and launch checks

- Workers AI model availability and free-tier quotas can change. Confirm the model is enabled for your Cloudflare account and review current limits before launch.
- This prototype does not yet implement per-user rate limits, daily quotas, persistent chat history, or abuse monitoring. Add those before opening the chat broadly.
- The browser session token is an application token, not a Supabase Auth JWT. Never send it to Supabase PostgREST.
- Never put Telegram client secrets or Supabase service-role/secret keys in frontend code, this repository, or Worker variables.
