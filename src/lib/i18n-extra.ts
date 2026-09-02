/**
 * Extra translation namespaces, merged into the main dictionary in i18n.tsx.
 * Kept in separate files so feature areas can grow without one huge file.
 */
import { cashflowDict } from "./i18n-cashflow";
import { hrDict } from "./i18n-hr";
import { adminDict } from "./i18n-admin";

export type LangDict = Record<string, string>;
export type ExtraDict = { uz: LangDict; en: LangDict; ru: LangDict };

const parts: ExtraDict[] = [cashflowDict, hrDict, adminDict];

export const extraDict: ExtraDict = {
  uz: Object.assign({}, ...parts.map((p) => p.uz)),
  en: Object.assign({}, ...parts.map((p) => p.en)),
  ru: Object.assign({}, ...parts.map((p) => p.ru)),
};
