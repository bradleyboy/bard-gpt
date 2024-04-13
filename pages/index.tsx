import { useState, useEffect, useRef, FormEventHandler } from 'react';

import type { PageMetadataFunction } from '@nokkio/router';
import { makeRequest } from '@nokkio/endpoints';

type Message = { role: 'assistant' | 'user'; content: string; date: Date };

export const getPageMetadata: PageMetadataFunction = () => {
  return { title: "Bard: I'm here to help, but I'm not happy about it." };
};

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

function Message({ message }: { message: Message }) {
  return (
    <div className="space-y-1">
      <div className="uppercase font-bold text-sm flex justify-between">
        <span>{message.role == 'assistant' ? 'Bard' : 'You'}</span>
        <span className="text-gray-500 font-normal text-sm">
          {formatter.format(message.date)}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-gray-200">
        {message.content === '' ? (
          <div role="status" className="animate-pulse">
            <div className="h-2.5 mt-3 bg-gray-600 rounded dark:bg-gray-700 w-1/2"></div>
            <span className="sr-only">Loading...</span>
          </div>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}

function Content({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl w-full mx-auto">{children}</div>;
}

async function updateChatAndStreamResponse(
  messages: Array<Message>,
  onUpdate: (next: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const response = await makeRequest('/chat', {
    method: 'POST',
    body: JSON.stringify({ history: messages }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('could not read body');
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    // Chunks sometimes contain multiple messages
    const parsed = decoder.decode(value).trim().split('\n');

    let delta = '';

    parsed.forEach((p) => {
      const message = JSON.parse(p) as {
        choices: Array<{ delta?: { content?: string } }>;
      };

      if (message.choices.length === 0) {
        return;
      }

      const next = message.choices[0].delta?.content;

      if (next) {
        delta += next;
      }
    });

    onUpdate(delta);
  }
}

export default function Index(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [agentIsAnswering, setAgentIsAnswering] = useState(false);
  const [messages, setMessages] = useState<Array<Message>>([
    {
      role: 'assistant',
      content: 'Oh great. What do you want?',
      date: new Date(),
    },
  ]);

  const handleNewUserPrompt: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();

    const d = new FormData(e.currentTarget);
    const content = (d.get('prompt') ?? '') as string;

    if (content.length > 0) {
      setMessages((messages) => {
        return [
          ...messages,
          {
            role: 'user',
            content,
            date: new Date(),
          },
          {
            role: 'assistant',
            content: '',
            date: new Date(),
          },
        ];
      });
      setAgentIsAnswering(true);
    }

    e.currentTarget.reset();
  };

  useEffect(() => {
    // If agentIsAnswering changes from false -> true, time to kick
    // off a new agent response.
    if (agentIsAnswering) {
      updateChatAndStreamResponse(messages, (next) => {
        setMessages((messages) => {
          const copy = [...messages];
          copy[copy.length - 1].content += next;
          return copy;
        });
      }).then(() => {
        setAgentIsAnswering(false);
      });
    } else {
      // when agent is finished, focus back on input. we have to do this
      // here so that the re-render of agentIsAnswering re-enabled the input
      // prior to setting focus
      inputRef.current?.focus();
    }
  }, [agentIsAnswering]);

  return (
    <>
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col-reverse w-full max-h-full overflow-y-auto">
          <Content>
            <div className="space-y-6 p-6 pt-12">
              {messages.map((m, idx) => (
                <Message key={`${idx}-${m.date.toUTCString()}`} message={m} />
              ))}
            </div>
          </Content>
        </div>
      </div>
      <div className="border-t border-gray-600">
        <Content>
          <form className="p-6" onSubmit={handleNewUserPrompt}>
            <input
              autoFocus
              ref={inputRef}
              disabled={agentIsAnswering}
              name="prompt"
              className="w-full outline-none bg-transparent disabled:text-gray-300"
              placeholder={
                agentIsAnswering
                  ? 'Agent is answering...'
                  : 'Ask Bard something...'
              }
            />
          </form>
        </Content>
      </div>
    </>
  );
}
