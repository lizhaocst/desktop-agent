import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useReducer, useState } from 'react'
import { startChatStream, subscribeChatStream } from '@renderer/lib/chatIpc'
import type { ChatStreamEvent } from '@renderer/types/chat'

type ChatRole = 'user' | 'assistant'
type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  streamId?: string
  status?: Exclude<StreamStatus, 'idle'>
  errorMessage?: string
}

interface ChatState {
  messages: ChatMessage[]
  activeStreamId: string | null
  pendingStreamId: string | null
  isStarting: boolean
  streamStatus: StreamStatus
  errorText: string | null
  lastUserMessage: string | null
  streamUpdatedAt: number | null
}

type ChatAction =
  | { type: 'user:submit'; text: string }
  | { type: 'start:request' }
  | { type: 'start:ack'; streamId: string }
  | { type: 'start:reject'; message: string }
  | { type: 'stream:event'; event: ChatStreamEvent }
  | { type: 'stream:timeout'; streamId: string | null; message: string }

const EMPTY_DONE_TEXT = '模型未返回文本'
const STREAM_TIMEOUT_TEXT = 'Stream timed out. Please retry.'

const initialState: ChatState = {
  messages: [],
  activeStreamId: null,
  pendingStreamId: null,
  isStarting: false,
  streamStatus: 'idle',
  errorText: null,
  lastUserMessage: null,
  streamUpdatedAt: null
}

const isKnownStreamEvent = (state: ChatState, streamId: string): boolean => {
  if (state.pendingStreamId === null && state.activeStreamId === null) {
    return true
  }

  return state.pendingStreamId === streamId || state.activeStreamId === streamId
}

const ensureStreamingMessage = (messages: ChatMessage[], streamId: string): ChatMessage[] => {
  const existingIndex = messages.findIndex((message) => message.streamId === streamId)
  if (existingIndex < 0) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        streamId,
        text: '',
        status: 'streaming'
      }
    ]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    return {
      ...message,
      status: 'streaming'
    }
  })
}

const appendDeltaToStream = (messages: ChatMessage[], streamId: string, text: string): ChatMessage[] => {
  const existingIndex = messages.findIndex((message) => message.streamId === streamId)
  if (existingIndex < 0) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        streamId,
        text,
        status: 'streaming'
      }
    ]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    return {
      ...message,
      status: 'streaming',
      text: `${message.text}${text}`
    }
  })
}

const markDoneForStream = (messages: ChatMessage[], streamId: string): ChatMessage[] => {
  const existingIndex = messages.findIndex((message) => message.streamId === streamId)
  if (existingIndex < 0) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        streamId,
        text: EMPTY_DONE_TEXT,
        status: 'done'
      }
    ]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    const nextText = message.text.trim().length > 0 ? message.text : EMPTY_DONE_TEXT

    return {
      ...message,
      status: 'done',
      text: nextText
    }
  })
}

const markErrorForStream = (messages: ChatMessage[], streamId: string, errorMessage: string): ChatMessage[] => {
  const existingIndex = messages.findIndex((message) => message.streamId === streamId)
  if (existingIndex < 0) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        streamId,
        text: errorMessage,
        status: 'error',
        errorMessage
      }
    ]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    return {
      ...message,
      status: 'error',
      errorMessage,
      text: message.text.length > 0 ? message.text : errorMessage
    }
  })
}

