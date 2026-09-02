import { describe, expect, it } from "vitest";

import { Constants } from "@/integrations/supabase/types";
import { stateLabel, wordsFor } from "./state-labels";

describe("stateLabel", () => {
  it("has operator words for every value of every database enum", () => {
    for (const [enumName, values] of Object.entries(Constants.public.Enums)) {
      for (const value of values as readonly string[]) {
        const label = stateLabel(value);
        expect(label, `${enumName}.${value}`).not.toContain("_");
        expect(label, `${enumName}.${value}`).not.toBe("");
        expect(label.charAt(0), `${enumName}.${value}`).toBe(label.charAt(0).toUpperCase());
      }
    }
  });

  it("says what a state means rather than echoing its stored name", () => {
    expect(stateLabel("awaiting_approval")).toBe("Waiting for your approval");
    expect(stateLabel("needs_attention")).toBe("Needs your attention");
    expect(stateLabel("unknown")).toBe("Not checked");
    expect(stateLabel("on_success")).toBe("After the upstream step succeeds");
  });

  it("passes a caller's own phrase through with only its underscores gone", () => {
    expect(stateLabel("Company: Lead vendor")).toBe("Company: Lead vendor");
    expect(stateLabel("some_provider_value")).toBe("Some provider value");
    expect(wordsFor("")).toBe("");
    expect(stateLabel(null)).toBe("");
  });
});
