import type { TelegramClient } from "../clients/telegramClient";
import { logError, logInfo } from "../logger";
import type { Repository } from "../repository";
import type { AppConfig, StoredMemory } from "../types";
import { fallbackNudge, type LlmService } from "./llmService";

export class NudgeService {
  constructor(
    private readonly repository: Repository,
    private readonly telegram: TelegramClient,
    private readonly llm: LlmService,
    private readonly config: AppConfig
  ) {}

  async sendNudgeIfNeeded(localDate: string, localHour: number, localMinute: number): Promise<void> {
    const chatId = this.config.allowedTelegramUserId;
    const hasEntry = await this.repository.hasEntryForHour(localDate, localHour);
    if (hasEntry) {
      logInfo("nudge_skipped_hour_complete", { localDate, localHour, localMinute });
      return;
    }

    const fallback = fallbackNudge(localMinute);
    const reserved = await this.repository.reserveNudge({
      localDate,
      localHour,
      localMinute,
      chatId,
      prompt: "pending",
      messageText: fallback
    });

    if (!reserved) {
      logInfo("nudge_already_reserved", { localDate, localHour, localMinute });
      return;
    }

    const todayEntries = await this.repository.getEntriesForDate(localDate);
    const memories = await this.loadMemories(chatId, localDate, localHour);
    let messageText = fallback;
    let prompt = "fallback";

    try {
      messageText = await this.llm.createNudge(localHour, localMinute, todayEntries, memories);
      prompt = "llm";
      const sent = await this.telegram.sendMessage(chatId, messageText);
      await this.repository.completeNudge({
        localDate,
        localHour,
        localMinute,
        chatId,
        prompt,
        messageText,
        telegramMessageId: sent.message_id,
        status: "sent"
      });
    } catch (error) {
      logError("nudge_send_failed", error, { localDate, localHour, localMinute });
      try {
        const sent = await this.telegram.sendMessage(chatId, fallback);
        await this.repository.completeNudge({
          localDate,
          localHour,
          localMinute,
          chatId,
          prompt,
          messageText: fallback,
          telegramMessageId: sent.message_id,
          status: "sent",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      } catch (fallbackError) {
        logError("fallback_nudge_failed", fallbackError, { localDate, localHour, localMinute });
        await this.repository.completeNudge({
          localDate,
          localHour,
          localMinute,
          chatId,
          prompt,
          messageText,
          telegramMessageId: null,
          status: "failed",
          errorMessage: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }
  }

  private async loadMemories(chatId: number, localDate: string, localHour: number): Promise<StoredMemory[]> {
    try {
      return await this.repository.getMemoriesForUser(chatId);
    } catch (error) {
      logError("nudge_memory_load_failed", error, { localDate, localHour });
      return [];
    }
  }
}
