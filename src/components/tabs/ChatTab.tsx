"use client";

import { useState, useRef, useEffect } from "react";
import { Subject, ChatMessage, ChatConversation } from "@/types";
import { createChat, deleteChat, saveChatMessages, renameChat } from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";

export default function ChatTab({
  subject,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  launch,
  onLaunchConsumed,
}: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  launch?: { message: string; chatName: string; nonce: number } | null;
  onLaunchConsumed?: () => void;
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!text || loading || !activeChatId) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    setStatus("Thinking...");

    try {
      const materials = getMaterials();
      setStatus(`Analyzing ${materials.length} material${materials.length !== 1 ? "s" : ""}...`);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: updated.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          materials,
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
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)", minHeight: "400px" }}>
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
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div
                  className="[&_p]:mb-2 [&_p]:last:mb-0 [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mb-2
                    [&_h4]:font-medium [&_h4]:text-zinc-200 [&_h4]:mb-1
                    [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal
                    [&_li]:mb-1 [&_strong]:text-zinc-100
                    [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs
                    [&_pre]:bg-zinc-950 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0
                    [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400"
                  dangerouslySetInnerHTML={{ __html: msg.content }}
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
        <div className="flex gap-2 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your materials..."
            disabled={loading}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
