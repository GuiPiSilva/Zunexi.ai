import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Palette,
  Plug,
  Sparkles,
  Target,
  Users,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { generateImage, testImageProvidersConnection } from "@/lib/ai.functions";
import { generateInstagramContent, testGroqConnection, updateSlide, type CarrosselOut } from "@/lib/groq.functions";
import { getAccessKey } from "@/lib/session";
import { getPrimaryBrandProfile, listBrandProfiles } from "@/lib/brand.functions";
import { newProject, upsertProject } from "@/lib/storage";
import { buildLayout, compositionForLayout, fontPairFromStyle, paletteFromDescription } from "@/lib/layouts";
import { explicitHumanVisualRequest, explicitInterfaceVisualRequest, resolveCampaignLayouts, reviewAndRepairElements } from "@/lib/creative-engine";
import { renderElementsThumbnail } from "@/lib/fabric-elements";
import {
  createCreationJob,
  getActiveCreationJob,
  getCreationJob,
  getPendingCreationJob,
  subscribeCreationJobs,
  updateCreationJob,
  withCreationJobLock,
  type CreationJob,
} from "@/lib/generation-jobs";
import { addNotification, requestNotificationPermission } from "@/lib/notifications";

export const Route = createFileRoute("/carrossel")({
  head: () => ({ meta: [{ title: "Criar carrossel — Zunexi.ai" }] }),
  component: NovoCarrossel,
});

type CarouselStep = 1 | 2 | 3 | 4;

type CarouselForm = {
  tema: string;
  empresa: string;
  produto: string;
  objetivo: string;
  publicoAlvo: string;
  tom: string;
  quantidadeSlides: number;
  estilo: string;
  paleta: string;
  cta: string;
  informacoesAdicionais: string;
  imageQuality: "fast" | "premium";
  imageProvider: "auto" | "colab" | "cloudflare" | "lovable";
  brandId: string;
};

const DEFAULT_FORM: CarouselForm = {
  tema: "",
  empresa: "",
  produto: "",
  objetivo: "educar",
  publicoAlvo: "",
  tom: "profissional",
  quantidadeSlides: 5,
  estilo: "publicidade premium",
  paleta: "roxo, azul, ciano e branco",
  cta: "",
  informacoesAdicionais: "",
  imageQuality: "premium",
  imageProvider: "auto",
  brandId: "",
};

function mergeAdditionalInformation(...values: Array<string | undefined | null>) {
  const unique = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join("\n\n");
  return unique.slice(0, 3000);
}

type CarouselJobPayload = {
  form: CarouselForm;
  details: string;
  accessKey: string;
};

