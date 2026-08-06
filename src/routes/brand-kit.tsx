import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BookOpenText, Check, FileText, Loader2, Palette, Plus, Save, Sparkles, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { deleteBrandProfile, listBrandDocuments, listBrandProfiles, saveBrandProfile, uploadBrandGuidePdf } from "@/lib/brand.functions";
import { getAccessKey } from "@/lib/session";
import type { PlanId } from "@/lib/plans";

export const Route = createFileRoute("/brand-kit")({
  head: () => ({ meta: [{ title: "Brand Kit inteligente — Zunexi.ai" }] }),
  component: BrandKitRoute,
});

type Brand = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  tone_of_voice: string;
  audience: string;
  visual_style: string;
  notes: string;
  is_primary: boolean;
  typography?: unknown;
  content_pillars?: unknown;
  prohibited_terms?: unknown;
  guide_summary?: string;
  guide_updated_at?: string | null;
};
type BrandDocument = { id: string; file_name: string; size_bytes: number; page_count: number; created_at: string };
type FormState = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  toneOfVoice: string;
  audience: string;
  visualStyle: string;
  notes: string;
  isPrimary: boolean;
};
const EMPTY: FormState = { name: "", primaryColor: "#4D6BFF", secondaryColor: "#8B5CF6", accentColor: "#12C7FF", toneOfVoice: "", audience: "", visualStyle: "", notes: "", isPrimary: true };

