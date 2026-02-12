declare module '@ai-sdk/openai' {
  export function createOpenAI(options: {
    apiKey?: string
    baseURL?: string
  }): (model: string) => unknown
}

declare module 'ai' {
  export function streamText(options: {
    model: unknown
    prompt: string
  }): {
    textStream: AsyncIterable<string>
  }
}
