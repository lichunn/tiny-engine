import { nextTick, ref, computed } from 'vue'
import { type ChatMessage } from '@opentiny/tiny-robot-kit'
import { GeneratingStatus, STATUS, type MessageState } from '../constants/status'
import { formatMessages, removeLoading } from '../utils'
import { getClientConfig as getConfig, updateClientConfig as updateConfig } from '../services/aiClient'
import useModelConfig from './core/useConfig'
import useMode from './modes/useMode'
import { createStreamDataHandler } from './core/useMessageStream'
import type { ChatRequestData, ProviderConfig } from '../services/OpenAICompatibleProvider'
import { createToolCallHandler } from './features/useToolCalls'
import apiService from '../services/api'
import { useConversationAdapter } from './core/useConversation'

const {
  // 配置方法
  getApiUrl,
  getContentType,
  // 生命周期钩子
  onConversationStart,
  onMessageSent,
  onBeforeRequest,
  onStreamStart,
  onStreamData,
  onRequestEnd,
  onStreamTools,
  onBeforeCallTool,
  onPostCallTool,
  onPostCallTools,
  onMessageProcessed,
  onConversationEnd
} = useMode()

const { robotSettingState, updateChatModeState, getSelectedModelInfo } = useModelConfig()

// 本次对话的状态，从用户发送消息开始到AI返回或用户主动终止结束
// 注意：0.4.x 中使用 STATUS 枚举，保持兼容
// CHAT_STATUS 仅用于内部逻辑映射，实际使用 STATUS 枚举值
enum CHAT_STATUS {
  PROCESSING = 'processing', // 本轮对话开始后，没有请求在流式返回（可能是等待请求，也可能是请求间隙）
  STREAMING = 'streaming', // 当前有请求正在流式返回
  FINISHED = 'finished' // 本轮对话结束
}

const chatStatus = ref<CHAT_STATUS>(CHAT_STATUS.FINISHED)

const abortControllerMap: Record<string, AbortController> = {}

// 使用工厂函数创建流式数据处理器，解耦业务逻辑
const handleStreamData = createStreamDataHandler({
  getContentType,
  hooks: {
    onStreamStart,
    onStreamData,
    onStreamTools
  },
  statusManager: {
    isStreaming: () => chatStatus.value === CHAT_STATUS.STREAMING,
    setStreaming: () => {
      // 状态由 useConversationAdapter 统一管理
    }
  }
})

const handleFinishRequest = async (
  finishReason: string,
  messages: ChatMessage[],
  contextMessages: ChatMessage[],
  messageState: MessageState
) => {
  const lastMessage = messages.at(-1)

  delete abortControllerMap.main
  await onRequestEnd(finishReason, lastMessage?.content || '', messages) // 本次请求结束

  // 部分模型返回格式不太标准，例如finishReason没有返回tool_calls而是stop，这里做下兼容
  if (['tool_calls', 'stop'].includes(finishReason) && lastMessage?.tool_calls?.length) {
    lastMessage.tool_calls.forEach((toolCall) => {
      if (toolCall.type !== 'function') {
        // 修复，兼容部分场景返回格式不标准，流式中多次返回type字段
        toolCall.type = 'function'
      }
    })
    await handleToolCall(lastMessage.tool_calls, messages, contextMessages) // eslint-disable-line
  }

  if (finishReason === 'aborted' || messageState?.status === STATUS.ABORTED) {
    messageState.status = STATUS.ABORTED
    chatStatus.value = CHAT_STATUS.FINISHED
  } else if (finishReason === 'stop' && !lastMessage?.tool_calls) {
    messageState.status = STATUS.FINISHED
    chatStatus.value = CHAT_STATUS.FINISHED
    await onMessageProcessed(finishReason, lastMessage?.content ?? '', messages, {
      abortControllerMap: {}
    })
  }
}

const handleRequestError = async (_error: Error, messages: ChatMessage[], messageState: MessageState) => {
  chatStatus.value = CHAT_STATUS.FINISHED
  delete abortControllerMap.main
  await onRequestEnd('error', messages.at(-1)?.content || '', messages) // 本次请求结束
  messageState.status = STATUS.ERROR
}

const beforeRequest = async (params: ChatRequestData): Promise<ChatRequestData> => {
  const requestParams = await onBeforeRequest(params)
  const { service } = getSelectedModelInfo()

  if (service && getConfig().apiKey !== service.apiKey) {
    updateConfig({ apiKey: service.apiKey })
  }
  if (getConfig().apiUrl !== getApiUrl()) {
    updateConfig({ apiUrl: getApiUrl() })
  }
  return requestParams
}

const initChatClient = () => {
  const { service, model } = getSelectedModelInfo()

  const config: ProviderConfig = {
    apiKey: service?.apiKey || '',
    apiUrl: getApiUrl(),
    defaultModel: model || 'deepseek-v3',
    axiosClient: () => apiService.getHttpClient(),
    httpClientType: 'axios',
    beforeRequest
  }
  updateConfig(config)
}