function NovoCarrossel() {
  const nav = useNavigate();
  const generate = useServerFn(generateInstagramContent);
  const save = useServerFn(updateSlide);
  const test = useServerFn(testGroqConnection);
  const generateImageFn = useServerFn(generateImage);
  const testImageProviders = useServerFn(testImageProvidersConnection);
  const getPrimaryBrand = useServerFn(getPrimaryBrandProfile);
  const listBrands = useServerFn(listBrandProfiles);

  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [step, setStep] = useState<CarouselStep>(1);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [imageEngineTesting, setImageEngineTesting] = useState(false);
  const [imageEngineTestResult, setImageEngineTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [result, setResult] = useState<CarrosselOut | null>(null);
  const [autoImages, setAutoImages] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState(0);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [form, setForm] = useState<CarouselForm>(DEFAULT_FORM);
  const [brands, setBrands] = useState<Array<any>>([]);
  const cancelledJobsRef = useRef<Set<string>>(new Set());
  const activeUiJobIdRef = useRef<string | null>(null);

  function setActiveJob(jobId: string | null) {
    activeUiJobIdRef.current = jobId;
    setCurrentJobId(jobId);
  }

  function wasCancelled(jobId: string) {
    return cancelledJobsRef.current.has(jobId);
  }

  useEffect(() => {
    const key = getAccessKey();
    if (!key) {
      nav({ to: "/acesso", replace: true });
      return;
    }
    setAccessKey(key);

    const transferredData = sessionStorage.getItem("inlabs_carousel_prompt_data");
    const legacyPrompt = sessionStorage.getItem("inlabs_carousel_prompt");
    if (transferredData || legacyPrompt) {
      try {
        const data = (transferredData ? JSON.parse(transferredData) : { tema: legacyPrompt || "" }) as Partial<CarouselForm> & { prompt?: string };
        setForm((current) => ({
          ...current,
          tema: data.tema || data.prompt || current.tema,
          empresa: data.empresa || current.empresa,
          produto: data.produto || current.produto,
          objetivo: data.objetivo || current.objetivo,
          publicoAlvo: data.publicoAlvo || current.publicoAlvo,
          tom: data.tom || current.tom,
          quantidadeSlides: Number(data.quantidadeSlides) || current.quantidadeSlides,
          estilo: data.estilo || current.estilo,
          paleta: data.paleta || current.paleta,
          cta: data.cta || current.cta,
          informacoesAdicionais: mergeAdditionalInformation(
            data.informacoesAdicionais,
            data.prompt && data.prompt !== data.tema ? `Briefing criado pela Zunexi:\n${data.prompt}` : "",
            current.informacoesAdicionais,
          ),
          brandId: (data as any).brandId || current.brandId,
        }));
        toast.success("Prompt e campos enviados para o criador de carrossel.");
      } catch {
        setForm((current) => ({ ...current, tema: legacyPrompt || "" }));
      }
      sessionStorage.removeItem("inlabs_carousel_prompt_data");
      sessionStorage.removeItem("inlabs_carousel_prompt");
    }
  }, [nav]);


  function applyBrand(brand: any) {
    if (!brand) return;
    setForm((current) => ({
      ...current,
      brandId: brand.id,
      empresa: brand.name || current.empresa,
      publicoAlvo: brand.audience || current.publicoAlvo,
      tom: brand.tone_of_voice || current.tom,
      estilo: [brand.visual_style || current.estilo, Array.isArray(brand.typography) && brand.typography.length ? `Tipografia obrigatória: ${brand.typography.join(", ")}` : ""].filter(Boolean).join("; "),
      paleta: `${brand.primary_color}, ${brand.secondary_color}, ${brand.accent_color}`,
      // O servidor aplica o Brand Kit completo usando brandId. Não duplique o manual no briefing.
      informacoesAdicionais: mergeAdditionalInformation(current.informacoesAdicionais),
    }));
  }

  useEffect(() => {
    if (!accessKey) return;
    listBrands({ data: { accessKey } }).then((result) => {
      const next = result.brands as any[];
      setBrands(next);
      const selected = next.find((brand) => brand.id === form.brandId) || next.find((brand) => brand.is_primary) || next[0];
      if (selected) applyBrand(selected);
    }).catch(() => {
      getPrimaryBrand({ data: { accessKey, brandId: form.brandId || null } }).then(applyBrand).catch(() => undefined);
    });
  }, [accessKey]);

  useEffect(() => {
    if (!accessKey) return;

    function syncFromJob() {
      const latest = getPendingCreationJob("carrossel");
      if (!latest) return;

      setActiveJob(latest.id);
      setProgress(latest.progress);
      if (latest.result) setResult(latest.result as CarrosselOut);
      if (latest.projectId) setSavedProjectId(latest.projectId);
      const images = Object.fromEntries(Object.entries(latest.assets).map(([number, asset]) => [Number(number), asset.url]));
      setAutoImages(images);
      const savedForm = latest.payload.form as Partial<CarouselForm> | undefined;
      if (savedForm) setForm((current) => ({ ...current, ...savedForm }));

      if (latest.status === "review") {
        setStep(2);
        setBusy(false);
      } else if (latest.result) {
        setStep(3);
        setBusy(latest.status === "queued" || latest.status === "running");
      } else {
        setStep(2);
        setBusy(latest.status === "queued" || latest.status === "running");
      }
    }

    syncFromJob();
    const unsubscribe = subscribeCreationJobs(syncFromJob);
    const pending = getPendingCreationJob("carrossel");
    if (pending?.status === "review") {
      setStep(2);
    } else if (pending?.result && (pending?.status === "queued" || pending?.status === "running")) {
      void executeImageJob(pending);
    } else if (pending && (pending.status === "queued" || pending.status === "running")) {
      void executeScriptJob(pending);
    }
    return unsubscribe;
    // The executors always reload the persisted job before continuing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey]);

  async function executeScriptJob(initialJob: CreationJob) {
    const started = await withCreationJobLock(initialJob.id, async () => {
      let job = getCreationJob(initialJob.id, initialJob.ownerScope) || initialJob;
      const payload = job.payload as CarouselJobPayload;

      setActiveJob(job.id);
      setStep(2);
      setBusy(true);
      setProgress(Math.max(10, job.progress));
      updateCreationJob(job.id, { status: "running", error: undefined, progress: Math.max(10, job.progress) }, job.ownerScope);

      try {
        let output = job.result as CarrosselOut | undefined;
        if (!output) {
          output = await generate({ data: {
            jobId: job.id,
            tema: payload.form.tema,
            objetivo: payload.form.objetivo,
            publicoAlvo: payload.form.publicoAlvo,
            tom: payload.form.tom,
            quantidadeSlides: payload.form.quantidadeSlides,
            informacoesAdicionais: payload.details,
            brandId: payload.form.brandId || null,
            accessKey: payload.accessKey,
          } });
          window.dispatchEvent(new CustomEvent("inlabs:credits-changed"));
        }

        if (wasCancelled(job.id)) return;

        job = updateCreationJob(job.id, {
          result: output,
          status: "review",
          progress: 25,
          error: undefined,
        }, job.ownerScope) || job;
        setResult(output);
        setProgress(25);
        setStep(2);
        toast.success("Roteiro pronto. Revise os slides antes de criar as imagens.");
      } catch (error) {
        if (wasCancelled(job.id)) return;
        window.dispatchEvent(new CustomEvent("inlabs:credits-changed"));
        const message = (error as Error).message || "Erro ao gerar o roteiro.";
        updateCreationJob(job.id, { status: "failed", error: message }, job.ownerScope);
        setStep(1);
        toast.error(message);
      } finally {
        if (activeUiJobIdRef.current === job.id) setBusy(false);
      }
    });

    if (!started && activeUiJobIdRef.current === initialJob.id) {
      const current = getCreationJob(initialJob.id, initialJob.ownerScope);
      setBusy(current?.status === "queued" || current?.status === "running");
    }
  }

  async function executeImageJob(initialJob: CreationJob) {
    const started = await withCreationJobLock(initialJob.id, async () => {
      let job = getCreationJob(initialJob.id, initialJob.ownerScope) || initialJob;
      const payload = job.payload as CarouselJobPayload;
      const output = job.result as CarrosselOut | undefined;
      if (!output) {
        updateCreationJob(job.id, { status: "queued", progress: 10 }, job.ownerScope);
        setBusy(false);
        setStep(2);
        toast.error("O roteiro ainda não está pronto para gerar imagens.");
        return;
      }

      const resolvedLayouts = resolveCampaignLayouts(output.slides);
      const allowPeople = output.slides.some((slide) => slide.allowPeople === true) ||
        explicitHumanVisualRequest(payload.form.tema, payload.form.produto, payload.details);
      const allowInterfaces = explicitInterfaceVisualRequest(payload.form.tema, payload.form.produto, payload.details);

      setActiveJob(job.id);
      setResult(output);
      setStep(3);
      setBusy(true);
      setProgress(Math.max(25, job.progress));
      updateCreationJob(job.id, { status: "running", error: undefined, result: output }, job.ownerScope);

      try {
        const persistedAssets = { ...job.assets };
        const projectAssets: Record<number, { dataUrl?: string; url?: string }> = {};
        for (const [number, asset] of Object.entries(persistedAssets)) {
          projectAssets[Number(number)] = { url: asset.url };
        }

        for (let index = 0; index < output.slides.length; index += 1) {
          if (wasCancelled(job.id)) return;
          const slide = output.slides[index];
          const existing = persistedAssets[String(slide.numero)];
          if (!existing) {
            let image: Awaited<ReturnType<typeof generateImageFn>> | undefined;
            let lastImageError: unknown;

            for (let attempt = 1; attempt <= 2; attempt += 1) {
              try {
                image = await generateImageFn({ data: {
                  accessKey: payload.accessKey,
                  prompt: slide.promptImagem,
                  seed: `${output.id}-${slide.numero}`,
                  // Estes campos classificam o domínio e o sentido visual no
                  // servidor; a copy não é concatenada ao prompt final.
                  slideTitle: slide.titulo,
                  slideBody: slide.texto,
                  slideIndex: slide.numero,
                  slideTotal: output.slides.length,
                  slideKind: `${slide.tipo}. Conceito: ${slide.visualConcept || "direção específica do slide"}. ${compositionForLayout(resolvedLayouts[index])}`,
                  brand: payload.form.empresa,
                  palette: payload.form.paleta,
                  style: `${payload.form.estilo}; tom ${payload.form.tom}; assinatura visual ${output.creativePlan?.visualSignature || "campanha editorial coerente"}`,
                  imageQuality: payload.form.imageQuality || "premium",
                  imageProvider: payload.form.imageProvider || "auto",
                  allowPeople,
                  allowInterfaces,
                } });
                if (wasCancelled(job.id)) return;
                break;
              } catch (error) {
                lastImageError = error;
                console.error(`Tentativa ${attempt} falhou no slide ${slide.numero}`, error);
                if (wasCancelled(job.id)) return;
                if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
              }
            }

            if (!image) {
              const reason = lastImageError instanceof Error ? lastImageError.message : "erro desconhecido";
              throw new Error(`Não foi possível gerar a imagem do slide ${slide.numero}: ${reason}`);
            }

            persistedAssets[String(slide.numero)] = { url: image.url };
            projectAssets[slide.numero] = { url: image.url };
            setAutoImages((current) => ({ ...current, [slide.numero]: image.url }));
          } else {
            projectAssets[slide.numero] = { url: existing.url };
          }

          const nextProgress = 25 + Math.round(((index + 1) / output.slides.length) * 70);
          job = updateCreationJob(job.id, { assets: persistedAssets, progress: nextProgress }, job.ownerScope) || job;
          setProgress(nextProgress);
        }

        if (wasCancelled(job.id)) return;

        let projectId = job.projectId;
        let finalPreviews: Record<number, string> | undefined;
        if (!projectId) {
          const savedProject = await saveCarouselProject({
            output,
            assets: projectAssets,
            name: output.titulo || payload.form.tema,
            caption: `${output.legenda}\n\n${output.hashtags.map((tag) => `#${tag}`).join(" ")}`.trim(),
            style: payload.form.estilo,
            palette: payload.form.paleta,
            brand: payload.form.empresa,
            ownerScope: job.ownerScope,
            isCancelled: () => wasCancelled(job.id),
          });
          if (wasCancelled(job.id)) return;
          projectId = savedProject.projectId;
          finalPreviews = savedProject.previews;
        }

        if (!projectId) throw new Error("Não foi possível salvar o projeto.");
        updateCreationJob(job.id, {
          status: "completed",
          progress: 100,
          projectId,
          assets: persistedAssets,
          result: output,
        }, job.ownerScope);
        setSavedProjectId(projectId);
        if (finalPreviews) setAutoImages(finalPreviews);
        setProgress(100);
        setStep(4);
        addNotification({
          title: "Carrossel concluído",
          message: `“${output.titulo || payload.form.tema}” está pronto para visualizar e baixar.`,
          href: `/editor/${projectId}`,
          kind: "success",
        }, job.ownerScope);
        toast.success("Imagens prontas com texto. Seu carrossel já pode ser visualizado e baixado.");
      } catch (error) {
        if (wasCancelled(job.id)) return;
        window.dispatchEvent(new CustomEvent("inlabs:credits-changed"));
        const message = (error as Error).message || "Erro ao gerar as imagens do carrossel.";
        updateCreationJob(job.id, { status: "failed", error: message }, job.ownerScope);
        addNotification({ title: "Falha na criação", message, href: "/carrossel", kind: "error" }, job.ownerScope);
        toast.error(message);
      } finally {
        if (activeUiJobIdRef.current === job.id) setBusy(false);
      }
    });

    if (!started && activeUiJobIdRef.current === initialJob.id) {
      const active = getCreationJob(initialJob.id, initialJob.ownerScope);
      setBusy(active?.status === "queued" || active?.status === "running");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !accessKey) return;
    if (form.tema.trim().length < 3) {
      toast.error("Descreva o tema do carrossel.");
      return;
    }

    const active = getActiveCreationJob("carrossel");
    if (active) {
      toast.info("Já existe uma criação em andamento. O progresso foi retomado.");
      if (active.result) void executeImageJob(active);
      else void executeScriptJob(active);
      return;
    }

    if (currentJobId) {
      const oldJob = getCreationJob(currentJobId);
      if (oldJob?.status === "review") {
        updateCreationJob(oldJob.id, { status: "failed", error: "Roteiro substituído por uma nova criação." }, oldJob.ownerScope);
      }
    }

    void requestNotificationPermission();
    setBusy(true);
    setStep(2);
    setResult(null);
    setAutoImages({});
    setSavedProjectId(null);
    setProgress(5);

    const details = mergeAdditionalInformation(
      form.empresa && `Marca: ${form.empresa}`,
      form.produto && `Produto ou serviço: ${form.produto}`,
      form.estilo && `Estilo visual: ${form.estilo}`,
      form.paleta && `Paleta: ${form.paleta}`,
      form.cta && `CTA: ${form.cta}`,
      form.informacoesAdicionais,
    );

    try {
      const job = createCreationJob("carrossel", {
        form: { ...form },
        details,
        accessKey,
      });
      setActiveJob(job.id);
      await executeScriptJob(job);
    } catch (error) {
      const message = (error as Error).message || "Erro ao preparar o carrossel.";
      setBusy(false);
      setStep(1);
      toast.error(message);
    }
  }

  function updateGeneratedSlide(index: number, field: "titulo" | "texto", value: string) {
    if (!result) return;
    const slides = result.slides.map((slide, slideIndex) => slideIndex === index ? { ...slide, [field]: value } : slide);
    const next = { ...result, slides };
    setResult(next);
    if (currentJobId) {
      const job = getCreationJob(currentJobId);
      if (job?.status === "review") updateCreationJob(job.id, { result: next }, job.ownerScope);
    }
  }

  async function startImageGeneration() {
    if (busy || !accessKey || !result || !currentJobId) return;
    const current = getCreationJob(currentJobId);
    if (!current) {
      toast.error("Não foi possível localizar esta criação. Gere o roteiro novamente.");
      setStep(1);
      return;
    }

    setBusy(true);
    try {
      for (const slide of result.slides) {
        if (wasCancelled(current.id)) return;
        await save({ data: {
          generationId: result.id,
          slideNumero: slide.numero,
          titulo: slide.titulo,
          texto: slide.texto,
          accessKey,
        } });
        if (wasCancelled(current.id)) return;
      }
      if (wasCancelled(current.id)) return;
      const updated = updateCreationJob(current.id, {
        result,
        status: "running",
        progress: 25,
        error: undefined,
      }, current.ownerScope) || current;
      setStep(3);
      setProgress(25);
      await executeImageJob(updated);
    } catch (error) {
      if (wasCancelled(current.id)) return;
      setBusy(false);
      toast.error((error as Error).message || "Não foi possível salvar o roteiro antes de gerar as imagens.");
    }
  }

  function cancelCreation() {
    const jobId = activeUiJobIdRef.current || currentJobId;
    if (jobId) {
      cancelledJobsRef.current.add(jobId);
      const job = getCreationJob(jobId);
      if (job && (job.status === "queued" || job.status === "running" || job.status === "review")) {
        updateCreationJob(job.id, {
          status: "failed",
          error: "Criação cancelada pelo usuário.",
        }, job.ownerScope);
      }
    }

    setActiveJob(null);
    setBusy(false);
    setStep(1);
    setResult(null);
    setAutoImages({});
    setProgress(0);
    setSavedProjectId(null);
    toast.success("Criação cancelada. Você já pode criar outro carrossel.");
  }

  function resetFlow() {
    if (currentJobId) {
      const job = getCreationJob(currentJobId);
      if (job?.status === "review") {
        updateCreationJob(job.id, { status: "failed", error: "Criação encerrada pelo usuário." }, job.ownerScope);
      }
    }
    setStep(1);
    setActiveJob(null);
    setBusy(false);
    setResult(null);
    setAutoImages({});
    setProgress(0);
    setSavedProjectId(null);
    setForm(DEFAULT_FORM);
  }

  function goToStep(target: CarouselStep) {
    if (busy && target !== step) return;
    if (target === 1) {
      setStep(1);
      return;
    }
    if (target === 2 && result) {
      setStep(2);
      return;
    }
    if (target === 3 && result) {
      setStep(3);
      return;
    }
    if (target === 4 && savedProjectId) setStep(4);
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

  async function runImageEngineTest() {
    if (imageEngineTesting) return;
    setImageEngineTesting(true);
    setImageEngineTestResult(null);
    try {
      const response = await testImageProviders({ data: { imageQuality: form.imageQuality, imageProvider: form.imageProvider } });
      setImageEngineTestResult(response);
      response.ok ? toast.success("Motor multi-API conectado.") : toast.error(response.message);
    } catch (error) {
      const message = (error as Error).message || "Falha ao testar os provedores de imagem.";
      setImageEngineTestResult({ ok: false, message });
      toast.error(message);
    } finally {
      setImageEngineTesting(false);
    }
  }

  const unlockedStep: CarouselStep = savedProjectId ? 4 : result ? 3 : step === 2 ? 2 : 1;

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section>
          <h1 className="section-title text-3xl sm:text-4xl">Criar carrossel</h1>
          <p className="mt-2 text-sm text-muted-foreground">Crie o roteiro, revise o conteúdo e gere artes finais com o texto já aplicado.</p>
        </section>

        <Stepper step={step} unlockedStep={unlockedStep} busy={busy} onChange={goToStep} />

        {step === 1 && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
            <form onSubmit={submit} className="panel p-5 sm:p-7">
              <div className="mb-6">
                <h2 className="section-title text-xl">Conte para a IA sobre o conteúdo</h2>
                <p className="mt-1 text-sm text-muted-foreground">Quanto mais detalhes você informar, mais alinhado será o resultado.</p>
              </div>

              <div className="space-y-5">
                {brands.length > 0 && <Field label="Marca desta criação"><select value={form.brandId} onChange={(event) => { const brand = brands.find((item) => item.id === event.target.value); if (brand) applyBrand(brand); }} className="app-input">{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select><div className="mt-2 text-[11px] text-muted-foreground">O manual, as cores, a tipografia, o tom e as restrições da marca serão aplicados automaticamente.</div></Field>}
                <Field label="Tema do carrossel" required>
                  <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} placeholder="Ex.: 5 dicas para vender todos os dias no Instagram" className="app-input" />
                </Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Nome da empresa ou marca"><input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Ex.: Zunexi.ai" className="app-input" /></Field>
                  <Field label="Produto ou serviço"><input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} placeholder="Ex.: Plataforma de criação de conteúdo" className="app-input" /></Field>
                  <Field label="Público-alvo"><input value={form.publicoAlvo} onChange={(e) => setForm({ ...form, publicoAlvo: e.target.value })} placeholder="Empreendedores e social medias" className="app-input" /></Field>
                  <Field label="Objetivo do carrossel"><select value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} className="app-input"><option value="vender">Vender</option><option value="educar">Educar</option><option value="engajar">Engajar</option><option value="informar">Informar</option><option value="captar clientes">Captar clientes</option></select></Field>
                  <Field label="Tom de voz"><select value={form.tom} onChange={(e) => setForm({ ...form, tom: e.target.value })} className="app-input"><option>profissional</option><option>amigável e inspirador</option><option>persuasivo</option><option>educativo</option><option>direto</option><option>elegante</option><option>divertido</option></select></Field>
                  <Field label="Quantidade de slides"><select value={form.quantidadeSlides} onChange={(e) => setForm({ ...form, quantidadeSlides: Number(e.target.value) })} className="app-input">{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} slides</option>)}</select></Field>
                  <Field label="Estilo visual"><select value={form.estilo} onChange={(e) => setForm({ ...form, estilo: e.target.value })} className="app-input"><option>publicidade premium</option><option>food commercial</option><option>cinematográfico</option><option>luxury campaign</option><option>editorial</option><option>minimalista e premium</option><option>tech campaign</option><option>3D publicitário</option><option>corporativo</option><option>vibrante</option></select></Field>
                  <Field label="Paleta de cores"><input value={form.paleta} onChange={(e) => setForm({ ...form, paleta: e.target.value })} className="app-input" /></Field>
                  <Field label="Motor de imagem"><select value={form.imageProvider} onChange={(e) => setForm({ ...form, imageProvider: e.target.value as CarouselForm["imageProvider"] })} className="app-input"><option value="auto">Automático — usa os motores configurados</option><option value="lovable">Lovable — GPT Image 2</option><option value="colab">Colab — usar somente este motor</option><option value="cloudflare">Cloudflare V2 — prompt otimizado</option></select></Field>
                  <Field label="Qualidade da imagem"><select value={form.imageQuality} onChange={(e) => setForm({ ...form, imageQuality: e.target.value as CarouselForm["imageQuality"] })} className="app-input"><option value="premium">Premium (recomendado)</option><option value="fast">Rápida</option></select></Field>
                </div>

                <Field label="CTA — chamada para ação"><input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="Ex.: Experimente grátis a Zunexi.ai" className="app-input" /></Field>
                <Field label="Informações adicionais"><textarea value={form.informacoesAdicionais} onChange={(e) => setForm({ ...form, informacoesAdicionais: e.target.value })} rows={4} maxLength={3000} placeholder="Inclua restrições, diferenciais e informações que não podem faltar." className="app-input resize-y" /></Field>

                <Field label="Imagem de referência">
                  <div className="rounded-xl border border-border bg-white/[0.02] p-4">
                    <div className="text-sm font-medium">Temporariamente desativada</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      No modo Automático, a geração percorre os motores configurados conforme IMAGE_PROVIDER_ORDER. Para comparar a qualidade do Lovable GPT Image 2 com Colab/Cloudflare, escolha um motor específico acima. O upload de referência continua separado da geração principal por enquanto.
                    </p>
                  </div>
                </Field>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button disabled={busy} className="primary-button min-w-44 disabled:cursor-not-allowed disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{busy ? "Preparando..." : "Criar roteiro"}</button>
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
                <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Teste dos motores de imagem</h2><p className="mt-1 text-xs text-muted-foreground">Valida Colab e Cloudflare sem gerar imagem.</p></div><ImageIcon className="h-5 w-5 text-primary" /></div>
                <button type="button" onClick={runImageEngineTest} disabled={imageEngineTesting} className="secondary-button w-full disabled:opacity-60">{imageEngineTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {imageEngineTesting ? "Testando..." : "Testar APIs de imagem"}</button>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">A ordem padrão é Colab → Cloudflare. Se o Colab estiver offline, expirar ou falhar, o servidor tenta a Cloudflare automaticamente.</p>
                {imageEngineTestResult && <div className={`mt-3 rounded-xl border p-3 text-xs ${imageEngineTestResult.ok ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200" : "border-red-500/25 bg-red-500/8 text-red-200"}`}><div className="flex items-start gap-2">{imageEngineTestResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{imageEngineTestResult.message}</span></div></div>}
              </div>
            </aside>
          </div>
        )}

        {step === 2 && (
          <ScriptStage
            data={result}
            busy={busy}
            progress={progress}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
            onSlideChange={updateGeneratedSlide}
            onCancel={cancelCreation}
          />
        )}

        {step === 3 && (
          <ImagesStage
            data={result}
            images={autoImages}
            busy={busy}
            progress={progress}
            onBack={() => setStep(2)}
            onGenerate={startImageGeneration}
            onCancel={cancelCreation}
          />
        )}

        {step === 4 && (
          <FinalStage
            data={result}
            images={autoImages}
            projectId={savedProjectId}
            onNew={resetFlow}
          />
        )}
      </div>
    </AppShell>
  );
}

