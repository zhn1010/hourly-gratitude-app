import { fetchJson } from "../httpClient";
import type { TelegramMessageResult } from "../types";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: number, text: string): Promise<TelegramMessageResult> {
    return this.call<TelegramMessageResult>("sendMessage", {
      chat_id: chatId,
      text,
      disable_notification: false
    });
  }

  async sendPhoto(chatId: number, photo: Uint8Array, caption: string): Promise<TelegramMessageResult> {
    const body = new FormData();
    body.set("chat_id", String(chatId));
    body.set("caption", caption);
    body.set("photo", new File([photo], "gratitude-poster.png", { type: "image/png" }));

    return this.call<TelegramMessageResult>("sendPhoto", body);
  }

  async setMessageReaction(chatId: number, messageId: number, emoji: string): Promise<void> {
    await this.call<boolean>("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
      is_big: false
    });
  }

  async sendChatAction(chatId: number, action: "typing" | "upload_photo"): Promise<void> {
    await this.call<boolean>("sendChatAction", {
      chat_id: chatId,
      action
    });
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const isFormData = body instanceof FormData;
    const init: RequestInit = {
      method: "POST",
      body: isFormData ? body : JSON.stringify(body)
    };

    if (!isFormData) {
      init.headers = { "content-type": "application/json" };
    }

    const response = await fetchJson<TelegramApiResponse<T>>(
      `${this.baseUrl}/${method}`,
      init,
      { timeoutMs: 20_000, retries: 2 }
    );

    if (!response.ok || response.result === undefined) {
      throw new Error(response.description ?? `Telegram ${method} failed`);
    }

    return response.result;
  }
}
