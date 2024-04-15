import { Chat } from '@nokkio/magic';
import { useForm } from '@nokkio/forms';
import type { AuthPageDataArgs, PageMetadataFunction } from '@nokkio/router';
import { usePageData, Link } from '@nokkio/router';

import Content from 'components/Content';

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
  const { chats, user } = usePageData<typeof getPageData>();
  const { Form } = useForm(Chat, {
    redirectOnSuccess: (chat) => {
      return `/chats/${chat.id}`;
    },
    initialValues: { userId: user.id },
  });

  return (
    <div className="h-full overflow-scroll">
      <Content>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold">Bard.</h1>
              <div className="uppercase text-sm text-gray-400">
                Recent history from when you bothered Bard last
              </div>
            </div>

            <div>
              <Form>
                <button className="w-12 h-12 bg-teal-700 hover:bg-teal-500 transition-colors font-bold rounded-xl text-3xl">
                  +
                </button>
              </Form>
            </div>
          </div>

          <div className="space-y-2">
            {chats.length === 0 && <div>No chats yet. Great.</div>}
            {chats.map((chat) => (
              <Link
                to={`/chats/${chat.id}`}
                key={chat.id}
                className="rounded transition-colors bg-gray-900 border border-transparent hover:border-gray-700 p-3 flex justify-between items-center"
              >
                <div className="space-y-1">
                  <div>{chat.summary ?? 'A chat with you and Bard'}</div>
                  <div className="uppercase text-sm text-gray-500">
                    {formatter.format(chat.createdAt)}
                  </div>
                </div>
                <div className="w-6 h-6 bg-black text-sm flex items-center justify-center rounded-full">
                  {chat.messagesCount}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Content>
    </div>
  );
}
