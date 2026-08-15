import { createHash } from "node:crypto";

export const KNOWLEDGE_PARSER_VERSION = "markdown-headings-v1";

export type KnowledgeChunkDraft = {
  ordinal: number;
  title: string;
  headingPath: string[];
  body: string;
  tokenEstimate: number;
  contentSha256: string;
};

type ChunkInput = {
  sourceTitle: string;
  content: string;
  maxChars?: number;
};

type Section = { headingPath: string[]; lines: string[] };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function splitBounded(value: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxChars) {
    const candidate = remaining.slice(0, maxChars + 1);
    const whitespace = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"));
    const boundary = whitespace >= Math.floor(maxChars * 0.55) ? whitespace : maxChars;
    parts.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function packSection(body: string, maxChars: number): string[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => splitBounded(part, maxChars));
  const packed: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) packed.push(current);
    current = paragraph;
  }
  if (current) packed.push(current);
  return packed;
}

export function chunkKnowledgeSource(input: ChunkInput): KnowledgeChunkDraft[] {
  const sourceTitle = input.sourceTitle.trim();
  if (!sourceTitle) throw new Error("A knowledge source title is required.");
  const maxChars = input.maxChars ?? 5_500;
  if (maxChars < 200) throw new Error("Knowledge chunk maxChars must be at least 200.");

  const content = input.content.replace(/\r\n?/g, "\n").trim();
  if (!content) return [];
  const sections: Section[] = [];
  let headingPath: string[] = [sourceTitle];
  let lines: string[] = [];
  const flush = () => {
    if (lines.some((line) => line.trim())) sections.push({ headingPath: [...headingPath], lines });
    lines = [];
  };

  for (const line of content.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    const depth = match[1]!.length;
    const heading = match[2]!.replace(/\s+#+\s*$/, "").trim();
    const parent = headingPath.slice(0, Math.max(0, depth - 1));
    headingPath = [...parent, heading];
  }
  flush();

  const chunks: KnowledgeChunkDraft[] = [];
  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    for (const packedBody of packSection(body, maxChars)) {
      const title = section.headingPath.at(-1) ?? sourceTitle;
      chunks.push({
        ordinal: chunks.length,
        title,
        headingPath: section.headingPath,
        body: packedBody,
        tokenEstimate: Math.max(1, Math.ceil(packedBody.length / 4)),
        contentSha256: sha256(`${section.headingPath.join(" > ")}\n${packedBody}`),
      });
    }
  }
  return chunks;
}
