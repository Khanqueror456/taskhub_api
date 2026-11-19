import OpenAI from 'openai';
import {
  ChatMessage,
  ToolCall,
  GenerateStructuredOptions,
  GenerateTextOptions,
  GenerateWithToolsOptions,
  LLMProvider,
  LLMResponse,
  LLMStructuredResponse,
  LLMToolResponse,
  StreamChunk,
} from './llm.provider.js';

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
        messages: this.toOpenAIMessages(options.messages),
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

  async *streamText(
    options: GenerateTextOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: this.toOpenAIMessages(options.messages),
        temperature: options.temperature ?? this.defaultTemperature,
        max_tokens: options.maxTokens ?? this.defaultMaxTokens,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: options.signal }
    );

    let lastModel = this.model;
    let lastFinishReason: string | undefined;

    for await (const part of stream) {
      lastModel = part.model ?? lastModel;
      const choice = part.choices[0];
      const delta = choice?.delta?.content ?? '';

      if (choice?.finish_reason) {
        lastFinishReason = choice.finish_reason;
      }

      if (delta) {
        yield { delta, done: false };
      }

      if (part.usage) {
        yield {
          delta: '',
          done: true,
          model: lastModel,
          finishReason: lastFinishReason,
          usage: {
            promptTokens: part.usage.prompt_tokens,
            completionTokens: part.usage.completion_tokens,
            totalTokens: part.usage.total_tokens,
          }
        }

        return;
      }
    }

    yield { delta: '', done: true, model: lastModel, finishReason: lastFinishReason };
  }


  // Inside GroqProvider:

  async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<LLMStructuredResponse<T>> {

    const completion = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: this.toOpenAIMessages(options.messages),
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? this.defaultMaxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: options.schemaName,
            strict: true,
            schema: options.jsonSchema
          }
        }
      },
      { signal: options.signal }
    );

    const choice = completion.choices[0];
    const content = choice?.message?.content;

    if (!content) {
      throw new Error('Groq returned an empty structured response');
    }

    const parsedJson = JSON.parse(content);
    const validatedData = options.zodSchema.parse(parsedJson);

    return {
      data: validatedData,
      model: completion.model,
      finishReason: choice.finish_reason ?? undefined,
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  private toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role == 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId ?? '',
          content: m.content ?? '',
        };
      }

      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.argumentsJson,
            },
          })),
        };
      }

      return {
        role : m.role as 'system' | 'user' | 'assistant',
        content : m.content ?? '',
      };
    });
  }

  async generateWithTools(options : GenerateWithToolsOptions) : Promise<LLMToolResponse> {
    const completion = await this.client.chat.completions.create(
      {
        model : this.model,
        messages : this.toOpenAIMessages(options.messages),
        tools : options.tools.map((t) => ({
          type : 'function' as const,
          function : {
            name : t.name,
            description : t.description,
            parameters : t.parameters,
          },
        })),
        tool_choice : 'auto',
        temperature : options.temperature ?? this.defaultTemperature,
        max_tokens : options.maxTokens ?? this.defaultMaxTokens,
      },
      { signal : options.signal }
    );

    const choice = completion.choices[0];
    const msg = choice?.message;

    const toolCalls : ToolCall[] = (msg?.tool_calls ?? [])
    .filter((tc) : tc is Extract<typeof tc, { type : 'function' }> => tc.type === 'function')
    .map((tc) => ({
      id : tc.id,
      name : tc.function.name,
      argumentsJson : tc.function.arguments,
    }));

    return {
      content : msg?.content ?? null,
      toolCalls,
      model : completion.model,
      finishReason : choice?.finish_reason ?? undefined,
      usage : completion.usage ?
      {
        promptTokens : completion.usage.prompt_tokens,
        completionTokens : completion.usage.completion_tokens,
        totalTokens : completion.usage.total_tokens
      } : undefined,
    };
  }
}