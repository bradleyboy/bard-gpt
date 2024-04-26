import process from 'node:process';

import OpenAI from 'npm:openai@^4.33';

import { getSecret } from '@nokkio/endpoints';
import { ChatWith, Message } from '@nokkio/magic';

const AI_BACKENDS = {
  openai: {
    apiKey: getSecret('openAIApiKey'),
    model: 'gpt-4-turbo',
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
