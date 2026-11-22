// Pure page logic for Automations. No fetch, no timers, no storage: the page is a window onto the
// sub-account's HighLevel workflows, and in Phase 2 every change stays in local state.
import { fillFacts } from "@/shared/lib/fill-facts";
import { MOCK_FOLDERS } from "../mock";
import type { Automation, Draft, FolderGroup, PageState, Who } from "../types";

export const WHEN = ["A new lead comes in", "A lead waits an hour", "A lead stays quiet", "An estimate is booked", "A visit is done", "A quote is sent", "A quote is accepted", "A job is booked", "A job is marked done", "An invoice is sent", "A card moves to Check Back Later", "A card moves to Lost", "You start it", "Every 3 to 4 months", "A customer books on your booking link"] as const;
export const WAIT = ["At once", "After 1 hour", "The day before", "24 hours and 1 hour before", "Day 2, 4, 7 and 14", "Day 2, 6, 12 and 25", "Day 3, 7 and 14", "Every 1 to 3 months", "The day after"] as const;
export const STOP = ["It runs once", "You call or text back", "The customer replies", "The customer books or replies", "The visit is done or cancelled", "The customer accepts or the quote is lost", "The invoice is paid", "The customer asks to stop"] as const;

export const NEW_TARGET = "new";
export const MADE_BY_YOU = "Made by you";
// The sample holds two new automations (the design's limit).
export const MAX_NEW = 2;

export function initialState(items: Automation[]): PageState {
  return { items, edit: null, conf: null, last: null, err: "", test: false };
}

export const emptyDraft = (): Draft => ({ name: "", when: 0, wait: 0, msg: "", stop: 0 });

export function draftOf(a: Automation): Draft {
  return { name: a.name, when: a.when, wait: a.wait, msg: a.msg, stop: a.stop };
}

const patch = (items: Automation[], id: string, change: Partial<Automation>) =>
  items.map((a) => (a.id === id ? { ...a, ...change } : a));

// The switch. In HighLevel later: publish and draft. Here it flips local state.
export function toggle(s: PageState, id: string): PageState {
  const a = s.items.find((x) => x.id === id);
  return a ? { ...s, items: patch(s.items, id, { on: !a.on }) } : s;
}

export function openEdit(s: PageState, id: string): PageState {
  return { ...s, edit: id, conf: null, err: "", test: false };
}

export function openNew(s: PageState): PageState {
  return { ...s, edit: NEW_TARGET, conf: null, err: "", test: false };
}

export function closeEdit(s: PageState): PageState {
  return { ...s, edit: null, err: "", test: false };
}

export function askRemove(s: PageState, id: string): PageState {
  return { ...s, conf: id };
}

export function keep(s: PageState): PageState {
  return { ...s, conf: null };
}

export function remove(s: PageState, id: string): PageState {
  return { ...s, items: patch(s.items, id, { gone: true }), conf: null, last: id, edit: s.edit === id ? null : s.edit };
}

export function undo(s: PageState): PageState {
  return s.last ? { ...s, items: patch(s.items, s.last, { gone: false }), last: null } : s;
}

export function sendTest(s: PageState): PageState {
  return { ...s, test: true };
}

const doesLine = (wait: number) => `Your text goes out: ${(WAIT[wait] ?? WAIT[0]).toLowerCase()}.`;

// Save the editor. A name is required; the rest has a valid default.
export function save(s: PageState, draft: Draft): PageState {
  const name = draft.name.trim();
  if (!name) return { ...s, err: "Give it a name." };
  const fields = { name, when: draft.when, wait: draft.wait, stop: draft.stop, msg: draft.msg };
  if (s.edit === NEW_TARGET) {
    const made = s.items.filter((a) => a.mine).length;
    if (made >= MAX_NEW) return { ...s, err: "This sample holds two new automations." };
    const item: Automation = {
      ...fields, id: `wf-new-${made + 1}`, folder: MADE_BY_YOU, does: doesLine(fields.wait), who: "auto", ran: -1,
      on: true, gone: false, mine: true, changed: false,
    };
    return { ...s, items: [...s.items, item], edit: null, err: "", test: false };
  }
  const old = s.items.find((a) => a.id === s.edit);
  if (!old) return { ...s, edit: null, err: "", test: false };
  const does = old.mine || fields.wait !== old.wait ? doesLine(fields.wait) : old.does;
  return { ...s, items: patch(s.items, old.id, { ...fields, does, changed: true }), edit: null, err: "", test: false };
}

