import { ChatMessage } from "../providers/llm.provider.js";


export function estimateTokens(text : string) : number {
    return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(messages : ChatMessage[]) : number {
    return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

export function applyTokenBudget(
    systemMessage : ChatMessage,
    history : ChatMessage[],
    userMessage : ChatMessage,
    maxInputTokens = 400
) : ChatMessage[] {

    const baseTokens = estimateMessageTokens([systemMessage, userMessage]);

    if (baseTokens > maxInputTokens) {
        throw new Error(
            `Prompt exceeds input token budget (${baseTokens} > ${maxInputTokens})`
        )
    }

    const keptHistory : ChatMessage[] = [];
    let runningTokens = baseTokens;

    // Keep the most recent turns first
    for(let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        const msgTokens = estimateTokens(msg.content) + 4;

        if (runningTokens + msgTokens > maxInputTokens) {
            break;
        }

        keptHistory.unshift(msg);
        runningTokens += msgTokens;
    }

    return [systemMessage, ...keptHistory, userMessage];
}