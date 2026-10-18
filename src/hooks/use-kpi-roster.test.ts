import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  useQuery: vi.fn((options: { queryFn: () => Promise<{ participants: { sales?: string[] } }> }) => options),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));

import { useKpiRoster } from "./use-kpi-roster";

describe("KPI roster tenant isolation", () => {
  it("reads all roster sources from the same current tenant used when saving", async () => {
    const scopes: Record<string, unknown[]> = {};
    mocks.rpc.mockResolvedValue({ data: "current-company", error: null });
    mocks.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => { scopes[table] = [column, value]; return chain; },
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: { business_rules: { kpi_participants: { sales: [] } } }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    });
    useKpiRoster();
    const options = mocks.useQuery.mock.calls[0]?.[0];
    if (!options) throw new Error("Roster query was not registered");
    const result = await options.queryFn();
    expect(mocks.rpc).toHaveBeenCalledWith("current_tenant_id");
    expect(scopes).toEqual({
      tenant_settings: ["tenant_id", "current-company"],
      employees: ["tenant_id", "current-company"],
      operators: ["tenant_id", "current-company"],
      contracts: ["tenant_id", "current-company"],
    });
    expect(result.participants.sales).toEqual([]);
  });
});