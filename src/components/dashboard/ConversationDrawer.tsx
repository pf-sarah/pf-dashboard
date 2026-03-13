'use client';

import { useEffect, useState, useRef } from 'react';

interface Message {
  uuid: string;
  messageText: string;
  userUuid: string;
  userFirstName: string;
  userLastName: string;
  dateCreated: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

interface ConversationUser {
  userUuid: string;
  userFirstName?: string;
  userLastName?: string;
  clientUser?: boolean;
}

interface Props {
  orderNum: string;
  orderUuid: string;
  onClose: () => void;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function ConversationDrawer({ orderNum, orderUuid, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [clientUuids, setClientUuids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/conversations?orderUuid=${encodeURIComponent(orderUuid)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }

        // Determine client UUIDs from users list
        const users: ConversationUser[] = data.users ?? [];
        const clientSet = new Set<string>(
          users.filter(u => u.clientUser).map(u => u.userUuid)
        );
        setClientUuids(clientSet);

        // Flatten paginated messages
        const msgs: Message[] = data.messages?.items ?? data.messages ?? [];
        setMessages(Array.isArray(msgs) ? msgs.sort((a, b) =>
          new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()
        ) : []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [orderUuid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Order Conversation</p>
            <p className="text-base font-semibold text-slate-800">#{orderNum}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Loading messages…
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm text-center py-8">
              Could not load conversation.<br />
              <span className="text-xs text-slate-400">{error}</span>
            </div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="text-slate-400 text-sm text-center py-8">
              No messages in this conversation yet.
            </div>
          )}
          {messages.map(msg => {
            const isClient = clientUuids.has(msg.userUuid);
            const senderName = `${msg.userFirstName ?? ''} ${msg.userLastName ?? ''}`.trim() || 'Unknown';
            return (
              <div key={msg.uuid} className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}>
                <span className="text-xs text-slate-400 mb-1 px-1">
                  {senderName} · {fmtTime(msg.dateCreated)}
                </span>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isClient
                    ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}>
                  {msg.messageText && <p>{msg.messageText}</p>}
                  {msg.attachmentUrl && (
                    <a
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block mt-1 text-xs underline ${isClient ? 'text-indigo-600' : 'text-indigo-200'}`}
                    >
                      {msg.attachmentName ?? 'Attachment'}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-400 text-center">
            View-only · Reply in the Pressed Floral app
          </p>
        </div>
      </div>
    </>
  );
}
