import OpenAI from 'npm:openai@^4.33';

import { getSecret } from '@nokkio/endpoints';
import { ChatWith, Message } from '@nokkio/magic';

export const openai = new OpenAI({
  apiKey: getSecret('openAIApiKey'),
});

export async function summarizeChat(
  chat: ChatWith<'messagesCount'>,
): Promise<void> {
  const messages = await Message.findForChat(chat.id);

  const result = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
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
