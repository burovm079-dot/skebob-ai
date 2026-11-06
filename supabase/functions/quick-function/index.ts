import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v5.9.6/index.ts";

const ALLOWED_ORIGIN = "https://burovm079-dot.github.io";
const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Server configuration is incomplete.");
  return value;
}

function supabaseHeaders(serviceKey: string) {
  return {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(serviceKey), ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("Supabase database request failed:", response.status, text.slice(0, 500));
    throw new Error("Could not save the account. Please try again.");
  }
  return text ? JSON.parse(text) : null;
}


async function verifyTelegramMiniAppData(initData, botToken) {
  if (typeof initData !== "string" || initData.length < 1 || initData.length > 8192) {
    throw new Error("Invalid Telegram Mini App data.");
  }
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash) ||
      !Number.isInteger(authDate) || authDate > Math.floor(Date.now() / 1000) + 60 ||
      Math.floor(Date.now() / 1000) - authDate > 86400) {
    throw new Error("Telegram Mini App authorization data is missing or expired.");
  }
  const entries = [...params.entries()]
    .filter(([key]) => key !== "hash" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const encoder = new TextEncoder();
  const tokenKey = await crypto.subtle.importKey(
    "raw", encoder.encode(botToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const secretKey = await crypto.subtle.sign("HMAC", tokenKey, encoder.encode("WebAppData"));
  const validationKey = await crypto.subtle.importKey(
    "raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const calculated = new Uint8Array(await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString)));
  const calculatedHex = Array.from(calculated, byte => byte.toString(16).padStart(2, "0")).join("");
  if (calculatedHex.length !== receivedHash.length) throw new Error("Telegram signature is invalid.");
  let diff = 0;
  for (let i = 0; i < calculatedHex.length; i++) diff |= calculatedHex.charCodeAt(i) ^ receivedHash.toLowerCase().charCodeAt(i);
  if (diff !== 0) throw new Error("Telegram signature is invalid.");
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user data is missing.");
  const user = JSON.parse(rawUser);
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot === true) {
    throw new Error("Telegram user data is invalid.");
  }
  return user;
}

async function createSession(userId: string) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const sessionToken = base64Url(tokenBytes);
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabaseRequest("app_sessions", {
    method: "POST",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    }),
  });
  return { sessionToken, expiresAt };
}

