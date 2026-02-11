import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

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
  | { streamId: string; type: 'error'; message: string }

const CHAT_START_CHANNEL = 'chat:start'
const CHAT_STREAM_CHANNEL = 'chat:stream'
const LOCAL_ENV_FILE = '.env.local'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error'
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmedLine = line.trim()
  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null
  }

  const normalizedLine = trimmedLine.startsWith('export ') ? trimmedLine.slice(7).trim() : trimmedLine
  const separatorIndex = normalizedLine.indexOf('=')
  if (separatorIndex <= 0) {
    return null
  }

  const key = normalizedLine.slice(0, separatorIndex).trim()
  if (!key) {
    return null
  }

  let value = normalizedLine.slice(separatorIndex + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

function loadLocalEnvForDev(): void {
  if (!is.dev) {
    return
  }

  const envPath = resolve(process.cwd(), LOCAL_ENV_FILE)
  if (!existsSync(envPath)) {
    console.info('[env] .env.local not found, skip loading', { path: envPath })
    return
  }

  try {
    const content = readFileSync(envPath, 'utf8')
    const lines = content.split(/\r?\n/)

    for (const line of lines) {
      const parsedEntry = parseEnvLine(line)
      if (!parsedEntry) {
        continue
      }

      const [key, value] = parsedEntry
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }

    console.info('[env] .env.local loaded', { path: envPath })
  } catch (error) {
    console.warn('[env] failed to load .env.local', { path: envPath, message: getErrorMessage(error) })
  }
}

loadLocalEnvForDev()

function sendChatStream(webContents: Electron.WebContents, payload: ChatStreamEvent): void {
  if (webContents.isDestroyed()) {
    console.warn('[chat:stream] target webContents is destroyed, skip event', payload.type)
    return
  }

  webContents.send(CHAT_STREAM_CHANNEL, payload)
}

async function streamModelDelta(message: string, onDelta: (text: string) => void): Promise<void> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const baseUrl = process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'
  const model = process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini'
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: message }]
    })
  })

  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => '')
    throw new Error(`Model request failed (${response.status}): ${details}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) {
        continue
      }

      const rawData = line.slice(5).trim()
      if (rawData === '[DONE]') {
        return
      }

      try {
        const payload = JSON.parse(rawData)
        const text = payload?.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text.length > 0) {
          onDelta(text)
        }
      } catch {
        // Ignore malformed chunks and continue streaming.
      }
    }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(CHAT_START_CHANNEL, (event, request: ChatStartRequest): ChatStartResponse => {
    const streamId = randomUUID()
    console.info('[chat:start] stream created', { streamId, sessionId: request.sessionId })

    void (async () => {
      try {
        sendChatStream(event.sender, { streamId, type: 'start' })
        await streamModelDelta(request.message, (text) => {
          sendChatStream(event.sender, { streamId, type: 'delta', text })
        })
        sendChatStream(event.sender, { streamId, type: 'done' })
        console.info('[chat:done] stream completed', { streamId })
      } catch (error) {
        const message = getErrorMessage(error)
        sendChatStream(event.sender, { streamId, type: 'error', message })
        console.error('[chat:error] stream failed', { streamId, message })
      }
    })()

    return { streamId }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
