// Public API of the settings feature. Other code imports from "@/features/settings" only.
export { SettingsPage } from "./components/SettingsPage";
export { contrast, validateValues } from "./api/validate";
export { filterSettings } from "./api/search";
export { initialState, settingsReducer } from "./api/state";
export type { SettingsAction, SettingsState } from "./api/state";
export { COLOR_KEYS, ESSENTIAL_KEYS, sectionOfKey } from "./api/fields";
export { MOCK_CUSTOM_VALUES } from "./mock";
export type { CustomValues, Problem, SectionKey } from "./types";
