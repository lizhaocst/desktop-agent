export interface ChatStartRequest {
  sessionId: string
  message: string
}

export interface ChatStartResponse {
  streamId: string
}

export type ChatStreamEvent =
  | { streamId: string; type: 'start' }
  | { streamId: string; type: 'delta'; text: string }
  | { streamId: string; type: 'done' }
  | { streamId: string; type: 'error'; message: string }
