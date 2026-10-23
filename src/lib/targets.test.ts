import { describe, expect, it } from "vitest";
import { countActuals, pct } from "./targets";

const contracts = [
  { contract_date: "2026-10-01", sales_manager: "Doston Abduraxmonov", back_office_manager: "Saodat Rahimjonova" },
  { contract_date: "2026-10-31", sales_manager: " doston  abduraxmonov", back_office_manager: "Doston Abduraxmonov" },
  { contract_date: "2026-11-01", sales_manager: "Doston Abduraxmonov", back_office_manager: null },
  { contract_date: "2026-09-30", sales_manager: "Doston Abduraxmonov", back_office_manager: null },
];

describe("targets", () => {
  it("counts only contracts of the selected month", () => {
    expect(countActuals("Doston Abduraxmonov", contracts, 2026, 10)).toEqual({ sold: 2, docs: 1 });
  });
  it("counts back office documents separately", () => {
    expect(countActuals("Saodat Rahimjonova", contracts, 2026, 10)).toEqual({ sold: 0, docs: 1 });
  });
  it("percentage of target", () => {
    expect(pct(3, 10)).toBe(30);
    expect(pct(5, 0)).toBeNull();
  });
});
