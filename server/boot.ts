import {
  RESTRICT_TO_ENDPOINTS,
  Message,
  Chat,
  User,
  isOrConditionBlock,
} from '@nokkio/magic';
import { BadRequestError, NotAuthorizedError } from '@nokkio/errors';

import { summarizeChat } from 'server/ai/openai.ts';

export default function boot() {
  // All models mutations in this app are created server-side, so wire off
  // all client side access to create, update, and delete.
  [Message, Chat, User].forEach((M) => {
    M.beforeCreate(RESTRICT_TO_ENDPOINTS);
    M.beforeUpdate(RESTRICT_TO_ENDPOINTS);
    M.beforeDelete(RESTRICT_TO_ENDPOINTS);
  });

  // Auth is handled via /_/endpoints/auth, the only User
  // lookups that happen client-side are via with: ['user'],
  // so should always have an ID
  User.beforeFind(({ isTrusted, query }) => {
    if (isTrusted) {
      return query;
    }

    if (query.length !== 1) {
      throw new BadRequestError();
    }

    const q = query[0];

    if (isOrConditionBlock(q)) {
      throw new NotAuthorizedError();
    }

    if (!q.id) {
      throw new BadRequestError();
    }

    return query;
  });

  // Messages are only queried for a chatId from the client
  Message.beforeFind(({ isTrusted, query }) => {
    if (isTrusted) {
      return query;
    }

    if (query.length !== 1) {
      throw new BadRequestError();
    }

    const q = query[0];

    if (isOrConditionBlock(q)) {
      throw new NotAuthorizedError();
    }

    if (!q.chatId) {
      throw new BadRequestError();
    }

    return query;
  });

  // Chats are only queried from the client for:
  // 1. Lists, which are also restricted to the logged in user
  // 2. Or single chats, queried by ID
  Chat.beforeFind(({ isTrusted, query, userId }) => {
    if (isTrusted) {
      return query;
    }

    if (query.length !== 1) {
      throw new BadRequestError();
    }

    const q = query[0];

    if (isOrConditionBlock(q)) {
      throw new NotAuthorizedError();
    }

    if (!q.id && q.userId !== userId) {
      throw new BadRequestError();
    }

    return query;
  });

  // Listen for new messages being added to chats, and periodically
  // update the chat's summary
  Message.afterCreate(async (message) => {
    const chat = await Chat.findById(message.chatId, {
      withCounts: ['messages'],
      with: { messages: { limit: 1, sort: '-createdAt' } },
    });

    if (!chat) {
      return;
    }

    const lastMessage = chat.messages[0];

    // If the last message is not from the assistant, that means the
    // assistant is almost 100% in the middle of generating a response,
    // so we might as well wait for that to complete before summarizing.
    if (lastMessage && lastMessage.role !== 'assistant') {
      return;
    }

    // If we have not summarized yet, create one once there are a
    // few messages.
    if (chat.summary === null) {
      if (chat.messagesCount > 1) {
        await summarizeChat(chat);
      }

      return;
    }

    // Otherwise, wait for 5 new messages to roll in before re-summarizing
    if (chat.messagesCount - chat.lastSummarizedAtMessageCount > 5) {
      await summarizeChat(chat);
    }
  });
}
