import { useState, useEffect, useRef, FormEventHandler } from 'react';

import { Chat, Message } from '@nokkio/magic';
import { makeRequest } from '@nokkio/endpoints';
import { usePageData, Link } from '@nokkio/router';
import type { PageMetadataFunction, PageDataArgs } from '@nokkio/router';
import { MarkdownPreview } from '@nokkio/markdown';

import useHydrated from 'hooks/useHydrated';
import Content from 'components/Content';

type ClientMessage = Pick<Message, 'role' | 'content' | 'createdAt'> & {
  id?: string;
};
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

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

const nameColors = {
  assistant: 'text-teal-400',
  user: 'text-sky-400',
};

const OPENING_MESSAGE = {
  role: 'assistant',
  content: 'Oh great. What do you want?',
  createdAt: new Date(),
} as const;

function MessageEntry({
  message,
  username,
  isTyping = false,
}: {
  message: ClientMessage;
  username?: string;
  isTyping: boolean;
}) {
  const isHydrated = useHydrated();

  return (
    <div className="space-y-1">
      <div className="uppercase font-bold text-sm flex space-x-3 items-center">
        <span className={nameColors[message.role]}>
          {message.role == 'assistant' ? 'Bard' : username ?? 'You'}
        </span>
        {isHydrated && (
          <span className="text-gray-500 font-normal text-xs">
            {formatter.format(message.createdAt)}
          </span>
        )}
      </div>
      <div className="text-gray-200">
        {message.content === '' ? (
          <div role="status" className="animate-pulse">
            <div className="h-2.5 mt-3 bg-gray-600 rounded dark:bg-gray-700 w-1/2"></div>
            <span className="sr-only">Loading...</span>
          </div>
        ) : (
          <MarkdownPreview
            as="div"
            className="prose prose-invert"
            markdown={message.content + (isTyping ? ' ▋' : '')}
          />
        )}
      </div>
    </div>
  );
}

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
  const [agentIsAnswering, setAgentIsAnswering] = useState(false);
  const [messages, setMessages] = useState<Array<ClientMessage>>(() => {
    if (chat?.messages && chat.messages.length > 0) {
      const copy = [...chat.messages];
      return copy.reverse();
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
      <Link
        to="/"
        className="lg:absolute text-center m-3 lg:m-6 p-3 rounded-xl text-gray-300 hover:text-gray-50 text-sm bg-transparent hover:bg-gray-900 transition-colors"
      >
        &larr; {user === null ? 'Login' : 'All chats'}
      </Link>
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col-reverse w-full max-h-full overflow-y-auto">
          <Content>
            <div className="space-y-8 lg:pt-6">
              {messages.map((m, idx) => (
                <MessageEntry
                  key={`${idx}-${m.createdAt.toUTCString()}`}
                  message={m}
                  isTyping={idx === messages.length - 1 && agentIsAnswering}
                  username={
                    user?.id !== chat?.user.id ? chat?.user.name : undefined
                  }
                />
              ))}
            </div>
          </Content>
        </div>
      </div>
      <div
        className={`transition-colors${agentIsAnswering ? '' : ' bg-gray-900'}`}
      >
        <Content>
          <form onSubmit={handleNewUserPrompt}>
            <input
              autoFocus
              ref={inputRef}
              disabled={user?.id !== chat?.userId || agentIsAnswering}
              name="prompt"
              className="w-full outline-none bg-transparent text-gray-200 disabled:text-gray-500 placeholder:text-gray-500"
              placeholder={
                agentIsAnswering
                  ? 'Agent is answering...'
                  : user?.id !== chat?.userId
                    ? 'Only the user who created this chat can continue it'
                    : 'Ask Bard something...'
              }
            />
          </form>
        </Content>
      </div>
    </>
  );
}
