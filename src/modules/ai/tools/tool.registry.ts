import { z } from 'zod';
import { ToolDefinition } from '../providers/llm.provider.js';

export interface ToolExecutionContext {
    organizationId : string;
    userId : string;
    userRole : 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface RegisteredTool<TArgs = any> {
    name : string;
    description : string;
    parameters : Record<string, unknown>;
    argsSchema : z.ZodType<TArgs>;
    execute : (args : TArgs, ctx : ToolExecutionContext) => Promise<unknown>;
}

export class ToolRegistery {
    private readonly tools = new Map<string, RegisteredTool>();

    register<TArgs>(tool : RegisteredTool<TArgs>) : void {
        this.tools.set(tool.name, tool);
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