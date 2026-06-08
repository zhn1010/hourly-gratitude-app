import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiClient } from "../clients/openaiClient";

describe("OpenAiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends explicit poster image size and quality", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiClient("key", "text-model", "gpt-image-2");
    const image = await client.generatePosterImage("poster prompt", {
      size: "1024x1536",
      quality: "medium",
      retries: 0
    });

    const request = calls[0]?.[1];
    if (!request) {
      throw new Error("fetch request was not captured");
    }
    const body = JSON.parse(request.body as string) as Record<string, unknown>;

    expect(Array.from(image)).toEqual([1, 2, 3]);
    expect(body).toMatchObject({
      model: "gpt-image-2",
      prompt: "poster prompt",
      size: "1024x1536",
      quality: "medium"
    });
  });
});
