export interface ChatStartRequest {
  sessionId: string
  message: string
}

export interface ChatStartResponse {
  streamId: string
}

export interface ChatStreamToolCallStartEvent {
  streamId: string
  type: 'tool_call_start'
  toolName: string
  callId: string
}

export interface ChatStreamToolCallResultEvent {
  streamId: string
  type: 'tool_call_result'
  toolName: string
  callId: string
  ok: boolean
  output?: unknown
  error?: unknown
}

export type ChatStreamEvent =
  | { streamId: string; type: 'start' }
  | { streamId: string; type: 'delta'; text: string }
  | ChatStreamToolCallStartEvent
  | ChatStreamToolCallResultEvent
  | { streamId: string; type: 'done' }
  | { streamId: string; type: 'error'; message: string }
