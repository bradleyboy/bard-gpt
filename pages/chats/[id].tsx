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
      with: { user: true, messages: { limit: 20, sort: '-createdAt' } },
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
  createdAt: new Date(),
} as const;

async function updateChatAndStreamResponse(
  messages: Array<ClientMessage>,
  onUpdate: (next: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const response = await makeRequest('/chat', {
    method: 'POST',
    body: JSON.stringify({ history: messages }),
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
    let parsed = decoder.decode(value).trim();
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

    onUpdate(delta);
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
            createdAt: new Date(),
          },
          {
            role: 'assistant',
            content: '',
            createdAt: new Date(),
          },
        ];
      });

      Message.create({
        chatId: chat!.id,
        role: 'user',
        content,
        userId: user.id,
      });

      setAgentIsAnswering(true);
    }

    e.currentTarget.reset();
  };

  useEffect(() => {
    if (user && chat?.messages.length === 0) {
      Message.create({
        chatId: chat.id,
        userId: user.id,
        content: OPENING_MESSAGE.content,
        role: OPENING_MESSAGE.role,
      });
    }
  }, [chat?.messages, user, chat?.id]);

  useEffect(() => {
    if (!chat || !user) {
      return;
    }

    // If agentIsAnswering changes from false -> true, time to kick
    // off a new agent response.
    if (agentIsAnswering) {
      // Build this up over time locally so we don't have to introduce
      // another dependency to this hook.
      let content = '';

      updateChatAndStreamResponse(messages, (next) => {
        content += next;
        setMessages((messages) => {
          const copy = [...messages];
          copy[copy.length - 1].content += next;
          return copy;
        });
      }).then(() => {
        Message.create({
          chatId: chat!.id,
          userId: user.id,
          role: 'assistant',
          content,
        });
        setAgentIsAnswering(false);
      });
    } else {
      // when agent is finished, focus back on input. we have to do this
      // here so that the re-render of agentIsAnswering re-enabled the input
      // prior to setting focus
      inputRef.current?.focus();
    }
  }, [agentIsAnswering]);

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
