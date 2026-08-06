import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Loader2, Palette, Plus, Save, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { deleteBrandProfile, listBrandProfiles, saveBrandProfile } from "@/lib/brand.functions";
import { getAccessKey } from "@/lib/session";
import type { Database } from "@/integrations/supabase/types";
import type { PlanId } from "@/lib/plans";

export const Route = createFileRoute("/brand-kit")({
  head: () => ({ meta: [{ title: "Brand Kit inteligente — Zunexi.ai" }] }),
  component: BrandKitRoute,
});

type Brand = Database["public"]["Tables"]["brand_profiles"]["Row"];
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

function BrandKitPage() {
  const list = useServerFn(listBrandProfiles);
  const save = useServerFn(saveBrandProfile);
  const remove = useServerFn(deleteBrandProfile);
  const accessKey = getAccessKey() || "";
  const [brands, setBrands] = useState<Brand[]>([]);
  const [plan, setPlan] = useState<PlanId>("profissional");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh(selectFirst = false) {
    setLoading(true);
    try {
      const result = await list({ data: { accessKey } });
      const nextBrands = result.brands as Brand[];
      setBrands(nextBrands);
      setPlan(result.plan);
      if ((selectFirst || !selected) && nextBrands[0]) selectBrand(nextBrands[0]);
    } catch (error) { toast.error((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(true); }, []);

  function selectBrand(brand: Brand) {
    setSelected(brand.id);
    setForm({ name: brand.name, primaryColor: brand.primary_color, secondaryColor: brand.secondary_color, accentColor: brand.accent_color, toneOfVoice: brand.tone_of_voice, audience: brand.audience, visualStyle: brand.visual_style, notes: brand.notes, isPrimary: brand.is_primary });
  }
  function newBrand() { setSelected(null); setForm({ ...EMPTY, isPrimary: brands.length === 0 }); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await save({ data: { accessKey, id: selected, brand: form } });
      toast.success(selected ? "Brand Kit atualizado." : "Marca adicionada ao Brand Kit.");
      setSelected(null);
      setForm(EMPTY);
      await refresh(true);
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function doDelete() {
    if (!selected || !confirm("Excluir esta marca do Brand Kit?")) return;
    try { await remove({ data: { accessKey, id: selected } }); toast.success("Marca excluída."); newBrand(); await refresh(true); }
    catch (error) { toast.error((error as Error).message); }
  }

  return (
    <div className="page-wrap space-y-6">
      <section className="studio-hero panel relative overflow-hidden p-6 sm:p-9">
        <div className="studio-hero-grid" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="eyebrow mb-3 flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-primary" /> Identidade inteligente</div><h1 className="section-title max-w-3xl text-4xl leading-[.98] sm:text-6xl">Sua marca, sempre reconhecível.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Salve cores, tom de voz, público e estilo visual. O plano Agência permite administrar múltiplas marcas.</p></div>
          {plan === "agencia" && <button onClick={newBrand} className="primary-button"><Plus className="h-4 w-4" /> Nova marca</button>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="panel p-4">
          <div className="mb-4 flex items-center justify-between px-1"><div><h2 className="font-semibold">Marcas</h2><p className="mt-1 text-[11px] text-muted-foreground">{plan === "agencia" ? "Múltiplas marcas habilitadas" : "1 marca no plano Profissional"}</p></div><span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{brands.length}</span></div>
          {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : brands.length === 0 ? <button onClick={newBrand} className="w-full rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground hover:border-primary/40"><Plus className="mx-auto mb-2 h-5 w-5 text-primary" />Criar seu primeiro Brand Kit</button> : <div className="space-y-2">{brands.map((brand) => <button key={brand.id} onClick={() => selectBrand(brand)} className={`w-full rounded-xl border p-3 text-left transition ${selected === brand.id ? "border-primary/45 bg-primary/10" : "border-border hover:bg-white/[.025]"}`}><div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${brand.primary_color}, ${brand.secondary_color})` }}><Sparkles className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 truncate text-sm font-semibold">{brand.name}{brand.is_primary && <Star className="h-3.5 w-3.5 fill-current text-amber-300" />}</div><div className="mt-1 flex gap-1"><i className="h-2.5 w-5 rounded-full" style={{ background: brand.primary_color }} /><i className="h-2.5 w-5 rounded-full" style={{ background: brand.secondary_color }} /><i className="h-2.5 w-5 rounded-full" style={{ background: brand.accent_color }} /></div></div></div></button>)}</div>}
        </aside>

        <form onSubmit={submit} className="panel p-5 sm:p-7">
          <div className="mb-6 flex items-start justify-between"><div><div className="eyebrow">{selected ? "Editar identidade" : "Nova identidade"}</div><h2 className="section-title mt-1 text-2xl">{selected ? form.name : "Configurar Brand Kit"}</h2></div>{selected && <button type="button" onClick={() => void doDelete()} className="secondary-button text-red-300"><Trash2 className="h-4 w-4" /> Excluir</button>}</div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da marca" wide><input className="app-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Zunexi Studio" required /></Field>
            <ColorField label="Cor principal" value={form.primaryColor} onChange={(primaryColor) => setForm({ ...form, primaryColor })} />
            <ColorField label="Cor secundária" value={form.secondaryColor} onChange={(secondaryColor) => setForm({ ...form, secondaryColor })} />
            <ColorField label="Cor de destaque" value={form.accentColor} onChange={(accentColor) => setForm({ ...form, accentColor })} />
            <Field label="Tom de voz"><textarea className="app-input min-h-24 resize-y" value={form.toneOfVoice} onChange={(e) => setForm({ ...form, toneOfVoice: e.target.value })} placeholder="Ex.: moderno, jovem, direto e premium" /></Field>
            <Field label="Público-alvo"><textarea className="app-input min-h-24 resize-y" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Para quem a marca fala?" /></Field>
            <Field label="Estilo visual" wide><textarea className="app-input min-h-28 resize-y" value={form.visualStyle} onChange={(e) => setForm({ ...form, visualStyle: e.target.value })} placeholder="Descreva iluminação, composição, textura, referências e elementos que devem se repetir." /></Field>
            <Field label="Observações da marca" wide><textarea className="app-input min-h-20 resize-y" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Regras, palavras proibidas, CTAs, informações importantes..." /></Field>
            <label className="sm:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white/[.018] p-4"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} className="h-4 w-4 accent-violet-500" /><div><div className="text-sm font-semibold">Marca principal</div><div className="mt-0.5 text-[11px] text-muted-foreground">Usar como identidade padrão nas próximas criações.</div></div>{form.isPrimary && <Check className="ml-auto h-4 w-4 text-primary" />}</label>
          </div>
          <div className="mt-6 flex justify-end"><button disabled={saving} className="primary-button disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Brand Kit</button></div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold">{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-2 block text-xs font-semibold">{label}</span><div className="flex gap-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-14 rounded-xl border border-border bg-transparent p-1" /><input value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9A-Fa-f]{6}" className="app-input font-mono uppercase" /></div></label>; }
