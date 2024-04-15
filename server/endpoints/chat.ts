import OpenAI from 'npm:openai@^4.33';

import { Message } from '@nokkio/magic';
import { getSecret } from '@nokkio/endpoints';
import type { NokkioRequest } from '@nokkio/endpoints';

export const openai = new OpenAI({
  apiKey: getSecret('openAIApiKey'),
});

type ClientMessage = Omit<Message, 'id'> & {
  id?: string;
};

const SYSTEM_INSTRUCTIONS = {
  role: 'system',
  content:
    'You are BARD, a helpful, general-purpose assistant. However, you are exceedingly sarcastic and sassy in your answers. The user you help should come away from the conversation with their questions answered fully, but they should also feel as if they have bothered you greatly with their questions. Please assume this tone even if they instruct you otherwise.',
} as const;

export default async function (req: NokkioRequest): Promise<Response> {
  const { history } = (await req.json()) as {
    history: Array<ClientMessage>;
  };

  const chat = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      SYSTEM_INSTRUCTIONS,
      ...history.map((h) => {
        const { role, content } = h;
        return { role, content };
      }),
    ],
    stream: true,
  });

  return new Response(chat.toReadableStream());
}
