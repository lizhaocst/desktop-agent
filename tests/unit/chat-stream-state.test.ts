import { describe, expect, it } from 'vitest'
import { initialState, reducer } from '../../src/renderer/src/App'

describe('chat stream state reducer', () => {
  it('keeps start/delta/done flow stable', () => {
    const streamId = 'stream-1'
    let state = reducer(initialState, { type: 'user:submit', text: 'hello' })
    state = reducer(state, { type: 'start:request' })
    state = reducer(state, { type: 'start:ack', streamId })
    state = reducer(state, { type: 'stream:event', event: { streamId, type: 'start' } })
    state = reducer(state, { type: 'stream:event', event: { streamId, type: 'delta', text: 'Hi' } })
    state = reducer(state, { type: 'stream:event', event: { streamId, type: 'done' } })

    const assistantMessage = state.messages.find((message) => message.streamId === streamId)
    expect(state.streamStatus).toBe('done')
    expect(state.activeStreamId).toBeNull()
    expect(state.pendingStreamId).toBeNull()
    expect(assistantMessage?.text).toBe('Hi')
    expect(assistantMessage?.status).toBe('done')
  })

  it('keeps error flow stable', () => {
    const streamId = 'stream-2'
    const errorMessage = 'network failure'
    let state = reducer(initialState, { type: 'start:request' })
    state = reducer(state, { type: 'start:ack', streamId })
    state = reducer(state, { type: 'stream:event', event: { streamId, type: 'start' } })
    state = reducer(state, {
      type: 'stream:event',
      event: { streamId, type: 'error', message: errorMessage }
    })

    const assistantMessage = state.messages.find((message) => message.streamId === streamId)
    expect(state.streamStatus).toBe('error')
    expect(state.errorText).toBe(errorMessage)
    expect(assistantMessage?.status).toBe('error')
    expect(assistantMessage?.errorMessage).toBe(errorMessage)
  })
})
