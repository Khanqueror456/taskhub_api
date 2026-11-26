import { ToolCall } from "../providers/llm.provider.js";
import { ToolExecutionContext, ToolRegistry } from "./tool.registry.js";
import { logger } from "../../../config/logger.js";

export class ToolExecutor {
    constructor(private readonly registry: ToolRegistry) { }

    async execute(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
        const tool = this.registry.get(toolCall.name);

        if (!tool) {
            return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
        }

        let rawArgs: unknown;

        try {
            rawArgs = toolCall.argumentsJson ? JSON.parse(toolCall.argumentsJson) : {};
        } catch (error) {
            return JSON.stringify({ error: 'Invalid JSON arguments from model' });
        }

        const parsed = tool.argsSchema.safeParse(rawArgs);
        if (!parsed.success) {
            return JSON.stringify({
                error: 'Invalid tool arguments',
                details: parsed.error.flatten(),
            });
        }

        try {
            const result = await tool.execute(parsed.data, ctx);
            return JSON.stringify(result);
        } catch (err) {
            logger.warn({ err, tool: name }, 'Tool execution failed');
            return JSON.stringify({ ok: false, error: 'Tool execution failed' });
        }
    }
}