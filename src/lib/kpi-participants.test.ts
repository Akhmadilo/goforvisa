import { describe, expect, it } from "vitest";
import { resolveKpiNames, resolveKpiSettingsNames, participates } from "./kpi-participants";

describe("administrator-selected KPI participants", () => {
  it("keeps an unticked operator available after saving and allows reselecting them", () => {
    const legacy = { call_centre: ["B2B"] };
    const saved = JSON.parse(JSON.stringify({ call_centre: [] })) as { call_centre: string[] };
    expect(resolveKpiSettingsNames([], legacy, saved)).toEqual(["B2B"]);
    expect(participates("call_centre", saved, "B2B")).toBe(false);
    expect(resolveKpiNames("call_centre", saved, legacy.call_centre)).toEqual([]);
    const reselected = { ...saved, call_centre: ["B2B"] };
    expect(participates("call_centre", reselected, "B2B")).toBe(true);
  });
  it("keeps a differently spelled contract manager available without selecting them", () => {
    const employees = [{ full_name: "Madina Raxmatova", terminated_at: null }];
    const saved = { sales: [], back_office: [], call_centre: [], visa_bonus: [] };
    expect(resolveKpiSettingsNames(employees, { sales: ["Madina Rakhmatova"] }, saved))
      .toEqual(["Madina Rakhmatova", "Madina Raxmatova"]);
    expect(participates("sales", saved, "Madina Rakhmatova")).toBe(false);
  });
  it("deduplicates candidates and omits blank names", () => {
    expect(resolveKpiSettingsNames([], { sales: [" B2B ", "", "  "] }, { call_centre: ["b2b"] }))
      .toEqual(["b2b"]);
  });
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