# Bard: A sarcastic, sassy GPT

Todo:

- [x] Show loading indicator when GPT is responding
- [x] system message giving bot basic instructions about its tone
- [x] refocus form when response is complete
- [x] add date to Message component
- [x] handle scrolling, make sure we stay scrolled to the bottom
- [x] are there line breaks in the responses?
- [ ] persist chats / use auth. use AI to generate a summary
- [x] instruct the GPT to mark parts of the text that should be treated
      as monospaced, then handle that on the frontend (e.g. draw me a table of data)
      --> Maybe just use markdown?
- [x] while the bot is typing, show a cursor at the end
- [x] color the agent and user names differently
- [ ] abstract away some of the gross logic for mediating the stream to a useChat hook or something
- [ ] add a summary, change it whenever 10 messages have passed since the last time
