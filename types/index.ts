import type { Message } from '@nokkio/magic';

export type ClientMessage = Pick<Message, 'role' | 'content' | 'createdAt'> & {
  id?: string;
};
