import { useState, useEffect, useRef, FormEventHandler } from 'react';

import { Chat, Message } from '@nokkio/magic';
import { makeRequest } from '@nokkio/endpoints';
import { usePageData, Link } from '@nokkio/router';
import { MarkdownPreview } from '@nokkio/markdown';

import useHydrated from 'hooks/useHydrated';

import type { PageMetadataFunction, PageDataArgs } from '@nokkio/router';
type ClientMessage = Pick<Message, 'role' | 'content' | 'createdAt'> & {
  id?: string;
};
type PageParams = { id: string };

export async function getPageData({ params }: PageDataArgs<PageParams>) {
  return Chat.findById(params.id, {
    with: { messages: { limit: 50, sort: '-createdAt' } },
  });
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
  isTyping = false,
}: {
  message: ClientMessage;
  isTyping: boolean;
}) {
  const isHydrated = useHydrated();

  return (
    <div className="space-y-1">
      <div className="uppercase font-bold text-sm flex space-x-3 items-center">
        <span className={nameColors[message.role]}>
          {message.role == 'assistant' ? 'Bard' : 'You'}
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

function Content({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl w-full mx-auto p-6">{children}</div>;
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
    const parsed = decoder.decode(value).trim().split('\n');

    let delta = '';

    parsed.forEach((p) => {
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
  const chat = usePageData<typeof getPageData>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [agentIsAnswering, setAgentIsAnswering] = useState(false);
  const [messages, setMessages] = useState<Array<ClientMessage>>(
    chat?.messages && chat.messages.length > 0
      ? // reverse since we sort: -createdAt when fetching/limiting
        chat.messages.reverse()
      : [OPENING_MESSAGE],
  );

  const handleNewUserPrompt: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();

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

      Message.create({ chatId: chat!.id, role: 'user', content });

      setAgentIsAnswering(true);
    }

    e.currentTarget.reset();
  };

  useEffect(() => {
    if (chat?.messages.length === 0) {
      Message.create({
        chatId: chat.id,
        ...OPENING_MESSAGE,
      });
    }
  }, [chat?.messages, chat?.id]);

  useEffect(() => {
    if (!chat) {
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
        to="/chats"
        className="absolute m-6 p-3 rounded-xl text-gray-300 hover:text-gray-50 text-sm bg-transparent hover:bg-gray-900 transition-colors"
      >
        &larr; All chats
      </Link>
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col-reverse w-full max-h-full overflow-y-auto">
          <Content>
            <div className="space-y-8 pt-2">
              {messages.map((m, idx) => (
                <MessageEntry
                  key={`${idx}-${m.createdAt.toUTCString()}`}
                  message={m}
                  isTyping={idx === messages.length - 1 && agentIsAnswering}
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
              disabled={agentIsAnswering}
              name="prompt"
              className="w-full outline-none bg-transparent text-gray-200 disabled:text-gray-500 placeholder:text-gray-500"
              placeholder={
                agentIsAnswering
                  ? 'Agent is answering...'
                  : 'Ask Bard something...'
              }
            />
          </form>
        </Content>
      </div>
    </>
  );
}
