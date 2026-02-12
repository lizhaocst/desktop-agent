declare module '@ai-sdk/openai' {
  export function createOpenAI(options: {
    apiKey?: string
    baseURL?: string
  }): {
    (model: string): unknown
    chat: (model: string) => unknown
  }
}

declare module 'ai' {
  export function tool(definition: unknown): unknown
  export function stepCountIs(steps: number): unknown
  export function streamText(options: {
    model: unknown
    system?: string
    prompt: string
    tools?: unknown
    stopWhen?: unknown
  }): {
    textStream: AsyncIterable<string>
    fullStream: AsyncIterable<{
      type: string
      text?: string
      toolName?: string
      toolCallId?: string
      output?: unknown
      error?: unknown
      reason?: string
    }>
  }
}
