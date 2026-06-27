import { createClient } from "npm:@supabase/supabase-js@2";
import { parseCommand } from "./command.ts";
import { replyToLine, verifyLineSignature } from "./line.ts";
import { queryPricebook } from "./pricebook.ts";
import type { PricebookPayload } from "./types.ts";

interface LineTextEvent {
  webhookEventId?: string;
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
}

export interface WebhookDependencies {
  channelSecret: string;
  channelAccessToken: string;
  allowedUserId: string;
  verifySignature: typeof verifyLineSignature;
  claimEvent(eventId: string): Promise<boolean>;
  loadPayload(): Promise<PricebookPayload>;
  reply(
    replyToken: string,
    text: string,
    accessToken: string,
  ): Promise<void>;
}

type EnvReader = (name: string) => string | undefined;

export function requiredEnv(name: string, readEnv: EnvReader): string {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createWebhookHandler(
  dependencies: WebhookDependencies,
): (request: Request) => Promise<Response> {
  const handleEvent = async (event: LineTextEvent): Promise<void> => {
    if (
      event.type !== "message" ||
      event.message?.type !== "text" ||
      !event.replyToken ||
      !event.webhookEventId
    ) {
      return;
    }

    if (!(await dependencies.claimEvent(event.webhookEventId))) return;

    if (event.source?.userId !== dependencies.allowedUserId) {
      await dependencies.reply(
        event.replyToken,
        "此帳號沒有查價權限",
        dependencies.channelAccessToken,
      );
      return;
    }

    const command = parseCommand(event.message.text ?? "");
    if (!command.ok) {
      await dependencies.reply(
        event.replyToken,
        command.message,
        dependencies.channelAccessToken,
      );
      return;
    }

    const payload = await dependencies.loadPayload();
    const reply = queryPricebook(
      payload,
      command.customer,
      command.productQuery,
    );
    await dependencies.reply(
      event.replyToken,
      reply,
      dependencies.channelAccessToken,
    );
  };

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") ?? "";
    if (
      !(await dependencies.verifySignature(
        rawBody,
        signature,
        dependencies.channelSecret,
      ))
    ) {
      return new Response("Invalid signature", { status: 401 });
    }

    let body: { events?: LineTextEvent[] };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const events = Array.isArray(body.events) ? body.events : [];
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === "rejected") console.error(result.reason);
    }

    return new Response("OK", { status: 200 });
  };
}

export function createRuntimeHandler(
  readEnv: EnvReader = (name) => Deno.env.get(name),
): (request: Request) => Promise<Response> {
  const channelSecret = requiredEnv("LINE_CHANNEL_SECRET", readEnv);
  const channelAccessToken = requiredEnv(
    "LINE_CHANNEL_ACCESS_TOKEN",
    readEnv,
  );
  const allowedUserId = requiredEnv("LINE_ALLOWED_USER_ID", readEnv);
  const pricebookOwnerId = requiredEnv("PRICEBOOK_OWNER_ID", readEnv);
  const supabaseUrl = requiredEnv("SUPABASE_URL", readEnv);
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", readEnv);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const claimEvent = async (eventId: string): Promise<boolean> => {
    const { error } = await supabase
      .from("line_webhook_events")
      .insert({ event_id: eventId });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  };

  const loadPayload = async (): Promise<PricebookPayload> => {
    const { data, error } = await supabase
      .from("pricebook_data")
      .select("payload")
      .eq("id", pricebookOwnerId)
      .single();
    if (error) throw error;
    return data.payload as PricebookPayload;
  };

  return createWebhookHandler({
    channelSecret,
    channelAccessToken,
    allowedUserId,
    verifySignature: verifyLineSignature,
    claimEvent,
    loadPayload,
    reply: replyToLine,
  });
}

if (import.meta.main) {
  Deno.serve(createRuntimeHandler());
}
