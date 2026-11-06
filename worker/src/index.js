const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
});

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(decoder.decode(decodeBase64url(value)));
}

async function verifyTelegramIdToken(token, env, expectedNonce) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token");

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Unsupported ID token algorithm");
  }

  const keysResponse = await fetch("https://oauth.telegram.org/.well-known/jwks.json", {
    headers: { "Accept": "application/json" }
  });
  if (!keysResponse.ok) throw new Error("Unable to load Telegram signing keys");
  const jwks = await keysResponse.json();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Telegram signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64url(parts[2]),
    encoder.encode(parts[0] + "." + parts[1])
  );
  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = Array.isArray(claims.aud)
    ? claims.aud.includes(env.TELEGRAM_CLIENT_ID)
    : claims.aud === env.TELEGRAM_CLIENT_ID;

  if (!validSignature ||
      claims.iss !== "https://oauth.telegram.org" ||
      !audienceMatches ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      claims.nonce !== expectedNonce ||
      typeof claims.sub !== "string") {
    throw new Error("Telegram ID token validation failed");
  }

  return claims;
}

async function createSessionToken(claims, secret) {
  const payload = {
    sub: claims.sub,
    name: typeof claims.name === "string" ? claims.name.slice(0, 120) : "",
    username: typeof claims.preferred_username === "string" ? claims.preferred_username.slice(0, 64) : "",
    picture: typeof claims.picture === "string" && claims.picture.startsWith("https://")
      ? claims.picture.slice(0, 1000)
      : "",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encoded));
  return encoded + "." + base64url(new Uint8Array(signature));
}

async function handleTelegramExchange(request, env, origin) {
  if (!env.TELEGRAM_CLIENT_ID || !env.TELEGRAM_CLIENT_SECRET ||
      !env.TELEGRAM_REDIRECT_URI || !env.AUTH_SESSION_SECRET) {
    return json({ error: "Telegram Login ещё не настроен на сервере." }, 503, origin);
  }

  let body;
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > 10000) {
      return json({ error: "Запрос слишком большой." }, 413, origin);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Некорректный запрос авторизации." }, 400, origin);
  }

  const { code, code_verifier: verifier, nonce, redirect_uri: redirectUri } = body || {};
  if (typeof code !== "string" || code.length > 4096 ||
      typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      typeof nonce !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(nonce) ||
      redirectUri !== env.TELEGRAM_REDIRECT_URI) {
    return json({ error: "Параметры авторизации не прошли проверку." }, 400, origin);
  }

  const basic = btoa(env.TELEGRAM_CLIENT_ID + ":" + env.TELEGRAM_CLIENT_SECRET);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.TELEGRAM_REDIRECT_URI,
    client_id: env.TELEGRAM_CLIENT_ID,
    code_verifier: verifier
  });

  try {
    const tokenResponse = await fetch("https://oauth.telegram.org/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: form
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokens.id_token !== "string") {
      return json({ error: "Telegram не подтвердил вход. Попробуй начать авторизацию заново." }, 401, origin);
    }

    const claims = await verifyTelegramIdToken(tokens.id_token, env, nonce);
    const sessionToken = await createSessionToken(claims, env.AUTH_SESSION_SECRET);
    return json({
      session_token: sessionToken,
      user: {
        id: claims.sub,
        name: typeof claims.name === "string" ? claims.name : "",
        username: typeof claims.preferred_username === "string" ? claims.preferred_username : "",
        picture: typeof claims.picture === "string" ? claims.picture : ""
      }
    }, 200, origin);
  } catch (error) {
    console.error("Telegram login failed:", error?.message || "unknown_error");
    return json({ error: "Не удалось проверить вход через Telegram. Начни авторизацию заново." }, 401, origin);
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const origin = request.headers.get("Origin");

    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(allowedOrigin),
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/auth/exchange") {
      return handleTelegramExchange(request, env, allowedOrigin);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, allowedOrigin);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ error: "Бесплатная AI-модель ещё не подключена в Cloudflare." }, 503, allowedOrigin);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (encoder.encode(rawBody).byteLength > 24000) {
        return json({ error: "Сообщение слишком большое." }, 413, allowedOrigin);
      }
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Некорректный формат запроса." }, 400, allowedOrigin);
    }

    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
      return json({ error: "Некорректная история чата." }, 400, allowedOrigin);
    }

    const messages = [{
      role: "system",
      content: "Ты — Skebob AI, полезный, дружелюбный и безопасный AI-ассистент. Отвечай на языке пользователя. Если не уверен — честно скажи об этом."
    }];

    for (const item of body.messages) {
      if (!item || !["user", "assistant"].includes(item.role) ||
          typeof item.content !== "string" || item.content.length < 1 ||
          item.content.length > 6000) {
        return json({ error: "В сообщении обнаружен недопустимый формат." }, 400, allowedOrigin);
      }
      messages.push({ role: item.role, content: item.content });
    }

    if (messages[messages.length - 1].role !== "user") {
      return json({ error: "Последнее сообщение должно быть сообщением пользователя." }, 400, allowedOrigin);
    }

    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
        messages,
        max_tokens: 900,
        temperature: 0.6
      });

      const reply = typeof result?.response === "string" ? result.response.trim() : "";
      if (!reply) {
        console.error("Workers AI returned an empty response");
        return json({ error: "AI не вернул текстовый ответ. Попробуй ещё раз." }, 502, allowedOrigin);
      }

      return json({ reply }, 200, allowedOrigin);
    } catch (error) {
      console.error("Workers AI request failed:", error?.name || "unknown_error");
      return json({ error: "Бесплатный лимит AI мог закончиться или модель временно недоступна. Попробуй позже." }, 503, allowedOrigin);
    }
  }
};
