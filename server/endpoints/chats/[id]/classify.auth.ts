import type { NokkioRequest } from '@nokkio/endpoints';
import { getPublicFileUrl, json } from '@nokkio/endpoints';
import { Chat } from '@nokkio/magic';
import { NotAuthorizedError, NotFoundError } from '@nokkio/errors';

import { isImageRequest } from 'server/ai/openai.ts';

export async function post(req: NokkioRequest) {
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

  const history = chat.messages.reverse().map((h) => {
    const { role, content } = h;
    return {
      role,
      content:
        h.type === 'image'
          ? `<the assistant generated an image as requested by the previous message. It can be found at ${getPublicFileUrl(h.image!.path)}>`
          : content,
    };
  });

  const { prompt } = (await req.json()) as { prompt: string };
  history.push({ role: 'user', content: prompt });

  const result = await isImageRequest(history);

  return json({ type: result ? 'image' : 'chat' });
}
