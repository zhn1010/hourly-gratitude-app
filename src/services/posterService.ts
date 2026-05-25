import type { OpenAiClient } from "../clients/openaiClient";
import type { TelegramClient } from "../clients/telegramClient";
import { logError, logInfo } from "../logger";
import type { Repository } from "../repository";
import type { AppConfig } from "../types";
import { fallbackPosterPrompt, fallbackSummary, type LlmService } from "./llmService";

export class PosterService {
  constructor(
    private readonly repository: Repository,
    private readonly telegram: TelegramClient,
    private readonly openAi: OpenAiClient,
    private readonly llm: LlmService,
    private readonly posters: R2Bucket,
    private readonly config: AppConfig
  ) {}

  async sendDailyPoster(localDate: string): Promise<void> {
    const chatId = this.config.allowedTelegramUserId;
    const reserved = await this.repository.reserveDailyPoster(localDate, chatId, new Date().toISOString());
    if (!reserved) {
      logInfo("poster_already_reserved", { localDate });
      return;
    }

    const entries = await this.repository.getEntriesForDate(localDate);
    let summary = fallbackSummary(entries);
    let imagePrompt = fallbackPosterPrompt(localDate, entries);
    let caption = summary;

    try {
      const plan = await this.llm.createPosterPlan(localDate, entries);
      summary = plan.summary;
      imagePrompt = plan.image_prompt;
      caption = plan.caption;

      if (entries.length === 0) {
        const sent = await this.telegram.sendMessage(chatId, summary);
        await this.repository.completeDailyPoster({
          localDate,
          chatId,
          summary,
          imagePrompt,
          r2Key: null,
          telegramMessageId: sent.message_id,
          status: "skipped"
        });
        return;
      }

      await this.telegram.sendChatAction(chatId, "upload_photo");
      const image = await this.openAi.generatePosterImage(imagePrompt);
      const r2Key = `posters/${localDate}.png`;
      await this.posters.put(r2Key, image, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { localDate }
      });

      const sent = await this.telegram.sendPhoto(chatId, image, caption);
      await this.repository.completeDailyPoster({
        localDate,
        chatId,
        summary,
        imagePrompt,
        r2Key,
        telegramMessageId: sent.message_id,
        status: "sent"
      });
    } catch (error) {
      logError("poster_failed", error, { localDate });
      try {
        const sent = await this.telegram.sendMessage(chatId, summary);
        await this.repository.completeDailyPoster({
          localDate,
          chatId,
          summary,
          imagePrompt,
          r2Key: null,
          telegramMessageId: sent.message_id,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      } catch (fallbackError) {
        logError("poster_fallback_message_failed", fallbackError, { localDate });
        await this.repository.completeDailyPoster({
          localDate,
          chatId,
          summary,
          imagePrompt,
          r2Key: null,
          telegramMessageId: null,
          status: "failed",
          errorMessage: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }
  }
}
