import type { NokkioRequest } from '@nokkio/endpoints';
import { getPublicFileUrl, json, writeImage } from '@nokkio/endpoints';
import { Chat, Message } from '@nokkio/magic';
import { NotAuthorizedError, NotFoundError } from '@nokkio/errors';

import { CHAT_MODEL, openai } from 'server/ai/openai.ts';
import OpenAI from 'npm:openai@^4.33';

const SYSTEM_INSTRUCTIONS = {
  role: 'system',
  content: `You act as an assistant that inspects a conversation between another assistant and a user. The last message of the conversation from the user has been classified as a request for an image to be created. Your job is to create a comprehensive image prompt based on that message and the rest of the conversation context. This image prompt will be provided to a separate model for the actual image generation.`,
} as const;

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

  const history: Array<OpenAI.Chat.ChatCompletionMessageParam> = chat.messages
    .reverse()
    .map((h) => {
      const { role, content } = h;
      return {
        role,
        content:
          h.type === 'image'
            ? `<the assistant generated an image as requested by the previous message. It can be found at ${getPublicFileUrl(h.image!.path)}>`
            : content,
      };
    });

  const { input, reference_url } = (await req.json()) as {
    input: {
      id?: string;
      role: 'assistant' | 'user';
      type: Message['type'];
      content: string;
    };
    reference_url?: string;
  };

  const { content, role, type, id } = input;

  // If the message does not exist yet, create it and attach
  // to the chat, and also append it to the history.
  if (!id) {
    await chat.createMessage({
      userId,
      role,
      type,
      content,
    });

    // Vision API will fail with an inaccessible image
    if (reference_url && !reference_url.startsWith('http://localhost')) {
      history.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: reference_url,
            },
          },
          { type: 'text', text: content },
        ],
      });
    } else {
      history.push({
        role,
        content,
      });
    }
  }

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [SYSTEM_INSTRUCTIONS, ...history],
  });

  const imagePrompt = completion.choices[0].message.content;

  if (!imagePrompt) {
    throw new Error('error generating image prompt');
  }

  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt: imagePrompt,
    size: '1792x1024',
  });

  const url = image.data[0].url;

  if (!url) {
    throw new Error('error generating image');
  }

  const r = await fetch(url);

  if (!r.ok || !r.body) {
    throw new Error('error fetching image');
  }

  const { path, metadata } = await writeImage('image.png', r.body);

  const message = await chat.createMessage({
    userId,
    role: 'assistant',
    type: 'image',
    image: { path, ...metadata },
    content: '[placeholder]',
  });

  return json({ message });
}