async function saveCarouselProject({
  output,
  assets,
  name,
  caption,
  style,
  palette,
  brand,
  ownerScope,
  isCancelled,
}: {
  output: CarrosselOut;
  assets: Record<number, { dataUrl?: string; url?: string }>;
  name: string;
  caption: string;
  style: string;
  palette: string;
  brand?: string;
  ownerScope?: string;
  isCancelled?: () => boolean;
}): Promise<{ projectId: string; previews: Record<number, string> }> {
  const project = newProject("carrossel", name.trim() || "Novo carrossel", {
    theme: caption,
    style,
    ratio: "1080x1080",
    creativePlan: output.creativePlan,
  });

  const resolvedPalette = paletteFromDescription(palette);
  const fonts = fontPairFromStyle(`${style}\n${output.titulo}\n${output.slides.map((slide) => `${slide.titulo} ${slide.texto}`).join("\n")}`);

  const previews: Record<number, string> = {};
  const resolvedLayouts = resolveCampaignLayouts(output.slides);
  const reviews: Array<{ slide: number; score: number; warnings: string[] }> = [];

  project.slides = await Promise.all(output.slides.map(async (slide, index) => {
    const asset = assets[slide.numero];
    const storedImage = asset?.url || (asset?.dataUrl ? await resizeImageDataUrl(asset.dataUrl, 1080, 0.9) : undefined);

    const rawElements = buildLayout(resolvedLayouts[index], {
      title: slide.titulo,
      body: slide.texto,
      cta: slide.cta,
      imageUrl: storedImage,
      palette: resolvedPalette,
      width: 1080,
      height: 1080,
      fonts,
      slideNumber: slide.numero,
      slideTotal: output.slides.length,
      brandName: brand,
      theme: `${output.titulo}\n${output.legenda}`,
      styleHint: style,
    });

    if (brand?.trim() && !rawElements.some((element) => element.role === "brand")) {
      rawElements.push({
        kind: "text",
        x: 64,
        y: 1018,
        w: 952,
        text: brand.trim(),
        size: 22,
        color: resolvedPalette[3],
        align: "left",
        weight: 600,
        font: fonts.body,
        lineHeight: 1,
        name: "Marca",
        role: "brand",
      });
    }

    const reviewed = reviewAndRepairElements(rawElements, 1080, 1080);
    const elements = reviewed.elements;
    reviews.push({ slide: slide.numero, score: reviewed.review.score, warnings: reviewed.review.warnings });

    // Renderize em sequência. Além de reduzir o pico de memória, isso evita
    // que duas exportações do Fabric disputem o carregamento da mesma imagem.
    const thumb = await renderElementsThumbnail({
      elements,
      background: resolvedPalette[0],
      width: 1080,
      height: 1080,
      maxDimension: 420,
    });
    const preview = await renderElementsThumbnail({
      elements,
      background: resolvedPalette[0],
      width: 1080,
      height: 1080,
      maxDimension: 900,
      format: "jpeg",
      quality: 0.9,
    });
    if (preview) previews[slide.numero] = preview;

    return {
      id: crypto.randomUUID(),
      width: 1080,
      height: 1080,
      thumb,
      canvas: {
        elements,
        background: resolvedPalette[0],
        fonts,
        layout: resolvedLayouts[index],
        review: reviewed.review,
        creative: {
          visualConcept: slide.visualConcept,
          textZone: slide.textZone,
          subjectZone: slide.subjectZone,
          aiReviewScore: slide.reviewScore,
        },
      },
    };
  }));

  if (isCancelled?.()) throw new Error("Criação cancelada pelo usuário.");
  project.meta = {
    ...project.meta,
    reviewSummary: {
      averageScore: reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.score, 0) / reviews.length) : 100,
      slides: reviews,
    },
  };
  upsertProject(project, ownerScope);
  return { projectId: project.id, previews };
}

