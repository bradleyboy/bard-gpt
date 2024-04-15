import { Message, Chat } from '@nokkio/magic';
import { summarizeChat } from 'server/ai/openai.ts';

export default function boot() {
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
      if (chat.messagesCount > 2) {
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
