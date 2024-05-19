import OpenAI from 'npm:openai@^4.33';

import { getSecret } from '@nokkio/endpoints';
import { ChatWith, Message } from '@nokkio/magic';

const AI_BACKENDS = {
  openai: {
    apiKey: getSecret('openAIApiKey'),
    model: 'gpt-4o',
  },
  llama: {
    apiKey: 'not-needed',
    baseURL: 'http://localhost:1234/v1',
    model:
      'lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF/Meta-Llama-3-8B-Instruct-Q4_K_M.gguf',
  },
} as const;

const backend = AI_BACKENDS[NOKKIO_ENV.AI_BACKEND as keyof typeof AI_BACKENDS];

export const CHAT_MODEL = backend.model;
export const openai = new OpenAI(backend);

export async function isImageRequest(
  history: Array<OpenAI.Chat.ChatCompletionMessageParam>,
): Promise<boolean> {
  const result = await openai.chat.completions.create({
    model: backend.model,
    messages: [
      {
        role: 'system',
        content:
          'you are a classifier that inspects an in-progress conversation. Your job is to determine if the latest message in the conversation from the user is asking for an image to be generated or not. If the user is asking for an image, respond with a 1. If not, respond with 0. Only respond with 1 or 0, no prefix or other output should be returned. If you are unsure in any way, return 0.',
      },
      ...history,
    ],
  });

  const response = result.choices[0].message.content;

  return Number(response) === 1;
}

export async function summarizeChat(
  chat: ChatWith<'messagesCount'>,
): Promise<void> {
  const messages = await Message.findForChat(chat.id);

  const result = await openai.chat.completions.create({
    model: backend.model,
    messages: [
      ...messages.map((h) => {
        const { role, content } = h;
        return { role, content };
      }),
      {
        role: 'user',
        content:
          'generate a title for this conversation so far. It should be 100 characters or less and provide an at-a-glance topic that helps the user identify the chat from a list of other chats. Only return the title itself, no prefix or punctuation.',
      },
    ],
  });

  const summary = result.choices[0].message.content;

  if (!summary) {
    throw new Error('no response from API');
  }

  await chat.update({
    summary,
    lastSummarizedAtMessageCount: chat.messagesCount,
  });
}
