import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileImage, Image as ImageIcon, Search, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { addLibrary, loadFavFonts, loadLibrary, removeLibrary, toggleFavFont, type LibItem } from "@/lib/storage";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca — Zunexi.ai" }] }),
  component: Biblioteca,
});

const POPULAR_FONTS = ["Inter", "Space Grotesk", "Playfair Display", "Bebas Neue", "Archivo Black", "Syne", "DM Serif Display", "Poppins", "Montserrat", "Lora", "Oswald", "Raleway", "Cormorant Garamond", "Anton", "Righteous"];

type Tab = "imagens" | "uploads" | "fontes";

function Biblioteca() {
  const [tab, setTab] = useState<Tab>("imagens");
  const [items, setItems] = useState<LibItem[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibItem | null>(null);

  const refresh = () => {
    const library = loadLibrary();
    setItems(library);
    setFavs(loadFavFonts());
    if (selected && !library.some((item) => item.id === selected.id)) setSelected(null);
  };

  useEffect(refresh, []);
  useEffect(() => {
    const id = "gf-preview";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?" + POPULAR_FONTS.map((font) => `family=${encodeURIComponent(font)}:wght@400;700`).join("&") + "&display=swap";
    document.head.appendChild(link);
  }, []);

  const visibleImages = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const visibleFonts = useMemo(() => POPULAR_FONTS.filter((font) => font.toLowerCase().includes(query.trim().toLowerCase())), [query]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name}: máximo de 8 MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        addLibrary({ id: crypto.randomUUID(), url: reader.result as string, name: file.name, addedAt: Date.now() });
        refresh();
      };
      reader.readAsDataURL(file);
    });
    toast.success("Imagens adicionadas à biblioteca.");
    e.target.value = "";
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow mb-2 flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5 text-primary" /> Ativos visuais</div>
            <h1 className="section-title text-3xl sm:text-4xl">Biblioteca</h1>
            <p className="mt-2 text-sm text-muted-foreground">Gerencie e reutilize imagens, uploads e fontes favoritas.</p>
          </div>
          <label className="primary-button cursor-pointer"><Upload className="h-4 w-4" /> Fazer upload<input type="file" multiple accept="image/*" onChange={onUpload} className="hidden" /></label>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-4 pt-4 sm:px-5">
            <div className="flex gap-6 overflow-x-auto">
              {(["imagens", "uploads", "fontes"] as Tab[]).map((item) => (
                <button key={item} onClick={() => setTab(item)} className={`relative pb-4 text-sm font-medium capitalize ${tab === item ? "text-white" : "text-muted-foreground hover:text-white"}`}>
                  {item}
                  {tab === item && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full gradient-brand" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "fontes" ? "Buscar fontes..." : "Buscar imagens..."} className="w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="text-xs text-muted-foreground">{tab === "fontes" ? `${visibleFonts.length} fontes` : `${visibleImages.length} arquivos`}</div>
          </div>

          {tab === "fontes" ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
              {visibleFonts.map((font) => (
                <article key={font} className="panel-soft flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{font}</div>
                    <div className="mt-2 truncate text-2xl" style={{ fontFamily: `"${font}", sans-serif` }}>Aa Bb Cc 123</div>
                  </div>
                  <button onClick={() => { toggleFavFont(font); refresh(); }} className={`rounded-xl p-2.5 ${favs.includes(font) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}>
                    <Star className={`h-5 w-5 ${favs.includes(font) ? "fill-current" : ""}`} />
                  </button>
                </article>
              ))}
            </div>
          ) : visibleImages.length === 0 ? (
            <div className="flex min-h-[370px] flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary"><FileImage className="h-7 w-7" /></div>
              <h2 className="section-title text-xl">Sua biblioteca está vazia</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Envie imagens para reutilizá-las nos próximos projetos.</p>
              <label className="primary-button mt-5 cursor-pointer"><Upload className="h-4 w-4" /> Enviar imagens<input type="file" multiple accept="image/*" onChange={onUpload} className="hidden" /></label>
            </div>
          ) : (
            <div className="grid min-h-[500px] xl:grid-cols-[1fr_300px]">
              <div className="grid content-start grid-cols-2 gap-3 border-r border-border p-4 sm:grid-cols-3 lg:grid-cols-4 sm:p-5">
                {visibleImages.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item)} className={`group relative aspect-square overflow-hidden rounded-xl border bg-secondary ${selected?.id === item.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/45"}`}>
                    <img src={item.url} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-left"><div className="truncate text-xs font-medium text-white">{item.name}</div></div>
                  </button>
                ))}
              </div>

              <aside className="p-5">
                {selected ? (
                  <div className="space-y-5">
                    <div className="aspect-square overflow-hidden rounded-xl border border-border bg-secondary"><img src={selected.url} alt={selected.name} className="h-full w-full object-cover" /></div>
                    <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Arquivo selecionado</div><h3 className="mt-1 break-words font-semibold">{selected.name}</h3></div>
                    <dl className="space-y-3 text-xs">
                      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Adicionado em</dt><dd>{new Date(selected.addedAt).toLocaleDateString("pt-BR")}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Origem</dt><dd>Upload</dd></div>
                    </dl>
                    <button onClick={() => { removeLibrary(selected.id); refresh(); toast.success("Arquivo removido."); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/15"><Trash2 className="h-4 w-4" /> Excluir arquivo</button>
                  </div>
                ) : (
                  <div className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground">Selecione uma imagem para ver os detalhes.</div>
                )}
              </aside>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
