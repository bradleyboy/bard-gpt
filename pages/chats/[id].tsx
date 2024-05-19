import { useState, useEffect, useRef, FormEventHandler } from 'react';

import { Chat, Message } from '@nokkio/magic';
import { makeRequest } from '@nokkio/endpoints';
import { usePageData } from '@nokkio/router';
import type { PageMetadataFunction, PageDataArgs } from '@nokkio/router';

import PromptForm from 'components/PromptForm';

import type { ClientMessage } from 'types';
import MessageList from 'components/MessageList';

type PageParams = { id: string };

export async function getPageData({ params, auth }: PageDataArgs<PageParams>) {
  return {
    chat: await Chat.findById(params.id, {
      with: { user: true, messages: { limit: 50, sort: '-createdAt' } },
    }),
    user: auth,
  };
}

export const getPageMetadata: PageMetadataFunction = () => {
  return { title: "Bard: I'm here to help, but I'm not happy about it." };
};

const OPENING_MESSAGE = {
  role: 'assistant',
  content: 'Oh great. What do you want?',
  type: 'chat',
  createdAt: new Date(),
} as const;

type ChatUpdateMessage =
  | { type: 'chunk'; chunk: string }
  | { type: 'classify'; result: ClientMessage['type'] }
  | { type: 'image'; message: ClientMessage };

async function classifyPrompt(
  chat: Chat,
  prompt: string,
): Promise<ClientMessage['type']> {
  const response = await makeRequest(`/chats/${chat.id}/classify`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()).type;
}

async function getImageMessage(
  chat: Chat,
  input: Pick<ClientMessage, 'id' | 'type' | 'role' | 'content'>,
): Promise<ClientMessage> {
  const response = await makeRequest(`/chats/${chat.id}/image`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const { message } = (await response.json()) as {
    message: Omit<Message, 'createdAt'> & { createdAt: string };
  };

  if (message.image === null) {
    throw new Error('message must have image');
  }

  return {
    ...message,
    createdAt: new Date(message.createdAt),
  };
}

async function updateChatAndStreamResponse(
  chat: Chat,
  message: Pick<ClientMessage, 'id' | 'type' | 'role' | 'content'>,
  onUpdate: (message: ChatUpdateMessage) => void,
): Promise<void> {
  const type = await classifyPrompt(chat, message.content);
  onUpdate({ type: 'classify', result: type });

  if (type === 'image') {
    const imageMessage = await getImageMessage(chat, message);
    onUpdate({ type: 'image', message: imageMessage });
    return;
    // TODO: then continue with chat message where assistant describes image
  }

  const decoder = new TextDecoder();
  const response = await makeRequest(`/chats/${chat.id}/messages`, {
    method: 'POST',
    body: JSON.stringify(message),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('could not read body');
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    // Chunks sometimes contain multiple messages
    const parsed = decoder.decode(value).trim();
    let chunks: Array<string> = [];

    // This is weird, but sometimes a chunk will have two separate messages.
    // we can't just always split on newlines, since some messages will have them too
    if (parsed.indexOf('\n{"id":') === -1) {
      chunks = [parsed];
    } else {
      chunks = parsed.split('\n');
    }

    let delta = '';

    chunks.forEach((p) => {
      const message = JSON.parse(p) as {
        choices: Array<{ delta?: { content?: string } }>;
      };

      if (message.choices.length === 0) {
        return;
      }

      const next = message.choices[0].delta?.content;

      if (next) {
        delta += next;
      }
    });

    onUpdate({ type: 'chunk', chunk: delta });
  }
}

export default function Index(): JSX.Element {
  const { chat, user } = usePageData<typeof getPageData>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [agentIsAnswering, setAgentIsAnswering] = useState(() => {
    // The default way for new chats to be created is to create the chat
    // and the initial user message. In those cases, we want to kick off
    // the agent immediately
    return (
      chat?.messages !== undefined &&
      chat.messages.length === 1 &&
      chat.messages[0].role === 'user'
    );
  });
  const [messages, setMessages] = useState<Array<ClientMessage>>(() => {
    if (chat?.messages) {
      // The default way for new chats to be created is to create the chat
      // and the initial user message. In those cases, add the empty assistant
      // message so it has a target to fill during the stream.
      if (chat.messages.length === 1) {
        return [
          ...chat.messages,
          {
            role: 'assistant',
            content: '',
            type: 'chat',
            createdAt: new Date(),
          },
        ];
      } else {
        const copy = [...chat.messages];
        return copy.reverse();
      }
    }

    return [OPENING_MESSAGE];
  });

  const handleNewUserPrompt: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();

    if (!user) {
      return;
    }

    const d = new FormData(e.currentTarget);
    const content = (d.get('prompt') ?? '') as string;

    if (content.length > 0) {
      setMessages((messages) => {
        return [
          ...messages,
          {
            role: 'user',
            content,
            type: 'chat',
            createdAt: new Date(),
          },
          {
            role: 'assistant',
            content: '',
            type: 'chat',
            createdAt: new Date(),
          },
        ];
      });

      setAgentIsAnswering(true);
    }

    e.currentTarget.reset();
  };

  // Do this out here so we don't have to make the hook below dependent on the entire
  // messages object.
  const lastUserMessage = messages.findLast((m) => m.role === 'user');

  useEffect(() => {
    if (!chat) {
      return;
    }

    // If agentIsAnswering changes from false -> true, time to kick
    // off a new agent response.
    if (agentIsAnswering) {
      if (!lastUserMessage) {
        console.error('could not find user message');
        setAgentIsAnswering(false);
        return;
      }

      updateChatAndStreamResponse(
        chat,
        {
          id: lastUserMessage.id,
          role: 'user',
          content: lastUserMessage.content,
          type: lastUserMessage.type,
        },
        (next) => {
          setMessages((messages) => {
            const copy = [...messages];

            if (next.type === 'classify') {
              copy[copy.length - 1].type = next.result;
            }

            if (next.type === 'image') {
              copy[copy.length - 1] = next.message;
            }

            if (next.type === 'chunk') {
              copy[copy.length - 1].content += next.chunk;
            }

            return copy;
          });
        },
      ).then(() => {
        // This is a bit weird. To work around how the chat messaging endpoint does
        // not trigger a reload of this collection, we have to force it here, otherwise
        // the observable cache can get out of sync. TODO: Fix this in Nokkio so that
        // endpoint invocations track and send back headers for changed models, which
        // would then trigger this automatically.
        chat.messages.reload();
        setAgentIsAnswering(false);
      });
    } else {
      // when agent is finished, focus back on input. we have to do this
      // here so that the re-render of agentIsAnswering re-enabled the input
      // prior to setting focus
      inputRef.current?.focus();
    }
  }, [agentIsAnswering, chat, lastUserMessage]);

  return (
    <>
      <MessageList
        messages={messages}
        username={user?.id !== chat?.user.id ? chat?.user.name : undefined}
        showTypingIndicator={agentIsAnswering}
      />
      <PromptForm
        onSubmit={handleNewUserPrompt}
        ref={inputRef}
        isDimmed={agentIsAnswering}
        isDisabled={user?.id !== chat?.userId || agentIsAnswering}
        placeholder={
          agentIsAnswering
            ? 'Agent is answering...'
            : user?.id !== chat?.userId
              ? 'Only the user who created this chat can continue it'
              : 'What now?'
        }
      />
    </>
  );
}
