import OpenAI from 'openai';
import {
  GenerateTextOptions,
  LLMProvider,
  LLMResponse,
} from './llm.provider.js';

export interface GroqProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  timeoutMs?: number;
}

export class GroqProvider implements LLMProvider {
  public readonly name = 'groq';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;

  constructor(config: GroqProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? 'https://api.groq.com/openai/v1',
      timeout: config.timeoutMs ?? 30_000,
    });
    this.model = config.model;
    this.defaultMaxTokens = config.defaultMaxTokens ?? 1500;
    this.defaultTemperature = config.defaultTemperature ?? 0.3;
  }

  async generateText(options: GenerateTextOptions): Promise<LLMResponse> {
    const completion = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: options.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature: options.temperature ?? this.defaultTemperature,
        max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      },
      { signal: options.signal }
    );

    const choice = completion.choices[0];
    const content = choice?.message?.content;

    if (!content) {
      throw new Error('Groq returned an empty response');
    }

    return {
      content,
      model: completion.model,
      finishReason: choice.finish_reason ?? undefined,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };
  }
}