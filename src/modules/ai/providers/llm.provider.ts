import { z } from 'zod';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
    id : string;
    name : string;
    argumentsJson : string;
}

export interface ToolDefinition {
    name : string;
    description : string;
    parameters : Record<string, unknown>;
}

export interface GenerateWithToolsOptions extends GenerateTextOptions {
    tools : ToolDefinition[];
}

export interface ChatMessage {
    role : MessageRole;
    content : string | null;
    toolCallId? : string;
    toolCalls? : ToolCall[];
    name? : string;
}

export interface GenerateTextOptions {
    messages : ChatMessage[];
    temperature? : number;
    maxTokens? : number;
    signal? : AbortSignal;
}

export interface GenerateStructuredOptions<T> extends GenerateTextOptions {
    schemaName : string;
    jsonSchema : Record<string, unknown>;
    zodSchema : z.ZodType<T>;
}

export interface LLMStructuredResponse<T> {
    data : T;
    model : string;
    finishReason? : string;
    usage? : LLMUsage;
}

export interface LLMUsage {
    promptTokens : number;
    completionTokens : number;
    totalTokens : number;
}

export interface LLMResponse {
    content : string;
    model : string;
    usage? : LLMUsage;
    finishReason? : string;
}

export interface LLMToolResponse {
    content : string | null;
    toolCalls : ToolCall[];
    model : string;
    finishReason? : string;
    usage? : LLMUsage;
}

export interface StreamChunk {
    delta : string;
    done : boolean;
    model? : string;
    finishReason? : string;
    usage? : LLMUsage
}

export interface LLMProvider {
    readonly name : string;
    generateText(options : GenerateTextOptions) : Promise<LLMResponse>;
    streamText(options : GenerateTextOptions) : AsyncGenerator<StreamChunk, void, unknown>;
    generateStructured<T>(
        options : GenerateStructuredOptions<T>
    ) : Promise<LLMStructuredResponse<T>>;
    generateWithTools(options : GenerateWithToolsOptions) : Promise<LLMToolResponse>;
}