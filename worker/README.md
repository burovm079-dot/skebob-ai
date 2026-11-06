# Skebob AI API

Server-side chat API for the GitHub Pages frontend. The OpenAI key is stored as a Cloudflare Worker secret and is never sent to the browser.

## Before deployment

A parent or guardian should help manage the hosting account, API account, and any billing. Do not put API keys in GitHub files, browser JavaScript, screenshots, or chat messages.

## Configure and deploy

1. Install Wrangler on a trusted computer and sign in to the Cloudflare account.
2. From this directory, set the secret:
   `npx wrangler secret put OPENAI_API_KEY`
3. Deploy:
   `npx wrangler deploy`
4. Copy the Worker URL printed by Wrangler. It will look like `https://skebob-ai-api.<account-subdomain>.workers.dev`.
5. In the root `index.html`, set `API_BASE_URL` to that Worker URL and commit the change. Do not add the OpenAI key there.

## Security included

- Exact-origin CORS allowlist for the published GitHub Pages site.
- Cloudflare rate limit: 10 requests per IP per minute.
- Request size, message length, and conversation length validation.
- Generic client errors; provider details are not returned to visitors.
- Responses API requests use `store: false`.

Before making the site public with a paid API key, review usage limits and billing with the adult managing the account. The initial version does not yet include user accounts, per-user quotas, or billing. Do not enable paid media generation or payments until those systems are implemented and tested.
