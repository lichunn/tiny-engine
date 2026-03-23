import { computed } from 'vue'
import {
  useConversation as useConversationKit,
  type ChatCompletion,
  type ChatMessage,
  type UseMessagePlugin
} from '@opentiny/tiny-robot-kit'
import { formatMessages } from '../../utils'
import { createStreamDataHandler } from './useMessageStream'
import type { ProviderConfig } from '../../services/OpenAICompatibleProvider'
import { OpenAICompatibleProvider } from '../../services/OpenAICompatibleProvider'

export interface ConversationAdapterOptions {
  // 业务回调函数
  onStreamData: (data: any, messages: any[]) => void
  onFinishRequest: (finishReason: string, messages: any[], contextMessages: any[], messageState: any) => Promise<void>
  onMessageProcessed: (finishReason: string, content: any, messages: any[], context: any) => Promise<void>
  statusManager: {
    isProcessing: () => boolean
    setProcessing: () => void
    resetProcessing: () => void
    setStreaming: () => void
    setFinished: () => void
  }
  // 从 useMode 注入
  getContentType?: () => string
  onBeforeRequest?: (params: any) => Promise<any>
  getProviderConfig?: () => ProviderConfig
}

export interface ConversationMetadata {
  chatMode?: string
  [key: string]: any
}

/**
 * 创建返回 AsyncGenerator 的 responseProvider
 * 0.4.x 要求 responseProvider 返回 AsyncGenerator<ChatCompletion>
 */
