import { createClient } from "npm:@supabase/supabase-js@2";
import { parseCommand } from "./command.ts";
import { replyToLine, verifyLineSignature } from "./line.ts";
import { queryPricebook } from "./pricebook.ts";
import type { PricebookPayload } from "./types.ts";

interface LineTextEvent {
  webhookEventId?: string;
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
}

export interface WebhookDependencies {
  channelSecret: string;
  channelAccessToken: string;
  allowedUserId: string;
  verifySignature: typeof verifyLineSignature;
  claimEvent(eventId: string): Promise<boolean>;
  completeEvent(eventId: string): Promise<void>;
  releaseEvent(eventId: string): Promise<void>;
  loadPayload(): Promise<PricebookPayload>;
  reply(
    replyToken: string,
    text: string,
    accessToken: string,
  ): Promise<void>;
}

type EnvReader = (name: string) => string | undefined;

interface DatabaseError {
  code?: string;
}

interface DatabaseClient {
  rpc(
    name: string,
    args: { p_event_id: string },
  ): PromiseLike<{
    data: unknown;
    error: DatabaseError | null;
  }>;
  from(table: string): {
    select(column: string): {
      eq(filterColumn: string, value: string): {
        single(): PromiseLike<{
          data: { payload: unknown };
          error: DatabaseError | null;
        }>;
      };
    };
  };
}

export function requiredEnv(name: string, readEnv: EnvReader): string {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createDatabaseAdapter(
  client: DatabaseClient,
  pricebookOwnerId: string,
) {
  const claimEvent = async (eventId: string): Promise<boolean> => {
    const { data, error } = await client.rpc(
      "claim_line_webhook_event",
      { p_event_id: eventId },
    );
    if (error) throw error;
    return data === true;
  };

  const completeEvent = async (eventId: string): Promise<void> => {
    const { error } = await client.rpc(
      "complete_line_webhook_event",
      { p_event_id: eventId },
    );
    if (error) throw error;
  };

  const releaseEvent = async (eventId: string): Promise<void> => {
    const { error } = await client.rpc(
      "release_line_webhook_event",
      { p_event_id: eventId },
    );
    if (error) throw error;
  };

  const loadPayload = async (): Promise<PricebookPayload> => {
    const { data, error } = await client
      .from("pricebook_data")
      .select("payload")
      .eq("id", pricebookOwnerId)
      .single();
    if (error) throw error;
    return data.payload as PricebookPayload;
  };

  return { claimEvent, completeEvent, releaseEvent, loadPayload };
}

export async function releaseFailedClaim(
  eventId: string,
  originalError: unknown,
  releaseEvent: (eventId: string) => Promise<void>,
): Promise<never> {
  try {
    await releaseEvent(eventId);
  } catch {
    // Preserve the event failure without logging release details.
  }
  throw originalError;
}

export function createWebhookHandler(
  dependencies: WebhookDependencies,
): (request: Request) => Promise<Response> {
  const safeFailureMessage = "查價服務暫時無法使用，請稍後再試";

  const handleEvent = async (event: LineTextEvent): Promise<void> => {
    if (
      event.type !== "message" ||
      event.message?.type !== "text" ||
      event.source?.type !== "user" ||
      !event.replyToken ||
      !event.webhookEventId
    ) {
      return;
    }

    if (!(await dependencies.claimEvent(event.webhookEventId))) return;

    let replyText: string;
    try {
      if (event.source?.userId !== dependencies.allowedUserId) {
        replyText = "此帳號沒有查價權限";
      } else {
        const command = parseCommand(event.message.text ?? "");
        if (!command.ok) {
          replyText = command.message;
        } else {
          const payload = await dependencies.loadPayload();
          replyText = queryPricebook(
            payload,
            command.customer,
            command.productQuery,
          );
        }
      }
    } catch {
      replyText = safeFailureMessage;
    }

    try {
      await dependencies.reply(
        event.replyToken,
        replyText,
        dependencies.channelAccessToken,
      );
    } catch (error) {
      try {
        await dependencies.reply(
          event.replyToken,
          safeFailureMessage,
          dependencies.channelAccessToken,
        );
      } catch {
        await releaseFailedClaim(
          event.webhookEventId,
          error,
          dependencies.releaseEvent,
        );
      }
    }

    await dependencies.completeEvent(event.webhookEventId);
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

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const events = body !== null &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        "events" in body &&
        Array.isArray(body.events)
      ? body.events as LineTextEvent[]
      : [];
    const results = await Promise.allSettled(events.map(handleEvent));
    const failed = results.filter((result) => result.status === "rejected");
    for (const _result of failed) {
      console.error("LINE webhook event failed");
    }

    return failed.length > 0
      ? new Response("Service Unavailable", { status: 503 })
      : new Response("OK", { status: 200 });
  };
}

export function createRuntimeHandler(
  readEnv: EnvReader = (name) => Deno.env.get(name),
  clientFactory: (url: string, key: string) => unknown = createClient,
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
  const supabase = clientFactory(supabaseUrl, serviceRoleKey);
  const database = createDatabaseAdapter(
    supabase as unknown as DatabaseClient,
    pricebookOwnerId,
  );

  return createWebhookHandler({
    channelSecret,
    channelAccessToken,
    allowedUserId,
    verifySignature: verifyLineSignature,
    ...database,
    reply: replyToLine,
  });
}

if (import.meta.main) {
  Deno.serve(createRuntimeHandler());
}
