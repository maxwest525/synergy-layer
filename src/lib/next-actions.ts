import type { TaxonomyGroupKey } from "./os-taxonomy";

/**
 * Everything the next-action rules are allowed to read. Every field is a count
 * or a stored string that came from a real row, so no rule can invent state.
 */
export type NextActionFacts = {
  property: { siteUrl: string; lastObservedAt: string | null } | null;
  gsc: { snapshots: number; latestDate: string | null; totalsDays: number };
  ga4: { snapshots: number; latestAt: string | null; lastError: string | null; configured: boolean };
  pagespeed: { attempts: number; failures: number; snapshots: number; latestError: string | null };
  umami: { snapshots: number; latestAt: string | null };
  keywords: { tracked: number; pendingCandidates: number };
  competitors: { tracked: number; pendingCandidates: number };
  changes: {
    total: number;
    proposed: number;
    approved: number;
    executing: number;
    verified: number;
    latestProposedId: string | null;
  };
  inbox: { pendingApproval: number; needsAttention: number };
  runs: { total: number; failed: number; queued: number; awaitingApproval: number; latestFailure: string | null };
  workflows: { registered: number; scheduled: number };
  recommendations: { proposed: number; observed: number };
  systems: { total: number; proven: number; configuredOnly: number; broken: number };
  coverage: {
    total: number;
    unowned: number;
    overdue: number;
    nextDue: { task: string; targetDate: string } | null;
  };
  measurement: { failedRuns: number; latestProvider: string | null; latestError: string | null };
};

export type NextActionRoute =
  | "/"
  | "/search"
  | "/ga4"
  | "/measurement"
  | "/keywords"
  | "/competitors"
  | "/changes"
  | "/recommendations"
  | "/workflows"
  | "/scheduler"
  | "/capabilities/systems"
  | "/spend"
  | "/assets"
  | "/seo-runs"
  | "/openseo"
  | "/essentials"
  | "/ask";

