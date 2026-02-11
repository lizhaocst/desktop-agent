import { FormEvent, useEffect, useReducer, useState } from 'react'
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
}

type ChatAction =
  | { type: 'user:submit'; text: string }
  | { type: 'start:request' }
  | { type: 'start:ack'; streamId: string }
  | { type: 'start:reject'; message: string }
  | { type: 'stream:event'; event: ChatStreamEvent }

const initialState: ChatState = {
  messages: [],
  activeStreamId: null,
  pendingStreamId: null,
  isStarting: false,
  streamStatus: 'idle',
  errorText: null,
  lastUserMessage: null
}

const appendDeltaToStream = (
  messages: ChatMessage[],
  streamId: string,
  text: string
): ChatMessage[] =>
  messages.map((message) => {
    if (message.streamId !== streamId) {
      return message
    }

    return {
      ...message,
      text: `${message.text}${text}`
    }
  })

const upsertStreamMessage = (messages: ChatMessage[], streamId: string): ChatMessage[] => {
  const existing = messages.some((message) => message.streamId === streamId)

  if (!existing) {
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

  return messages.map((message) => {
    if (message.streamId !== streamId) {
      return message
    }

    return {
      ...message,
      status: 'streaming'
    }
  })
}

const markStreamMessage = (
  messages: ChatMessage[],
  streamId: string,
  status: Exclude<StreamStatus, 'idle'>,
  errorMessage?: string
): ChatMessage[] =>
  messages.map((message) => {
    if (message.streamId !== streamId) {
      return message
    }

    return {
      ...message,
      status,
      errorMessage: errorMessage ?? message.errorMessage,
      text: status === 'error' && message.text.length === 0 ? (errorMessage ?? 'Request failed') : message.text
    }
  })

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
      streamStatus: 'streaming'
    }
  }

  if (action.type === 'start:ack') {
    return {
      ...state,
      isStarting: false,
      pendingStreamId: action.streamId,
      errorText: null,
      streamStatus: 'streaming'
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

  const { event } = action

  if (event.type === 'start') {
    return {
      ...state,
      activeStreamId: event.streamId,
      pendingStreamId: null,
      streamStatus: 'streaming',
      messages: upsertStreamMessage(state.messages, event.streamId)
    }
  }

  if (event.type === 'delta') {
    return {
      ...state,
      messages: appendDeltaToStream(state.messages, event.streamId, event.text)
    }
  }

  if (event.type === 'done') {
    return {
      ...state,
      isStarting: false,
      pendingStreamId: null,
      activeStreamId: state.activeStreamId === event.streamId ? null : state.activeStreamId,
      errorText: null,
      streamStatus: 'done',
      messages: markStreamMessage(state.messages, event.streamId, 'done')
    }
  }

  return {
    ...state,
    isStarting: false,
    pendingStreamId: null,
    activeStreamId: state.activeStreamId === event.streamId ? null : state.activeStreamId,
    errorText: event.message,
    streamStatus: 'error',
    messages: markStreamMessage(state.messages, event.streamId, 'error', event.message)
  }
}

function App(): React.JSX.Element {
  const [inputText, setInputText] = useState('')
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    return subscribeChatStream((event) => {
      dispatch({ type: 'stream:event', event })
    })
  }, [])

  const isBusy =
    state.isStarting || state.pendingStreamId !== null || state.activeStreamId !== null || state.streamStatus === 'streaming'
  const canSend = inputText.trim().length > 0 && !isBusy

  const sendMessage = async (message: string): Promise<void> => {
    if (!message || isBusy) {
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
    await sendMessage(inputText.trim())
  }

  const onRetry = async (): Promise<void> => {
    if (!state.lastUserMessage || isBusy) {
      return
    }

    await sendMessage(state.lastUserMessage)
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
          <button type="button" className="retry-button" onClick={onRetry} disabled={isBusy}>
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
          rows={3}
          placeholder="Type your message"
          disabled={isBusy}
        />
        <div className="actions">
          <button type="submit" disabled={!canSend}>
            {isBusy ? 'Working...' : 'Send'}
          </button>
        </div>
      </form>
    </main>
  )
}

export default App
