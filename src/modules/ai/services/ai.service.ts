import { LLMProvider, LLMResponse } from "../providers/llm.provider.js";
import { OpenAIProvider } from "../providers/openai.provider.js";
import { GroqProvider } from '../providers/groq.provider.js';

export class AIService{
    constructor(private readonly provider : LLMProvider) {};

    async chat(userMessage : string) : Promise<LLMResponse> {
        return this.provider.generateText({
            messages : [
                {
                    role : 'system',
                    content : 'You are TaskHub AI Copilot, a concisse and accurate project management assistant.',
                },
                {
                    role : 'user',
                    content : userMessage
                }
            ],
        });
    }
}

// export function createAIService() : AIService {
//     const apiKey = process.env.AI_API_KEY;
//     if (!apiKey) {
//         throw new Error('AI_API_KEY is not configured');
//     }

//     const provider = new OpenAIProvider({
//         apiKey,
//         baseURL : process.env.AI_BASE_URL,
//         model : process.env.AI_MODEL ?? 'gpt-4o-mini',
//         defaultMaxTokens : Number(process.env.AI_MAX_TOKENS ?? 2000),
//         defaultTemperature : Number(process.env.AI_TEMPERATURE ?? 0.3),
//         timeoutMs : Number(process.env.AI_TIMEOUT_MS ?? 30_000),
//     });

//     return new AIService(provider);
// }

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