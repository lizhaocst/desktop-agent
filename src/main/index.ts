import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { stepCountIs, streamText, tool } from 'ai'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { z } from 'zod'
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

const CHAT_START_CHANNEL = 'chat:start'
const CHAT_STREAM_CHANNEL = 'chat:stream'
const LOCAL_ENV_FILE = '.env.local'
const FILE_TOOL_READ_NAME = 'read_file'
const FILE_TOOL_WRITE_NAME = 'write_file'
const FILE_TOOL_MAX_STEPS = 5
const MODEL_SYSTEM_PROMPT = [
  'You are a desktop coding assistant.',
  `When reading files, use ${FILE_TOOL_READ_NAME}.`,
  `When writing files, use ${FILE_TOOL_WRITE_NAME}.`,
  'Never claim file access unless a tool call succeeds.'
].join(' ')

const authorizedDirectoryByWebContentsId = new Map<number, string>()

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

function resolveLocalEnvPathCandidates(): string[] {
  const candidates = new Set<string>()
  candidates.add(resolve(process.cwd(), LOCAL_ENV_FILE))
  candidates.add(resolve(__dirname, '../../', LOCAL_ENV_FILE))
  candidates.add(resolve(__dirname, '../../../', LOCAL_ENV_FILE))

  try {
    candidates.add(resolve(app.getAppPath(), LOCAL_ENV_FILE))
  } catch {
    // ignore app path resolution failures during early startup
  }

  return [...candidates]
}

