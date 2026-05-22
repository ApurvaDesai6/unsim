import Anthropic from "@anthropic-ai/sdk";
import type { AIMessage, AIProvider, AIResponse, GenerateOptions } from "./provider";

export class ClaudeProvider implements AIProvider {
  name = "claude";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async generate(messages: AIMessage[], options?: GenerateOptions): Promise<AIResponse> {
    const systemMsg = messages.find((m) => m.role === "system");
    const conversationMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.client.messages.create({
      model: options?.model || "claude-sonnet-4-20250514",
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      system: systemMsg?.content,
      messages: conversationMsgs,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async generateStructured<T>(
    messages: AIMessage[],
    schema: object,
    options?: GenerateOptions,
  ): Promise<T> {
    const schemaPrompt = `\n\nRespond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON, no markdown fences.`;
    const augmented = messages.map((m, i) =>
      i === messages.length - 1 && m.role === "user"
        ? { ...m, content: m.content + schemaPrompt }
        : m,
    );

    const response = await this.generate(augmented, {
      ...options,
      temperature: options?.temperature ?? 0.3,
    });

    return JSON.parse(response.text) as T;
  }
}
