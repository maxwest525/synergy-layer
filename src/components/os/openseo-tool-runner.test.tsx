import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { initialToolArguments } from "@/lib/openseo/tool-arguments";

import { OpenSeoToolRunner } from "./openseo-tool-runner";

const tools = [
  {
    name: "list_projects",
    description: "Free — uses no credits.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    classification: {
      mode: "free_read" as const,
      cost: "free" as const,
      readOnly: true,
      destructive: false,
      requiresConfirmation: false,
    },
  },
  {
    name: "run_site_audit",
    description: "Creates a site audit and costs credits.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" } } },
    annotations: { readOnlyHint: false },
    classification: {
      mode: "mutation" as const,
      cost: "metered" as const,
      readOnly: false,
      destructive: false,
      requiresConfirmation: true,
    },
  },
];

describe("OpenSEO tool runner", () => {
  it("renders every discovered tool with the correct free or governed action", () => {
    const html = renderToStaticMarkup(
      <OpenSeoToolRunner tools={tools} projectId="project-42" onInvoke={vi.fn()} />,
    );

    expect(html).toContain("list_projects");
    expect(html).toContain("run_site_audit");
    expect(html).toContain("Run free read");
    expect(html).toContain("Review governed call");
  });

  it("prefills the selected project ID only for tools that ask for one", () => {
    expect(initialToolArguments(tools[0]!, "project-42")).toEqual({});
    expect(initialToolArguments(tools[1]!, "project-42")).toEqual({ project_id: "project-42" });
  });
});