const reducer = (state: ChatState, action: ChatAction): ChatState => {
  if (action.type === 'user:submit') {
    return {
      ...state,
      errorText: null,
      lastUserMessage: action.text,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: 'user',
          text: action.text
        }
      ]
    }
  }

  if (action.type === 'start:request') {
    return {
      ...state,
      isStarting: true,
      errorText: null,
      streamStatus: 'streaming',
      streamUpdatedAt: Date.now()
    }
  }

  if (action.type === 'start:ack') {
    return {
      ...state,
      isStarting: false,
      pendingStreamId: state.activeStreamId === action.streamId ? null : action.streamId,
      errorText: null,
      streamStatus: 'streaming',
      streamUpdatedAt: Date.now()
    }
  }

  if (action.type === 'start:reject') {
    return {
      ...state,
      isStarting: false,
      pendingStreamId: null,
      activeStreamId: null,
      errorText: action.message,
      streamStatus: 'error',
      streamUpdatedAt: null,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: action.message,
          status: 'error',
          errorMessage: action.message
        }
      ]
    }
  }

  if (action.type === 'stream:timeout') {
    const expectedStreamId = state.activeStreamId ?? state.pendingStreamId
    if (!state.isStarting && expectedStreamId === null) {
      return state
    }

    if (action.streamId !== null && expectedStreamId !== null && action.streamId !== expectedStreamId) {
      return state
    }

    return {
      ...state,
      isStarting: false,
      pendingStreamId: null,
      activeStreamId: null,
      errorText: action.message,
      streamStatus: 'error',
      streamUpdatedAt: null,
      messages:
        expectedStreamId === null
          ? [
              ...state.messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                text: action.message,
                status: 'error',
                errorMessage: action.message
              }
            ]
          : markErrorForStream(state.messages, expectedStreamId, action.message)
    }
  }

  const { event } = action
  if (!isKnownStreamEvent(state, event.streamId)) {
    return state
  }

  if (event.type === 'start') {
    return {
      ...state,
      isStarting: false,
      activeStreamId: event.streamId,
      pendingStreamId: state.pendingStreamId === event.streamId ? null : state.pendingStreamId,
      streamStatus: 'streaming',
      streamUpdatedAt: Date.now(),
      messages: ensureStreamingMessage(state.messages, event.streamId)
    }
  }

  if (event.type === 'delta') {
    return {
      ...state,
      isStarting: false,
      activeStreamId: event.streamId,
      pendingStreamId: state.pendingStreamId === event.streamId ? null : state.pendingStreamId,
      streamStatus: 'streaming',
      streamUpdatedAt: Date.now(),
      messages: appendDeltaToStream(state.messages, event.streamId, event.text)
    }
  }

  if (event.type === 'done') {
    const nextPending = state.pendingStreamId === event.streamId ? null : state.pendingStreamId
    const nextActive = state.activeStreamId === event.streamId ? null : state.activeStreamId
    const hasInFlight = state.isStarting || nextPending !== null || nextActive !== null

    return {
      ...state,
      isStarting: false,
      pendingStreamId: nextPending,
      activeStreamId: nextActive,
      errorText: hasInFlight ? state.errorText : null,
      streamStatus: hasInFlight ? 'streaming' : 'done',
      streamUpdatedAt: hasInFlight ? Date.now() : null,
      messages: markDoneForStream(state.messages, event.streamId)
    }
  }

  const nextPending = state.pendingStreamId === event.streamId ? null : state.pendingStreamId
  const nextActive = state.activeStreamId === event.streamId ? null : state.activeStreamId
  const hasInFlight = state.isStarting || nextPending !== null || nextActive !== null

  return {
    ...state,
    isStarting: false,
    pendingStreamId: nextPending,
    activeStreamId: nextActive,
    errorText: event.message,
    streamStatus: hasInFlight ? 'streaming' : 'error',
    streamUpdatedAt: hasInFlight ? Date.now() : null,
    messages: markErrorForStream(state.messages, event.streamId, event.message)
  }
}

function App(): React.JSX.Element {
  const [inputText, setInputText] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    return subscribeChatStream((event) => {
      dispatch({ type: 'stream:event', event })
    })
  }, [])

  const inFlightStreamId = state.activeStreamId ?? state.pendingStreamId

  useEffect(() => {
    if (!state.isStarting && inFlightStreamId === null) {
      return
    }

    const timeoutMs = 20000
    const baseTime = state.streamUpdatedAt ?? Date.now()
    const delay = Math.max(0, timeoutMs - (Date.now() - baseTime))
    const timerId = window.setTimeout(() => {
      dispatch({ type: 'stream:timeout', streamId: inFlightStreamId, message: STREAM_TIMEOUT_TEXT })
    }, delay)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [state.isStarting, inFlightStreamId, state.streamUpdatedAt])

  const hasInFlight = state.isStarting || state.pendingStreamId !== null || state.activeStreamId !== null
  const canSend = inputText.trim().length > 0 && !hasInFlight && !isComposing

  const sendMessage = async (rawMessage: string): Promise<void> => {
    const message = rawMessage.trim()
    if (!message || hasInFlight || isComposing) {
      return
    }

    dispatch({ type: 'user:submit', text: message })
    dispatch({ type: 'start:request' })
    setInputText('')

    try {
      const result = await startChatStream({
        sessionId: 'default',
        message
      })

      dispatch({ type: 'start:ack', streamId: result.streamId })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'chat:start invoke failed'
      dispatch({ type: 'start:reject', message: messageText })
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    await sendMessage(inputText)
  }

  const onRetry = async (): Promise<void> => {
    if (!state.lastUserMessage || hasInFlight) {
      return
    }

    await sendMessage(state.lastUserMessage)
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    const nativeEvent = event.nativeEvent
    if (isComposing || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      return
    }

    event.preventDefault()
    void sendMessage(inputText)
  }

  return (
    <main className="chat-app">
      <header className="chat-header">
        <span>R-P1-Loop Chat</span>
        <span className={`stream-status status-${state.streamStatus}`}>{state.streamStatus}</span>
      </header>
      {state.errorText && (
        <section className="error-banner" role="alert">
          <span>{state.errorText}</span>
          <button type="button" className="retry-button" onClick={onRetry} disabled={hasInFlight}>
            Retry last message
          </button>
        </section>
      )}
      <section className="message-list" aria-live="polite">
        {state.messages.length === 0 ? (
          <p className="empty">Send a message to start the chat.</p>
        ) : (
          state.messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <p>{message.text || '...'}</p>
              {message.status && <small className="message-meta">{message.status}</small>}
              {message.status === 'error' && message.errorMessage && (
                <small className="message-error">{message.errorMessage}</small>
              )}
            </article>
          ))
        )}
      </section>
      <form className="chat-input" onSubmit={onSubmit}>
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={onInputKeyDown}
          rows={3}
          placeholder="Type your message"
          disabled={hasInFlight}
        />
        <div className="actions">
          <button type="submit" disabled={!canSend}>
            {hasInFlight ? 'Working...' : 'Send'}
          </button>
        </div>
      </form>
    </main>
  )
}

export default App
