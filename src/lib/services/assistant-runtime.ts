import type { AssistantRuntimeMode } from "@/lib/types";

export type AssistantAiProvider = "openai" | "ollama";

interface AssistantRuntimeEnv {
  aiProvider?: string | null;
  aiBaseUrl?: string | null;
  aiApiKey?: string | null;
  openAiApiKey?: string | null;
  aiModel?: string | null;
  openAiModel?: string | null;
  aiUseMockData?: boolean | null;
}

export interface AssistantRuntimeConfig {
  provider: AssistantAiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  isMockMode: boolean;
  runtimeMode: AssistantRuntimeMode;
  providerLabel: string;
}

function normalizeProvider(provider: string | null | undefined): AssistantAiProvider {
  return provider?.trim().toLowerCase() === "ollama" ? "ollama" : "openai";
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function resolveAssistantRuntimeConfig(
  rawEnv: AssistantRuntimeEnv,
): AssistantRuntimeConfig {
  const provider = normalizeProvider(rawEnv.aiProvider);
  const baseUrl = normalizeBaseUrl(
    rawEnv.aiBaseUrl?.trim() ||
      (provider === "ollama"
        ? "http://localhost:11434/v1"
        : "https://api.openai.com/v1"),
  );
  const apiKey =
    rawEnv.aiApiKey?.trim() ||
    rawEnv.openAiApiKey?.trim() ||
    (provider === "ollama" ? "ollama" : "");
  const model =
    rawEnv.aiModel?.trim() ||
    rawEnv.openAiModel?.trim() ||
    (provider === "ollama" ? "llama3.2" : "gpt-5.4-mini");
  const isMockMode =
    Boolean(rawEnv.aiUseMockData) || (provider === "openai" && apiKey.length === 0);
  const runtimeMode: AssistantRuntimeMode = isMockMode ? "mock" : provider;

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    isMockMode,
    runtimeMode,
    providerLabel:
      runtimeMode === "mock"
        ? "Mock AI"
        : runtimeMode === "ollama"
          ? "Local Ollama"
          : "OpenAI",
  };
}