// 使用 conversation 适配器，将业务逻辑与 conversation 管理解耦
const {
  messageManager,
  conversationState,
  createConversation: createConversationBase,
  switchConversation: switchConversationBase,
  autoSetTitle: autoSetTitleBase,
  ...conversationMethods
} = useConversationAdapter({
  onStreamData: handleStreamData,
  onFinishRequest: handleFinishRequest,
  onMessageProcessed: async (finishReason, content, messages) => {
    await onMessageProcessed(finishReason, content, messages, {
      abortControllerMap,
      messageState: messageManager.messageState.value
    })
    if (GeneratingStatus.includes(messageManager.messageState.value.status)) {
      messageManager.messageState.value.status = STATUS.FINISHED
    }
    chatStatus.value = CHAT_STATUS.FINISHED
  },
  statusManager: {
    isProcessing: () => chatStatus.value === CHAT_STATUS.PROCESSING,
    setProcessing: () => {
      chatStatus.value = CHAT_STATUS.PROCESSING
    },
    resetProcessing: () => {
      chatStatus.value = CHAT_STATUS.FINISHED
    },
    setStreaming: () => {
      chatStatus.value = CHAT_STATUS.STREAMING
    },
    setFinished: () => {
      chatStatus.value = CHAT_STATUS.FINISHED
    }
  },
  getContentType,
  onBeforeRequest,
  getProviderConfig: () => {
    const { service, model } = getSelectedModelInfo()
    return {
      apiKey: service?.apiKey || getConfig()?.apiKey,
      apiUrl: getApiUrl(),
      defaultModel: model || 'deepseek-v3'
    } as ProviderConfig
  }
})

// 使用工厂函数创建工具调用处理器
const handleToolCall = createToolCallHandler({
  getAbortController: () => {
    abortControllerMap.toolCall = new AbortController()
    return abortControllerMap.toolCall
  },
  formatMessages,
  hooks: {
    onBeforeCallTool,
    onPostCallTool,
    onPostCallTools
  },
  streamHandlers: {
    onData: handleStreamData,
    onError: handleRequestError,
    onDone: handleFinishRequest
  },
  getMessageState: () => messageManager.messageState.value,
  statusManager: {
    isProcessing: () => chatStatus.value === CHAT_STATUS.PROCESSING,
    setProcessing: () => {
      chatStatus.value = CHAT_STATUS.PROCESSING
    },
    resetProcessing: () => {
      chatStatus.value = CHAT_STATUS.FINISHED
    }
  }
})

// 包装 conversation 方法，添加业务特定逻辑
const createConversation = (title = '新会话', chatMode = robotSettingState.chatMode) => {
  const currentConversationId = conversationState.value?.currentId
  const newConversationId = createConversationBase(title, { chatMode })
  if (currentConversationId && newConversationId !== currentConversationId) {
    onConversationEnd(currentConversationId)
  }
  onConversationStart(conversationState.value, messageManager.messages.value, conversationMethods)
  return newConversationId
}

const switchConversation = (conversationId: string) => {
  const currentId = conversationState.value?.currentId
  if (currentId) {
    onConversationEnd(currentId)
  }
  return switchConversationBase(conversationId, (state, messages, methods) => {
    onConversationStart(state, messages, methods)
  })
}

const autoSetTitle = () => {
  autoSetTitleBase()
}

const addMainAbortController = () => {
  const mainAbortController = new AbortController()
  mainAbortController.signal.addEventListener('abort', () => {
    messageManager.abortRequest()
    messageManager.messageState.value.status = STATUS.ABORTED
    chatStatus.value = CHAT_STATUS.FINISHED
  })
  abortControllerMap.main = mainAbortController
}

// const addLoading = (messages: ChatMessage[]) => {
  // 0.4.x 中，loading 消息通过插件自动管理，不再需要手动添加
  // 保留此函数用于向后兼容
// }

const sendUserMessage = async () => {
  onMessageSent()
  await nextTick()
  addMainAbortController()

  // 设置处理中状态
  chatStatus.value = CHAT_STATUS.PROCESSING

  // 0.4.x 中，用户消息应该已经通过 UI 手动添加到 messages 数组
  // 调用 engine.send() 会自动创建 assistant 消息并处理流式响应
  await messageManager.send()

  if (messageManager.messageState.value.status === STATUS.ERROR) {
    removeLoading(messageManager.messages.value)
    await handleRequestError(
      messageManager.messageState.value.errorMsg,
      messageManager.messages.value,
      messageManager.messageState.value
    )
  }
  autoSetTitle()
}

const abortRequest = () => {
  Object.values(abortControllerMap).forEach((controller) => controller?.abort())
  for (const key of Object.keys(abortControllerMap)) {
    delete abortControllerMap[key]
  }
  chatStatus.value = CHAT_STATUS.FINISHED

  onRequestEnd('aborted', messageManager.messages.value.at(-1)?.content as string, messageManager.messages.value)
}

const changeChatMode = (chatMode: string) => {
  // 空会话更新metadata
  const usedConversationId = conversationState.value?.currentId
  const newConversationId = createConversation('新会话', chatMode)
  if (usedConversationId && usedConversationId === newConversationId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conversationMethods as any).updateMetadata(newConversationId, { chatMode })
    // 0.4.x 中可能不再有 saveConversations 方法，改为可选调用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (conversationMethods as any).saveConversations === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conversationMethods as any).saveConversations()
    }
  }

  updateChatModeState(chatMode)
  updateConfig({ apiUrl: getApiUrl() })
}

// 将 CHAT_STATUS 映射到 STATUS 枚举，用于 UI 显示
const mappedStatus = computed(() => {
  const statusMap: Record<CHAT_STATUS, STATUS> = {
    [CHAT_STATUS.PROCESSING]: STATUS.PENDING,
    [CHAT_STATUS.STREAMING]: STATUS.STREAMING,
    [CHAT_STATUS.FINISHED]: STATUS.FINISHED
  }
  return statusMap[chatStatus.value] || STATUS.FINISHED
})

export default function () {
  return {
    chatStatus,
    mappedStatus,
    initChatClient,
    updateConfig,
    ...messageManager,
    sendUserMessage,
    changeChatMode,
    abortRequest,
    conversationState,
    ...conversationMethods,
    switchConversation,
    createConversation,
    autoSetTitle
  }
}
