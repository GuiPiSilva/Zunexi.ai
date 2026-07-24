import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Palette,
  Plug,
  Save,
  Sparkles,
  Target,
  Upload,
  Users,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { generateImage, testNanoBananaConnection } from "@/lib/ai.functions";
import { generateInstagramContent, testGroqConnection, updateSlide, type CarrosselOut } from "@/lib/groq.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/carrossel")({
  head: () => ({ meta: [{ title: "Criar carrossel — InLabs.Ia Studios" }] }),
  component: NovoCarrossel,
});

function NovoCarrossel() {
  const nav = useNavigate();
  const generate = useServerFn(generateInstagramContent);
  const save = useServerFn(updateSlide);
  const test = useServerFn(testGroqConnection);
  const generateImageFn = useServerFn(generateImage);
  const testNanoBanana = useServerFn(testNanoBananaConnection);

  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [nanoTesting, setNanoTesting] = useState(false);
  const [nanoTestResult, setNanoTestResult] = useState<{ ok: boolean; message: string; model?: string; dataUrl?: string } | null>(null);
  const [result, setResult] = useState<CarrosselOut | null>(null);
  const [autoImages, setAutoImages] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState(0);

  const [form, setForm] = useState({
    tema: "",
    empresa: "",
    produto: "",
    objetivo: "educar",
    publicoAlvo: "",
    tom: "profissional",
    quantidadeSlides: 5,
    estilo: "moderno e tecnológico",
    paleta: "roxo, azul, ciano e branco",
    cta: "",
    informacoesAdicionais: "",
  });

  useEffect(() => {
    const key = getAccessKey();
    if (!key) {
      nav({ to: "/acesso", replace: true });
      return;
    }
    setAccessKey(key);
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !accessKey) return;
    if (form.tema.trim().length < 3) {
      toast.error("Descreva o tema do carrossel.");
      return;
    }

    setBusy(true);
    setResult(null);
    setAutoImages({});
    setProgress(5);

    const details = [
      form.empresa && `Marca: ${form.empresa}`,
      form.produto && `Produto ou serviço: ${form.produto}`,
      form.estilo && `Estilo visual: ${form.estilo}`,
      form.paleta && `Paleta: ${form.paleta}`,
      form.cta && `CTA: ${form.cta}`,
      form.informacoesAdicionais,
    ].filter(Boolean).join("\n");

    try {
      const output = await generate({ data: {
        tema: form.tema,
        objetivo: form.objetivo,
        publicoAlvo: form.publicoAlvo,
        tom: form.tom,
        quantidadeSlides: form.quantidadeSlides,
        informacoesAdicionais: details,
        accessKey,
      } });
      setResult(output);
      setProgress(25);
      toast.success("Roteiro criado. Gerando imagens...");

      for (let index = 0; index < output.slides.length; index += 1) {
        const slide = output.slides[index];
        try {
          const image = await generateImageFn({ data: {
            prompt: slide.promptImagem,
            seed: `${output.id}-${slide.numero}`,
            slideTitle: slide.titulo,
            slideBody: slide.texto,
            slideIndex: slide.numero,
            slideTotal: output.slides.length,
            slideKind: slide.tipo,
            brand: form.empresa,
            palette: form.paleta,
            style: `${form.estilo}; tom ${form.tom}`,
          } });
          setAutoImages((current) => ({ ...current, [slide.numero]: image.dataUrl }));
        } catch (error) {
          console.error(`Falha ao gerar imagem do slide ${slide.numero}`, error);
          toast.error(`Não foi possível gerar a imagem do slide ${slide.numero}.`);
        }
        setProgress(25 + Math.round(((index + 1) / output.slides.length) * 75));
      }

      toast.success("Carrossel completo.");
    } catch (error) {
      toast.error((error as Error).message || "Erro ao gerar o carrossel.");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await test();
      setTestResult({ ok: response.ok, message: response.message });
      response.ok ? toast.success("Groq conectado.") : toast.error(response.message);
    } catch (error) {
      const message = (error as Error).message || "Falha ao testar a conexão.";
      setTestResult({ ok: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function runNanoBananaTest() {
    if (nanoTesting) return;
    setNanoTesting(true);
    setNanoTestResult(null);
    try {
      const response = await testNanoBanana();
      setNanoTestResult(response);
      response.ok ? toast.success("Nano Banana conectado e funcionando.") : toast.error(response.message);
    } catch (error) {
      const message = (error as Error).message || "Falha ao testar o Nano Banana.";
      setNanoTestResult({ ok: false, message });
      toast.error(message);
    } finally {
      setNanoTesting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section>
          <div className="eyebrow mb-2 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Criação guiada por IA</div>
          <h1 className="section-title text-3xl sm:text-4xl">Criar carrossel</h1>
          <p className="mt-2 text-sm text-muted-foreground">Crie roteiro, textos e imagens em poucos passos com a IA da Groq (roteiro) e Kie.ai/Nano Banana (artes finais).</p>
        </section>

        <Stepper />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <form onSubmit={submit} className="panel p-5 sm:p-7">
            <div className="mb-6">
              <h2 className="section-title text-xl">Conte para a IA sobre o conteúdo</h2>
              <p className="mt-1 text-sm text-muted-foreground">Quanto mais detalhes você informar, mais alinhado será o resultado.</p>
            </div>

            <div className="space-y-5">
              <Field label="Tema do carrossel" required>
                <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} placeholder="Ex.: 5 dicas para vender todos os dias no Instagram" className="app-input" />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Nome da empresa ou marca"><input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Ex.: InLabs.Ia Studios" className="app-input" /></Field>
                <Field label="Produto ou serviço"><input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} placeholder="Ex.: Plataforma de criação de conteúdo" className="app-input" /></Field>
                <Field label="Público-alvo"><input value={form.publicoAlvo} onChange={(e) => setForm({ ...form, publicoAlvo: e.target.value })} placeholder="Empreendedores e social medias" className="app-input" /></Field>
                <Field label="Objetivo do carrossel"><select value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} className="app-input"><option value="vender">Vender</option><option value="educar">Educar</option><option value="engajar">Engajar</option><option value="informar">Informar</option><option value="captar clientes">Captar clientes</option></select></Field>
                <Field label="Tom de voz"><select value={form.tom} onChange={(e) => setForm({ ...form, tom: e.target.value })} className="app-input"><option>profissional</option><option>amigável e inspirador</option><option>persuasivo</option><option>educativo</option><option>direto</option><option>elegante</option><option>divertido</option></select></Field>
                <Field label="Quantidade de slides"><select value={form.quantidadeSlides} onChange={(e) => setForm({ ...form, quantidadeSlides: Number(e.target.value) })} className="app-input">{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} slides</option>)}</select></Field>
                <Field label="Estilo visual"><select value={form.estilo} onChange={(e) => setForm({ ...form, estilo: e.target.value })} className="app-input"><option>moderno e tecnológico</option><option>minimalista e premium</option><option>editorial</option><option>corporativo</option><option>vibrante</option><option>cinematográfico</option></select></Field>
                <Field label="Paleta de cores"><input value={form.paleta} onChange={(e) => setForm({ ...form, paleta: e.target.value })} className="app-input" /></Field>
              </div>

              <Field label="CTA — chamada para ação"><input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="Ex.: Experimente grátis a InLabs.Ia Studios" className="app-input" /></Field>
              <Field label="Informações adicionais"><textarea value={form.informacoesAdicionais} onChange={(e) => setForm({ ...form, informacoesAdicionais: e.target.value })} rows={4} maxLength={1000} placeholder="Inclua restrições, diferenciais e informações que não podem faltar." className="app-input resize-y" /></Field>
            </div>

            {busy && (
              <div className="mt-5 rounded-xl border border-primary/25 bg-primary/8 p-4">
                <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Criando seu conteúdo...</span><span>{progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full gradient-brand transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button disabled={busy} className="primary-button min-w-44 disabled:cursor-not-allowed disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{busy ? "Gerando..." : "Gerar roteiro"}</button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className="panel p-5">
              <div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Lightbulb className="h-5 w-5" /></div><div><h2 className="font-semibold">Dicas para um prompt melhor</h2><p className="text-xs text-muted-foreground">Melhore a qualidade da geração.</p></div></div>
              <Tip icon={Target} title="Seja específico" text="Defina claramente o assunto e o objetivo." />
              <Tip icon={Users} title="Conheça o público" text="Explique para quem o conteúdo será criado." />
              <Tip icon={Palette} title="Defina o visual" text="Indique paleta, estilo e personalidade da marca." />
            </div>

            <div className="panel p-5">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Conexão Groq</h2><p className="mt-1 text-xs text-muted-foreground">Teste a integração do servidor.</p></div><Plug className="h-5 w-5 text-primary" /></div>
              <button type="button" onClick={runTest} disabled={testing} className="secondary-button w-full disabled:opacity-60">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Testar conexão</button>
              {testResult && <div className={`mt-3 rounded-xl border p-3 text-xs ${testResult.ok ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200" : "border-red-500/25 bg-red-500/8 text-red-200"}`}><div className="flex items-start gap-2">{testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{testResult.message}</span></div></div>}
            </div>

            <div className="panel p-5">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Teste Nano Banana</h2><p className="mt-1 text-xs text-muted-foreground">Faz uma geração real pela Kie.ai para validar chave, créditos e modelo.</p></div><ImageIcon className="h-5 w-5 text-primary" /></div>
              <button type="button" onClick={runNanoBananaTest} disabled={nanoTesting} className="secondary-button w-full disabled:opacity-60">{nanoTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {nanoTesting ? "Testando..." : "Testar Nano Banana"}</button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Este teste consome uma geração/créditos da sua conta Kie.ai.</p>
              {nanoTestResult && <div className={`mt-3 rounded-xl border p-3 text-xs ${nanoTestResult.ok ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200" : "border-red-500/25 bg-red-500/8 text-red-200"}`}><div className="flex items-start gap-2">{nanoTestResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{nanoTestResult.message}</span></div>{nanoTestResult.model && <div className="mt-2 opacity-80">Modelo: {nanoTestResult.model}</div>}</div>}
              {nanoTestResult?.dataUrl && <img src={nanoTestResult.dataUrl} alt="Imagem do teste Nano Banana" className="mt-3 aspect-square w-full rounded-xl border border-border object-cover" />}
            </div>
          </aside>
        </div>

        {result && accessKey && <ResultView data={result} save={save} accessKey={accessKey} autoImages={autoImages} />}
      </div>
    </AppShell>
  );
}

function Stepper() {
  const items = [{ n: 1, title: "Informações", sub: "Conte sobre o conteúdo" }, { n: 2, title: "Roteiro", sub: "A IA cria a estrutura" }, { n: 3, title: "Imagens", sub: "Geração visual" }, { n: 4, title: "Editor", sub: "Personalize e finalize" }];
  return <div className="panel grid gap-3 p-4 sm:grid-cols-4 sm:p-5">{items.map((item, index) => <div key={item.n} className="flex items-center gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold ${index === 0 ? "border-primary bg-primary/20 text-white shadow-[0_0_25px_rgba(139,92,246,.35)]" : "border-border text-muted-foreground"}`}>{item.n}</div><div><div className={index === 0 ? "text-sm font-semibold" : "text-sm font-medium text-muted-foreground"}>{item.title}</div><div className="hidden text-[11px] text-muted-foreground lg:block">{item.sub}</div></div></div>)}</div>;
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium">{label}{required && <span className="ml-1 text-primary">*</span>}</span>{children}</label>;
}

function Tip({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <div className="flex gap-3 border-t border-border py-4 first:border-t-0"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</div></div></div>;
}

function ResultView({ data, save, accessKey, autoImages }: { data: CarrosselOut; save: ReturnType<typeof useServerFn<typeof updateSlide>>; accessKey: string; autoImages: Record<number, string> }) {
  return (
    <section className="space-y-5">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl"><div className="eyebrow mb-2">Conteúdo gerado</div><h2 className="section-title text-2xl">{data.titulo}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{data.legenda}</p><p className="mt-3 text-sm text-primary">{data.hashtags.map((tag) => `#${tag}`).join(" ")}</p></div>
          <div className="flex flex-wrap gap-2"><CopyButton text={data.legenda} label="Copiar legenda" /><CopyButton text={data.hashtags.map((tag) => `#${tag}`).join(" ")} label="Copiar hashtags" /></div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">{data.slides.map((slide) => <SlideCard key={slide.numero} generationId={data.id} slide={slide} save={save} accessKey={accessKey} autoImage={autoImages[slide.numero]} />)}</div>
    </section>
  );
}

function SlideCard({ generationId, slide, save, accessKey, autoImage }: { generationId: string; slide: CarrosselOut["slides"][number]; save: ReturnType<typeof useServerFn<typeof updateSlide>>; accessKey: string; autoImage?: string }) {
  const generateImageFn = useServerFn(generateImage);
  const [title, setTitle] = useState(slide.titulo);
  const [body, setBody] = useState(slide.texto);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const displayedImage = userImage ?? imageUrl ?? autoImage ?? null;

  async function persist() {
    setSaving(true);
    try { await save({ data: { generationId, slideNumero: slide.numero, titulo: title, texto: body, accessKey } }); toast.success(`Slide ${slide.numero} salvo.`); }
    catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function regenerateImage() {
    setImageBusy(true);
    try {
      const response = await generateImageFn({ data: {
        prompt: slide.promptImagem,
        seed: `${generationId}-${slide.numero}-${Date.now()}`,
        slideTitle: title,
        slideBody: body,
        slideIndex: slide.numero,
        slideKind: slide.tipo,
      } });
      setImageUrl(response.dataUrl);
      toast.success(`Imagem do slide ${slide.numero} atualizada.`);
    } catch (error) { toast.error((error as Error).message || "Falha ao gerar imagem."); }
    finally { setImageBusy(false); }
  }

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo de 8 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setUserImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <article className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="text-xs uppercase tracking-[0.15em] text-primary">Slide {String(slide.numero).padStart(2, "0")}</div><div className="mt-1 text-xs capitalize text-muted-foreground">{slide.tipo}</div></div><button onClick={persist} disabled={saving} className="secondary-button px-3 py-2 text-xs disabled:opacity-60">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</button></div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4 p-5"><Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} className="app-input" /></Field><Field label="Texto"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="app-input resize-y" /></Field><div className="rounded-xl border border-border bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Prompt visual: </span>{slide.promptImagem}</div></div>
        <div className="border-t border-border bg-[#080b15] p-4 sm:border-l sm:border-t-0">{displayedImage ? <img src={displayedImage} alt={`Slide ${slide.numero}`} className="aspect-square w-full rounded-xl object-cover" /> : <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground"><span><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Gerando imagem...</span></div>}<div className="mt-3 grid gap-2"><button type="button" onClick={regenerateImage} disabled={imageBusy} className="secondary-button w-full px-3 py-2 text-xs disabled:opacity-60">{imageBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Gerar nova</button><label className="secondary-button w-full cursor-pointer px-3 py-2 text-xs"><Upload className="h-3.5 w-3.5" /> Usar imagem<input type="file" accept="image/*" onChange={upload} className="hidden" /></label>{userImage && <button onClick={() => setUserImage(null)} className="secondary-button w-full px-3 py-2 text-xs"><X className="h-3.5 w-3.5" /> Remover upload</button>}{displayedImage && <a href={displayedImage} download={`slide-${slide.numero}.png`} className="primary-button w-full px-3 py-2 text-xs"><Download className="h-3.5 w-3.5" /> Baixar</a>}</div></div>
      </div>
    </article>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="secondary-button text-xs">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copiado" : label}</button>;
}
