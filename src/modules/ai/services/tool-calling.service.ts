import { AssistantTool } from "openai/resources/beta.mjs";
import { buildCopilotSystemPrompt } from "../prompts/system.prompt.js";
import { ChatMessage, LLMProvider, LLMUsage } from "../providers/llm.provider.js";
import { ChatRequestInput } from "../schemas/chat.schema.js";
import { ToolExecutor } from "../tools/tool.executor.js";
import { ToolExecutionContext, ToolRegistry } from "../tools/tool.registry.js";
import { applyTokenBudget } from "../utils/token-budget.js";

export interface AssistantResponse {
    content : string;
    model : string;
    iterations : number;
    toolsUsed : string[];
    usage : LLMUsage;
}

export class ToolCallingService {
    constructor(
        private readonly provider : LLMProvider,
        private readonly registry : ToolRegistry,
        private readonly executor : ToolExecutor,
        private readonly maxIterations = 5
    ) {}

    async run (
        input : ChatRequestInput,
        ctx : ToolExecutionContext
    ) : Promise<AssistantResponse> {
        const systemMessage : ChatMessage = {
            role : 'system',
            content : [
                buildCopilotSystemPrompt({...ctx, projectSummary : input.projectSummary}),
                '',
                'Use the provided tools when you need live organization, project, or task data.',
            ].join('\n')
        };

        const userMessage : ChatMessage = { role : 'user', content : input.message };
        const messages = applyTokenBudget(systemMessage, input.history, userMessage, 4000);
        const tools = this.registry.listDefinitions();

        const toolsUsed : string[] = [];
        const totalUsage : LLMUsage = { promptTokens : 0, completionTokens : 0, totalTokens : 0}

        for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
            const res = await this.provider.generateWithTools({ messages, tools });

            if (res.usage) {
                totalUsage.promptTokens += res.usage.promptTokens;
                totalUsage.completionTokens += res.usage.completionTokens;
                totalUsage.totalTokens += res.usage.totalTokens;
            }

            if (res.toolCalls.length === 0) {
                return {
                    content : res.content ?? '',
                    model : res.model,
                    iterations : iteration,
                    toolsUsed,
                    usage : totalUsage
                }
            }

            messages.push({
                role : 'assistant',
                content : res.content,
                toolCalls : res.toolCalls,
            });

            for (const tc of res.toolCalls) {
                toolsUsed.push(tc.name);

                const toolOutput = await this.executor.execute(tc, ctx);
                messages.push({
                    role : 'tool',
                    toolCallId : tc.id,
                    name : tc.name,
                    content : toolOutput
                })
            }
        }

        throw new Error(`Maximum tool-calling iterations (${this.maxIterations}) reached`);
    }
}