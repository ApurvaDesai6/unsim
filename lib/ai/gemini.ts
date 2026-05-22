import { GoogleGenAI } from "@google/genai";
import type { AIMessage, AIProvider, AIResponse, GenerateOptions } from "./provider";

export class GeminiProvider implements AIProvider {
  name = "gemini";
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    });
  }

  async generate(messages: AIMessage[], options?: GenerateOptions): Promise<AIResponse> {
    const systemMsg = messages.find((m) => m.role === "system");
    const conversationMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

    const response = await this.client.models.generateContent({
      model: options?.model || "gemini-2.0-flash",
      contents: conversationMsgs as never,
      config: {
        systemInstruction: systemMsg?.content,
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens || 4096,
      },
    });

    return {
      text: response.text ?? "",
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          }
        : undefined,
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
      temperature: options?.temperature ?? 0.2,
    });

    return JSON.parse(response.text) as T;
  }
}