function BrandKitRoute() {
  return <AppShell><PlanGate feature="brand_kit"><BrandKitPage /></PlanGate></AppShell>;
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function BrandKitPage() {
  const list = useServerFn(listBrandProfiles);
  const save = useServerFn(saveBrandProfile);
  const remove = useServerFn(deleteBrandProfile);
  const uploadPdf = useServerFn(uploadBrandGuidePdf);
  const getDocuments = useServerFn(listBrandDocuments);
  const accessKey = getAccessKey() || "";
  const [brands, setBrands] = useState<Brand[]>([]);
  const [documents, setDocuments] = useState<BrandDocument[]>([]);
  const [plan, setPlan] = useState<PlanId>("profissional");
  const [tenantName, setTenantName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  async function refresh(preferredId?: string | null) {
    setLoading(true);
    try {
      const result = await list({ data: { accessKey } });
      const nextBrands = result.brands as Brand[];
      setBrands(nextBrands);
      setPlan(result.plan);
      setTenantName(result.tenantName);
      const target = nextBrands.find((brand) => brand.id === preferredId) || nextBrands.find((brand) => brand.id === selected) || nextBrands[0];
      if (target) selectBrand(target);
      else newBrand();
    } catch (error) { toast.error((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function loadDocuments(brandId: string) {
    try { setDocuments(await getDocuments({ data: { accessKey, brandId } }) as BrandDocument[]); }
    catch { setDocuments([]); }
  }

  function selectBrand(brand: Brand) {
    setSelected(brand.id);
    setForm({ name: brand.name, primaryColor: brand.primary_color, secondaryColor: brand.secondary_color, accentColor: brand.accent_color, toneOfVoice: brand.tone_of_voice, audience: brand.audience, visualStyle: brand.visual_style, notes: brand.notes, isPrimary: brand.is_primary });
    void loadDocuments(brand.id);
  }

  function newBrand() {
    setSelected(null);
    setDocuments([]);
    setForm({ ...EMPTY, isPrimary: brands.length === 0 });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await save({ data: { accessKey, id: selected, brand: form } }) as Brand;
      toast.success(selected ? "Brand Kit atualizado." : "Marca adicionada ao Brand Kit.");
      await refresh(saved.id);
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function doDelete() {
    if (!selected || !confirm("Excluir esta marca e os manuais enviados?")) return;
    try { await remove({ data: { accessKey, id: selected } }); toast.success("Marca excluída."); await refresh(null); }
    catch (error) { toast.error((error as Error).message); }
  }

  async function importPdf(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf") return toast.error("Envie um arquivo PDF.");
    if (file.size > 15 * 1024 * 1024) return toast.error("O PDF deve ter no máximo 15 MB.");
    setImporting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
        reader.readAsDataURL(file);
      });
      const result = await uploadPdf({ data: { accessKey, brandId: selected, fileName: file.name, mimeType: "application/pdf", base64 } });
      toast.success(`Manual analisado: ${result.totalPages} página(s). O Brand Kit foi preenchido automaticamente.`);
      await refresh(result.brand.id);
    } catch (error) { toast.error((error as Error).message); }
    finally { setImporting(false); }
  }

  const current = brands.find((brand) => brand.id === selected);
  const typography = textArray(current?.typography);
  const pillars = textArray(current?.content_pillars);
  const prohibited = textArray(current?.prohibited_terms);

  return (
    <div className="page-wrap space-y-5 sm:space-y-6">
      <section className="studio-hero panel relative overflow-hidden p-5 sm:p-8 lg:p-9">
        <div className="studio-hero-grid" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-primary" /> Identidade inteligente</div>
            <h1 className="section-title text-3xl sm:text-4xl">Brand Kit de {tenantName || "sua empresa"}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">Envie o manual em PDF. A Zunexi identifica tipografia, linguagem, público, cores, regras e pilares e aplica esse contexto nas próximas criações.</p>
          </div>
          <label className="primary-button cursor-pointer justify-center">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {importing ? "Analisando PDF..." : selected ? "Atualizar com PDF" : "Importar PDF e criar marca"}
            <input type="file" accept="application/pdf" disabled={importing} onChange={(event) => { void importPdf(event.target.files?.[0]); event.target.value = ""; }} className="hidden" />
          </label>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel p-4">
          <div className="mb-4 flex items-center justify-between px-1">
            <div><h2 className="font-semibold">Marcas</h2><p className="mt-1 text-[11px] text-muted-foreground">{plan === "agencia" ? "Selecione a marca usada em cada criação" : "Uma identidade no plano Profissional"}</p></div>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{brands.length}</span>
          </div>
          {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : brands.length === 0 ? <button onClick={newBrand} className="w-full rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground hover:border-primary/40"><Plus className="mx-auto mb-2 h-5 w-5 text-primary" />Cadastre manualmente ou importe um PDF</button> : <div className="space-y-2">{brands.map((brand) => <button key={brand.id} onClick={() => selectBrand(brand)} className={`w-full rounded-xl border p-3 text-left transition ${selected === brand.id ? "border-primary/45 bg-primary/10" : "border-border hover:bg-white/[.025]"}`}><div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${brand.primary_color}, ${brand.secondary_color})` }}><Sparkles className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 truncate text-sm font-semibold">{brand.name}{brand.is_primary && <Star className="h-3.5 w-3.5 fill-current text-amber-300" />}</div><div className="mt-1 flex gap-1"><i className="h-2.5 w-5 rounded-full" style={{ background: brand.primary_color }} /><i className="h-2.5 w-5 rounded-full" style={{ background: brand.secondary_color }} /><i className="h-2.5 w-5 rounded-full" style={{ background: brand.accent_color }} /></div></div></div></button>)}</div>}
          {plan === "agencia" && <button onClick={newBrand} className="secondary-button mt-4 w-full"><Plus className="h-4 w-4" /> Nova marca</button>}
        </aside>

        <div className="space-y-5">
          <form onSubmit={submit} className="panel p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">{selected ? "Editar identidade" : "Nova identidade"}</div><h2 className="section-title mt-1 text-2xl">{selected ? form.name : "Configurar Brand Kit"}</h2></div>{selected && <button type="button" onClick={() => void doDelete()} className="secondary-button text-red-300"><Trash2 className="h-4 w-4" /> Excluir</button>}</div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome da marca" wide><input className="app-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Zunexi Studio" required /></Field>
              <ColorField label="Cor principal" value={form.primaryColor} onChange={(primaryColor) => setForm({ ...form, primaryColor })} />
              <ColorField label="Cor secundária" value={form.secondaryColor} onChange={(secondaryColor) => setForm({ ...form, secondaryColor })} />
              <ColorField label="Cor de destaque" value={form.accentColor} onChange={(accentColor) => setForm({ ...form, accentColor })} />
              <Field label="Tom de voz"><textarea className="app-input min-h-24 resize-y" value={form.toneOfVoice} onChange={(e) => setForm({ ...form, toneOfVoice: e.target.value })} placeholder="Moderno, jovem, direto e premium" /></Field>
              <Field label="Público-alvo"><textarea className="app-input min-h-24 resize-y" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Para quem a marca fala?" /></Field>
              <Field label="Estilo visual" wide><textarea className="app-input min-h-28 resize-y" value={form.visualStyle} onChange={(e) => setForm({ ...form, visualStyle: e.target.value })} placeholder="Iluminação, composição, textura, fotografia e elementos recorrentes." /></Field>
              <Field label="Regras e observações" wide><textarea className="app-input min-h-24 resize-y" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Regras, palavras proibidas, CTAs e informações importantes." /></Field>
              <label className="sm:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white/[.018] p-4"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} className="h-4 w-4 accent-violet-500" /><div><div className="text-sm font-semibold">Marca principal</div><div className="mt-0.5 text-[11px] text-muted-foreground">Usar como padrão quando nenhuma marca for escolhida.</div></div>{form.isPrimary && <Check className="ml-auto h-4 w-4 text-primary" />}</label>
            </div>
            <div className="mt-6 flex justify-end"><button disabled={saving} className="primary-button disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Brand Kit</button></div>
          </form>

          {current && (
            <section className="panel grid gap-5 p-5 sm:p-7 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-2 font-semibold"><BookOpenText className="h-4 w-4 text-primary" /> Dados extraídos do manual</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{current.guide_summary || "Envie um manual PDF para preencher automaticamente tipografia, regras e pilares."}</p>
                {typography.length > 0 && <div className="mt-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipografia identificada</div><div className="mt-2 flex flex-wrap gap-2">{typography.map((font) => <span key={font} className="rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs">{font}</span>)}</div></div>}
                {pillars.length > 0 && <div className="mt-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pilares de conteúdo</div><div className="mt-2 flex flex-wrap gap-2">{pillars.map((item) => <span key={item} className="rounded-lg border border-primary/20 bg-primary/8 px-2.5 py-1.5 text-xs text-primary">{item}</span>)}</div></div>}
                {prohibited.length > 0 && <div className="mt-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Evitar</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{prohibited.join(" • ")}</p></div>}
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> PDFs salvos</div>
                {documents.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhum manual enviado para esta marca.</div> : <div className="space-y-2">{documents.map((doc) => <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border bg-white/[.018] p-3"><FileText className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{doc.file_name}</div><div className="text-[11px] text-muted-foreground">{doc.page_count} páginas · {(doc.size_bytes / 1024 / 1024).toFixed(1)} MB</div></div></div>)}</div>}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold">{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-2 block text-xs font-semibold">{label}</span><div className="flex gap-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-14 rounded-xl border border-border bg-transparent p-1" /><input value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9A-Fa-f]{6}" className="app-input font-mono uppercase" /></div></label>; }
