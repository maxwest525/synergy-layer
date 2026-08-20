// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { queueKeyAction } from "./queue-keys";

describe("queueKeyAction", () => {
  const base = { count: 3, selected: null, typing: false } as const;

  it("selects the first card on the first step", () => {
    expect(queueKeyAction("j", base)).toEqual({ kind: "select", index: 0 });
    expect(queueKeyAction("k", base)).toEqual({ kind: "select", index: 0 });
  });

  it("steps down and up without running off either end", () => {
    expect(queueKeyAction("j", { ...base, selected: 0 })).toEqual({ kind: "select", index: 1 });
    expect(queueKeyAction("j", { ...base, selected: 2 })).toEqual({ kind: "select", index: 2 });
    expect(queueKeyAction("k", { ...base, selected: 0 })).toEqual({ kind: "select", index: 0 });
  });

  it("does not act when nothing is selected", () => {
    // Enter approving the first card the operator never chose would be a real
    // accident, on a control that changes their live site.
    expect(queueKeyAction("Enter", base)).toBeNull();
    expect(queueKeyAction("i", base)).toBeNull();
  });

  it("approves and ignores the selected card", () => {
    expect(queueKeyAction("Enter", { ...base, selected: 1 })).toEqual({
      kind: "approve",
      index: 1,
    });
    expect(queueKeyAction("i", { ...base, selected: 1 })).toEqual({ kind: "ignore", index: 1 });
  });

  it("keeps its hands off the keyboard while the operator is typing", () => {
    for (const key of ["j", "k", "Enter", "i"]) {
      expect(queueKeyAction(key, { count: 3, selected: 1, typing: true })).toBeNull();
    }
  });

  it("claims no key it does not own", () => {
    expect(queueKeyAction("x", { ...base, selected: 1 })).toBeNull();
    expect(queueKeyAction("Tab", { ...base, selected: 1 })).toBeNull();
  });

  it("does nothing at all when the queue is empty", () => {
    expect(queueKeyAction("j", { count: 0, selected: null, typing: false })).toBeNull();
  });
});

/** A minimum queue, wired the way the real one will be. */
function Queue({ onApprove }: { onApprove: (index: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const titles = ["First fix", "Second fix", "Third fix"];

  return (
    <div
      // The queue has to be focusable or the keystrokes never reach it: they
      // land on document.body and no React handler ever sees them. The real
      // component needs this too.
      tabIndex={-1}
      data-testid="queue"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const action = queueKeyAction(event.key, { count: titles.length, selected, typing });
        if (!action) return;
        event.preventDefault();
        if (action.kind === "select") setSelected(action.index);
        if (action.kind === "approve") onApprove(action.index);
      }}
    >
      <input aria-label="Notes" />
      {titles.map((title, index) => (
        <article key={title} aria-current={index === selected ? "true" : undefined}>
          {title}
        </article>
      ))}
    </div>
  );
}

describe("the queue in a browser", () => {
  it("steps through cards with j and approves with Enter", async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<Queue onApprove={onApprove} />);

    screen.getByTestId("queue").focus();
    await user.keyboard("jj");
    expect(screen.getByText("Second fix")).toHaveAttribute("aria-current", "true");

    await user.keyboard("{Enter}");
    expect(onApprove).toHaveBeenCalledWith(1);
  });

  it("lets the operator type a j into a note without stepping the queue", async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<Queue onApprove={onApprove} />);

    await user.click(screen.getByLabelText("Notes"));
    await user.keyboard("jjj");

    expect(screen.getByLabelText("Notes")).toHaveValue("jjj");
    expect(screen.getByText("First fix")).not.toHaveAttribute("aria-current");
    expect(onApprove).not.toHaveBeenCalled();
  });
});
