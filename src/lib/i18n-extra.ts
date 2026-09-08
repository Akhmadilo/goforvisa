/**
 * Extra translation namespaces, merged into the main dictionary in i18n.tsx.
 * Kept in separate files so feature areas can grow without one huge file.
 */
import { cashflowDict } from "./i18n-cashflow";
import { hrDict } from "./i18n-hr";
import { adminDict } from "./i18n-admin";
import { chartsDict } from "./i18n-charts";
import { dashDict } from "./i18n-dash";
import { opsDict } from "./i18n-ops";
import { finesDict } from "./i18n-fines";
import { jarimaDict } from "./i18n-jarima";
import { hr2Dict } from "./i18n-hr2";

export type LangDict = Record<string, string>;
export type ExtraDict = { uz: LangDict; en: LangDict; ru: LangDict };

const parts: ExtraDict[] = [cashflowDict, hrDict, adminDict, chartsDict, dashDict, opsDict, finesDict, jarimaDict, hr2Dict];

export const extraDict: ExtraDict = {
  uz: Object.assign({}, ...parts.map((p) => p.uz)),
  en: Object.assign({}, ...parts.map((p) => p.en)),
  ru: Object.assign({}, ...parts.map((p) => p.ru)),
};
