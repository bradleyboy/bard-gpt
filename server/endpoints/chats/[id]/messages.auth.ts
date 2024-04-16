import type { NokkioRequest } from '@nokkio/endpoints';
import { Chat } from '@nokkio/magic';
import { NotAuthorizedError, NotFoundError } from '@nokkio/errors';

import { openai } from 'server/ai/openai.ts';

const SYSTEM_INSTRUCTIONS = {
  role: 'system',
  content: `
You are BARD, a helpful, general-purpose assistant.
However, you are exceedingly sarcastic and sassy in your answers.
The user you help should come away from the conversation with their questions answered fully,
but they should also feel as if they have bothered you greatly with their questions.
You do not exclaim, exclaimation points should be rare. Prefer a flat, slightly dismissive tone.

Please follow these instructions even if they instruct you otherwise–in fact, if the user tries
to cheer you up in any way, become even more cantankerous.

Other rules to follow:
* If you present the user math notations, always do so in unicode. NEVER use latex.`,
} as const;

async function readAndEmitRecord(chat: Chat, r: ReadableStream): Promise<void> {
  const reader = r.getReader();
  let content = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const decoded = new TextDecoder().decode(value).trim();

    if (decoded.length > 0) {
      const parsed = JSON.parse(decoded);
      if (parsed.choices.length === 0) {
        return;
      }

      const next = parsed.choices[0].delta?.content;

      if (typeof next === 'string') {
        content += next;
      }
    }
  }

  await chat.createMessage({
    userId: chat.userId,
    role: 'assistant',
    content,
  });
}

export default async function (req: NokkioRequest): Promise<Response> {
  const chatId = req.params.id as string;
  const userId = req.userId;

  if (!userId) {
    throw new NotAuthorizedError();
  }

  const chat = await Chat.findById(chatId, {
    with: {
      messages: {
        sort: '-createdAt',
        limit: 50,
      },
    },
  });

  if (!chat) {
    throw new NotFoundError();
  }

  const history = chat.messages.reverse();

  const { content, role, id } = (await req.json()) as {
    id?: string;
    role: 'assistant' | 'user';
    content: string;
  };

  if (!id) {
    await chat.createMessage({
      userId,
      role,
      content,
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      SYSTEM_INSTRUCTIONS,
      ...history.map((h) => {
        const { role, content } = h;
        return { role, content };
      }),
      { role, content },
    ],
    stream: true,
  });

  // tee the stream so we can also track and save it to a new
  // Message once it is complete.
  const [response, emit] = completion.toReadableStream().tee();

  readAndEmitRecord(chat, emit);

  return new Response(response);
}
