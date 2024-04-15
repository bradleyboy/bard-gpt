import { Chat } from '@nokkio/magic';

import type { PageMetadataFunction } from '@nokkio/router';
import { useNavigate } from '@nokkio/router';

export const getPageMetadata: PageMetadataFunction = () => {
  return { title: 'Bard.' };
};

export default function Index(): JSX.Element {
  const navigate = useNavigate();

  function handleCreate() {
    Chat.create().then((r) => navigate(`/chats/${r.id}`));
  }

  return <button onClick={handleCreate}>Create</button>;
}
