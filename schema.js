/** @type {import('@nokkio/schema').Config} */
module.exports = function ({ defineModel, types }) {
  const Chat = defineModel('Chat', {
    summary: types.string(null),
    lastSummarizedAtMessageCount: types.number(0),
    isArchived: types.bool(false),
  });

  const Message = defineModel('Message', {
    role: types.string().oneOf(['assistant', 'user']),
    content: types.text(),
  });

  Chat.hasMany(Message);

  return { Chat, Message };
};
