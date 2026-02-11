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

  type ChatStreamErrorEvent = {
    streamId: string
    type: 'error'
    message: string
  }

  type ChatStreamEvent =
    | ChatStreamStartEvent
    | ChatStreamDeltaEvent
    | ChatStreamDoneEvent
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