export function live(items: Automation[]): Automation[] {
  return items.filter((a) => !a.gone);
}

export function totals(items: Automation[]) {
  const l = live(items);
  const on = l.filter((a) => a.on).length;
  return { on, off: l.length - on, all: l.length };
}

// Rows grouped by HighLevel workflow folder, in folder order, then "Made by you". Removed rows and
// empty folders do not show.
export function groupByFolder(items: Automation[]): FolderGroup[] {
  const l = live(items);
  const order: string[] = [...MOCK_FOLDERS, MADE_BY_YOU];
  const extra = [...new Set(l.map((a) => a.folder))].filter((f) => !order.includes(f));
  return [...order, ...extra]
    .map((folder) => ({ folder, items: l.filter((a) => a.folder === folder) }))
    .filter((g) => g.items.length > 0);
}

export function whoLabel(who: Who): string {
  return who === "ok" ? "Waits for your OK" : who === "you" ? "You start it" : "Runs on its own";
}

// How often it ran this week, or why there is no count.
export function runLabel(a: Automation): string {
  if (!a.on) return "Off. Nothing goes out.";
  if (a.changed) return "Changed by you just now";
  if (a.ran < 0) return "New. Not run yet.";
  if (a.who === "you") return "Not started yet";
  return `Ran ${a.ran} ${a.ran === 1 ? "time" : "times"} this week`;
}

// The business details a text may use, from the signed-in sub-account ("" when it has no value).
// `review_url` is its Google review link. Other {tokens} stay as they are. The seasonal offer and the
// referral reward are optional custom values.
export type AutomationBusiness = {
  business_name: string;
  business_owner_name: string;
  business_main_keyword: string;
  business_phone_number: string;
  review_url: string;
  seasonal_offer_text?: string;
  referral_reward_text?: string;
};

// {seasonal offer} and {referral reward}: the tenant's text (custom values seasonal_offer_text and
// referral_reward_text), as the design fills them. When a value is missing the token is left out
// with its quotes and lead-in, so the line never shows raw braces, a placeholder note or a made-up
// offer: 'Texts old leads your seasonal offer: "{seasonal offer}"' reads "Texts old leads your seasonal offer.".
function fillOffers(text: string, business: AutomationBusiness): string {
  const one = (out: string, token: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (v) return out.replace(new RegExp(`"\\{${token}\\}"|\\{${token}\\}`, "g"), (m) => (m.startsWith('"') ? `"${v}"` : v));
    const cut = out.replace(new RegExp(`\\s*:?\\s*"?\\{${token}\\}"?`, "g"), "");
    if (cut === out) return out;
    const tidy = cut.replace(/[\s,:]+$/, "");
    return /[A-Za-z0-9]$/.test(tidy) ? `${tidy}.` : tidy;
  };
  return one(one(text, "seasonal offer", business.seasonal_offer_text), "referral reward", business.referral_reward_text);
}

// The Does line of a row as shown.
export function doesText(does: string, business: AutomationBusiness): string {
  return fillOffers(does, business);
}

// After the editor closes: the row to return to. The edited row, or the row a new automation made;
// null for a cancelled new one, a removed row, or when nothing was open.
export function returnTarget(prevEdit: string | null, prevItems: Automation[], items: Automation[]): string | null {
  if (prevEdit === null) return null;
  if (prevEdit === NEW_TARGET) {
    const before = new Set(prevItems.map((a) => a.id));
    return items.find((a) => !before.has(a.id))?.id ?? null;
  }
  return items.some((a) => a.id === prevEdit && !a.gone) ? prevEdit : null;
}

// A missing name reads "our team"; a missing keyword is left out; a missing review link keeps its token.
export function fillBusiness(text: string, business: AutomationBusiness): string {
  return fillFacts(text, {
    businessToken: "business",
    personToken: "owner",
    business: business.business_name,
    person: business.business_owner_name,
    values: { "main keyword": business.business_main_keyword, ...(business.review_url ? { "review link": business.review_url } : {}) },
  });
}

// "Send me a test": the line shown on screen. Nothing is sent.
export function testLine(msg: string, business: AutomationBusiness): string {
  const phone = business.business_phone_number.trim();
  const base = `Would text the business phone${phone ? `, ${phone}` : ""}. Nothing is sent in this preview.`;
  const text = fillBusiness(fillOffers(msg, business), business).trim();
  return text ? `${base} The text reads: ${text}` : base;
}
