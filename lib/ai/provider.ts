export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AIProvider {
  name: string;
  generate(messages: AIMessage[], options?: GenerateOptions): Promise<AIResponse>;
  generateStructured<T>(
    messages: AIMessage[],
    schema: object,
    options?: GenerateOptions,
  ): Promise<T>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

let defaultProvider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (!defaultProvider) {
    const name = process.env.AI_PROVIDER || "claude";
    if (name === "gemini") {
      const { GeminiProvider } = require("./gemini");
      defaultProvider = new GeminiProvider();
    } else {
      const { ClaudeProvider } = require("./claude");
      defaultProvider = new ClaudeProvider();
    }
  }
  return defaultProvider!;
}
