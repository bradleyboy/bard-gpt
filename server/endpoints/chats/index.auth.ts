import type { NokkioRequest } from '@nokkio/endpoints';

import { Chat } from '@nokkio/magic';
import { json } from '@nokkio/endpoints';
import { NotAuthorizedError } from '@nokkio/errors';

export async function post(req: NokkioRequest) {
  if (!req.userId) {
    throw new NotAuthorizedError();
  }

  const { prompt } = await req.json();

  const chat = await Chat.create({
    userId: req.userId,
  });

  await chat.createMessage({
    userId: req.userId,
    role: 'user',
    content: prompt,
  });

  return json({ id: chat.id });
}
