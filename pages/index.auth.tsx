import { FormEventHandler, useRef, useState } from 'react';

import { Chat } from '@nokkio/magic';
import type { AuthPageDataArgs, PageMetadataFunction } from '@nokkio/router';
import { useNavigate, usePageData, Link } from '@nokkio/router';
import { makeRequest } from '@nokkio/endpoints';

import Content from 'components/Content';
import PromptForm from 'components/PromptForm';
import MessageList from 'components/MessageList';

export async function getPageData({ auth }: AuthPageDataArgs) {
  return {
    chats: await Chat.findForUser(auth.id, {
      limit: 20,
      sort: '-createdAt',
      withCounts: ['messages'],
    }),
    user: auth,
  };
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
});

export const getPageMetadata: PageMetadataFunction = () => {
  return { title: 'Bard.' };
};

export default function Index(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const navigate = useNavigate();
  const { chats } = usePageData<typeof getPageData>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();

    const data = new FormData(e.currentTarget);
    const prompt = (data.get('prompt') ?? '') as string;

    if (prompt.length > 0) {
      setIsCreating(prompt);
      makeRequest('/chats', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
        headers: { 'Content-Type': 'application/json' },
      })
        .then((r) => r.json())
        .then(({ id }) => {
          navigate(`/chats/${id}`);
        });
    }
  };

  return (
    <>
      {isCreating !== null && (
        <MessageList
          messages={[
            {
              role: 'user',
              type: 'chat',
              content: isCreating,
              createdAt: new Date(),
            },
            {
              role: 'assistant',
              type: 'chat',
              content: '',
              createdAt: new Date(),
            },
          ]}
          showTypingIndicator={true}
        />
      )}
      {isCreating === null && (
        <div className="flex-1 overflow-scroll">
          <Content>
            <div className="space-y-6">
              <div className="flex justify-between">
                <div className="space-y-1">
                  <h1 className="text-3xl font-bold">Bard.</h1>
                  <div className="uppercase text-sm text-gray-400">
                    Recent history from when you bothered Bard last
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {chats.length === 0 && <div>No chats yet. Great.</div>}
                {chats.map((chat) => (
                  <Link
                    to={`/chats/${chat.id}`}
                    key={chat.id}
                    className="rounded transition-colors bg-gray-700 border border-gray-900 hover:border-teal-700 p-6 flex justify-between items-center"
                  >
                    <div className="space-y-1 pr-6">
                      <div>{chat.summary ?? 'A chat with you and Bard'}</div>
                      <div className="uppercase text-sm text-gray-400">
                        {formatter.format(chat.createdAt)}
                      </div>
                    </div>
                    <div className="w-6 h-6 bg-gray-800 text-xs flex items-center justify-center rounded-full text-gray-300">
                      {chat.messagesCount}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Content>
        </div>
      )}
      <PromptForm
        ref={inputRef}
        onSubmit={handleSubmit}
        isDisabled={isCreating !== null}
        isDimmed={isCreating !== null}
        placeholder={
          isCreating === null
            ? "Start a new chat with Bard, I'm sure he'll love it."
            : 'Agent is answering...'
        }
      />
    </>
  );
}