async function getSession(sessionToken: string) {
  if (typeof sessionToken !== "string" || sessionToken.length < 30 || sessionToken.length > 200) {
    return null;
  }
  const tokenHash = await sha256Hex(sessionToken);
  const rows = await supabaseRequest(
    `app_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,expires_at`,
  );
  if (!Array.isArray(rows) || rows.length !== 1) return null;

  const users = await supabaseRequest(
    `app_users?id=eq.${rows[0].user_id}&select=id,telegram_user_id,telegram_username,display_name,avatar_url`,
  );
  if (!Array.isArray(users) || users.length !== 1) return null;
  return { user: users[0], expires_at: rows[0].expires_at };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const origin = request.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);

  try {
    const body = await request.json();
    const action = body?.action || "login";

    if (action === "miniapp-login") {
      const botToken = requiredEnv("TELEGRAM_BOT_TOKEN");
      let telegramUser: Record<string, unknown>;
      try {
        telegramUser = await verifyTelegramMiniAppData(body.init_data, botToken);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Telegram authorization failed." }, 401);
      }
      const telegramId = String(telegramUser.id);
      const username = typeof telegramUser.username === "string" ? telegramUser.username.slice(0, 64) : null;
      const firstName = typeof telegramUser.first_name === "string" ? telegramUser.first_name : "";
      const lastName = typeof telegramUser.last_name === "string" ? telegramUser.last_name : "";
      const displayName = [firstName, lastName].filter(Boolean).join(" ").slice(0, 160) || username || null;
      const avatarUrl = typeof telegramUser.photo_url === "string" && telegramUser.photo_url.startsWith("https://")
        ? telegramUser.photo_url.slice(0, 2048)
        : null;
      const profiles = await supabaseRequest(
        "app_users?on_conflict=telegram_user_id&select=id,telegram_user_id,telegram_username,display_name,avatar_url",
        {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            telegram_user_id: telegramId,
            telegram_username: username,
            display_name: displayName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!Array.isArray(profiles) || profiles.length !== 1 || typeof profiles[0].id !== "string") {
        throw new Error("Could not create the account profile.");
      }
      const session = await createSession(profiles[0].id);
      return json({ authenticated: true, session_token: session.sessionToken, expires_at: session.expiresAt, user: profiles[0] });
    }

    if (action === "session") {
      const session = await getSession(body.session_token);
      if (!session) return json({ authenticated: false, error: "Session expired. Please sign in again." }, 401);
      return json({ authenticated: true, user: session.user, expires_at: session.expires_at });
    }

    if (action === "logout") {
      const token = body.session_token;
      if (typeof token === "string" && token.length >= 30 && token.length <= 200) {
        const tokenHash = await sha256Hex(token);
        await supabaseRequest(`app_sessions?token_hash=eq.${tokenHash}`, { method: "DELETE" });
      }
      return json({ success: true });
    }

    if (action !== "login") return json({ error: "Unknown action." }, 400);

    const clientId = requiredEnv("TELEGRAM_CLIENT_ID");
    const clientSecret = requiredEnv("TELEGRAM_CLIENT_SECRET");
    const redirectUri = requiredEnv("TELEGRAM_REDIRECT_URI");
    if (redirectUri !== "https://burovm079-dot.github.io/skebob-ai/auth/callback/") {
      return json({ error: "Telegram redirect URI configuration does not match the website." }, 500);
    }

    const { code, code_verifier: codeVerifier, nonce } = body || {};
    if (
      typeof code !== "string" || code.length < 1 || code.length > 4096 ||
      typeof codeVerifier !== "string" || codeVerifier.length < 43 || codeVerifier.length > 128 ||
      typeof nonce !== "string" || nonce.length < 16 || nonce.length > 256
    ) {
      return json({ error: "Invalid authorization response." }, 400);
    }

    const tokenResponse = await fetch("https://oauth.telegram.org/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenData.id_token !== "string") {
      console.error("Telegram token exchange failed:", tokenResponse.status);
      return json({ error: "Telegram could not complete sign-in. Please try again." }, 401);
    }

    const { payload } = await jwtVerify(tokenData.id_token, TELEGRAM_JWKS, {
      issuer: TELEGRAM_ISSUER,
      audience: clientId,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    if (payload.nonce !== nonce || typeof payload.sub !== "string" || !/^\d+$/.test(payload.sub)) {
      return json({ error: "Telegram identity verification failed." }, 401);
    }

    const telegramId = payload.sub;
    const username = typeof payload.preferred_username === "string"
      ? payload.preferred_username.slice(0, 64)
      : null;
    const displayName = typeof payload.name === "string"
      ? payload.name.slice(0, 160)
      : [payload.given_name, payload.family_name].filter((part) => typeof part === "string").join(" ").slice(0, 160) || null;
    const avatarUrl = typeof payload.picture === "string" && payload.picture.startsWith("https://")
      ? payload.picture.slice(0, 2048)
      : null;

    const profiles = await supabaseRequest(
      "app_users?on_conflict=telegram_user_id&select=id,telegram_user_id,telegram_username,display_name,avatar_url",
      {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          telegram_user_id: telegramId,
          telegram_username: username,
          display_name: displayName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!Array.isArray(profiles) || profiles.length !== 1 || typeof profiles[0].id !== "string") {
      throw new Error("Could not create the account profile.");
    }

    const session = await createSession(profiles[0].id);
    return json({
      authenticated: true,
      session_token: session.sessionToken,
      expires_at: session.expiresAt,
      user: profiles[0],
    });
  } catch (error) {
    console.error("quick-function error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message.includes("configuration") ? message : "Sign-in could not be completed. Please try again." }, 500);
  }
});
