import type { TelegramClient } from "../clients/telegramClient";
import { logError, logInfo, logWarn } from "../logger";
import type { Repository } from "../repository";
import { getBerlinLocalParts, toIsoFromTelegramDate } from "../time";
import type { AppConfig, StoredGratitudeEntry, TelegramUpdate } from "../types";
import { fallbackReaction, type LlmService } from "./llmService";
import type { MemoryService } from "./memoryService";

export class GratitudeService {
  constructor(
    private readonly repository: Repository,
    private readonly telegram: TelegramClient,
    private readonly llm: LlmService,
    private readonly config: AppConfig,
    private readonly memory?: MemoryService
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const nowIso = new Date().toISOString();
    const shouldProcess = await this.repository.reserveUpdate(update.update_id, nowIso);
    if (!shouldProcess) {
      logInfo("duplicate_update_ignored", { updateId: update.update_id });
      return;
    }

    const message = update.message;
    if (!message?.from || !message.text && !message.caption) {
      return;
    }

    if (message.from.id !== this.config.allowedTelegramUserId) {
      logWarn("unauthorized_message_ignored", { userId: message.from.id });
      return;
    }

    const text = (message.text ?? message.caption ?? "").trim();
    if (!text || text.startsWith("/")) {
      return;
    }

    const receivedAtUtc = toIsoFromTelegramDate(message.date);
    const local = getBerlinLocalParts(new Date(receivedAtUtc));

    await this.repository.insertGratitudeEntry({
      telegramUpdateId: update.update_id,
      telegramMessageId: message.message_id,
      chatId: message.chat.id,
      userId: message.from.id,
      text,
      receivedAtUtc,
      localDate: local.date,
      localHour: local.hour,
      createdAtUtc: nowIso
    });

    await this.deletePreviousNudges(message.chat.id, message.message_id, local.date, local.hour);

    const todayEntries = await this.getEntriesForReaction(local.date, message.chat.id, message.message_id);
    let reaction = fallbackReaction();
    try {
      reaction = await this.llm.selectReaction(text, todayEntries);
      await this.telegram.setMessageReaction(message.chat.id, message.message_id, reaction);
    } catch (error) {
      logError("reaction_failed", error, { chatId: message.chat.id, messageId: message.message_id });
      reaction = fallbackReaction();
      try {
        await this.telegram.setMessageReaction(message.chat.id, message.message_id, reaction);
      } catch (fallbackError) {
        logError("fallback_reaction_failed", fallbackError, { chatId: message.chat.id, messageId: message.message_id });
      }
    }

    await this.repository.setEntryReaction(message.chat.id, message.message_id, reaction);

    await this.memory?.captureFromMessage({
      userId: message.from.id,
      messageId: message.message_id,
      text,
      localDate: local.date,
      receivedAtUtc,
      nowIso
    });
  }

  private async getEntriesForReaction(
    localDate: string,
    chatId: number,
    messageId: number
  ): Promise<StoredGratitudeEntry[]> {
    try {
      return await this.repository.getEntriesForDate(localDate);
    } catch (error) {
      logError("reaction_context_load_failed", error, { chatId, messageId, localDate });
      return [];
    }
  }

  private async deletePreviousNudges(
    chatId: number,
    beforeMessageId: number,
    localDate: string,
    localHour: number
  ): Promise<void> {
    let messageIds: number[];
    try {
      messageIds = await this.repository.getSentNudgeMessageIds(chatId, beforeMessageId, localDate, localHour);
    } catch (error) {
      logError("nudge_lookup_failed", error, { chatId, beforeMessageId, localDate, localHour });
      return;
    }

    for (const messageId of messageIds) {
      try {
        await this.telegram.deleteMessage(chatId, messageId);
        await this.repository.markNudgeDeleted(chatId, messageId);
      } catch (error) {
        logError("nudge_delete_failed", error, { chatId, messageId });
      }
    }
  }
}
