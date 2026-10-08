import crypto from "node:crypto";

export const KNOWLEDGE_CHUNK_MAX_CHARS = 3_200;
export const KNOWLEDGE_CHUNK_OVERLAP_CHARS = 480;

export type KnowledgeChunk = {
  chunkIndex: number;
  text: string;
  heading: string | null;
  pageNumber: number | null;
  tokenCount: number;
  contentHash: string;
};

function isHeading(line: string) {
  return /^#{1,6}\s+\S/.test(line.trim()) || (/^[A-ZÁÀÃÉÊÍÓÔÕÚÇ0-9][^.!?]{2,100}:$/.test(line.trim()));
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

export function chunkKnowledgeText(input: string, options?: {
  maxChars?: number;
  overlapChars?: number;
}) {
  const maxChars = options?.maxChars ?? KNOWLEDGE_CHUNK_MAX_CHARS;
  const overlapChars = Math.min(options?.overlapChars ?? KNOWLEDGE_CHUNK_OVERLAP_CHARS, Math.floor(maxChars / 2));
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const chunks: KnowledgeChunk[] = [];
  let heading: string | null = null;
  let pageNumber: number | null = null;
  let buffer = "";

  const flush = () => {
    const text = buffer.trim();
    if (!text) return;
    const contentHash = crypto.createHash("sha256").update(text, "utf8").digest("hex");
    chunks.push({
      chunkIndex: chunks.length,
      text,
      heading,
      pageNumber,
      tokenCount: estimateTokens(text),
      contentHash,
    });
    buffer = text.slice(Math.max(0, text.length - overlapChars));
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (buffer && !buffer.endsWith("\n")) buffer += "\n";
      continue;
    }
    const pageMatch = /^\[p(?:age)?\s*(\d+)\]$/i.exec(line);
    if (pageMatch) {
      pageNumber = Number(pageMatch[1]);
      continue;
    }
    if (isHeading(line)) {
      if (buffer.length > maxChars * 0.7) flush();
      heading = line.replace(/^#+\s*/, "").replace(/:$/, "").trim();
    }
    const next = buffer ? `${buffer}\n${line}` : line;
    if (next.length > maxChars) flush();
    buffer = buffer ? `${buffer}\n${line}` : line;
  }
  flush();
  return chunks;
}
