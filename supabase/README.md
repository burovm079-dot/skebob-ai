# Supabase Telegram sign-in

The browser only uses the Supabase publishable key in the `apikey` header. Never put a Supabase secret/service-role key or Telegram client secret in GitHub Pages.

## One-time database step

1. Open the Supabase SQL Editor for this project.
2. Run the contents of `supabase/migrations/20261106_add_app_sessions.sql`.
3. Confirm that `public.app_sessions` appears in Table Editor.

## Deploy the Edge Function

The deployable source is `supabase/functions/quick-function/index.ts`.

1. In Supabase Dashboard, open Edge Functions → `quick-function`.
2. Replace the function editor contents with the source file above and deploy the update.
3. Keep the existing Telegram secrets configured in Edge Function Secrets:
   - `TELEGRAM_CLIENT_ID`
   - `TELEGRAM_CLIENT_SECRET`
   - `TELEGRAM_REDIRECT_URI` = `https://burovm079-dot.github.io/auth/callback/`
4. The function also reads Supabase's server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Supabase provides these to Edge Functions; do not copy them into the website or GitHub.
5. Leave platform JWT verification enabled. The browser sends the publishable key in `apikey`, not as a Bearer token.

## Session behavior

- Telegram's authorization code is exchanged server-side and its ID token is verified against Telegram's JWKS.
- The function upserts the Telegram profile into `app_users`.
- It creates a cryptographically random opaque session token. Only its SHA-256 hash is stored in `app_sessions`.
- Sessions expire after seven days. The browser stores the raw token in `sessionStorage`.
- `action: "session"` checks a session and returns the profile; `action: "logout"` revokes it.

This is an application session handled by the Edge Function, not a Supabase Auth user JWT. Do not send it to Supabase PostgREST directly. Future protected application APIs must validate it through the Edge Function before accessing user data.

## Test checklist

1. Apply the SQL migration.
2. Deploy the Edge Function source.
3. Confirm Telegram BotFather has the exact website origin and redirect URI registered.
4. Merge/deploy the website branch only after reviewing the pull request.
5. Test a fresh Telegram sign-in, verify a row in `app_users` and a hashed row in `app_sessions`, refresh the site, then log out and confirm the session row is removed.
