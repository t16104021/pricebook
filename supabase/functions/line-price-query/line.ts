const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function truncateLineText(text: string): string {
  const truncated = text.slice(0, 5000);
  const lastCodeUnit = truncated.charCodeAt(truncated.length - 1);
  const nextCodeUnit = text.charCodeAt(5000);
  const splitsSurrogatePair = lastCodeUnit >= 0xD800 &&
    lastCodeUnit <= 0xDBFF &&
    nextCodeUnit >= 0xDC00 &&
    nextCodeUnit <= 0xDFFF;

  return splitsSurrogatePair ? truncated.slice(0, -1) : truncated;
}

async function importHmacKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function createLineSignature(
  body: string,
  secret: string,
): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyLineSignature(
  body: string,
  received: string,
  secret: string,
): Promise<boolean> {
  if (!received) return false;

  try {
    const key = await importHmacKey(secret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64ToBytes(received),
      encoder.encode(body),
    );
  } catch {
    return false;
  }
}

export async function replyToLine(
  replyToken: string,
  text: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: truncateLineText(text) }],
      }),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    const safeBody = accessToken
      ? responseBody.split(accessToken).join("[REDACTED]")
      : responseBody;
    throw new Error(`LINE Reply API failed: ${response.status} ${safeBody}`);
  }
}
