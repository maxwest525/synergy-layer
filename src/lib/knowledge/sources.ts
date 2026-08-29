import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnowledgeSourceInput } from "./runtime.server";

function resolveRepoRoot(): string {
  return fileURLToPath(new URL("../../..", import.meta.url));
}
export const EXECUTION_HANDBOOK_FILES = [
  "_topic.md",
  "BRAND_AND_CLAIMS.md",
  "COMPETITIVE_MODEL.md",
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

function loadContent(
  input: Omit<KnowledgeSourceInput, "content"> & { localPath: string },
  rawContent: string,
): LoadedKnowledgeSource {
  const content = rawContent.replace(/\r\n?/g, "\n").trim();
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

function loadBundledDefaults() {
  const handbookModules = import.meta.glob("../../../docs/execution-handbook/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>;
  const playbookModules = import.meta.glob("../../../docs/knowledge-sources/*.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>;
  const byBasename = (modules: Record<string, string>, file: string) => {
    const entry = Object.entries(modules).find(([path]) => path.endsWith(`/${file}`));
    if (!entry) throw new Error(`Bundled governed knowledge source is missing: ${file}`);
    return entry[1];
  };
  return {
    handbook: Object.fromEntries(
      EXECUTION_HANDBOOK_FILES.map((file) => [file, byBasename(handbookModules, file)]),
    ) as Record<(typeof EXECUTION_HANDBOOK_FILES)[number], string>,
    seoAeo: byBasename(playbookModules, "SEO_AEO_LAWS_ALGORITHMS_DECISION_MODELS.txt"),
    dataforseo: byBasename(playbookModules, "DATAFORSEO_MASTER_PLAYBOOK.txt"),
  };
}

export function loadGovernedKnowledgeSources(
  options: {
    repoRoot?: string;
    seoAeoPath?: string;
    dataforseoPath?: string;
    handbookVersion?: string;
    bundled?: boolean;
  } = {},
): LoadedKnowledgeSource[] {
  const bundledDefaults = options.bundled ? loadBundledDefaults() : null;
  // Lovable rewrites import.meta.url in the server bundle. Bundled sources do not
  // need a filesystem root, so avoid parsing that rewritten value at runtime.
  const repoRoot = options.repoRoot ?? (bundledDefaults ? "." : resolveRepoRoot());
  const seoAeoPath =
    options.seoAeoPath ??
    process.env["SEO_AEO_PLAYBOOK_PATH"] ??
    join(repoRoot, "docs", "knowledge-sources", "SEO_AEO_LAWS_ALGORITHMS_DECISION_MODELS.txt");
  const dataforseoPath =
    options.dataforseoPath ??
    process.env["DATAFORSEO_PLAYBOOK_PATH"] ??
    join(repoRoot, "docs", "knowledge-sources", "DATAFORSEO_MASTER_PLAYBOOK.txt");
  const handbookVersion =
    options.handbookVersion ?? process.env["AOOS_KNOWLEDGE_VERSION"] ?? "2026-08-14";
  const playbooks = [
    loadContent(
      {
        stableKey: "playbook.seo-aeo-laws",
        title: "SEO & AEO Laws, Algorithms and Decision Models",
        description: "Governing SEO/AEO decision models, including Authority Science.",
        sourceType: "playbook",
        sourceRef: "supplied://seo-aeo-laws-2026-08-13",
        versionLabel: "2026-08-13",
        localPath: seoAeoPath,
        metadata: { authority_science: true },
      },
      options.seoAeoPath || process.env["SEO_AEO_PLAYBOOK_PATH"]
        ? readFileSync(seoAeoPath, "utf8")
        : (bundledDefaults?.seoAeo ?? readFileSync(seoAeoPath, "utf8")),
    ),
    loadContent(
      {
        stableKey: "playbook.dataforseo-master",
        title: "DataForSEO Master Playbook",
        description: "Technical and operating guidance for DataForSEO evidence collection.",
        sourceType: "playbook",
        sourceRef: "supplied://dataforseo-master-2026-08-13",
        versionLabel: "2026-08-13",
        localPath: dataforseoPath,
      },
      options.dataforseoPath || process.env["DATAFORSEO_PLAYBOOK_PATH"]
        ? readFileSync(dataforseoPath, "utf8")
        : (bundledDefaults?.dataforseo ?? readFileSync(dataforseoPath, "utf8")),
    ),
  ];

  const handbook = EXECUTION_HANDBOOK_FILES.map((file) => {
    const localPath = join(repoRoot, "docs", "execution-handbook", file);
    const content = bundledDefaults?.handbook[file] ?? readFileSync(localPath, "utf8");
    const slug = basename(file, ".md").replace(/^_/, "").toLowerCase().replaceAll("_", "-");
    return loadContent(
      {
        stableKey: `handbook.${slug}`,
        title: handbookTitle(content, file),
        description: "AOOS governed execution handbook document.",
        sourceType: "execution_handbook",
        sourceRef: `docs/execution-handbook/${file}`,
        versionLabel: handbookVersion,
        localPath,
        metadata: { repository_path: `docs/execution-handbook/${file}` },
      },
      content,
    );
  });
  return [...playbooks, ...handbook];
}
