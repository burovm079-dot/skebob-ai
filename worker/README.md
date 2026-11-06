# Skebob AI API

Server-side chat API for the GitHub Pages frontend. The first chat model uses Cloudflare Workers AI, so no OpenAI API key or paid OpenAI account is needed for this prototype.

## Free-tier notes

- Cloudflare Workers AI currently includes 10,000 Neurons per day at no charge on Workers Free.
- The daily free allocation is limited and shared by all Workers AI usage on the account. When it runs out, chat requests may stop until the daily reset.
- Cloudflare Workers Free also has request limits. Check the current official pricing and limits before launch.
- Free tiers and model availability can change. Do not promise unlimited free AI.

## Configure and deploy

1. Open the Cloudflare dashboard and select the account that owns the Worker.
2. Confirm the Workers Free plan is selected. Do not upgrade to a paid plan for this setup.
3. In Workers & Pages, create a Worker named `skebob-ai-api`, or deploy this folder using Wrangler from a trusted computer.
4. The Wrangler config enables the Workers AI binding (`AI`) and an IP-based rate limit.
5. Deploy the Worker and copy its URL, for example `https://skebob-ai-api.<account-subdomain>.workers.dev`.
6. In the root `index.html`, set `API_BASE_URL` to that Worker URL and commit the change.

No OpenAI key is required for this first free chat version.

## Security included

- Exact-origin CORS allowlist for the published GitHub Pages site.
- Per-IP rate limiting: 10 requests per minute.
- Request size, message length, and conversation length validation.
- Generic client errors; internal provider details are not returned to visitors.
- The model is called server-side; the browser never receives provider credentials.

## Not implemented yet

User accounts, Google/Telegram sign-in, persistent chat history, user-level quotas, paid media generation, PRO, credits, and payments are not implemented yet. Add authentication before storing personal chat history or introducing account-specific balances. Do not enable paid media generation or payments until those systems are implemented and tested.
