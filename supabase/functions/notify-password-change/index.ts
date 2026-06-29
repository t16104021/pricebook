const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function messageHtml(email: string): string {
  const time = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',Arial,sans-serif;line-height:1.7;color:#1c2522;">
      <h2 style="margin:0 0 12px;">產品售價管理：密碼已更新</h2>
      <p>${email} 的登入密碼已於 ${time} 更新成功。</p>
      <p>如果這不是你本人操作，請立即登入系統再次修改密碼，並檢查 Supabase 帳號安全設定。</p>
      <p style="color:#68756f;font-size:13px;">此通知不包含任何密碼內容。</p>
    </div>
  `;
}

async function getUserEmail(
  supabaseUrl: string,
  anonKey: string,
  token: string,
): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;

  const payload = await response.json();
  return typeof payload.email === "string" ? payload.email : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const token = bearerToken(request);
    if (!token) return jsonResponse({ error: "Missing bearer token" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("PASSWORD_NOTICE_FROM") ||
      "產品售價管理 <onboarding@resend.dev>";

    if (!resendApiKey) {
      console.warn(
        "RESEND_API_KEY is not configured; password notice skipped.",
      );
      return jsonResponse({ sent: false, reason: "email_not_configured" });
    }

    const email = await getUserEmail(supabaseUrl, anonKey, token);
    if (!email) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "產品售價管理：密碼已更新",
        html: messageHtml(email),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Failed to send password notice", {
        status: response.status,
        details,
      });
      return jsonResponse({ sent: false, reason: "email_send_failed" }, 502);
    }

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error("Password notice failed", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
