import { MarkdownPreview } from '@nokkio/markdown';
import { Link } from '@nokkio/router';
import { useAuth } from '@nokkio/auth';

import useHydrated from 'hooks/useHydrated';
import type { ClientMessage } from 'types';

import Content from './Content';

const nameColors = {
  assistant: 'text-teal-400',
  user: 'text-sky-400',
};

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

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

export default function MessageList({
  messages,
  showTypingIndicator,
  username = 'You',
}: {
  messages: Array<ClientMessage>;
  showTypingIndicator: boolean;
  username?: string;
}) {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Link
        to="/"
        className="lg:absolute text-center m-3 lg:m-6 p-3 rounded-xl text-gray-300 hover:text-gray-50 text-sm bg-transparent hover:bg-gray-900 transition-colors"
      >
        &larr; {isAuthenticated ? 'All chats' : 'Login'}
      </Link>
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col-reverse w-full max-h-full overflow-y-auto">
          <Content>
            <div className="space-y-8 lg:pt-6">
              {messages.map((m, idx) => (
                <MessageEntry
                  key={`${idx}-${m.createdAt.toUTCString()}`}
                  message={m}
                  isTyping={idx === messages.length - 1 && showTypingIndicator}
                  username={username}
                />
              ))}
            </div>
          </Content>
        </div>
      </div>
    </>
  );
}
