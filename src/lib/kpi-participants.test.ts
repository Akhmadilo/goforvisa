import { describe, expect, it } from "vitest";
import { resolveKpiNames, participates } from "./kpi-participants";

describe("administrator-selected KPI participants", () => {
  it("includes a new employee without contracts", () => {
    expect(resolveKpiNames("sales", { sales: ["Jumayeva Mahbuba"] }, [])).toEqual(["Jumayeva Mahbuba"]);
  });
  it("excludes deselected staff from calculation", () => {
    expect(participates("sales", { sales: ["Jumayeva Mahbuba"] }, "Doston Abduraxmonov")).toBe(false);
  });
  it("an explicitly empty selection disables the role", () => {
    expect(resolveKpiNames("sales", { sales: [] }, ["Doston Abduraxmonov"])).toEqual([]);
  });
  it("preserves legacy participation until configured", () => {
    expect(participates("sales", {}, "Doston Abduraxmonov")).toBe(true);
  });
});