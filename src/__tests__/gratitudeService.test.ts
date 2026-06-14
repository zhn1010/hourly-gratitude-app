import { describe, expect, it } from "vitest";
import { GratitudeService } from "../services/gratitudeService";
import type { AppConfig, TelegramUpdate } from "../types";

const config: AppConfig = {
  timezone: "Europe/Berlin",
  telegramBotToken: "token",
  telegramWebhookSecret: "secret",
  allowedTelegramUserId: 123,
  openAiApiKey: "key",
  openAiTextModel: "model",
  openAiFastTextModel: "fast-model",
  openAiPosterTextModel: "poster-model",
  openAiImageModel: "image",
  posterImageQuality: "medium",
  posterImageSize: "1024x1536",
  allowedReactions: ["🙏", "🎉"]
};

const baseUpdate: TelegramUpdate = {
  update_id: 1,
  message: {
    message_id: 10,
    date: Date.parse("2026-05-25T10:00:00.000Z") / 1000,
    chat: { id: 123, type: "private" },
    from: { id: 123, first_name: "Saeed" },
    text: "I am grateful for coffee."
  }
};

describe("GratitudeService", () => {
  it("stores gratitude and reacts for the authorized user", async () => {
    const inserted: string[] = [];
    const reactions: string[] = [];
    const service = new GratitudeService(
      {
        reserveUpdate: async () => true,
        insertGratitudeEntry: async (input: { text: string }) => inserted.push(input.text),
        getSentNudgeMessageIds: async (_chatId: number, _beforeMessageId: number, localDate: string, localHour: number) => {
          expect(localDate).toBe("2026-05-25");
          expect(localHour).toBe(12);
          return [];
        },
        markNudgeDeleted: async () => {},
        getEntriesForDate: async () => [],
        setEntryReaction: async (_chatId: number, _messageId: number, emoji: string) => reactions.push(emoji)
      } as never,
      { setMessageReaction: async (_chatId: number, _messageId: number, emoji: string) => reactions.push(emoji) } as never,
      { selectReaction: async () => "🎉" } as never,
      config
    );

    await service.handleUpdate(baseUpdate);

    expect(inserted).toEqual(["I am grateful for coffee."]);
    expect(reactions).toEqual(["🎉", "🎉"]);
  });

  it("deletes previous nudge messages when gratitude is accepted", async () => {
    const deleted: number[] = [];
    const marked: number[] = [];
    const service = new GratitudeService(
      {
        reserveUpdate: async () => true,
        insertGratitudeEntry: async () => {},
        getSentNudgeMessageIds: async (
          _chatId: number,
          beforeMessageId: number,
          localDate: string,
          localHour: number
        ) => {
          expect(beforeMessageId).toBe(10);
          expect(localDate).toBe("2026-05-25");
          expect(localHour).toBe(12);
          return [7, 8, 9];
        },
        markNudgeDeleted: async (_chatId: number, messageId: number) => marked.push(messageId),
        getEntriesForDate: async () => [],
        setEntryReaction: async () => {}
      } as never,
      {
        deleteMessage: async (_chatId: number, messageId: number) => deleted.push(messageId),
        setMessageReaction: async () => {}
      } as never,
      { selectReaction: async () => "🙏" } as never,
      config
    );

    await service.handleUpdate(baseUpdate);

    expect(deleted).toEqual([7, 8, 9]);
    expect(marked).toEqual([7, 8, 9]);
  });

  it("retries with the fallback reaction when the selected emoji is rejected", async () => {
    const attempted: string[] = [];
    const recorded: string[] = [];
    const service = new GratitudeService(
      {
        reserveUpdate: async () => true,
        insertGratitudeEntry: async () => {},
        getSentNudgeMessageIds: async () => [],
        markNudgeDeleted: async () => {},
        getEntriesForDate: async () => [],
        setEntryReaction: async (_chatId: number, _messageId: number, emoji: string) => recorded.push(emoji)
      } as never,
      {
        setMessageReaction: async (_chatId: number, _messageId: number, emoji: string) => {
          attempted.push(emoji);
          if (emoji === "🫶") {
            throw new Error("unsupported reaction");
          }
        }
      } as never,
      { selectReaction: async () => "🫶" } as never,
      config
    );

    await service.handleUpdate(baseUpdate);

    expect(attempted).toEqual(["🫶", "🙏"]);
    expect(recorded).toEqual(["🙏"]);
  });

  it("ignores duplicate updates", async () => {
    let inserts = 0;
    const service = new GratitudeService(
      {
        reserveUpdate: async () => false,
        insertGratitudeEntry: async () => { inserts += 1; }
      } as never,
      {} as never,
      {} as never,
      config
    );

    await service.handleUpdate(baseUpdate);

    expect(inserts).toBe(0);
  });

  it("ignores commands", async () => {
    let inserts = 0;
    const service = new GratitudeService(
      {
        reserveUpdate: async () => true,
        insertGratitudeEntry: async () => { inserts += 1; }
      } as never,
      {} as never,
      {} as never,
      config
    );

    await service.handleUpdate({
      ...baseUpdate,
      message: { ...baseUpdate.message!, text: "/start" }
    });

    expect(inserts).toBe(0);
  });
});
