import { LLMProvider, LLMResponse } from "../providers/llm.provider.js";
import { OpenAIProvider } from "../providers/openai.provider.js";

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

export function createAIService() : AIService {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
        throw new Error('AI_API_KEY is not configured');
    }

    const provider = new OpenAIProvider({
        apiKey,
        baseURL : process.env.AI_BASE_URL,
        model : process.env.AI_MODEL ?? 'gpt-4o-mini',
        defaultMaxTokens : Number(process.env.AI_MAX_TOKENS ?? 2000),
        defaultTemperature : Number(process.env.AI_TEMPERATURE ?? 0.3),
        timeoutMs : Number(process.env.AI_TIMEOUT_MS ?? 30_000),
    });

    return new AIService(provider);
}