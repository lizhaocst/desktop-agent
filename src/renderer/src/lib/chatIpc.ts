import type { ChatStartRequest, ChatStartResponse, ChatStreamEvent } from '@renderer/types/chat'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isChatStartResponse = (value: unknown): value is ChatStartResponse => {
  if (!isObject(value)) {
    return false
  }

  return typeof value.streamId === 'string'
}

export const isChatStreamEvent = (value: unknown): value is ChatStreamEvent => {
  if (!isObject(value) || typeof value.streamId !== 'string' || typeof value.type !== 'string') {
    return false
  }

  if (value.type === 'start' || value.type === 'done') {
    return true
  }

  if (value.type === 'delta') {
    return typeof value.text === 'string'
  }

  if (value.type === 'tool_call_start') {
    return typeof value.toolName === 'string' && typeof value.callId === 'string'
  }

  if (value.type === 'tool_call_result') {
    return (
      typeof value.toolName === 'string' &&
      typeof value.callId === 'string' &&
      typeof value.ok === 'boolean'
    )
  }

  if (value.type === 'error') {
    return typeof value.message === 'string'
  }

  return false
}

export const startChatStream = async (payload: ChatStartRequest): Promise<ChatStartResponse> => {
  const response = await window.api.chat.start(payload)

  if (!isChatStartResponse(response)) {
    throw new Error('Invalid chat:start response shape')
  }

  return response
}

export const subscribeChatStream = (onEvent: (event: ChatStreamEvent) => void): (() => void) => {
  return window.api.chat.onStream((payload: unknown) => {
    if (isChatStreamEvent(payload)) {
      onEvent(payload)
    }
  })
}
