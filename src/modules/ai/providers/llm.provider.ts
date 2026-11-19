import { z } from 'zod';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
    role : MessageRole;
    content : string;
    toolCallId? : string;
    name? : string
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
}