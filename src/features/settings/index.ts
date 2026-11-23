// Public API of the settings feature. Other code imports from "@/features/settings" only.
export { SettingsPage } from "./components/SettingsPage";
export { contrast, validateValues } from "./api/validate";
export { filterSettings } from "./api/search";
export { initialState, settingsReducer } from "./api/state";
export type { SettingsAction, SettingsState } from "./api/state";
export { COLOR_KEYS, ESSENTIAL_KEYS, LINK_KEYS, labelOfKey, sectionOfKey } from "./api/fields";
export { MOCK_CUSTOM_VALUES } from "./mock";
export { MAX_VALUE_LENGTH, isKeyAllowedBy, isSettingsKeyAllowed, settingsValuesFrom } from "./api/allowlist";
export { loadSettingsValues } from "./api/load-values";
export type { AccountLayout } from "./api/load-values";
export { NOT_AVAILABLE, UNKNOWN_CONNECTIONS, connectionChip } from "./api/connections";
export { sectionFromParam } from "./api/section-param";
export { applyBrandVars, brandCssVars, brandScopeRule, businessPatchFromValues, safeHttpsUrl } from "./api/live-save";
export type { BusinessPatch } from "./api/live-save";
export type { ConnectionState, ConnectionStatus, CustomValues, Problem, SectionKey } from "./types";
export type { SaveAnswer, SaveResult, SaveStatus, SaveValues, ValueChange } from "./types";
