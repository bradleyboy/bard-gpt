import type { Message } from '@nokkio/magic';

export type ClientMessage = Pick<
  Message,
  'role' | 'type' | 'content' | 'createdAt'
> & {
  id?: string;
  image?: Message['image'];
};
