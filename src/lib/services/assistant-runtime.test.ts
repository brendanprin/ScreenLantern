import { describe, expect, it } from "vitest";

import { resolveAssistantRuntimeConfig } from "@/lib/services/assistant-runtime";

describe("resolveAssistantRuntimeConfig", () => {
  it("uses OpenAI by default and falls back to mock mode when no API key is present", () => {
    const config = resolveAssistantRuntimeConfig({
      aiProvider: "openai",
      aiUseMockData: false,
    });

    expect(config.provider).toBe("openai");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.model).toBe("gpt-5.4-mini");
    expect(config.isMockMode).toBe(true);
    expect(config.runtimeMode).toBe("mock");
    expect(config.providerLabel).toBe("Mock AI");
  });

  it("uses OpenAI live mode when an API key is configured", () => {
    const config = resolveAssistantRuntimeConfig({
      aiProvider: "openai",
      aiApiKey: "sk-test",
      aiModel: "gpt-5.4-mini",
      aiUseMockData: false,
    });

    expect(config.provider).toBe("openai");
    expect(config.apiKey).toBe("sk-test");
    expect(config.isMockMode).toBe(false);
    expect(config.runtimeMode).toBe("openai");
    expect(config.providerLabel).toBe("OpenAI");
  });

  it("supports Ollama without requiring a real API key", () => {
    const config = resolveAssistantRuntimeConfig({
      aiProvider: "ollama",
      aiUseMockData: false,
    });

    expect(config.provider).toBe("ollama");
    expect(config.baseUrl).toBe("http://localhost:11434/v1");
    expect(config.apiKey).toBe("ollama");
    expect(config.model).toBe("llama3.2");
    expect(config.isMockMode).toBe(false);
    expect(config.runtimeMode).toBe("ollama");
    expect(config.providerLabel).toBe("Local Ollama");
  });

  it("normalizes custom base urls and respects the generic AI env vars", () => {
    const config = resolveAssistantRuntimeConfig({
      aiProvider: "ollama",
      aiBaseUrl: "http://localhost:11434/v1/",
      aiApiKey: "custom-key",
      aiModel: "llama3.2:latest",
      aiUseMockData: false,
    });

    expect(config.baseUrl).toBe("http://localhost:11434/v1");
    expect(config.apiKey).toBe("custom-key");
    expect(config.model).toBe("llama3.2:latest");
  });
});
