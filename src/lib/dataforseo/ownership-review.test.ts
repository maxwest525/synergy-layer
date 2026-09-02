import { describe, expect, it } from "vitest";

import { describeMatchedFields, describeRegistrationMatch } from "./ownership-review";

describe("domain ownership review words", () => {
  it("says which detail matched and how many read domains share it", () => {
    expect(
      describeRegistrationMatch({
        field: "registrar",
        value: "NameCheap, Inc.",
        cohortCount: 2,
        cohortSize: 5,
      }),
    ).toBe("the same registrar (NameCheap, Inc.), shared by 2 of 5 read domains");
    expect(
      describeRegistrationMatch({ field: "createdDatetime", value: "2019-04-02 10:11:12" }),
    ).toBe("the same registration moment (2019-04-02 10:11:12)");
  });

  it("never invents a detail for a shape it does not recognise", () => {
    expect(describeRegistrationMatch(null)).toBe("a matched detail");
    expect(describeMatchedFields([])).toBe("no stored detail");
    expect(describeMatchedFields("x")).toBe("no stored detail");
  });
});
