import type { DailyPosterInput, MemoryFactInput, NudgeRecordInput, StoredGratitudeEntry, StoredMemory } from "./types";

interface EntryRow extends StoredGratitudeEntry {}
interface MemoryRow extends StoredMemory {}

export class Repository {
  constructor(private readonly db: D1Database) {}

  async reserveUpdate(updateId: number, nowIso: string): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT update_id FROM processed_updates WHERE update_id = ?")
      .bind(updateId)
      .first<{ update_id: number }>();

    if (existing) {
      return false;
    }

    await this.db
      .prepare("INSERT INTO processed_updates (update_id, processed_at_utc) VALUES (?, ?)")
      .bind(updateId, nowIso)
      .run();
    return true;
  }

  async insertGratitudeEntry(input: {
    telegramUpdateId: number;
    telegramMessageId: number;
    chatId: number;
    userId: number;
    text: string;
    receivedAtUtc: string;
    localDate: string;
    localHour: number;
    createdAtUtc: string;
  }): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR IGNORE INTO gratitude_entries (
          telegram_update_id, telegram_message_id, chat_id, user_id, text,
          received_at_utc, local_date, local_hour, created_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.telegramUpdateId,
        input.telegramMessageId,
        input.chatId,
        input.userId,
        input.text,
        input.receivedAtUtc,
        input.localDate,
        input.localHour,
        input.createdAtUtc
      )
      .run();
  }

  async setEntryReaction(chatId: number, messageId: number, reactionEmoji: string): Promise<void> {
    await this.db
      .prepare("UPDATE gratitude_entries SET reaction_emoji = ? WHERE chat_id = ? AND telegram_message_id = ?")
      .bind(reactionEmoji, chatId, messageId)
      .run();
  }

  async hasEntryForHour(localDate: string, localHour: number): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT id FROM gratitude_entries WHERE local_date = ? AND local_hour = ? LIMIT 1")
      .bind(localDate, localHour)
      .first<{ id: number }>();
    return Boolean(row);
  }

  async getEntriesForDate(localDate: string): Promise<StoredGratitudeEntry[]> {
    const result = await this.db
      .prepare("SELECT * FROM gratitude_entries WHERE local_date = ? ORDER BY received_at_utc ASC")
      .bind(localDate)
      .all<EntryRow>();
    return result.results ?? [];
  }

  async getMemoriesForUser(userId: number, limit = 40): Promise<StoredMemory[]> {
    const result = await this.db
      .prepare(`
        SELECT *
        FROM memories
        WHERE user_id = ?
        ORDER BY updated_at_utc DESC
        LIMIT ?
      `)
      .bind(userId, limit)
      .all<MemoryRow>();

    return result.results ?? [];
  }

  async upsertMemoryFact(input: MemoryFactInput): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO memories (
          user_id, memory_key, category, subject, fact, confidence, source_text,
          source_message_id, created_at_utc, updated_at_utc, last_observed_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, memory_key) DO UPDATE SET
          category = excluded.category,
          subject = excluded.subject,
          fact = excluded.fact,
          confidence = excluded.confidence,
          source_text = excluded.source_text,
          source_message_id = excluded.source_message_id,
          updated_at_utc = excluded.updated_at_utc,
          last_observed_at_utc = excluded.last_observed_at_utc
      `)
      .bind(
        input.userId,
        input.key,
        input.category,
        input.subject,
        input.fact,
        input.confidence,
        input.sourceText,
        input.sourceMessageId,
        input.nowIso,
        input.nowIso,
        input.observedAtUtc
      )
      .run();
  }

  async reserveNudge(input: Omit<NudgeRecordInput, "telegramMessageId" | "status" | "errorMessage">): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT id FROM nudges WHERE local_date = ? AND local_hour = ? AND local_minute = ? AND chat_id = ?")
      .bind(input.localDate, input.localHour, input.localMinute, input.chatId)
      .first<{ id: number }>();

    if (existing) {
      return false;
    }

    await this.db
      .prepare(`
        INSERT INTO nudges (
          local_date, local_hour, local_minute, chat_id, prompt, message_text,
          telegram_message_id, status, created_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?)
      `)
      .bind(
        input.localDate,
        input.localHour,
        input.localMinute,
        input.chatId,
        input.prompt,
        input.messageText,
        new Date().toISOString()
      )
      .run();
    return true;
  }

  async completeNudge(input: NudgeRecordInput): Promise<void> {
    await this.db
      .prepare(`
        UPDATE nudges
        SET prompt = ?, message_text = ?, telegram_message_id = ?, status = ?, error_message = ?
        WHERE local_date = ? AND local_hour = ? AND local_minute = ? AND chat_id = ?
      `)
      .bind(
        input.prompt,
        input.messageText,
        input.telegramMessageId,
        input.status,
        input.errorMessage ?? null,
        input.localDate,
        input.localHour,
        input.localMinute,
        input.chatId
      )
      .run();
  }

  async getSentNudgeMessageIds(chatId: number, beforeTelegramMessageId: number): Promise<number[]> {
    const result = await this.db
      .prepare(`
        SELECT telegram_message_id
        FROM nudges
        WHERE chat_id = ?
          AND status = 'sent'
          AND telegram_message_id IS NOT NULL
          AND telegram_message_id < ?
        ORDER BY telegram_message_id ASC
      `)
      .bind(chatId, beforeTelegramMessageId)
      .all<{ telegram_message_id: number }>();

    return (result.results ?? []).map((row) => row.telegram_message_id);
  }

  async markNudgeDeleted(chatId: number, telegramMessageId: number): Promise<void> {
    await this.db
      .prepare("UPDATE nudges SET status = 'deleted' WHERE chat_id = ? AND telegram_message_id = ?")
      .bind(chatId, telegramMessageId)
      .run();
  }

  async reserveDailyPoster(localDate: string, chatId: number, nowIso: string): Promise<boolean> {
    const existing = await this.db
      .prepare("SELECT id FROM daily_posters WHERE local_date = ? AND chat_id = ?")
      .bind(localDate, chatId)
      .first<{ id: number }>();

    if (existing) {
      return false;
    }

    await this.db
      .prepare(`
        INSERT INTO daily_posters (
          local_date, chat_id, summary, image_prompt, r2_key, telegram_message_id, status, created_at_utc
        )
        VALUES (?, ?, '', '', NULL, NULL, 'pending', ?)
      `)
      .bind(localDate, chatId, nowIso)
      .run();
    return true;
  }

  async completeDailyPoster(input: DailyPosterInput): Promise<void> {
    await this.db
      .prepare(`
        UPDATE daily_posters
        SET summary = ?, image_prompt = ?, r2_key = ?, telegram_message_id = ?, status = ?, error_message = ?
        WHERE local_date = ? AND chat_id = ?
      `)
      .bind(
        input.summary,
        input.imagePrompt,
        input.r2Key,
        input.telegramMessageId,
        input.status,
        input.errorMessage ?? null,
        input.localDate,
        input.chatId
      )
      .run();
  }
}
