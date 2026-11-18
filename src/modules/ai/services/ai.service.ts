import { LLMProvider, LLMResponse } from "../providers/llm.provider.js";
import { GroqProvider } from '../providers/groq.provider.js';
import { buildCopilotSystemPrompt, CopilotPromptContext } from "../prompts/system.prompt.js";
import { applyTokenBudget } from "../utils/token-budget.js";
import { ChatRequestInput } from "../schemas/chat.schema.js";

export class AIService{
    constructor(private readonly provider : LLMProvider) {};

    async chat(input : ChatRequestInput, context : CopilotPromptContext) : Promise<LLMResponse> {
        const systemMessage = {
          role : 'system' as const,
          content : buildCopilotSystemPrompt({
            ...context,
            projectSummary : input.projectSummary,
          }),
        }

        const userMessage = {
          role : 'user' as const,
          content : input.message
        };

        const messages = applyTokenBudget(systemMessage, input.history, userMessage, 4000);

        return this.provider.generateText({ messages });
    }
}


export function createAIService(): AIService {
  const providerName = process.env.AI_PROVIDER ?? 'groq';

  if (providerName === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    return new AIService(
      new GroqProvider({
        apiKey,
        baseURL: process.env.AI_BASE_URL,
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b',
        defaultMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 1500),
        defaultTemperature: Number(process.env.AI_TEMPERATURE ?? 0.3),
        timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
      })
    );
  }

  throw new Error(`Unsupported AI_PROVIDER: ${providerName}`);
}