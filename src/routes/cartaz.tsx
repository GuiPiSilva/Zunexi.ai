import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3, ImagePlus, Loader2, MapPin, Palette, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { generateCartaz, generateImage } from "@/lib/ai.functions";
import { newProject, upsertProject } from "@/lib/storage";
import { getAccessKey } from "@/lib/session";
import {
  createCreationJob,
  getActiveCreationJob,
  getCreationJob,
  subscribeCreationJobs,
  updateCreationJob,
  withCreationJobLock,
  type CreationJob,
} from "@/lib/generation-jobs";
import { addNotification, requestNotificationPermission } from "@/lib/notifications";

export const Route = createFileRoute("/cartaz")({
  head: () => ({ meta: [{ title: "Criar cartaz — InLabs.Ia Studios" }] }),
  component: NovoCartaz,
});

const STYLE_CARDS = [
  { id: "moderno", title: "Moderno", className: "from-fuchsia-600 via-violet-700 to-indigo-950" },
  { id: "futurista", title: "Futurista", className: "from-cyan-500 via-blue-700 to-violet-950" },
  { id: "vintage", title: "Vintage", className: "from-amber-500 via-orange-800 to-stone-950" },
  { id: "minimalista", title: "Minimalista", className: "from-stone-100 via-stone-300 to-stone-600" },
  { id: "vibrante", title: "Vibrante", className: "from-pink-500 via-orange-500 to-purple-800" },
  { id: "dark", title: "Dark", className: "from-neutral-700 via-neutral-900 to-black" },
];