function resizeImageDataUrl(dataUrl: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        reject(new Error("Imagem gerada sem dimensões válidas."));
        return;
      }

      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("O navegador não suporta redimensionamento de imagem."));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("Não foi possível preparar a imagem para o projeto."));
    image.src = dataUrl;
  });
}

function Stepper({
  step,
  unlockedStep,
  busy,
  onChange,
}: {
  step: CarouselStep;
  unlockedStep: CarouselStep;
  busy: boolean;
  onChange: (step: CarouselStep) => void;
}) {
  const items: { n: CarouselStep; title: string; sub: string }[] = [
    { n: 1, title: "Informações", sub: "Conte sobre o conteúdo" },
    { n: 2, title: "Roteiro", sub: "Revise a estrutura" },
    { n: 3, title: "Imagens", sub: "Geração visual" },
    { n: 4, title: "Final", sub: "Visualize e baixe" },
  ];

  return (
    <div className="panel grid gap-3 p-4 sm:grid-cols-4 sm:p-5">
      {items.map((item) => {
        const active = item.n === step;
        const completed = item.n < unlockedStep && !active;
        const locked = item.n > unlockedStep;
        const disabled = locked || (busy && !active);

        return (
          <button
            key={item.n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.n)}
            className={`flex items-center gap-3 rounded-xl p-1 text-left transition ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.03]"}`}
          >
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition ${active ? "border-primary bg-primary/20 text-white shadow-[0_0_25px_rgba(139,92,246,.35)]" : completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border text-muted-foreground"}`}>
              {completed ? <Check className="h-4 w-4" /> : item.n}
            </div>
            <div>
              <div className={active ? "text-sm font-semibold text-white" : completed ? "text-sm font-medium text-foreground" : "text-sm font-medium text-muted-foreground"}>{item.title}</div>
              <div className="hidden text-[11px] text-muted-foreground lg:block">{item.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium">{label}{required && <span className="ml-1 text-primary">*</span>}</span>{children}</label>;
}

function Tip({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <div className="flex gap-3 border-t border-border py-4 first:border-t-0"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</div></div></div>;
}

function ScriptStage({
  data,
  busy,
  progress,
  onBack,
  onContinue,
  onSlideChange,
  onCancel,
}: {
  data: CarrosselOut | null;
  busy: boolean;
  progress: number;
  onBack: () => void;
  onContinue: () => void;
  onSlideChange: (index: number, field: "titulo" | "texto", value: string) => void;
  onCancel: () => void;
}) {
  if (busy || !data) {
    return (
      <div className="panel mx-auto max-w-3xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><Loader2 className="h-5 w-5 animate-spin" /></div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-2">Etapa 2 de 4</div>
            <h2 className="section-title text-2xl">Criando o roteiro</h2>
            <p className="mt-2 text-sm text-muted-foreground">A Groq está estruturando os títulos, textos, legenda e direção visual de cada slide.</p>
            <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span>Gerando estrutura...</span><span>{Math.max(10, progress)}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full gradient-brand transition-all duration-500" style={{ width: `${Math.max(10, progress)}%` }} /></div>
            <button type="button" onClick={onCancel} className="secondary-button mt-5 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"><XCircle className="h-4 w-4" /> Cancelar criação</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow mb-2">Etapa 2 de 4 · roteiro</div>
            <h2 className="section-title text-2xl">Revise antes de gerar as imagens</h2>
            <p className="mt-2 text-sm text-muted-foreground">Você pode corrigir títulos e textos. As imagens serão criadas usando esta versão revisada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={data.legenda} label="Copiar legenda" />
            <CopyButton text={data.hashtags.map((tag) => `#${tag}`).join(" ")} label="Copiar hashtags" />
          </div>
        </div>

        {data.creativePlan && (
          <div className="mt-5 grid gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4 md:grid-cols-3">
            <div><div className="text-[10px] uppercase tracking-[.14em] text-primary">Ideia central</div><div className="mt-1 text-sm font-medium">{data.creativePlan.centralIdea}</div></div>
            <div><div className="text-[10px] uppercase tracking-[.14em] text-primary">Assinatura visual</div><div className="mt-1 text-sm text-muted-foreground">{data.creativePlan.visualSignature}</div></div>
            <div><div className="text-[10px] uppercase tracking-[.14em] text-primary">Política visual</div><div className="mt-1 text-sm text-muted-foreground">{data.creativePlan.peoplePolicy === "disabled" ? "Sem pessoas por padrão" : "Pessoas solicitadas no briefing"}</div></div>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-white/[0.02] p-4">
          <div className="text-sm font-semibold">{data.titulo}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{data.legenda}</p>
          <p className="mt-3 text-xs text-primary">{data.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {data.slides.map((slide, index) => (
          <article key={slide.numero} className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-primary">Slide {String(slide.numero).padStart(2, "0")}</div>
                <div className="mt-1 text-xs capitalize text-muted-foreground">{slide.tipo}</div>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[.12em] text-muted-foreground">Revisável</span>
            </div>
            <div className="space-y-4 p-5">
              <Field label="Título"><input value={slide.titulo} maxLength={300} onChange={(event) => onSlideChange(index, "titulo", event.target.value)} className="app-input" /></Field>
              <Field label="Texto"><textarea value={slide.texto} maxLength={2000} onChange={(event) => onSlideChange(index, "texto", event.target.value)} rows={5} className="app-input resize-y" /></Field>
              <div className="rounded-xl border border-border bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
                <div><span className="font-semibold text-foreground">Conceito: </span>{slide.visualConcept || "Direção criada para este slide"}</div>
                <div className="mt-2"><span className="font-semibold text-foreground">Layout: </span>{slide.layout || "seleção automática"} · texto {slide.textZone || "zona segura"} · assunto {slide.subjectZone || "zona oposta"}</div>
                <div className="mt-2"><span className="font-semibold text-foreground">Prompt visual: </span>{slide.promptImagem}</div>
                {typeof slide.reviewScore === "number" && <div className="mt-2 text-primary">Revisão da IA: {slide.reviewScore}/100</div>}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className="secondary-button"><ArrowLeft className="h-4 w-4" /> Voltar às informações</button>
        <button type="button" onClick={onContinue} className="primary-button"><ImageIcon className="h-4 w-4" /> Continuar para imagens <ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
  );
}

function ImagesStage({
  data,
  images,
  busy,
  progress,
  onBack,
  onGenerate,
  onCancel,
}: {
  data: CarrosselOut | null;
  images: Record<number, string>;
  busy: boolean;
  progress: number;
  onBack: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  if (!data) {
    return <div className="panel p-6 text-sm text-muted-foreground">Gere o roteiro antes de criar as imagens.</div>;
  }

  const generated = data.slides.filter((slide) => Boolean(images[slide.numero])).length;
  const total = data.slides.length;

  return (
    <section className="space-y-5">
      <div className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="eyebrow mb-2">Etapa 3 de 4 · imagens</div>
            <h2 className="section-title text-2xl">{busy ? "Gerando as artes do carrossel" : generated ? "Continue a geração das imagens" : "Pronto para criar as imagens"}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Cada slide usa fallback automático entre Colab e Cloudflare. Você pode sair desta página; a criação é retomada ao voltar.</p>
          </div>
          {busy ? (
            <button type="button" onClick={onCancel} className="secondary-button shrink-0 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"><XCircle className="h-4 w-4" /> Cancelar criação</button>
          ) : (
            <button type="button" onClick={onGenerate} className="primary-button shrink-0"><Sparkles className="h-4 w-4" /> {generated ? "Continuar geração" : `Gerar ${total} imagens`}</button>
          )}
        </div>

        {(busy || generated > 0) && (
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
            <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium">{busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />} {busy ? "Gerando imagens..." : "Imagens geradas"}</span><span>{generated}/{total} · {progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full gradient-brand transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.slides.map((slide) => {
          const image = images[slide.numero];
          return (
            <article key={slide.numero} className="panel overflow-hidden">
              <div className="aspect-square bg-[#080b15]">
                {image ? (
                  <img src={image} alt={`Slide ${slide.numero}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
                    <div>{busy ? <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" /> : <ImageIcon className="mx-auto mb-3 h-6 w-6" />}<div>{busy ? "Aguardando geração..." : "Imagem ainda não gerada"}</div></div>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-[.15em] text-primary">Slide {String(slide.numero).padStart(2, "0")}</div>
                <div className="mt-1 line-clamp-2 text-sm font-medium">{slide.titulo}</div>
              </div>
            </article>
          );
        })}
      </div>

      {!busy && (
        <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onBack} className="secondary-button"><ArrowLeft className="h-4 w-4" /> Voltar ao roteiro</button>
          <div className="text-xs text-muted-foreground">Ao terminar, o projeto será salvo automaticamente com o texto já aplicado à arte.</div>
        </div>
      )}
    </section>
  );
}

function FinalStage({
  data,
  images,
  projectId,
  onNew,
}: {
  data: CarrosselOut | null;
  images: Record<number, string>;
  projectId: string | null;
  onNew: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="panel overflow-hidden p-6 text-center sm:p-10">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><CheckCircle2 className="h-8 w-8" /></div>
        <div className="eyebrow mb-2 mt-6">Etapa 4 de 4 · finalização</div>
        <h2 className="section-title text-3xl">Seu carrossel está pronto</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">As imagens foram finalizadas com o texto aplicado pela Zunexi e salvas no projeto. O editor visual está temporariamente desativado para evitar deslocamentos de elementos.</p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {projectId && <Link to="/editor/$id" params={{ id: projectId }} className="primary-button"><Sparkles className="h-4 w-4" /> Ver artes prontas</Link>}
          <Link to="/projetos" className="secondary-button">Meus projetos</Link>
          <button type="button" onClick={onNew} className="secondary-button">Criar outro carrossel</button>
        </div>
      </div>

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.slides.map((slide) => (
            <div key={slide.numero} className="panel overflow-hidden">
              {images[slide.numero] ? <img src={images[slide.numero]} alt={`Slide ${slide.numero}`} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-xs text-muted-foreground">Slide {slide.numero}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="secondary-button text-xs">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copiado" : label}</button>;
}
