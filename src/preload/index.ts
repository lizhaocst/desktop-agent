import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type ChatStartRequest = {
  sessionId: string
  message: string
}

type ChatStartResponse = {
  streamId: string
}

type ChatStreamEvent =
  | { streamId: string; type: 'start' }
  | { streamId: string; type: 'delta'; text: string }
  | { streamId: string; type: 'done' }
  | { streamId: string; type: 'tool_call_start'; toolName: string; callId: string }
  | {
      streamId: string
      type: 'tool_call_result'
      toolName: string
      callId: string
      ok: boolean
      output?: unknown
      error?: string
    }
  | { streamId: string; type: 'error'; message: string }

type PreloadApi = {
  chat: {
    start: (request: ChatStartRequest) => Promise<ChatStartResponse>
    onStream: (listener: (event: ChatStreamEvent) => void) => () => void
  }
}

const api: PreloadApi = {
  chat: {
    start: (request) => ipcRenderer.invoke('chat:start', request),
    onStream: (listener) => {
      const streamListener = (
        _event: Electron.IpcRendererEvent,
        payload: ChatStreamEvent
      ): void => {
        listener(payload)
      }

      ipcRenderer.on('chat:stream', streamListener)
      return () => {
        ipcRenderer.removeListener('chat:stream', streamListener)
      }
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