function loadLocalEnvForDev(): void {
  if (!is.dev) {
    return
  }

  const envPath = resolveLocalEnvPathCandidates().find((candidatePath) => existsSync(candidatePath))
  if (!envPath) {
    console.info('[env] .env.local not found, skip loading', {
      candidates: resolveLocalEnvPathCandidates()
    })
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

async function getOrRequestAuthorizedDirectory(
  sender: Electron.WebContents,
  streamId: string
): Promise<string> {
  const cachedDirectory = authorizedDirectoryByWebContentsId.get(sender.id)
  if (cachedDirectory) {
    return cachedDirectory
  }

  const window = BrowserWindow.fromWebContents(sender)
  if (!window) {
    throw new Error('Cannot resolve browser window for file tool authorization')
  }

  const result = await dialog.showOpenDialog(window, {
    title: 'Select authorized folder for file tools',
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('File tool authorization was canceled by user')
  }

  const authorizedDirectory = resolve(result.filePaths[0])
  authorizedDirectoryByWebContentsId.set(sender.id, authorizedDirectory)
  sender.once('destroyed', () => {
    authorizedDirectoryByWebContentsId.delete(sender.id)
  })

  console.info('[tool:auth] directory authorized', { streamId, webContentsId: sender.id, authorizedDirectory })
  return authorizedDirectory
}

function resolvePathWithinAuthorizedDirectory(authorizedDirectory: string, inputPath: string): string {
  if (inputPath.trim().length === 0) {
    throw new Error('File path is required')
  }

  const resolvedPath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(authorizedDirectory, inputPath)
  const relativePath = relative(authorizedDirectory, resolvedPath)
  const isOutOfAuthorizedDirectory =
    relativePath.length > 0 && (relativePath.startsWith('..') || isAbsolute(relativePath))

  if (isOutOfAuthorizedDirectory) {
    throw new Error('File path is outside the authorized directory')
  }

  return resolvedPath
}

function createFileTools(sender: Electron.WebContents, streamId: string) {
  return {
    [FILE_TOOL_READ_NAME]: tool({
      description: 'Read UTF-8 text from a file inside the authorized directory',
      inputSchema: z.object({
        path: z.string().describe('File path. Can be relative to the authorized directory.')
      }),
      execute: async ({ path }, { toolCallId }) => {
        try {
          const authorizedDirectory = await getOrRequestAuthorizedDirectory(sender, streamId)
          const filePath = resolvePathWithinAuthorizedDirectory(authorizedDirectory, path)
          const content = await readFile(filePath, 'utf8')
          return {
            path: relative(authorizedDirectory, filePath),
            content
          }
        } catch (error) {
          console.error('[tool:read_file] failed', {
            streamId,
            callId: toolCallId,
            path,
            message: getErrorMessage(error)
          })
          throw error
        }
      }
    }),
    [FILE_TOOL_WRITE_NAME]: tool({
      description: 'Write UTF-8 text to a file inside the authorized directory',
      inputSchema: z.object({
        path: z.string().describe('Target file path. Can be relative to the authorized directory.'),
        content: z.string().describe('UTF-8 text content to write.')
      }),
      execute: async ({ path, content }, { toolCallId }) => {
        try {
          const authorizedDirectory = await getOrRequestAuthorizedDirectory(sender, streamId)
          const filePath = resolvePathWithinAuthorizedDirectory(authorizedDirectory, path)
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, content, 'utf8')

          return {
            path: relative(authorizedDirectory, filePath),
            bytesWritten: Buffer.byteLength(content, 'utf8')
          }
        } catch (error) {
          console.error('[tool:write_file] failed', {
            streamId,
            callId: toolCallId,
            path,
            message: getErrorMessage(error)
          })
          throw error
        }
      }
    })
  }
}

async function streamModelResponse(
  sender: Electron.WebContents,
  streamId: string,
  message: string,
  onDelta: (text: string) => void,
  onToolStart: (toolName: string, callId: string) => void,
  onToolResult: (toolName: string, callId: string, ok: boolean, output?: unknown, error?: string) => void
): Promise<void> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const baseURL = process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1'
  const model = process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini'
  const openai = createOpenAI({
    apiKey,
    baseURL
  })

  const result = streamText({
    model: openai(model),
    system: MODEL_SYSTEM_PROMPT,
    prompt: message,
    tools: createFileTools(sender, streamId),
    stopWhen: stepCountIs(FILE_TOOL_MAX_STEPS)
  })

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        if (part.text.length > 0) {
          onDelta(part.text)
        }
        break
      }
      case 'tool-call': {
        console.info('[tool:start]', { streamId, toolName: part.toolName, callId: part.toolCallId })
        onToolStart(part.toolName, part.toolCallId)
        break
      }
      case 'tool-result': {
        console.info('[tool:result]', { streamId, toolName: part.toolName, callId: part.toolCallId, ok: true })
        onToolResult(part.toolName, part.toolCallId, true, part.output)
        break
      }
      case 'tool-error': {
        console.warn('[tool:result]', {
          streamId,
          toolName: part.toolName,
          callId: part.toolCallId,
          ok: false,
          message: getErrorMessage(part.error)
        })
        onToolResult(part.toolName, part.toolCallId, false, undefined, getErrorMessage(part.error))
        break
      }
      case 'tool-output-denied': {
        console.warn('[tool:result]', {
          streamId,
          toolName: part.toolName,
          callId: part.toolCallId,
          ok: false,
          message: 'Tool output denied'
        })
        onToolResult(part.toolName, part.toolCallId, false, undefined, 'Tool output denied')
        break
      }
      case 'abort': {
        throw new Error(part.reason ?? 'Model stream aborted')
      }
      case 'error': {
        throw new Error(getErrorMessage(part.error))
      }
      default:
        break
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
        await streamModelResponse(
          event.sender,
          streamId,
          request.message,
          (text) => {
            sendChatStream(event.sender, { streamId, type: 'delta', text })
          },
          (toolName, callId) => {
            sendChatStream(event.sender, { streamId, type: 'tool_call_start', toolName, callId })
          },
          (toolName, callId, ok, output, error) => {
            sendChatStream(event.sender, {
              streamId,
              type: 'tool_call_result',
              toolName,
              callId,
              ok,
              output,
              error
            })
          }
        )
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
