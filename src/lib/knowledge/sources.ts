import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnowledgeSourceInput } from "./runtime.server";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_SEO_AEO_PATH =
  "C:\\Users\\maxwe\\.codex\\attachments\\e2e515ae-64d7-4dd1-abe4-2465637842bf\\pasted-text.txt";
const DEFAULT_DATAFORSEO_PATH =
  "C:\\Users\\maxwe\\.codex\\attachments\\da318028-e85f-4aac-a0f2-c0ed2bcf07f8\\pasted-text.txt";

export const EXECUTION_HANDBOOK_FILES = [
  "_topic.md",
  "BRAND_AND_CLAIMS.md",
  "COMPONENT_REGISTRY.md",
  "DETECTION_RULES.md",
  "DIAGNOSIS_REMEDY_MATRIX.md",
  "EVIDENCE_POLICY.md",
  "EXECUTION_ROLLBACK.md",
  "INDEX.md",
  "KNOWLEDGE_INGESTION.md",
  "OUTCOME_MEASUREMENT.md",
  "PROPOSAL_DATA_CONTRACT.md",
  "SITE_PAGE_KEYWORD_MAP.md",
  "SOURCE_OF_TRUTH.md",
  "TENANCY_PERMISSIONS.md",
  "TEST_CASES.md",
  "VALIDATION_GATES.md",
] as const;

export type LoadedKnowledgeSource = KnowledgeSourceInput & {
  contentSha256: string;
  sourceSizeBytes: number;
  localPath: string;
};

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function load(
  input: Omit<KnowledgeSourceInput, "content"> & { localPath: string },
): LoadedKnowledgeSource {
  const content = readFileSync(input.localPath, "utf8").replace(/\r\n?/g, "\n").trim();
  if (!content) throw new Error(`Governed knowledge source is empty: ${input.localPath}`);
  return {
    ...input,
    content,
    contentSha256: checksum(content),
    sourceSizeBytes: Buffer.byteLength(content, "utf8"),
  };
}

function handbookTitle(content: string, file: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading ?? basename(file, ".md").replace(/^_/, "").replaceAll("_", " ");
}

export function loadGovernedKnowledgeSources(
  options: {
    repoRoot?: string;
    seoAeoPath?: string;
    dataforseoPath?: string;
    handbookVersion?: string;
  } = {},
): LoadedKnowledgeSource[] {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const seoAeoPath =
    options.seoAeoPath ?? process.env["SEO_AEO_PLAYBOOK_PATH"] ?? DEFAULT_SEO_AEO_PATH;
  const dataforseoPath =
    options.dataforseoPath ?? process.env["DATAFORSEO_PLAYBOOK_PATH"] ?? DEFAULT_DATAFORSEO_PATH;
  const handbookVersion =
    options.handbookVersion ?? process.env["AOOS_KNOWLEDGE_VERSION"] ?? "2026-08-14";

  const playbooks = [
    load({
      stableKey: "playbook.seo-aeo-laws",
      title: "SEO & AEO Laws, Algorithms and Decision Models",
      description: "Governing SEO/AEO decision models, including Authority Science.",
      sourceType: "playbook",
      sourceRef: "supplied://seo-aeo-laws-2026-08-13",
      versionLabel: "2026-08-13",
      localPath: seoAeoPath,
      metadata: { authority_science: true },
    }),
    load({
      stableKey: "playbook.dataforseo-master",
      title: "DataForSEO Master Playbook",
      description: "Technical and operating guidance for DataForSEO evidence collection.",
      sourceType: "playbook",
      sourceRef: "supplied://dataforseo-master-2026-08-13",
      versionLabel: "2026-08-13",
      localPath: dataforseoPath,
    }),
  ];

  const handbook = EXECUTION_HANDBOOK_FILES.map((file) => {
    const localPath = join(repoRoot, "docs", "execution-handbook", file);
    const content = readFileSync(localPath, "utf8");
    const slug = basename(file, ".md").replace(/^_/, "").toLowerCase().replaceAll("_", "-");
    return load({
      stableKey: `handbook.${slug}`,
      title: handbookTitle(content, file),
      description: "AOOS governed execution handbook document.",
      sourceType: "execution_handbook",
      sourceRef: `docs/execution-handbook/${file}`,
      versionLabel: handbookVersion,
      localPath,
      metadata: { repository_path: `docs/execution-handbook/${file}` },
    });
  });
  return [...playbooks, ...handbook];
}
