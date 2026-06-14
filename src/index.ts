import { OpenAiClient } from "./clients/openaiClient";
import { TelegramClient } from "./clients/telegramClient";
import { getConfig } from "./config";
import { logError, logInfo, logWarn } from "./logger";
import { Repository } from "./repository";
import { GratitudeService } from "./services/gratitudeService";
import { LlmService } from "./services/llmService";
import { MemoryService } from "./services/memoryService";
import { NudgeService } from "./services/nudgeService";
import { PosterService } from "./services/posterService";
import { getScheduledAction } from "./time";
import type { Env, TelegramUpdate } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        getConfig(env);
        return Response.json({ ok: true, service: "hourly-gratitude-bot" });
      }

      if (request.method === "POST" && url.pathname === "/telegram/webhook") {
        return handleTelegramWebhook(request, env);
      }

      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    } catch (error) {
      logError("request_failed", error, { path: url.pathname });
      return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(controller, env));
  }
};

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const config = getConfig(env);
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== config.telegramWebhookSecret) {
    logWarn("webhook_secret_rejected");
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = await request.json<TelegramUpdate>();
  logInfo("telegram_webhook_update_received", {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    messageId: update.message?.message_id,
    chatId: update.message?.chat.id,
    chatType: update.message?.chat.type,
    fromUserId: update.message?.from?.id,
    textLength: update.message?.text?.length,
    captionLength: update.message?.caption?.length
  });
  const services = createServices(env);
  await services.gratitude.handleUpdate(update);
  logInfo("telegram_webhook_update_handled", { updateId: update.update_id });
  return Response.json({ ok: true });
}

async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const services = createServices(env);
  const action = getScheduledAction(new Date(controller.scheduledTime));

  if (action.kind === "none") {
    logInfo("scheduled_noop", {
      localDate: action.local.date,
      localHour: action.local.hour,
      localMinute: action.local.minute
    });
    return;
  }

  if (action.kind === "nudge") {
    await services.nudge.sendNudgeIfNeeded(action.local.date, action.local.hour, action.local.minute);
    return;
  }

  await services.poster.sendDailyPoster(action.local.date);
}

function createServices(env: Env): {
  gratitude: GratitudeService;
  nudge: NudgeService;
  poster: PosterService;
} {
  const config = getConfig(env);
  const repository = new Repository(env.DB);
  const telegram = new TelegramClient(config.telegramBotToken);
  const openAi = new OpenAiClient(config.openAiApiKey, config.openAiTextModel, config.openAiImageModel);
  const llm = new LlmService(openAi, config);
  const memory = new MemoryService(repository, llm);

  return {
    gratitude: new GratitudeService(repository, telegram, llm, config, memory),
    nudge: new NudgeService(repository, telegram, llm, config),
    poster: new PosterService(repository, telegram, openAi, llm, env.POSTERS, config)
  };
}