async function* createStreamResponseProvider(
  requestBody: any,
  signal?: AbortSignal,
  onBeforeRequestHook?: (params: any) => Promise<any>,
  streamOptions?: {
    getMessages: () => any[]
    onFinishRequest: (finishReason: string, messages: any[], contextMessages: any[], messageState: any) => Promise<void>
    onMessageProcessed: (finishReason: string, content: any, messages: any[], context: any) => Promise<void>
    setIsStreaming: (value: boolean) => void
    getIsStreaming: () => boolean
    onStreamEnd?: () => void
    getContentType?: () => string
    getProviderConfig?: () => ProviderConfig
  }
): AsyncGenerator<ChatCompletion> {
  // 获取 provider 配置
  const providerConfig: ProviderConfig = streamOptions?.getProviderConfig?.() || {}
  const provider = new OpenAICompatibleProvider(providerConfig)
  const baseConfig = provider.getBaseConfig?.() || providerConfig

  // 准备请求，调用 onBeforeRequest 钩子来修改请求参数
  let config = {
    baseUrl: requestBody.baseUrl,
    model: requestBody.model || baseConfig.defaultModel,
    messages: formatMessages(requestBody.messages as any),
    stream: true,
    ...requestBody
  }

  // 重新格式化 messages，确保只包含必要的字段（因为 ...requestBody 可能覆盖了）
  config.messages = formatMessages(requestBody.messages as any)

  // 调用业务层的 onBeforeRequest 钩子，允许修改请求参数（如添加 tools）
  if (onBeforeRequestHook) {
    config = await onBeforeRequestHook(config)
    // onBeforeRequest 可能修改了 messages，重新格式化确保没有多余字段
    if (config.messages && Array.isArray(config.messages)) {
      config.messages = formatMessages(config.messages as any)
    }
  }

  // 发送请求
  const baseUrl = baseConfig.apiUrl || ''
  const apiKey = config.apiKey || baseConfig.apiKey || ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream'
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  // 移除内部字段，只保留 OpenAI 兼容的参数
  const { apiKey: __, ...openAiConfig } = config as any

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(openAiConfig),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  // 手动处理 SSE 流，避免 sseStreamToGenerator 的 ReadableStream 兼容性问题
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | undefined = undefined

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        // 流结束
        break
      }

      // 检查是否被中止
      if (signal?.aborted) {
        reader.cancel()
        throw new Error('Request aborted')
      }

      // 解码并处理数据
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine === 'data: [DONE]') {
          finishReason = 'stop'
          const doneChunk = {
            id: '',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: config.model || baseConfig.defaultModel,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: finishReason
              }
            ]
          } as ChatCompletion
          yield doneChunk

          // 处理请求结束
          if (streamOptions) {
            const messages = streamOptions.getMessages()
            const lastMessage = messages.at(-1)
            if (lastMessage) {
              const messageState = { status: 'streaming' }
              await streamOptions.onFinishRequest(finishReason || 'unknown', messages, messages.slice(0, -1), messageState)
              if (finishReason === 'stop') {
                await streamOptions.onMessageProcessed(finishReason, lastMessage.content || '', messages, {})
              }
            }
            streamOptions.setIsStreaming(false)
          }
          // 调用流结束回调
          streamOptions.onStreamEnd?.()
          continue
        }

        // 解析 SSE 数据
        const match = trimmedLine.match(/^data:\s*(.+)$/)
        if (match) {
          try {
            const data = JSON.parse(match[1]) as ChatCompletion
            yield data
            if (data.choices?.[0]?.finish_reason) {
              finishReason = data.choices[0].finish_reason
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    reader.cancel()
    throw error
  } finally {
    reader.releaseLock()
  }
}

/**
 * Conversation 适配器
 * 将 tiny-robot-kit 0.4.x 的 useConversation 与业务逻辑解耦
 */
export function useConversationAdapter(options: ConversationAdapterOptions) {
  const { onStreamData, onFinishRequest, onMessageProcessed, statusManager, getContentType = () => 'markdown', onBeforeRequest, getProviderConfig } = options

  // 状态标记：是否正在流式处理
  let isStreaming = false

  // 在流开始时设置 streaming 状态
  const onStreamStart = () => {
    if (!isStreaming) {
      isStreaming = true
      statusManager.setStreaming?.()
    }
  }

  // 在流结束时设置 finished 状态
  const onStreamEnd = () => {
    if (isStreaming) {
      isStreaming = false
      statusManager.setFinished?.()
    }
  }

  // 创建流式数据处理器
  const handleStreamData = createStreamDataHandler({
    getContentType,
    hooks: {
      onStreamStart: () => {
        onStreamStart()
      },
      onStreamData: (data, content, messages) => {
        // 触发业务回调
        onStreamData(data, messages)
      },
      onStreamTools: (tools, context) => {
        // 处理工具调用
        if (context.currentMessage.tool_calls) {
          // 工具调用已经在上层处理
        }
      }
    },
    statusManager: {
      isStreaming: () => isStreaming,
      setStreaming: () => {
        isStreaming = true
      }
    }
  })

  // 创建流式数据处理插件
  const streamPlugin: UseMessagePlugin = {
    name: 'streamPlugin',
    onStreamData: (data: ChatCompletion, messages: ChatMessage[]) => {
      const lastMessage = messages.at(-1) as any
      const choice = data.choices?.[0]

      if (!choice || !lastMessage) {
        return
      }

      // 如果当前不是 streaming 状态，说明是第一次接收数据，需要设置 loading
      if (!isStreaming && lastMessage?.role === 'assistant') {
        // 确保 renderContent 存在并设置为 loading 类型
        if (!lastMessage.renderContent || !Array.isArray(lastMessage.renderContent)) {
          lastMessage.renderContent = []
        }
        // 如果当前没有 renderContent 或 renderContent 为空，添加 loading 类型
        if (lastMessage.renderContent.length === 0) {
          const loadingType = getContentType() === 'agent-content' ? 'agent-loading' : 'loading'
          lastMessage.renderContent.push({ type: loadingType, content: '' })
        }
      }

      // 使用 handleStreamData 处理流式数据
      handleStreamData(data, messages)
    },
    onStreamEnd: async () => {
      onStreamEnd()
    }
  }

  // 使用 tiny-robot-kit 0.4.x 的 useConversation
  const {
    conversations,
    activeConversationId,
    activeConversation,
    createConversation: createConversationBase,
    switchConversation: switchConversationBase,
    deleteConversation: deleteConversationBase,
    clear: clearBase,
    updateConversationTitle: updateTitleBase,
    saveMessages: saveMessagesBase,
    sendMessage: sendMessageBase,
    abortActiveRequest
  } = useConversationKit({
    useMessageOptions: {
      // 0.4.x 要求返回 AsyncGenerator<ChatCompletion>
      responseProvider: async (requestBody, signal) => {
        return createStreamResponseProvider(
          requestBody,
          signal,
          onBeforeRequest,
          {
            getMessages: () => messages.value,
            onFinishRequest,
            onMessageProcessed,
            setIsStreaming: (value: boolean) => {
              isStreaming = value
            },
            getIsStreaming: () => isStreaming,
            onStreamEnd: () => {
              onStreamEnd()
            },
            getContentType,
            getProviderConfig: () => (getProviderConfig?.() || {}) as ProviderConfig
          }
        )
      },
      // 使用插件系统处理流式数据
      plugins: [streamPlugin]
    }
  })

  // 构造兼容 0.3.x 的 conversationState 对象
  const conversationState = computed(() => ({
    conversations: conversations.value,
    currentId: activeConversationId.value
  }))

  // 获取当前活跃会话的 messages
  const messages = computed(() => activeConversation.value?.engine?.messages.value || [])

  // 获取当前活跃会话的 messageState
  const messageState = computed(() => {
    const active = activeConversation.value
    if (active?.engine) {
      return {
        status: active.engine.requestState.value,
        errorMsg: undefined,
        abortRequest: active.engine.abortRequest
      }
    }
    return { status: 'idle', errorMsg: undefined, abortRequest: () => Promise.resolve() }
  })

  /**
   * 创建新会话
   * @param title 会话标题
   * @param metadata 会话元数据（如 chatMode）
   */
  const createConversation = (title: string, metadata?: ConversationMetadata) => {
    const conversation = createConversationBase({
      title,
      metadata
    })
    return conversation.id
  }

    // 会话方法集合
  const conversationMethods = {
    deleteConversation: deleteConversationBase,
    clear: clearBase,
    updateTitle: updateTitleBase,
    saveMessages: saveMessagesBase,
    sendMessage: sendMessageBase,
    updateMetadata: (id: string) => {
      const conversation = conversations.value.find((c) => c.id === id)
      if (conversation) {
        // 0.4.x 中需要通过创建新会话来更新 metadata，或者直接操作
        // 这里暂时不做处理，实际业务中可能需要其他方式
      }
    },
    saveConversations: () => {
      // 0.4.x 中不再需要手动保存
    }
  }

  /**
   * 切换会话
   * @param conversationId 会话ID
   * @param onStart 切换成功后的回调
   */
  const switchConversation = async (
    conversationId: string,
    onStart?: (state: any, messages: any, methods: any) => void
  ) => {
    const result = await switchConversationBase(conversationId)
    if (result && onStart) {
      onStart(conversationState.value, messages.value, conversationMethods)
    }
    return result?.id
  }

  /**
   * 自动设置会话标题
   * @param currentId 当前会话ID
   * @param defaultTitle 默认标题
   */
  const autoSetTitle = (currentId: string, defaultTitle = '新会话') => {
    const currentConversation = conversations.value.find((conversation) => conversation.id === currentId)
    if (!currentConversation) return

    const currentTitle = currentConversation?.title
    if (currentTitle === defaultTitle && currentId) {
      const active = activeConversation.value
      if (active) {
        const messageContent = active.engine?.messages.value.find((item) => item.role === 'user')?.content
        const contentStr = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent)
        updateTitleBase(currentId, contentStr.substring(0, 20))
      }
    }
  }

  // 构造 messageManager 对象以兼容旧代码
  const messageManager = {
    messages,
    messageState,
    send: async () => {
      // 0.4.x 中，如果已经手动添加了用户消息，直接调用 engine.send()
      if (activeConversation.value?.engine) {
        await activeConversation.value.engine.send()
      }
    },
    abortRequest: async () => {
      await abortActiveRequest()
    }
  }


  return {
    // 消息管理器
    messageManager,
    // 会话状态
    conversationState,
    // 会话方法（包装后，覆盖原始方法）
    ...conversationMethods,
    createConversation,
    switchConversation,
    autoSetTitle
  }
}
