"use client";

import { useState, useRef, useEffect, MutableRefObject } from "react";
import { Subject, CrossSubjectChat, ChatMessage, ChatAttachment } from "@/types";
import {
  renameCrossChat, updateCrossChatSubjects, saveCrossChatMessages, deleteCrossChat,
} from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { ImageLookup } from "@/lib/render";
import RenderedHtml from "./RenderedHtml";

// A stand-alone chat surface not tied to any single subject.
// The user picks which subjects to include; their materials all go into
// the chat context so the assistant can connect knowledge across them.

export default function CrossChatView({
  chat,
  subjects,
  balance,
  imageBlobRef,
  onBack,
  onDelete,
  onResetCredits,
  onUpdated,
}: {
  chat: CrossSubjectChat;
  subjects: Subject[];
  balance: number;
  imageBlobRef: MutableRefObject<Map<string, string>>;
  onBack: () => void;
  onDelete: () => void;
  onResetCredits: () => void;
  onUpdated: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(chat.messages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set(chat.subjectIds));
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(chat.name);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<(ChatAttachment & { localId: string; uploading?: boolean; failed?: boolean })[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastCost, setLastCost] = useState<{ amount: number; action: string } | null>(null);

  useEffect(() => {
    setMessages(chat.messages);
    setSelectedSubjectIds(new Set(chat.subjectIds));
    setTitleValue(chat.name);
  }, [chat.id, chat.messages, chat.subjectIds, chat.name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const includedSubjects = subjects.filter((s) => selectedSubjectIds.has(s.id));

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

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      updateCrossChatSubjects(chat.id, Array.from(next));
      onUpdated();
      return next;
    });
  };

  const buildMaterialsPayload = () => {
    const out: { type: string; data: string; name: string; uri?: string; mimeType?: string }[] = [];
    for (const s of includedSubjects) {
      for (const m of s.materials) {
        // Prefix material name with subject name so the model knows the provenance.
        const scopedName = `[${s.name}] ${m.name}`;
        if (m.type === "pdf") {
          if (m.uri) out.push({ type: "pdf", data: "", name: scopedName, uri: m.uri, mimeType: m.mimeType || "application/pdf" });
        } else if (m.type === "image") {
          if (m.uri) out.push({ type: "image", data: "", name: scopedName, uri: m.uri, mimeType: m.mimeType || "image/png" });
          else if (m.data) out.push({ type: "image", data: m.data, name: scopedName, mimeType: m.mimeType || "image/png" });
        } else if (m.data) {
          out.push({ type: m.type, data: m.data, name: scopedName });
        }
      }
    }
    return out;
  };

  const materialCount = buildMaterialsPayload().length;

  const handleSend = async () => {
    const text = input.trim();
    const attachmentsReady = pending.filter((a) => !!a.uri && !a.failed);
    if ((!text && attachmentsReady.length === 0) || loading) return;
    if (pending.some((a) => a.uploading)) return;
    if (includedSubjects.length === 0) return;

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
      const materials = buildMaterialsPayload();
      setStatus(`Analyzing ${materials.length} material${materials.length !== 1 ? "s" : ""} across ${includedSubjects.length} subject${includedSubjects.length !== 1 ? "s" : ""}...`);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "(image sent)",
          history: updated.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          materials,
          attachments: attachmentsReady.map((a) => ({ name: a.name, mimeType: a.mimeType, uri: a.uri })),
          crossSubject: {
            subjectNames: includedSubjects.map((s) => s.name),
          },
        }),
      });
      const data = await parseApiResponse<{ reply: string; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "cross-chat", chat.name, usage.tokensIn, usage.tokensOut);
      setLastCost({ amount: charged, action: "Cross-subject chat" });
      setTimeout(() => setLastCost(null), 8000);
      onUpdated();

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply, timestamp: Date.now() };
      const withReply = [...updated, assistantMsg];
      setMessages(withReply);
      saveCrossChatMessages(chat.id, withReply);
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

  const handleClearMessages = () => {
    if (!confirm("Clear all messages in this chat?")) return;
    setMessages([]);
    saveCrossChatMessages(chat.id, []);
    onUpdated();
  };

  const handleDeleteChat = () => {
    if (!confirm(`Delete cross-subject chat "${chat.name}"?`)) return;
    deleteCrossChat(chat.id);
    onDelete();
  };

  // Cross-subject imageLookup: search across all included subjects for a material id.
  const crossSubject: Subject = {
    id: "__cross__",
    name: "Cross-subject",
    color: "#8b5cf6",
    materials: includedSubjects.flatMap((s) => s.materials),
    content: { quizzes: [], chats: [], customSections: [] },
    createdAt: 0,
  };
  const imageLookup: ImageLookup = {
    getUrl: (materialId, pageNum) => {
      const key = pageNum !== undefined ? `${materialId}::${pageNum}` : materialId;
      return imageBlobRef.current.get(key);
    },
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Sidebar */}
      <nav className="w-64 md:w-56 shrink-0 border-r border-zinc-800 flex flex-col h-full bg-zinc-950">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
          >
            &larr; All subjects
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">🧩</span>
            {renamingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => {
                  const t = titleValue.trim();
                  if (t) { renameCrossChat(chat.id, t); onUpdated(); }
                  setRenamingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingTitle(false);
                }}
                className="flex-1 min-w-0 bg-zinc-900 border border-violet-500 rounded px-1.5 py-0.5 text-sm text-zinc-100 focus:outline-none"
              />
            ) : (
              <h2
                onClick={() => setRenamingTitle(true)}
                title="Click to rename"
                className="text-sm font-bold text-zinc-200 truncate flex-1 cursor-text hover:bg-zinc-900 rounded px-1"
              >
                {chat.name}
              </h2>
            )}
            <button
              onClick={handleDeleteChat}
              aria-label="Delete cross-subject chat"
              className="text-zinc-700 hover:text-red-400 text-xs transition-colors"
            >
              🗑
            </button>
          </div>
        </div>

        {/* Subject picker */}
        <div className="p-3 border-b border-zinc-800 space-y-1.5">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Included subjects</div>
          {subjects.length === 0 && (
            <p className="text-[11px] text-zinc-600">No subjects yet.</p>
          )}
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedSubjectIds.has(s.id)}
                onChange={() => toggleSubject(s.id)}
                className="accent-violet-500 w-3.5 h-3.5 shrink-0"
              />
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className={`text-xs truncate flex-1 ${selectedSubjectIds.has(s.id) ? "text-zinc-200" : "text-zinc-500 group-hover:text-zinc-300"}`}>
                {s.name}
              </span>
              <span className="text-[10px] text-zinc-600 shrink-0">{s.materials.length}</span>
            </label>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Context</div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            The assistant sees materials from all {includedSubjects.length} included subject{includedSubjects.length !== 1 ? "s" : ""} at once
            ({materialCount} file{materialCount !== 1 ? "s" : ""} total). Ask it to connect concepts across them.
          </p>
          {messages.length > 0 && (
            <button
              onClick={handleClearMessages}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              Clear chat
            </button>
          )}
          {lastCost && (
            <div className="mt-3 px-2.5 py-2 bg-amber-950/30 border border-amber-800/30 rounded-lg animate-fade-in">
              <p className="text-[10px] text-amber-400">{lastCost.action}</p>
              <p className="text-xs text-amber-300 font-mono">-&euro;{lastCost.amount.toFixed(4)}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Credits</span>
            <button
              onClick={onResetCredits}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              reset
            </button>
          </div>
          <p className={`text-lg font-mono font-bold mt-0.5 ${balance < 1 ? "text-red-400" : "text-emerald-400"}`}>
            &euro;{balance.toFixed(2)}
          </p>
        </div>
      </nav>

      {/* Chat area */}
      <div className="flex-1 overflow-hidden flex flex-col px-4 md:px-8 py-4 md:py-6">
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <span className="text-lg">🧩</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-200">{chat.name}</h2>
            <p className="text-[10px] text-zinc-600 truncate">
              {includedSubjects.length === 0 ? "No subjects selected — pick some in the sidebar." :
                includedSubjects.map((s) => s.name).join(" · ")}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 && includedSubjects.length > 0 && (
            <div className="py-8 space-y-3">
              <p className="text-zinc-500 text-sm">Ask something that spans your subjects.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "What concepts overlap between these subjects?",
                  "Explain how topic X relates to topic Y",
                  "Give me a study plan across all these",
                  "Solve this problem using knowledge from all subjects",
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
          {messages.length === 0 && includedSubjects.length === 0 && (
            <p className="text-sm text-zinc-500 py-8">Include at least one subject to start.</p>
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
                        <div key={ai} className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-2 py-1">🖼 {a.name}</div>
                      );
                    })}
                  </div>
                )}
                {msg.role === "user" ? (
                  msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <RenderedHtml
                    html={msg.content}
                    subject={crossSubject}
                    imageLookup={imageLookup}
                    className="[&_p]:mb-2 [&_p]:last:mb-0 [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mb-2
                      [&_h4]:font-medium [&_h4]:text-zinc-200 [&_h4]:mb-1
                      [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal
                      [&_li]:mb-1 [&_strong]:text-zinc-100
                      [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs
                      [&_pre]:bg-zinc-950 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0
                      [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400
                      [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:my-3 [&_svg]:bg-zinc-950 [&_svg]:rounded-lg [&_svg]:p-2
                      [&_.mermaid]:my-3 [&_.mermaid]:bg-zinc-950 [&_.mermaid]:rounded-lg [&_.mermaid]:p-2 [&_.mermaid]:overflow-x-auto"
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
        <div
          className="shrink-0 relative mt-3"
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
                      <div className="absolute inset-0 rounded-lg bg-red-900/60 flex items-center justify-center text-[10px] text-red-200">failed</div>
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
              placeholder={includedSubjects.length === 0 ? "Include a subject first..." : "Ask across your subjects..."}
              disabled={loading || includedSubjects.length === 0}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={loading || includedSubjects.length === 0 || (!input.trim() && pending.filter((a) => a.uri).length === 0) || pending.some((a) => a.uploading)}
              className="px-5 py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
