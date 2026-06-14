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
    logInfo("telegram_update_reserved", { updateId: update.update_id });

    const message = update.message;
    if (!message?.from || !message.text && !message.caption) {
      logInfo("telegram_update_not_gratitude_candidate", {
        updateId: update.update_id,
        hasMessage: Boolean(message),
        hasFrom: Boolean(message?.from),
        hasText: Boolean(message?.text),
        hasCaption: Boolean(message?.caption)
      });
      return;
    }

    if (message.from.id !== this.config.allowedTelegramUserId) {
      logWarn("unauthorized_message_ignored", {
        updateId: update.update_id,
        chatId: message.chat.id,
        messageId: message.message_id,
        userId: message.from.id
      });
      return;
    }

    const text = (message.text ?? message.caption ?? "").trim();
    if (!text || text.startsWith("/")) {
      logInfo("telegram_message_ignored", {
        updateId: update.update_id,
        chatId: message.chat.id,
        messageId: message.message_id,
        reason: text ? "command" : "empty_text"
      });
      return;
    }

    const receivedAtUtc = toIsoFromTelegramDate(message.date);
    const local = getBerlinLocalParts(new Date(receivedAtUtc));
    logInfo("gratitude_message_accepted", {
      updateId: update.update_id,
      chatId: message.chat.id,
      messageId: message.message_id,
      userId: message.from.id,
      receivedAtUtc,
      localDate: local.date,
      localHour: local.hour,
      localMinute: local.minute,
      textLength: text.length
    });

    const insertChanges = await this.repository.insertGratitudeEntry({
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
    logInfo("gratitude_entry_insert_result", {
      updateId: update.update_id,
      chatId: message.chat.id,
      messageId: message.message_id,
      changes: insertChanges
    });

    await this.deletePreviousNudges(message.chat.id, message.message_id, local.date, local.hour);

    const todayEntries = await this.getEntriesForReaction(local.date, message.chat.id, message.message_id);
    let reaction = fallbackReaction();
    try {
      reaction = await this.llm.selectReaction(text, todayEntries);
      logInfo("reaction_selected", {
        chatId: message.chat.id,
        messageId: message.message_id,
        emoji: reaction,
        entriesForDate: todayEntries.length
      });
      await this.telegram.setMessageReaction(message.chat.id, message.message_id, reaction);
    } catch (error) {
      logError("reaction_failed", error, { chatId: message.chat.id, messageId: message.message_id, emoji: reaction });
      reaction = fallbackReaction();
      try {
        logInfo("reaction_fallback_attempt", { chatId: message.chat.id, messageId: message.message_id, emoji: reaction });
        await this.telegram.setMessageReaction(message.chat.id, message.message_id, reaction);
      } catch (fallbackError) {
        logError("fallback_reaction_failed", fallbackError, { chatId: message.chat.id, messageId: message.message_id, emoji: reaction });
      }
    }

    const reactionChanges = await this.repository.setEntryReaction(message.chat.id, message.message_id, reaction);
    logInfo("gratitude_entry_reaction_recorded", {
      chatId: message.chat.id,
      messageId: message.message_id,
      emoji: reaction,
      changes: reactionChanges
    });

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
      const entries = await this.repository.getEntriesForDate(localDate);
      logInfo("reaction_context_loaded", { chatId, messageId, localDate, entryCount: entries.length });
      return entries;
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
      messageIds = await this.repository.getSentNudgeMessageIds(chatId, beforeMessageId, localDate);
    } catch (error) {
      logError("nudge_lookup_failed", error, { chatId, beforeMessageId, localDate, localHour });
      return;
    }
    logInfo("nudge_delete_candidates_loaded", {
      chatId,
      beforeMessageId,
      localDate,
      localHour,
      candidateCount: messageIds.length,
      candidateMessageIds: messageIds.join(",")
    });

    for (const messageId of messageIds) {
      try {
        logInfo("nudge_delete_attempt", { chatId, messageId });
        await this.telegram.deleteMessage(chatId, messageId);
        const changes = await this.repository.markNudgeDeleted(chatId, messageId);
        logInfo("nudge_mark_deleted_result", { chatId, messageId, changes });
      } catch (error) {
        logError("nudge_delete_failed", error, { chatId, messageId });
      }
    }
  }
}
