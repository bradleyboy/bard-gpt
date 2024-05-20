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
): Promise<{ type: 'chat' } | { type: 'image'; reference_url?: string }> {
  const result = await openai.chat.completions.create({
    model: backend.model,
    messages: [
      {
        role: 'system',
        content: `
you are a classifier that inspects an in-progress conversation between a general purpose chat assistant and a user. Your job is to determine if the latest message in the conversation from the user is asking for an image to be generated.

Your reponse should be in JSON format and contain no other output. If you determine that the user is asking for an image, respond like this:

{"type": "image"}

If the user is referencing a previous image in the conversation, add the URL to that image in the payload like this (substitute <url> with the URL that you found):

{"type": "image", reference_url: "<url>"}

If you user is not asking for an image or you are unsure of your classification, respond with:

{"type": "chat"}
        `,
      },
      ...history,
    ],
  });

  const rawJson = result.choices[0].message.content?.trim();

  if (rawJson) {
    const json = JSON.parse(rawJson);

    if (json.type === 'chat' || json.type === 'image') {
      return json;
    }
  }

  return { type: 'chat' };
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