function NovoCartaz() {
  const nav = useNavigate();
  const generateText = useServerFn(generateCartaz);
  const generateImageFn = useServerFn(generateImage);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [photo, setPhoto] = useState<string | undefined>();
  const [form, setForm] = useState({
    title: "",
    kind: "evento",
    date: "",
    time: "",
    place: "",
    address: "",
    description: "",
    attractions: "",
    price: "",
    contact: "",
    cta: "Garanta seu ingresso agora!",
    style: "moderno",
    palette: "roxo, rosa, azul e ciano",
    format: "1080x1350",
  });

  useEffect(() => {
    const key = getAccessKey();
    if (!key) {
      nav({ to: "/acesso", replace: true });
      return;
    }
    setAccessKey(key);
  }, [nav]);

  useEffect(() => {
    if (!accessKey) return;

    function syncFromJob() {
      const latest = getActiveCreationJob("cartaz");
      if (!latest) return;
      setBusy(latest.status === "queued" || latest.status === "running");
      setProgress(latest.progress);
      const savedForm = latest.payload.form as typeof form | undefined;
      if (savedForm) setForm(savedForm);
    }

    syncFromJob();
    const unsubscribe = subscribeCreationJobs(syncFromJob);
    const active = getActiveCreationJob("cartaz");
    if (active) void executeCartazJob(active);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo de 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function executeCartazJob(initialJob: CreationJob, memoryPhoto?: string) {
    if (!accessKey) return;

    const started = await withCreationJobLock(initialJob.id, async () => {
      let job = getCreationJob(initialJob.id, initialJob.ownerScope) || initialJob;
      const payload = job.payload as { form: typeof form; photo?: string };
      const currentForm = payload.form;
      setBusy(true);
      setProgress(job.progress);
      updateCreationJob(job.id, { status: "running", error: undefined }, job.ownerScope);

      try {
        const seed = String(job.payload.seed || job.id);
        const extra = [
          currentForm.description,
          currentForm.address && `Endereço: ${currentForm.address}`,
          currentForm.attractions && `Atrações: ${currentForm.attractions}`,
          currentForm.price && `Preço: ${currentForm.price}`,
          currentForm.contact && `Contato: ${currentForm.contact}`,
          currentForm.cta && `CTA: ${currentForm.cta}`,
          currentForm.palette && `Paleta: ${currentForm.palette}`,
        ].filter(Boolean).join("\n");

        let generated = job.result as { title: string; body: string; imagePrompt: string } | undefined;
        if (!generated) {
          const generatedOutput = await generateText({ data: {
            jobId: job.id,
            accessKey,
            title: currentForm.title,
            kind: currentForm.kind,
            date: currentForm.date,
            time: currentForm.time,
            place: currentForm.place,
            style: currentForm.style,
            extra,
            seed,
          } });
          generated = generatedOutput;
          job = updateCreationJob(job.id, { result: generatedOutput, progress: 40 }, job.ownerScope) || job;
          setProgress(40);
          window.dispatchEvent(new CustomEvent("inlabs:credits-changed"));
        }

        if (!generated) throw new Error("O texto do cartaz não pôde ser recuperado.");

        const dimensions = currentForm.format === "1080x1080" ? [1080, 1080] : currentForm.format === "1080x1920" ? [1080, 1920] : [1080, 1350];
        const [width, height] = dimensions;
        const aspectRatio = currentForm.format === "1080x1080" ? "1:1" : currentForm.format === "1080x1920" ? "9:16" : "4:5";

        let imageUrl = job.assets.main?.url || memoryPhoto || payload.photo;
        if (!imageUrl) {
          const image = await generateImageFn({
            data: {
              prompt: generated.imagePrompt,
              seed,
              slideTitle: generated.title,
              slideBody: generated.body,
              slideKind: `cartaz profissional de ${currentForm.kind}`,
              brand: currentForm.title,
              palette: currentForm.palette,
              style: `${currentForm.style}; cartaz de evento premium; arte final pronta para publicação`,
              aspectRatio,
            },
          });
          imageUrl = image.url;
          job = updateCreationJob(job.id, { assets: { ...job.assets, main: { url: image.url } }, progress: 90 }, job.ownerScope) || job;
          setProgress(90);
        }

        if (!imageUrl) throw new Error("A IA não retornou a arte do cartaz.");

        let projectId = job.projectId;
        if (!projectId) {
          const project = newProject("cartaz", currentForm.title, { style: currentForm.style, ratio: currentForm.format });
          project.slides = [{
            id: crypto.randomUUID(),
            width,
            height,
            canvas: {
              elements: [{ kind: "image" as const, x: 0, y: 0, w: width, h: height, url: imageUrl }],
              background: "#05050a",
              fonts: { display: "Bebas Neue", body: "Inter" },
            },
          }];
          upsertProject(project, job.ownerScope);
          projectId = project.id;
        }

        if (!projectId) throw new Error("Não foi possível salvar o projeto.");
        updateCreationJob(job.id, { status: "completed", progress: 100, projectId }, job.ownerScope);
        setProgress(100);
        addNotification({
          title: "Cartaz concluído",
          message: `“${currentForm.title}” foi salvo em Meus projetos.`,
          href: `/editor/${projectId}`,
          kind: "success",
        }, job.ownerScope);
        toast.success("Cartaz criado e salvo em Meus projetos.");
        if (window.location.pathname === "/cartaz") nav({ to: "/editor/$id", params: { id: projectId } });
      } catch (error) {
        window.dispatchEvent(new CustomEvent("inlabs:credits-changed"));
        const message = (error as Error).message || "Erro ao gerar o cartaz.";
        updateCreationJob(job.id, { status: "failed", error: message }, job.ownerScope);
        addNotification({ title: "Falha na criação", message, href: "/cartaz", kind: "error" }, job.ownerScope);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    });

    if (!started) {
      const active = getCreationJob(initialJob.id, initialJob.ownerScope);
      setBusy(active?.status === "queued" || active?.status === "running");
    }
  }

  async function gerar() {
    if (!accessKey) return;
    if (!form.title.trim()) {
      toast.error("Informe o nome do evento.");
      return;
    }

    const active = getActiveCreationJob("cartaz");
    if (active) {
      toast.info("Já existe um cartaz sendo criado. O progresso foi retomado.");
      void executeCartazJob(active);
      return;
    }

    void requestNotificationPermission();
    const persistedPhoto = photo && photo.length <= 2_000_000 ? photo : undefined;
    const job = createCreationJob("cartaz", { form: { ...form }, photo: persistedPhoto, seed: crypto.randomUUID() });
    setBusy(true);
    setProgress(5);
    await executeCartazJob(job, photo);
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section>
          <div className="eyebrow mb-2 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Arte de evento com IA</div>
          <h1 className="section-title text-3xl sm:text-4xl">Criar cartaz</h1>
          <p className="mt-2 text-sm text-muted-foreground">Informe os detalhes do evento e receba uma arte pronta para editar.</p>
        </section>

        <div className="panel grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          {[{ n: 1, title: "Informações", sub: "Dados do evento" }, { n: 2, title: "Geração", sub: "Texto e imagem com IA" }, { n: 3, title: "Editor", sub: "Personalize e exporte" }].map((item, index) => (
            <div key={item.n} className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-semibold ${index === 0 ? "border-primary bg-primary/20" : "border-border text-muted-foreground"}`}>{item.n}</div><div><div className={index === 0 ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>{item.title}</div><div className="text-[11px] text-muted-foreground">{item.sub}</div></div></div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="panel p-5 sm:p-7">
            <div className="mb-6"><h2 className="section-title text-xl">Informações do evento</h2><p className="mt-1 text-sm text-muted-foreground">Preencha os dados que devem aparecer na arte.</p></div>
            <div className="space-y-5">
              <Field label="Nome do evento" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Sunset Vibes Festival" className="app-input" /></Field>
              <div className="grid gap-5 md:grid-cols-2"><Field label="Categoria"><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="app-input"><option>evento</option><option>música / festival</option><option>igreja</option><option>palestra</option><option>promoção</option><option>lançamento</option></select></Field><Field label="Local"><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Arena InLabs" className="app-input pl-10" /></div></Field></div>
              <div className="grid gap-5 md:grid-cols-2"><Field label="Data"><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="app-input pl-10" /></div></Field><Field label="Horário"><div className="relative"><Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="app-input pl-10" /></div></Field></div>
              <Field label="Endereço"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. das Nações Unidas, 12.345" className="app-input" /></Field>
              <Field label="Descrição do evento"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Descreva a experiência, atrações e diferenciais." className="app-input resize-y" /></Field>
              <Field label="Atrações principais"><input value={form.attractions} onChange={(e) => setForm({ ...form, attractions: e.target.value })} placeholder="DJ Lucas Beat, MC Wave, Banda Horizon" className="app-input" /></Field>
              <div className="grid gap-5 md:grid-cols-3"><Field label="Preço"><input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="R$ 80,00" className="app-input" /></Field><Field label="Contato"><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="(11) 99999-9999" className="app-input" /></Field><Field label="Chamada para ação"><input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} className="app-input" /></Field></div>
              <div className="grid gap-5 md:grid-cols-3"><Field label="Estilo visual"><select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className="app-input">{STYLE_CARDS.map((style) => <option key={style.id} value={style.id}>{style.title}</option>)}</select></Field><Field label="Paleta de cores"><input value={form.palette} onChange={(e) => setForm({ ...form, palette: e.target.value })} className="app-input" /></Field><Field label="Formato da arte"><select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="app-input"><option value="1080x1350">1080 × 1350 — Feed</option><option value="1080x1080">1080 × 1080 — Quadrado</option><option value="1080x1920">1080 × 1920 — Story</option></select></Field></div>
              <Field label="Foto principal — opcional"><label className="flex min-h-28 cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border bg-white/[0.018] p-4 hover:border-primary/50"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Upload className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{photo ? "Imagem carregada" : "Enviar imagem do evento"}</div><div className="mt-1 text-xs text-muted-foreground">PNG ou JPG, máximo de 8 MB.</div></div>{photo && <img src={photo} alt="Prévia" className="h-20 w-20 rounded-xl object-cover" />}<input type="file" accept="image/*" onChange={onFile} className="hidden" /></label></Field>
            </div>
            {busy && (
              <div className="mt-6 rounded-xl border border-primary/25 bg-primary/8 p-4">
                <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Criando em segundo plano...</span><span>{progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full gradient-brand transition-all duration-500" style={{ width: `${progress}%` }} /></div>
                <p className="mt-2 text-[11px] text-muted-foreground">Você pode sair desta página. O sistema avisará quando terminar.</p>
              </div>
            )}
            <div className="mt-6 flex justify-end"><button type="button" disabled={busy} onClick={gerar} className="primary-button min-w-48 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{busy ? "Gerando cartaz..." : "Gerar cartaz"}</button></div>
          </section>

          <aside className="space-y-5">
            <div className="panel p-5"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Palette className="h-5 w-5" /></div><div><h2 className="font-semibold">Estilos visuais</h2><p className="text-xs text-muted-foreground">Escolha uma direção criativa.</p></div></div><div className="grid grid-cols-2 gap-3">{STYLE_CARDS.map((style) => <button key={style.id} onClick={() => setForm({ ...form, style: style.id })} className={`relative aspect-[4/5] overflow-hidden rounded-xl border p-3 text-left ${form.style === style.id ? "border-primary ring-2 ring-primary/20" : "border-border"}`}><div className={`absolute inset-0 bg-gradient-to-br ${style.className}`} /><span className="relative text-sm font-bold text-white drop-shadow">{style.title}</span>{form.style === style.id && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-white">✓</span>}</button>)}</div></div>
            <div className="panel overflow-hidden"><div className="p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><ImagePlus className="h-5 w-5" /></div><div><h2 className="font-semibold">Prévia rápida</h2><p className="text-xs text-muted-foreground">Uma referência do estilo escolhido.</p></div></div></div><div className={`relative mx-5 mb-5 aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br ${STYLE_CARDS.find((item) => item.id === form.style)?.className ?? STYLE_CARDS[0].className}`}><div className="absolute inset-0 bg-black/15" /><div className="absolute inset-x-5 bottom-6"><div className="text-xs uppercase tracking-[.25em] text-white/75">Evento especial</div><div className="mt-2 text-3xl font-black uppercase leading-none text-white">{form.title || "Seu evento"}</div><div className="mt-3 text-sm text-white/80">{form.date || "Data"} · {form.time || "Horário"}</div></div></div></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium">{label}{required && <span className="ml-1 text-primary">*</span>}</span>{children}</label>;
}
