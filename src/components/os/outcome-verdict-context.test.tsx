// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutcomeVerdictContext } from "./outcome-verdict-context";

describe("the verdict beside the verify control", () => {
  it("shows each graded reading in plain words, with its window and reason", () => {
    render(
      <OutcomeVerdictContext
        verdicts={[
          {
            windowDays: 28,
            verdict: "failure",
            reason: "Fell from 100 to 12 impressions, and clicks fell with it, from 20 to 0.",
          },
          {
            windowDays: 14,
            verdict: "success",
            reason: "Google has indexed this page and shown it 40 times.",
          },
        ]}
      />,
    );
    expect(screen.getByText("It did not work")).toBeInTheDocument();
    expect(screen.getByText("It worked")).toBeInTheDocument();
    expect(screen.getByText(/Fell from 100 to 12 impressions/)).toBeInTheDocument();
    expect(screen.getByText(/28 day reading/)).toBeInTheDocument();
    // The operator never sees a stored enum value.
    expect(screen.queryByText(/too_early|not_yet|failure/)).not.toBeInTheDocument();
  });

  it("prints the confidence a count-based verdict rests on, and nothing where none was computed", () => {
    render(
      <OutcomeVerdictContext
        verdicts={[
          {
            windowDays: 28,
            verdict: "success",
            reason: "Rose from 40 to 120 impressions.",
            confidence: { value: 0.62, band: "medium" },
          },
          { windowDays: 14, verdict: "too_early", reason: "Not closed yet.", confidence: null },
        ]}
      />,
    );
    expect(screen.getByText("Confidence 62% (medium).")).toBeInTheDocument();
    expect(screen.getAllByText(/Confidence/)).toHaveLength(1);
  });

  it("says the grading informs the decision without making it", () => {
    render(
      <OutcomeVerdictContext
        verdicts={[{ windowDays: 28, verdict: "neutral", reason: "No change yet." }]}
      />,
    );
    expect(screen.getByText(/your judgment/i)).toBeInTheDocument();
  });

  it("states the absence of a graded reading instead of rendering nothing", () => {
    render(<OutcomeVerdictContext verdicts={[]} />);
    expect(screen.getByText(/no reading .* graded/i)).toBeInTheDocument();
  });
});
