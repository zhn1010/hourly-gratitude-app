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
