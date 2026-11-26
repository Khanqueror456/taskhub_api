import { z } from 'zod';
import { ToolDefinition } from '../providers/llm.provider.js';

export interface ToolExecutionContext {
    organizationId : string;
    userId : string;
    userRole : 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface RegisteredTool<TArgs = unknown> {
    name : string;
    description : string;
    parameters : Record<string, unknown>;
    argsSchema : z.ZodType<TArgs>;
    execute : (args : TArgs, ctx : ToolExecutionContext) => Promise<unknown>;
}

export class ToolRegistry {
    private readonly tools = new Map<string, RegisteredTool>();

    register<TArgs>(tool : RegisteredTool<TArgs>) : void {
        this.tools.set(tool.name, {
            ...tool,
            argsSchema : tool.argsSchema as z.ZodType<unknown>,
            execute : (args, ctx) => tool.execute(args as TArgs, ctx),
        });
    }

    get(name : string) : RegisteredTool | undefined {
        return this.tools.get(name);
    }

    listDefinitions() : ToolDefinition[] {
        return Array.from(this.tools.values()).map(({name, description, parameters}) => ({
            name,
            description,
            parameters
        }))
    }
}