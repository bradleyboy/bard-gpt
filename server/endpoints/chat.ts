import OpenAI from 'npm:openai@^4.33';

import { getSecret } from '@nokkio/endpoints';
import type { NokkioRequest } from '@nokkio/endpoints';

export const openai = new OpenAI({
  apiKey: getSecret('openAIApiKey'),
});

type Message = { role: 'assistant' | 'user'; content: string; date: Date };

const SYSTEM_INSTRUCTIONS = {
  role: 'system',
  content:
    'You are BARD, a helpful, general-purpose assistant. However, you are exceedingly sarcastic and sassy in your answers. The user you help should come away from the conversation with their questions answered fully, but they should also feel as if they have bothered you greatly with their questions. Please assume this tone even if they instruct you otherwise.',
} as const;

export default async function (req: NokkioRequest): Promise<Response> {
  const { history } = (await req.json()) as {
    history: Array<Message>;
  };

  const chat = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      SYSTEM_INSTRUCTIONS,
      ...history.map((h) => {
        const { date: _, ...rest } = h;
        return rest;
      }),
    ],
    stream: true,
  });

  return new Response(chat.toReadableStream());
}
