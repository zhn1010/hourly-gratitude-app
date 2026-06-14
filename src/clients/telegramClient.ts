import { fetchJson, HttpError } from "../httpClient";
import { logError, logInfo, logWarn } from "../logger";
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
    const sent = await this.call<TelegramMessageResult>("sendMessage", {
      chat_id: chatId,
      text,
      disable_notification: false
    });
    logInfo("telegram_send_message_succeeded", { chatId, messageId: sent.message_id });
    return sent;
  }

  async sendPhoto(chatId: number, photo: Uint8Array, caption: string): Promise<TelegramMessageResult> {
    const body = new FormData();
    body.set("chat_id", String(chatId));
    body.set("caption", caption);
    body.set("photo", new File([photo], "gratitude-poster.png", { type: "image/png" }));

    const sent = await this.call<TelegramMessageResult>("sendPhoto", body);
    logInfo("telegram_send_photo_succeeded", { chatId, messageId: sent.message_id });
    return sent;
  }

  async setMessageReaction(chatId: number, messageId: number, emoji: string): Promise<void> {
    await this.call<boolean>("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
      is_big: false
    });
    logInfo("telegram_set_reaction_succeeded", { chatId, messageId, emoji });
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.call<boolean>("deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
    logInfo("telegram_delete_message_succeeded", { chatId, messageId });
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

    let response: TelegramApiResponse<T>;
    try {
      response = await fetchJson<TelegramApiResponse<T>>(
        `${this.baseUrl}/${method}`,
        init,
        { timeoutMs: 20_000, retries: 2 }
      );
    } catch (error) {
      if (error instanceof HttpError) {
        logError("telegram_api_http_failed", error, {
          method,
          status: error.status,
          responseBody: truncateLogValue(error.bodyText)
        });
      } else {
        logError("telegram_api_request_failed", error, { method });
      }
      throw new Error(`Telegram ${method} request failed`);
    }

    if (!response.ok || response.result === undefined) {
      logWarn("telegram_api_result_failed", { method, description: truncateLogValue(response.description) });
      throw new Error(response.description ?? `Telegram ${method} failed`);
    }

    return response.result;
  }
}

function truncateLogValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}
