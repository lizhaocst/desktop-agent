import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  type ChatStartRequest = {
    sessionId: string
    message: string
  }

  type ChatStartResponse = {
    streamId: string
  }

  type ChatStreamStartEvent = {
    streamId: string
    type: 'start'
  }

  type ChatStreamDeltaEvent = {
    streamId: string
    type: 'delta'
    text: string
  }

  type ChatStreamDoneEvent = {
    streamId: string
    type: 'done'
  }

  type ChatStreamToolCallStartEvent = {
    streamId: string
    type: 'tool_call_start'
    toolName: string
    callId: string
  }

  type ChatStreamToolCallResultEvent = {
    streamId: string
    type: 'tool_call_result'
    toolName: string
    callId: string
    ok: boolean
    output?: unknown
    error?: string
  }

  type ChatStreamErrorEvent = {
    streamId: string
    type: 'error'
    message: string
  }

  type ChatStreamEvent =
    | ChatStreamStartEvent
    | ChatStreamDeltaEvent
    | ChatStreamDoneEvent
    | ChatStreamToolCallStartEvent
    | ChatStreamToolCallResultEvent
    | ChatStreamErrorEvent

  interface ChatApi {
    start: (request: ChatStartRequest) => Promise<ChatStartResponse>
    onStream: (listener: (event: ChatStreamEvent) => void) => () => void
  }

  interface Api {
    chat: ChatApi
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
