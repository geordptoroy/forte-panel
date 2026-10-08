import { useRef, useState } from "react";
import { Archive, Eye, FileText, Loader2, RefreshCw, UploadCloud, X } from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = {
  uploaded: "Aguardando indexação",
  processing: "Indexando",
  indexed: "Indexado",
  published: "Publicado",
  failed: "Falhou",
  archived: "Arquivado",
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler o arquivo."));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export default function KnowledgeBasePage() {
  const utils = trpc.useUtils();
  const query = trpc.knowledge.list.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailQuery = trpc.knowledge.get.useQuery(
    { documentId: selectedId ?? 0 },
    { enabled: selectedId !== null },
  );
  const upload = trpc.knowledge.upload.useMutation({ onSuccess: () => void query.refetch() });
  const retry = trpc.knowledge.retry.useMutation({ onSuccess: () => void query.refetch() });
  const archive = trpc.knowledge.archive.useMutation({ onSuccess: () => void query.refetch() });
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const handleFile = async (file: File) => {
    setMessage("");
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("O arquivo ultrapassa o limite de 25 MB.");
      const dataUrl = await fileToDataUrl(file);
      await upload.mutateAsync({ title: title.trim() || file.name, fileName: file.name, mimeType: file.type || "text/plain", dataUrl });
      setTitle("");
      setMessage("Documento enviado. O worker fará a extração e indexação quando estiver disponível.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o documento.");
    }
  };

  const documents = query.data ?? [];
  return (
    <PanelLayout
      eyebrow="IA · Base de conhecimento"
      title="Base de Conhecimento"
      description="Gerencie as fontes usadas pelo RAG. Cada documento fica isolado no workspace e só entra no agente depois de indexado."
      actions={<button className="btn-secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={13} /> Atualizar</button>}
    >
      <section className="surface" style={{ padding: 18, marginBottom: 18 }}>
        <SectionTitle eyebrow="Adicionar fonte" title="Upload manual" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11, lineHeight: 1.5 }}>
          O onboarding por áudio é a forma recomendada. Use o upload para PDFs, DOCX, TXT, CSV ou Markdown que a empresa já possui.
        </p>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="form-field">
            <label htmlFor="knowledge-title">Título opcional</label>
            <input id="knowledge-title" className="input-control" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Política de cancelamento" />
          </div>
          <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <><Loader2 size={13} className="animate-spin" /> Enviando...</> : <><UploadCloud size={13} /> Escolher documento</>}
          </button>
          <input ref={inputRef} type="file" hidden accept="application/pdf,.docx,.txt,.md,.csv" onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} />
        </div>
        {message && <div className="operational-banner" style={{ marginTop: 12, fontSize: 10 }}>{message}</div>}
      </section>

      {selectedId !== null && (
        <section className="surface" style={{ padding: 18, marginBottom: 18 }} aria-label="Detalhe do documento">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <SectionTitle eyebrow="Conteúdo indexável" title={detailQuery.data?.title ?? "Documento"} />
            <button className="btn-ghost" onClick={() => setSelectedId(null)} aria-label="Fechar visualização"><X size={14} /></button>
          </div>
          {detailQuery.isLoading ? <div className="muted" role="status"><Loader2 size={14} className="animate-spin" /> Carregando conteúdo...</div> : detailQuery.data ? (
            <>
              <div className="muted" style={{ fontSize: 10, margin: "-3px 0 10px" }}>
                Versão {detailQuery.data.version?.version ?? "—"} · {detailQuery.data.version?.status ?? detailQuery.data.status} · o texto abaixo é o conteúdo privado usado pelo worker.
              </div>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto", margin: 0, padding: 14, border: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,.16)", color: "#cddbd1", font: "11px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace" }}>{detailQuery.data.version?.sourceText || "Ainda não há texto extraído para esta versão."}</pre>
            </>
          ) : <div className="form-error">Documento não encontrado neste workspace.</div>}
        </section>
      )}

      <section className="surface" style={{ padding: 18 }}>
        <SectionTitle eyebrow="Fontes deste workspace" title={`${documents.length} documento${documents.length === 1 ? "" : "s"}`} />
        {query.isLoading ? <div className="muted" role="status"><Loader2 size={14} className="animate-spin" /> Carregando documentos...</div> : documents.length === 0 ? (
          <div className="demo-banner"><FileText size={14} /> Ainda não há documentos. Publique o onboarding para gerar a primeira base em Markdown.</div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {documents.map(document => {
              const version = document.version;
              const status = version?.status ?? document.status;
              const canRetry = status === "failed";
              const canArchive = status !== "archived";
              return (
                <article key={document.id} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.015)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "#e1e8e3", fontSize: 12 }}>{document.title}</strong>
                      <div className="muted" style={{ marginTop: 4, fontSize: 10 }}>{document.source === "onboarding_generated" ? "Gerado pelo onboarding por áudio" : "Upload manual"} · {document.originalFileName ?? "fonte privada"} · {formatBytes(document.sizeBytes)}</div>
                    </div>
                    <span className={`status-pill ${status === "indexed" || status === "published" ? "status-pill--success" : status === "failed" ? "status-pill--danger" : ""}`}>{statusLabels[status] ?? status}</span>
                  </div>
                  <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10 }}>
                    <span>Versão {version?.version ?? "—"}</span><span>{document.chunkCount} chunks</span><span>{document.mimeType}</span><span>{version?.attemptCount ?? 0} tentativa(s)</span>
                  </div>
                  {version?.lastError && <div className="form-error" style={{ fontSize: 10 }}>{version.lastError}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-secondary" onClick={() => setSelectedId(document.id)}><Eye size={13} /> Ver conteúdo</button>
                    {canRetry && <button className="btn-secondary" onClick={() => retry.mutate({ documentId: document.id })} disabled={retry.isPending}><RefreshCw size={13} /> Reprocessar</button>}
                    {canArchive && <button className="btn-ghost" onClick={() => archive.mutate({ documentId: document.id })} disabled={archive.isPending}><Archive size={13} /> Arquivar</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </PanelLayout>
  );
}
