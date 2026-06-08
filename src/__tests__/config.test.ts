import { describe, expect, it } from "vitest";
import { getConfig } from "../config";
import type { Env, PosterImageQuality } from "../types";

describe("getConfig cost controls", () => {
  it.each<PosterImageQuality>(["low", "medium", "high", "auto"])("accepts poster image quality %s", (quality) => {
    expect(getConfig(env({ POSTER_IMAGE_QUALITY: quality })).posterImageQuality).toBe(quality);
  });

  it("rejects unsupported poster image quality", () => {
    expect(() => getConfig(env({ POSTER_IMAGE_QUALITY: "expensive" }))).toThrow(
      "POSTER_IMAGE_QUALITY must be one of: low, medium, high, auto"
    );
  });

  it("uses task-specific models and preserves OPENAI_TEXT_MODEL as fallback", () => {
    const config = getConfig(env({ OPENAI_TEXT_MODEL: "legacy-model" }));

    expect(config.openAiFastTextModel).toBe("legacy-model");
    expect(config.openAiPosterTextModel).toBe("legacy-model");
  });
});

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    POSTERS: {} as R2Bucket,
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    OPENAI_API_KEY: "openai-key",
    ALLOWED_TELEGRAM_USER_ID: "123",
    ...overrides
  };
}
