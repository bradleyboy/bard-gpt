/** @type {import('@nokkio/schema').Config} */
module.exports = function ({ defineModel, types }) {
  const User = defineModel('User', {
    sub: types.string().unique(),
    email: types.string().filterable(),
    name: types.string(),
    picture: types.string(),
  });

  const Chat = defineModel('Chat', {
    summary: types.string(null),
    lastSummarizedAtMessageCount: types.number(0),
    isArchived: types.bool(false),
  });

  const Message = defineModel('Message', {
    role: types.string().oneOf(['assistant', 'user']),
    content: types.text(),
    type: types.string('chat').oneOf(['chat', 'image']),
    image: types.image(null),
  });

  User.hasMany(Chat);
  User.hasMany(Message);
  Chat.hasMany(Message);

  User.actAsAuth({ type: 'custom' });

  return { User, Chat, Message };
};
