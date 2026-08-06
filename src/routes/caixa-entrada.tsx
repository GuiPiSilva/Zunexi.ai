import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Inbox, Instagram, Loader2, MessageCircle, Search, Send, StickyNote, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { listInboxMessages, listInboxThreads, sendInboxReply, updateInboxThread } from "@/lib/social.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/caixa-entrada")({
  head: () => ({ meta: [{ title: "Caixa de entrada — Zunexi.ai" }] }),
  component: InboxRoute,
});

type ThreadStatus = "novo" | "em_atendimento" | "aguardando" | "resolvido" | "spam";
type Sentiment = "positive" | "neutral" | "negative" | "urgent";
type Thread = {
  id: string; platform: string; user_name: string; kind: string; status: ThreadStatus; sentiment: Sentiment;
  last_message: string; last_message_at: string; unread_count: number; labels: string[];
  social_accounts?: { account_name?: string; platform?: string };
};
type Message = { id: string; direction: "inbound" | "outbound" | "note"; body: string; created_at: string; tenant_members?: { display_name?: string } };

const STATUS: Record<ThreadStatus, string> = { novo: "Novo", em_atendimento: "Em atendimento", aguardando: "Aguardando", resolvido: "Resolvido", spam: "Spam" };
const SENTIMENT: Record<Sentiment, string> = { positive: "Positivo", neutral: "Neutro", negative: "Negativo", urgent: "Urgente" };

function InboxRoute() { return <AppShell><PlanGate feature="caixa_entrada"><InboxPage /></PlanGate></AppShell>; }

function InboxPage() {
  const accessKey = getAccessKey() || "";
  const getThreads = useServerFn(listInboxThreads);
  const getMessages = useServerFn(listInboxMessages);
  const updateThread = useServerFn(updateInboxThread);
  const reply = useServerFn(sendInboxReply);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ThreadStatus | "todos">("todos");
  const [body, setBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function refresh(keepId?: string) {
    setLoading(true);
    try {
      const rows = await getThreads({ data: { accessKey, query: "", status: filter === "todos" ? undefined : filter } }) as Thread[];
      setThreads(rows);
      const next = rows.find((row) => row.id === (keepId || selected?.id)) || rows[0] || null;
      setSelected(next);
      if (next) setMessages(await getMessages({ data: { accessKey, threadId: next.id } }) as Message[]);
      else setMessages([]);
    } catch (error) { toast.error((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [filter]);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return !value ? threads : threads.filter((thread) => `${thread.user_name} ${thread.last_message} ${thread.social_accounts?.account_name || ""}`.toLowerCase().includes(value));
  }, [threads, query]);

  async function choose(thread: Thread) {
    setSelected(thread);
    try { setMessages(await getMessages({ data: { accessKey, threadId: thread.id } }) as Message[]); }
    catch (error) { toast.error((error as Error).message); }
  }

  async function setStatus(status: ThreadStatus) {
    if (!selected) return;
    try {
      await updateThread({ data: { accessKey, threadId: selected.id, status } });
      setSelected({ ...selected, status });
      setThreads((all) => all.map((item) => item.id === selected.id ? { ...item, status } : item));
      toast.success(`Conversa marcada como ${STATUS[status].toLowerCase()}.`);
    } catch (error) { toast.error((error as Error).message); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !body.trim()) return;
    setSending(true);
    try {
      await reply({ data: { accessKey, threadId: selected.id, body: body.trim(), internalNote } });
      setBody("");
      setMessages(await getMessages({ data: { accessKey, threadId: selected.id } }) as Message[]);
      toast.success(internalNote ? "Nota interna adicionada." : "Resposta enviada.");
    } catch (error) { toast.error((error as Error).message); }
    finally { setSending(false); }
  }

  return <div className="page-wrap space-y-6">
    <section className="studio-hero panel relative overflow-hidden p-6 sm:p-8"><div className="studio-hero-grid" /><div className="relative"><div className="eyebrow mb-3 flex items-center gap-2"><Inbox className="h-3.5 w-3.5 text-primary" /> Atendimento social</div><h1 className="section-title text-3xl sm:text-5xl">Caixa de entrada</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Mensagens, comentários e menções recebidos pelos webhooks das contas conectadas.</p></div></section>
    <section className="panel grid min-h-[650px] overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-b border-border lg:border-b-0 lg:border-r">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa..." className="w-full bg-transparent text-sm outline-none" /></div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as ThreadStatus | "todos")} className="app-input h-11 w-full"><option value="todos">Todos os status</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        <div className="max-h-[570px] overflow-y-auto">
          {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : visible.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa sincronizada.</div> : visible.map((thread) => <button key={thread.id} onClick={() => void choose(thread)} className={`block w-full border-b border-border/70 p-4 text-left transition hover:bg-secondary/60 ${selected?.id === thread.id ? "bg-primary/8" : ""}`}>
            <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{thread.platform === "instagram" ? <Instagram className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{thread.user_name || "Contato"}</strong>{thread.unread_count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{thread.unread_count}</span>}</div><div className="mt-1 truncate text-xs text-muted-foreground">{thread.last_message}</div><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{thread.social_accounts?.account_name || thread.platform}</span><span>{formatDate(thread.last_message_at)}</span></div></div></div>
          </button>)}
        </div>
      </aside>
      {!selected ? <div className="grid place-items-center p-8 text-center"><div><Inbox className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 font-semibold">Selecione uma conversa</h2><p className="mt-2 text-sm text-muted-foreground">As novas interações aparecerão aqui automaticamente.</p></div></div> : <div className="flex min-h-[650px] min-w-0 flex-col">
        <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate font-semibold">{selected.user_name}</h2><p className="truncate text-xs text-muted-foreground">{selected.social_accounts?.account_name || selected.platform} · {SENTIMENT[selected.sentiment]}</p></div></div><select value={selected.status} onChange={(e) => void setStatus(e.target.value as ThreadStatus)} className="app-input h-10 sm:w-44">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></header>
        {selected.sentiment === "urgent" && <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300"><CircleAlert className="h-4 w-4" /> Esta interação foi marcada como urgente. Revise antes de responder.</div>}
        <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/15 p-4 sm:p-6">{messages.length === 0 ? <div className="text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</div> : messages.map((message) => <div key={message.id} className={`flex ${message.direction === "inbound" ? "justify-start" : "justify-end"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.direction === "note" ? "border border-amber-400/30 bg-amber-500/10" : message.direction === "outbound" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}><div>{message.body}</div><div className={`mt-1.5 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{message.direction === "note" ? `Nota de ${message.tenant_members?.display_name || "equipe"}` : formatDate(message.created_at)}</div></div></div>)}</div>
        <form onSubmit={submit} className="border-t border-border p-4"><div className="mb-3 flex items-center justify-between"><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} /> <StickyNote className="h-3.5 w-3.5" /> Nota interna</label>{selected.status !== "resolvido" && <button type="button" onClick={() => void setStatus("resolvido")} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Resolver</button>}</div><div className="flex gap-2"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={internalNote ? "Escreva uma nota para a equipe..." : "Escreva sua resposta..."} className="app-input min-h-16 flex-1 resize-none py-3" /><button disabled={sending || !body.trim()} className="primary-button self-end disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : internalNote ? <StickyNote className="h-4 w-4" /> : <Send className="h-4 w-4" />}</button></div></form>
      </div>}
    </section>
  </div>;
}

function formatDate(value: string) { if (!value) return ""; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
