import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Headphones,
  Send,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { askSupport, type SupportAnswer } from "@/lib/support.functions";
import { SUPPORT_QUICK_QUESTIONS } from "@/lib/support-knowledge";
import { getAccessKey } from "@/lib/session";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  source?: SupportAnswer["source"];
  needsHuman?: boolean;
};

type SupportChatPanelProps = {
  className?: string;
  compact?: boolean;
  onClose?: () => void;
};

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá! Sou o Suporte Zunexi. Posso explicar qualquer função do sistema e ajudar a resolver erros, 24 horas por dia. O que aconteceu?",
  createdAt: 0,
  source: "knowledge",
};

function messageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storageKey() {
  const key = getAccessKey();
  return `zunexi.support.v1.${key?.slice(-6) || "guest"}`;
}

function loadChat() {
  if (typeof window === "undefined") return [WELCOME];
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey()) || "[]",
    ) as ChatMessage[];
    const valid = parsed
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          typeof item.createdAt === "number",
      )
      .slice(-30);
    return valid.length
      ? [WELCOME, ...valid.filter((item) => item.id !== "welcome")]
      : [WELCOME];
  } catch {
    return [WELCOME];
  }
}

function saveChat(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  const persistable = messages
    .filter((item) => item.id !== "welcome")
    .slice(-30);
  localStorage.setItem(storageKey(), JSON.stringify(persistable));
}

function InlineText({ children }: { children: string }) {
  const parts = children.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function MessageContent({ content }: { content: string }) {
  return (
    <div className="space-y-1.5">
      {content.split("\n").map((line, index) => {
        const numbered = line.match(/^\s*(\d+)\.\s+(.+)/);
        const bullet = line.match(/^\s*[-•]\s+(.+)/);
        if (!line.trim()) return <div key={index} className="h-1" />;
        if (numbered)
          return (
            <div key={index} className="flex gap-2">
              <span className="font-semibold text-primary">{numbered[1]}.</span>
              <span>
                <InlineText>{numbered[2]}</InlineText>
              </span>
            </div>
          );
        if (bullet)
          return (
            <div key={index} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>
                <InlineText>{bullet[1]}</InlineText>
              </span>
            </div>
          );
        return (
          <p key={index}>
            <InlineText>{line}</InlineText>
          </p>
        );
      })}
    </div>
  );
}

export function SupportChatPanel({
  className = "",
  compact = false,
  onClose,
}: SupportChatPanelProps) {
  const location = useLocation();
  const sendQuestion = useServerFn(askSupport);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState(
    SUPPORT_QUICK_QUESTIONS.slice(0, 4),
  );

  useEffect(() => {
    setMessages(loadChat());
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    saveChat(messages);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending]);

  const recentHistory = useMemo(
    () =>
      messages
        .filter((item) => item.id !== "welcome")
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content })),
    [messages],
  );

  async function submitQuestion(value?: string) {
    const question = (value ?? input).trim();
    if (!question || sending) return;
    const accessKey = getAccessKey();
    if (!accessKey) return;

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      content: question,
      createdAt: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);

    try {
      const result = await sendQuestion({
        data: {
          accessKey,
          question,
          currentPath: location.pathname,
          history: recentHistory,
          diagnostics: {
            online: navigator.onLine,
            userAgent: navigator.userAgent.slice(0, 300),
          },
        },
      });
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: result.answer,
          createdAt: Date.now(),
          source: result.source,
          needsHuman: result.needsHuman,
        },
      ]);
      if (result.suggestions.length) setSuggestions(result.suggestions);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Falha inesperada";
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: `Não consegui validar sua conta para consultar o suporte. Recarregue a página e tente novamente. Se continuar, informe ao administrador: ${detail}`,
          createdAt: Date.now(),
          source: "knowledge",
          needsHuman: true,
        },
      ]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void submitQuestion();
  }

  function clearConversation() {
    setMessages([WELCOME]);
    setSuggestions(SUPPORT_QUICK_QUESTIONS.slice(0, 4));
    localStorage.removeItem(storageKey());
  }

  async function copyDiagnostic() {
    const transcript = messages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "user" ? "Cliente" : "Suporte"}: ${item.content}`,
      )
      .join("\n\n");
    const report = [
      "Relatório de suporte Zunexi.ai",
      `Página: ${location.pathname}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      `Online: ${navigator.onLine ? "sim" : "não"}`,
      `Navegador: ${navigator.userAgent}`,
      "",
      transcript,
    ].join("\n");
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border border-border bg-popover shadow-2xl ${compact ? "h-[min(720px,calc(100dvh-96px))] rounded-2xl" : "h-[720px] rounded-2xl"} ${className}`}
      aria-label="Chat de suporte Zunexi.ai"
    >
      <header className="relative overflow-hidden border-b border-border px-4 py-3.5">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/15 via-violet-500/5 to-accent/10" />
        <div className="relative flex items-center gap-3">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-[0_10px_30px_rgba(139,92,246,.24)]">
            <Bot className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-popover bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">Suporte Zunexi</h2>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                24h
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {online ? (
                <Wifi className="h-3 w-3 text-emerald-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-amber-500" />
              )}
              {online ? "IA + base de soluções" : "Você está sem conexão"}
            </div>
          </div>
          <button
            type="button"
            onClick={clearConversation}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Limpar conversa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Fechar suporte"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-[13px] leading-5 ${message.role === "user" ? "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-border bg-card/85 text-foreground"}`}
              >
                <MessageContent content={message.content} />
                {message.role === "assistant" && message.id !== "welcome" && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <span>
                      {message.source === "ai"
                        ? "Resposta da IA"
                        : "Base de soluções"}
                    </span>
                    {message.needsHuman && (
                      <button
                        type="button"
                        onClick={() => void copyDiagnostic()}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 normal-case tracking-normal hover:bg-secondary hover:text-foreground"
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copied ? "Copiado" : "Copiar diagnóstico"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}

          {sending && (
            <div className="flex gap-2.5">
              <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div
                className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card/85 px-4 py-3"
                aria-label="Suporte digitando"
              >
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-.2s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-.1s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-card/35 px-3 pb-3 pt-2.5 sm:px-4">
        {messages.length <= 2 && (
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void submitQuestion(suggestion)}
                disabled={sending}
                className="shrink-0 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 2000))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion();
              }
            }}
            rows={2}
            placeholder="Descreva sua dúvida ou cole o erro..."
            className="app-input min-h-[58px] resize-none pr-14 text-xs leading-5"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || !online}
            className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-muted-foreground">
          <span>Não envie senhas, chaves ou tokens.</span>
          {compact && (
            <Link
              to="/suporte"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:text-accent"
            >
              Central completa <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function SupportAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (location.pathname === "/suporte") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] sm:bottom-6 sm:right-6">
      {open && (
        <div className="fixed inset-x-3 bottom-[84px] z-[71] sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[410px]">
          <SupportChatPanel compact onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Fechar suporte" : "Abrir suporte 24 horas"}
        className={`group ml-auto flex h-14 items-center gap-2.5 rounded-2xl border px-4 text-white shadow-[0_16px_50px_rgba(76,29,149,.35)] transition hover:-translate-y-0.5 ${open ? "border-border bg-card text-foreground" : "border-white/10 bg-gradient-to-r from-primary via-violet-600 to-indigo-600"}`}
      >
        {open ? <X className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold">Suporte Zunexi</span>
          <span
            className={`mt-0.5 flex items-center gap-1 text-[9px] ${open ? "text-muted-foreground" : "text-white/75"}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
            24h
          </span>
        </span>
      </button>
    </div>
  );
}