export type NextAction = {
  id: string;
  group: TaxonomyGroupKey;
  title: string;
  /** One sentence saying why this is next, phrased from stored counts. */
  reason: string;
  /** The stored rows the reason came from. */
  evidence: string;
  /** Set when the action cannot proceed until something else is fixed. */
  blockedBy: string | null;
  to: NextActionRoute;
  actionLabel: string;
  /** Lower sorts first. Blocked loops and waiting decisions rank highest. */
  weight: number;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Deterministic next-best-action pass. It reads only counts that came from
 * stored rows, so the page is useful with no model call and never claims work
 * that the evidence does not support.
 */
export function buildNextActions(facts: NextActionFacts): NextAction[] {
  const actions: NextAction[] = [];

  // Decisions: anything already waiting on a human.
  if (facts.changes.proposed > 0) {
    actions.push({
      id: "decide-page-changes",
      group: "decisions",
      title: "Approve or reject the proposed page changes",
      reason: `${plural(facts.changes.proposed, "page change")} is waiting on your yes or no and nothing moves until you decide.`,
      evidence: `${facts.changes.proposed} of ${facts.changes.total} change request(s) are in the proposed state.`,
      blockedBy: null,
      to: "/changes",
      actionLabel: "Review page changes",
      weight: 10,
    });
  }
  if (facts.keywords.pendingCandidates > 0) {
    actions.push({
      id: "decide-keywords",
      group: "decisions",
      title: "Review the pending keyword candidates",
      reason: `${plural(facts.keywords.pendingCandidates, "candidate")} cannot become tracked keywords until you accept or reject them.`,
      evidence: `${facts.keywords.pendingCandidates} keyword candidate row(s) in the pending review state, ${facts.keywords.tracked} keyword(s) tracked today.`,
      blockedBy: null,
      to: "/keywords",
      actionLabel: "Review keywords",
      weight: 20,
    });
  }
  if (facts.competitors.pendingCandidates > 0) {
    actions.push({
      id: "decide-competitors",
      group: "decisions",
      title: "Confirm which competitor candidates are real competitors",
      reason: `${plural(facts.competitors.pendingCandidates, "candidate")} is waiting to be confirmed or dismissed.`,
      evidence: `${facts.competitors.pendingCandidates} competitor candidate row(s) pending, ${facts.competitors.tracked} tracked.`,
      blockedBy: null,
      to: "/competitors",
      actionLabel: "Review competitors",
      weight: 30,
    });
  }
  if (facts.recommendations.proposed > 0) {
    actions.push({
      id: "decide-recommendations",
      group: "decisions",
      title: "Work through the proposed recommendations",
      reason: `${plural(facts.recommendations.proposed, "recommendation")} has been proposed and none of them act on their own.`,
      evidence: `${facts.recommendations.proposed} proposed, ${facts.recommendations.observed} observation only.`,
      blockedBy: null,
      to: "/recommendations",
      actionLabel: "Open recommendations",
      weight: 40,
    });
  }
  if (facts.changes.proposed === 0 && facts.gsc.snapshots > 0) {
    actions.push({
      id: "draft-change",
      group: "decisions",
      title: "Draft the next page change from stored search evidence",
      reason:
        "There is stored search evidence but nothing is currently waiting on a decision, so the loop has no next step.",
      evidence: `${plural(facts.gsc.snapshots, "Search Console snapshot")} stored, ${facts.changes.total} change request(s) ever created.`,
      blockedBy: null,
      to: "/ask",
      actionLabel: "Ask the agent to draft one",
      weight: 50,
    });
  }

  // Evidence: reads that would fill an empty list.
  if (facts.ga4.snapshots === 0) {
    actions.push({
      id: "evidence-ga4",
      group: "evidence",
      title: "Store the first analytics snapshot",
      reason: facts.ga4.lastError
        ? "The last analytics read failed, so no visit numbers are stored to compare against search performance."
        : "Analytics is configured but has never returned a stored read, so nothing here can be compared against search.",
      evidence: facts.ga4.lastError
        ? `0 stored snapshot(s). Last recorded error: ${facts.ga4.lastError}.`
        : `0 stored snapshot(s). Credentials ${facts.ga4.configured ? "are recorded" : "are not recorded"}.`,
      blockedBy: facts.ga4.configured ? null : "No analytics credential is recorded yet.",
      to: "/ga4",
      actionLabel: "Open analytics",
      weight: 60,
    });
  }
  if (facts.pagespeed.snapshots === 0) {
    actions.push({
      id: "evidence-pagespeed",
      group: "evidence",
      title: "Get one page speed measurement stored",
      reason:
        facts.pagespeed.attempts > 0
          ? "Every page speed attempt so far failed at the provider, so there is no measurement to act on."
          : "No page speed run has been attempted, so there is no measurement to act on.",
      evidence: `${facts.pagespeed.attempts} attempt(s), ${facts.pagespeed.failures} failed, 0 stored measurement(s).${facts.pagespeed.latestError ? ` Last error: ${facts.pagespeed.latestError}.` : ""}`,
      blockedBy: facts.pagespeed.failures > 0 ? "The last provider attempt failed." : null,
      to: "/measurement",
      actionLabel: "Open measurement",
      weight: 70,
    });
  }
  if (facts.gsc.snapshots === 0) {
    actions.push({
      id: "evidence-gsc",
      group: "evidence",
      title: "Store the first search performance read",
      reason: "No search snapshot is stored, so every decision downstream has nothing to rest on.",
      evidence: facts.property
        ? `Property ${facts.property.siteUrl} is selected, 0 snapshot(s) stored.`
        : "No property is selected for this workspace.",
      blockedBy: facts.property ? null : "No Search Console property is selected.",
      to: "/search",
      actionLabel: "Open search evidence",
      weight: 15,
    });
  } else if (facts.gsc.totalsDays < 28) {
    actions.push({
      id: "evidence-gsc-depth",
      group: "evidence",
      title: "Build up enough search history to compare periods",
      reason: `Only ${plural(facts.gsc.totalsDays, "finalized day")} of totals is stored, so before and after comparisons are not reliable yet.`,
      evidence: `${plural(facts.gsc.snapshots, "snapshot")} stored, latest finalized date ${facts.gsc.latestDate ?? "none"}.`,
      blockedBy: null,
      to: "/search",
      actionLabel: "Open search evidence",
      weight: 80,
    });
  }
  if (facts.keywords.tracked === 0 && facts.keywords.pendingCandidates === 0) {
    actions.push({
      id: "evidence-keywords",
      group: "evidence",
      title: "Produce keyword candidates to review",
      reason:
        "There are no tracked keywords and no candidates waiting, so the keyword loop has nothing entering it.",
      evidence: "0 tracked keyword(s), 0 pending candidate(s) stored.",
      blockedBy: "No keyword research run has stored candidates for this workspace.",
      to: "/keywords",
      actionLabel: "Open keywords",
      weight: 45,
    });
  }

  // Run work: the automations that produce evidence and apply changes.
  if (facts.changes.approved > 0) {
    actions.push({
      id: "run-approved-change",
      group: "run_work",
      title: "Execute the approved page changes",
      reason: `${plural(facts.changes.approved, "change")} has been approved and is waiting to be applied.`,
      evidence: `${facts.changes.approved} approved, ${facts.changes.executing} in flight, ${facts.changes.verified} verified.`,
      blockedBy: null,
      to: "/changes",
      actionLabel: "Open page changes",
      weight: 25,
    });
  }
  if (facts.runs.awaitingApproval > 0) {
    actions.push({
      id: "run-awaiting-approval",
      group: "run_work",
      title: "A workflow run is paused for approval",
      reason: `${plural(facts.runs.awaitingApproval, "run")} stopped at a step that mutates something and needs your approval to continue.`,
      evidence: `${facts.runs.awaitingApproval} run(s) in the awaiting approval state.`,
      blockedBy: null,
      to: "/workflows",
      actionLabel: "Open workflows",
      weight: 12,
    });
  }
  if (facts.runs.failed > 0) {
    actions.push({
      id: "run-failures",
      group: "run_work",
      title: "Clear the failed runs",
      reason: `${plural(facts.runs.failed, "run")} failed, so the evidence those runs produce is missing or stale.`,
      evidence: `${facts.runs.failed} failed of ${facts.runs.total} recorded run(s).${facts.runs.latestFailure ? ` Latest failure: ${facts.runs.latestFailure}.` : ""}`,
      blockedBy: null,
      to: "/workflows",
      actionLabel: "Open workflows",
      weight: 35,
    });
  }
  if (facts.workflows.scheduled === 0 && facts.workflows.registered > 0) {
    actions.push({
      id: "run-schedule",
      group: "run_work",
      title: "Put the observation workflows on a schedule",
      reason:
        "Workflows exist but nothing is scheduled, so evidence only appears when someone runs it by hand.",
      evidence: `${facts.workflows.registered} registered workflow(s), 0 active schedule(s).`,
      blockedBy: null,
      to: "/scheduler",
      actionLabel: "Open scheduler",
      weight: 65,
    });
  }

  // Coverage ownership: a concern nobody owns is work nobody will do.
  if (facts.coverage.overdue > 0) {
    actions.push({
      id: "coverage-overdue",
      group: "decisions",
      title: "Clear the overdue coverage concerns",
      reason: `${plural(facts.coverage.overdue, "concern")} passed the target date you set and is still not working.`,
      evidence: `${facts.coverage.overdue} overdue of ${facts.coverage.total} concern(s).${facts.coverage.nextDue ? ` Earliest target ${facts.coverage.nextDue.targetDate} on "${facts.coverage.nextDue.task}".` : ""}`,
      blockedBy: null,
      to: "/essentials",
      actionLabel: "Open coverage",
      weight: 18,
    });
  }
  if (facts.coverage.unowned > 0) {
    actions.push({
      id: "coverage-unowned",
      group: "decisions",
      title: "Assign an owner and target date to the unowned concerns",
      reason: `${plural(facts.coverage.unowned, "concern")} has nobody named against it, so nothing moves it forward.`,
      evidence: `${facts.coverage.unowned} of ${facts.coverage.total} concern(s) have no owner or no target date stored.`,
      blockedBy: null,
      to: "/essentials",
      actionLabel: "Assign owners",
      weight: 55,
    });
  }

  // Run work: an overnight read that failed leaves stale evidence behind.
  if (facts.measurement.failedRuns > 0) {
    actions.push({
      id: "run-measurement-failures",
      group: "run_work",
      title: "Retry the failed measurement runs",
      reason: `${plural(facts.measurement.failedRuns, "measurement run")} failed, so the evidence on those cards is stale rather than current.`,
      evidence: `${facts.measurement.failedRuns} failed run(s)${facts.measurement.latestProvider ? `, latest from ${facts.measurement.latestProvider}` : ""}.${facts.measurement.latestError ? ` Last error: ${facts.measurement.latestError}.` : ""}`,
      blockedBy: null,
      to: "/measurement",
      actionLabel: "Open measurement",
      weight: 22,
    });
  }

  // System health: only surfaced when something is actually wrong.
  if (facts.systems.broken > 0) {
    actions.push({
      id: "health-broken",
      group: "system_health",
      title: "Repair the connections that failed their last read",
      reason: `${plural(facts.systems.broken, "system")} recorded a real failure, and every loop downstream of them stalls.`,
      evidence: `${facts.systems.broken} broken, ${facts.systems.proven} proven, ${facts.systems.configuredOnly} configured but never proven, of ${facts.systems.total} catalogued.`,
      blockedBy: null,
      to: "/capabilities/systems",
      actionLabel: "Open systems",
      weight: 5,
    });
  }
  if (facts.systems.configuredOnly > 0) {
    actions.push({
      id: "health-unproven",
      group: "system_health",
      title: "Prove the systems that are only configured",
      reason: `${plural(facts.systems.configuredOnly, "system")} holds configuration but has never returned a stored read, so it counts for nothing yet.`,
      evidence: `${facts.systems.configuredOnly} configured only, ${facts.systems.proven} proven, of ${facts.systems.total} catalogued.`,
      blockedBy: null,
      to: "/capabilities/systems",
      actionLabel: "Open systems",
      weight: 75,
    });
  }

  return actions.sort((a, b) => a.weight - b.weight);
}

/** Named reasons for the lists that are empty, so a zero never looks like a bug. */
export type MissingReason = {
  id: string;
  group: TaxonomyGroupKey;
  label: string;
  reason: string;
  /** Imperative next step. Every missing line is an instruction, never a note. */
  instruction: string;
  to: NextActionRoute;
  actionLabel: string;
};

export function buildMissingReasons(facts: NextActionFacts): MissingReason[] {
  const missing: MissingReason[] = [];

  if (facts.keywords.tracked === 0 && facts.keywords.pendingCandidates === 0) {
    missing.push({
      id: "missing-keywords",
      group: "decisions",
      label: "No keyword candidates",
      reason:
        "No keyword research run has stored a candidate set for this workspace, so the list is empty rather than showing zero opportunity.",
      instruction: "Run keyword research to build the first candidate set.",
      to: "/keywords",
      actionLabel: "Run keyword research",
    });
  }
  if (facts.competitors.tracked === 0 && facts.competitors.pendingCandidates === 0) {
    missing.push({
      id: "missing-competitors",
      group: "decisions",
      label: "No competitors",
      reason:
        "No competitor derivation run has stored candidates, so AOOS makes no claim about who you compete with.",
      instruction: "Derive competitors from the selected property.",
      to: "/competitors",
      actionLabel: "Find competitors",
    });
  }
  if (facts.changes.total === 0) {
    missing.push({
      id: "missing-changes",
      group: "decisions",
      label: "No page changes proposed",
      reason:
        "No change request has ever been created, so the approval loop has not started once.",
      instruction: "Propose the first page change from stored search evidence.",
      to: "/changes",
      actionLabel: "Propose a change",
    });
  }
  if (facts.ga4.snapshots === 0) {
    missing.push({
      id: "missing-ga4",
      group: "evidence",
      label: "No analytics snapshots",
      reason: facts.ga4.lastError
        ? `Every analytics read failed. Last recorded error: ${facts.ga4.lastError}.`
        : "Analytics has never completed a stored read, so visit numbers are absent rather than zero.",
      instruction: "Refresh analytics now and store the first snapshot.",
      to: "/ga4",
      actionLabel: "Refresh analytics",
    });
  }
  if (facts.pagespeed.snapshots === 0) {
    missing.push({
      id: "missing-pagespeed",
      group: "evidence",
      label: "No page speed measurement",
      reason:
        facts.pagespeed.attempts > 0
          ? `${facts.pagespeed.attempts} attempt(s), all failed at the provider${facts.pagespeed.latestError ? `: ${facts.pagespeed.latestError}` : ""}.`
          : "No page speed run has been attempted yet.",
      instruction: "Fix the page speed provider key, then measure now.",
      to: "/measurement",
      actionLabel: "Measure page speed",
    });
  }
  if (facts.umami.snapshots === 0) {
    missing.push({
      id: "missing-umami",
      group: "evidence",
      label: "No self hosted traffic snapshots",
      reason: "The self hosted analytics reader has not stored a snapshot for this workspace yet.",
      instruction: "Run the self hosted traffic reader now.",
      to: "/measurement",
      actionLabel: "Read traffic",
    });
  }
  if (facts.gsc.snapshots === 0) {
    missing.push({
      id: "missing-gsc",
      group: "evidence",
      label: "No search performance",
      reason: facts.property
        ? `Property ${facts.property.siteUrl} is selected but no snapshot has been stored.`
        : "No Search Console property is selected for this workspace.",
      instruction: "Run a search performance read now.",
      to: "/search",
      actionLabel: "Read search performance",
    });
  }
  if (facts.runs.total === 0) {
    missing.push({
      id: "missing-runs",
      group: "run_work",
      label: "No workflow runs",
      reason: "Nothing has been run yet, so there is no run history to read.",
      instruction: "Run a registered workflow now.",
      to: "/workflows",
      actionLabel: "Run a workflow",
    });
  }
  if (facts.workflows.scheduled === 0) {
    missing.push({
      id: "missing-schedules",
      group: "run_work",
      label: "No active schedules",
      reason: "No schedule is active, so evidence only appears when someone runs a workflow by hand.",
      instruction: "Turn on a daily schedule now.",
      to: "/scheduler",
      actionLabel: "Set a schedule",
    });
  }
  if (facts.systems.proven === 0) {
    missing.push({
      id: "missing-proven",
      group: "system_health",
      label: "No proven connection",
      reason:
        "No catalogued system has a stored successful read, so every screen downstream is honestly empty.",
      instruction: "Connect one system and prove it with a real read.",
      to: "/capabilities/systems",
      actionLabel: "Connect a system",
    });
  }

  return missing;
}
