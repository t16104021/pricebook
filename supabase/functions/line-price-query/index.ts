import { createClient } from "npm:@supabase/supabase-js@2";
import { parseCommand } from "./command.ts";
import { replyToLine, verifyLineSignature } from "./line.ts";
import {
  createGeminiPersonalReply,
  createOpenAIPersonalReply,
} from "./personal_reply.ts";
import { queryPricebookResult } from "./pricebook.ts";
import type { PersonalReplyContext, PricebookPayload } from "./types.ts";

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
  allowedUserIds: string[];
  verifySignature: typeof verifyLineSignature;
  claimEvent(eventId: string): Promise<string | null>;
  completeEvent(eventId: string, claimToken: string): Promise<void>;
  releaseEvent(eventId: string, claimToken: string): Promise<void>;
  loadPayload(): Promise<PricebookPayload>;
  createPersonalReply(context: PersonalReplyContext): Promise<string | null>;
  reply(
    replyToken: string,
    messages: string[],
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
    args: { p_event_id: string; p_claim_token?: string },
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

function parseAllowedUserIds(
  primaryUserId: string,
  extraUserIds: string | undefined,
): string[] {
  const userIds = [primaryUserId, ...(extraUserIds?.split(",") ?? [])]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(userIds)];
}

function maskUserId(userId: string): string {
  if (userId.length <= 8) return userId;
  return `${userId.slice(0, 3)}…${userId.slice(-4)}`;
}

function unauthorizedReply(): string {
  return "此帳號尚未開通查價權限，請聯絡管理者。";
}

export function createDatabaseAdapter(
  client: DatabaseClient,
  pricebookOwnerId: string,
) {
  const claimEvent = async (eventId: string): Promise<string | null> => {
    const { data, error } = await client.rpc(
      "claim_line_webhook_event",
      { p_event_id: eventId },
    );
    if (error) throw error;
    if (data === null) return null;
    if (typeof data !== "string") throw new Error("Invalid claim response");
    return data;
  };

  const completeEvent = async (
    eventId: string,
    claimToken: string,
  ): Promise<void> => {
    const { error } = await client.rpc(
      "complete_line_webhook_event",
      { p_event_id: eventId, p_claim_token: claimToken },
    );
    if (error) throw error;
  };

  const releaseEvent = async (
    eventId: string,
    claimToken: string,
  ): Promise<void> => {
    const { error } = await client.rpc(
      "release_line_webhook_event",
      { p_event_id: eventId, p_claim_token: claimToken },
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
  claimToken: string,
  originalError: unknown,
  releaseEvent: (eventId: string, claimToken: string) => Promise<void>,
): Promise<never> {
  try {
    await releaseEvent(eventId, claimToken);
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

    const claimToken = await dependencies.claimEvent(event.webhookEventId);
    if (claimToken === null) return;

    let replyMessages: string[];
    try {
      const userId = event.source?.userId ?? "";
      const isAllowed = dependencies.allowedUserIds.includes(userId);
      console.info("LINE webhook user check", {
        webhookEventId: event.webhookEventId,
        userId: maskUserId(userId),
        allowedCount: dependencies.allowedUserIds.length,
        isAllowed,
      });
      if (!isAllowed) {
        replyMessages = [unauthorizedReply()];
      } else {
        const command = parseCommand(event.message.text ?? "");
        if (!command.ok) {
          replyMessages = [command.message];
        } else {
          const payload = await dependencies.loadPayload();
          const result = queryPricebookResult(
            payload,
            command.customer,
            command.productQuery,
          );
          replyMessages = [result.standardReply];
          if (result.status === "found") {
            try {
              const personalReply = await dependencies.createPersonalReply(
                result.personalReplyContext,
              );
              if (personalReply) replyMessages.push(personalReply);
            } catch {
              // Keep the fixed reply if AI wording is unavailable.
            }
          }
        }
      }
    } catch {
      replyMessages = [safeFailureMessage];
    }

    try {
      await dependencies.reply(
        event.replyToken,
        replyMessages,
        dependencies.channelAccessToken,
      );
    } catch (error) {
      try {
        await dependencies.reply(
          event.replyToken,
          [safeFailureMessage],
          dependencies.channelAccessToken,
        );
      } catch {
        await releaseFailedClaim(
          event.webhookEventId,
          claimToken,
          error,
          dependencies.releaseEvent,
        );
      }
    }

    await dependencies.completeEvent(event.webhookEventId, claimToken);
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
  const allowedUserIds = parseAllowedUserIds(
    requiredEnv("LINE_ALLOWED_USER_ID", readEnv),
    readEnv("LINE_ALLOWED_USER_IDS"),
  );
  const pricebookOwnerId = requiredEnv("PRICEBOOK_OWNER_ID", readEnv);
  const supabaseUrl = requiredEnv("SUPABASE_URL", readEnv);
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", readEnv);
  const geminiKey = readEnv("GEMINI_API_KEY");
  const geminiModel = readEnv("GEMINI_MODEL") || "gemini-2.5-flash";
  const openAIKey = readEnv("OPENAI_API_KEY");
  const openAIModel = readEnv("OPENAI_MODEL") || "gpt-5-mini";
  const supabase = clientFactory(supabaseUrl, serviceRoleKey);
  const database = createDatabaseAdapter(
    supabase as unknown as DatabaseClient,
    pricebookOwnerId,
  );

  return createWebhookHandler({
    channelSecret,
    channelAccessToken,
    allowedUserIds,
    verifySignature: verifyLineSignature,
    ...database,
    createPersonalReply: async (context) => {
      const geminiReply = await createGeminiPersonalReply(
        context,
        geminiKey,
        geminiModel,
        fetch,
        context.aiReplyInstructions,
      );
      if (geminiReply) return geminiReply;
      return createOpenAIPersonalReply(
        context,
        openAIKey,
        openAIModel,
        fetch,
        context.aiReplyInstructions,
      );
    },
    reply: replyToLine,
  });
}

if (import.meta.main) {
  Deno.serve(createRuntimeHandler());
}
