"use client";

import { useState, useRef, useEffect, MutableRefObject } from "react";
import { Subject, ChatMessage, ChatAttachment } from "@/types";
import { createChat, deleteChat, saveChatMessages, renameChat } from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { ImageLookup, swapMaterialImages } from "@/lib/render";

export default function ChatTab({
  subject,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  launch,
  onLaunchConsumed,
  imageLookup,
  imageBlobRef,
}: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  launch?: { message: string; chatName: string; nonce: number; attachments?: ChatAttachment[] } | null;
  onLaunchConsumed?: () => void;
  imageLookup: ImageLookup;
  imageBlobRef: MutableRefObject<Map<string, string>>;
}) {
  const chats = subject.content.chats;
  const [activeChatId, setActiveChatId] = useState<string | null>(chats[0]?.id || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [showChatList, setShowChatList] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingActiveTitle, setRenamingActiveTitle] = useState(false);
  const [activeTitleValue, setActiveTitleValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<(ChatAttachment & { localId: string; uploading?: boolean; failed?: boolean })[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const localId = crypto.randomUUID();
    const blobUrl = URL.createObjectURL(file);
    imageBlobRef.current.set(`chat-attach::${localId}`, blobUrl);
    setPending((p) => [...p, { localId, name: file.name, mimeType: file.type, uploading: true }]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: fd });
      const data = await parseApiResponse<{ uri: string; mimeType: string; name: string }>(res);
      setPending((p) => p.map((a) => a.localId === localId ? { ...a, uri: data.uri, mimeType: data.mimeType, uploading: false } : a));
    } catch {
      setPending((p) => p.map((a) => a.localId === localId ? { ...a, uploading: false, failed: true } : a));
    }
  };

  const removePending = (localId: string) => {
    const key = `chat-attach::${localId}`;
    const url = imageBlobRef.current.get(key);
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    imageBlobRef.current.delete(key);
    setPending((p) => p.filter((a) => a.localId !== localId));
  };

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    if (activeChat) {
      setMessages(activeChat.messages);
    } else if (chats.length > 0) {
      setActiveChatId(chats[0].id);
    } else {
      setMessages([]);
    }
  }, [activeChatId, activeChat, chats]);

  useEffect(() => {
    if (launch && onLaunchConsumed) {
      const chat = createChat(subject.id, launch.chatName);
      onUpdated();
      setActiveChatId(chat.id);
      setMessages([]);
      setInput(launch.message);
      onLaunchConsumed();
    }
  }, [launch, onLaunchConsumed, subject.id, onUpdated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleNewChat = () => {
    const chat = createChat(subject.id, `Chat ${chats.length + 1}`);
    onUpdated();
    setActiveChatId(chat.id);
    setMessages([]);
    setShowChatList(false);
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat(subject.id, chatId);
    onUpdated();
    if (activeChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      setActiveChatId(remaining[0]?.id || null);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    const attachmentsReady = pending.filter((a) => !!a.uri && !a.failed);
    if ((!text && attachmentsReady.length === 0) || loading || !activeChatId) return;
    if (pending.some((a) => a.uploading)) return;

    const attachmentsForMessage: ChatAttachment[] = attachmentsReady.map((a) => ({
      name: a.name, mimeType: a.mimeType, uri: a.uri, data: `chat-attach::${a.localId}`,
    }));

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now(), attachments: attachmentsForMessage };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setPending([]);
    setLoading(true);
    setStatus("Thinking...");

    try {
      const materials = getMaterials();
      setStatus(`Analyzing ${materials.length} material${materials.length !== 1 ? "s" : ""}...`);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "(image sent)",
          history: updated.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          materials,
          attachments: attachmentsReady.map((a) => ({ name: a.name, mimeType: a.mimeType, uri: a.uri })),
        }),
      });
      const data = await parseApiResponse<{ reply: string; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "chat", subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, "Chat message");

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply, timestamp: Date.now() };
      const withReply = [...updated, assistantMsg];
      setMessages(withReply);
      saveChatMessages(subject.id, activeChatId, withReply);
      onUpdated();
    } catch (e: unknown) {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `<p style="color:#f87171">Error: ${e instanceof Error ? e.message : "Something went wrong"}</p>`,
        timestamp: Date.now(),
      };
      setMessages([...updated, errMsg]);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleClearChat = () => {
    if (!activeChatId) return;
    setMessages([]);
    saveChatMessages(subject.id, activeChatId, []);
    onUpdated();
  };

  if (!hasMaterials) {
    return (
      <div className="py-12 space-y-4">
        <p className="text-4xl">💬</p>
        <h3 className="text-lg font-semibold text-zinc-300">Study Chat</h3>
        <p className="text-sm text-zinc-500">Upload materials first, then chat with AI about them.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] min-h-[400px]">
      {/* Chat header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="relative">
          {renamingActiveTitle && activeChat ? (
            <input
              autoFocus
              value={activeTitleValue}
              onChange={(e) => setActiveTitleValue(e.target.value)}
              onBlur={() => {
                const trimmed = activeTitleValue.trim();
                if (trimmed && activeChat) {
                  renameChat(subject.id, activeChat.id, trimmed);
                  onUpdated();
                }
                setRenamingActiveTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenamingActiveTitle(false);
              }}
              className="bg-zinc-900 border border-violet-500 rounded-lg px-2 py-1 text-sm text-zinc-100 focus:outline-none w-48"
            />
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowChatList(!showChatList)}
                className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
              >
                <span className="truncate max-w-[200px]">{activeChat?.name || "No chat"}</span>
                <span className="text-[10px] text-zinc-600">&#x25BC;</span>
              </button>
              {activeChat && (
                <button
                  onClick={() => { setRenamingActiveTitle(true); setActiveTitleValue(activeChat.name); }}
                  title="Rename chat"
                  className="text-xs text-zinc-600 hover:text-zinc-400 px-1 transition-colors"
                >
                  ✎
                </button>
              )}
            </div>
          )}

          {showChatList && !renamingActiveTitle && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 animate-fade-in">
              <button
                onClick={handleNewChat}
                className="w-full text-left px-3 py-2 text-xs text-violet-400 hover:bg-zinc-800 transition-colors"
              >
                + New Chat
              </button>
              <div className="border-t border-zinc-800 my-1" />
              {chats.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm group transition-colors ${
                    c.id === activeChatId ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  } ${renamingId === c.id ? "" : "cursor-pointer"}`}
                  onClick={() => {
                    if (renamingId === c.id) return;
                    setActiveChatId(c.id);
                    setShowChatList(false);
                  }}
                >
                  {renamingId === c.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        const trimmed = renameValue.trim();
                        if (trimmed) {
                          renameChat(subject.id, c.id, trimmed);
                          onUpdated();
                        }
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 bg-zinc-950 border border-violet-500 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none"
                    />
                  ) : (
                    <>
                      <span className="truncate flex-1">{c.name}</span>
                      <span className="text-[10px] text-zinc-600">{c.messages.length} msg</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.name); }}
                        title="Rename"
                        className="text-zinc-600 hover:text-zinc-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteChat(c.id); }}
                        className="text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <p className="text-xs text-zinc-600 px-3 py-2">No chats yet</p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {hasLoadedMaterials && (
          <span className="text-[10px] text-zinc-600">
            {getMaterials().length} material{getMaterials().length !== 1 ? "s" : ""} loaded
          </span>
        )}
        {!hasLoadedMaterials && (
          <span className="text-[10px] text-amber-400">re-upload PDFs to include them</span>
        )}

        {messages.length > 0 && (
          <button onClick={handleClearChat} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Clear
          </button>
        )}

        <button
          onClick={handleNewChat}
          className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
        >
          + New
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {!activeChatId && (
          <div className="py-8 space-y-3">
            <p className="text-zinc-500 text-sm">Create a new chat to get started.</p>
            <button
              onClick={handleNewChat}
              className="text-xs px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              + New Chat
            </button>
          </div>
        )}

        {activeChatId && messages.length === 0 && (
          <div className="py-8 space-y-3">
            <p className="text-zinc-500 text-sm">Ask anything about your materials.</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Explain the key concepts",
                "What are the main topics covered?",
                "Give me practice problems",
                "What's most likely on the exam?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-violet-600/20 text-zinc-200 border border-violet-500/20"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-300"
              }`}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.attachments.map((a, ai) => {
                    const url = a.data ? imageBlobRef.current.get(a.data) : undefined;
                    return url ? (
                      <img key={ai} src={url} alt={a.name} className="max-w-full max-h-64 rounded-lg" />
                    ) : (
                      <div key={ai} className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-2 py-1">
                        🖼 {a.name}
                      </div>
                    );
                  })}
                </div>
              )}
              {msg.role === "user" ? (
                msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div
                  className="[&_p]:mb-2 [&_p]:last:mb-0 [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mb-2
                    [&_h4]:font-medium [&_h4]:text-zinc-200 [&_h4]:mb-1
                    [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal
                    [&_li]:mb-1 [&_strong]:text-zinc-100
                    [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs
                    [&_pre]:bg-zinc-950 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0
                    [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400"
                  dangerouslySetInnerHTML={{ __html: swapMaterialImages(msg.content, subject, imageLookup) }}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-zinc-500">{status}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {activeChatId && (
        <div
          className="shrink-0 relative"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
            files.forEach(attachImage);
          }}
        >
          {dragOver && (
            <div className="absolute inset-0 -m-2 bg-violet-500/10 border-2 border-dashed border-violet-400 rounded-2xl z-10 pointer-events-none flex items-center justify-center">
              <p className="text-sm text-violet-300">Drop image to attach</p>
            </div>
          )}

          {/* Pending attachment strip */}
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 p-2 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              {pending.map((a) => {
                const url = imageBlobRef.current.get(`chat-attach::${a.localId}`);
                return (
                  <div key={a.localId} className="relative group">
                    {url ? (
                      <img src={url} alt={a.name} className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-500">🖼</div>
                    )}
                    {a.uploading && (
                      <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-violet-300 border-t-transparent rounded-full animate-spin-slow" />
                      </div>
                    )}
                    {a.failed && (
                      <div className="absolute inset-0 rounded-lg bg-red-900/60 flex items-center justify-center text-[10px] text-red-200">
                        failed
                      </div>
                    )}
                    <button
                      onClick={() => removePending(a.localId)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-300 text-[10px] hover:bg-red-600 hover:border-red-500 hover:text-white transition-colors flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) Array.from(e.target.files).forEach(attachImage);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Attach image"
              className="px-3 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
            >
              📎
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                if (files.length) {
                  e.preventDefault();
                  files.forEach(attachImage);
                }
              }}
              placeholder="Ask about your materials, paste or drop an image..."
              disabled={loading}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && pending.filter((a) => a.uri).length === 0) || pending.some((a) => a.uploading)}
              className="px-5 py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
