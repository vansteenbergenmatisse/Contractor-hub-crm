import { REMINDER_DAY_BEFORE } from "../mock";
import type { CalendarBusiness, CalendarState, Placement, Stop, StopKind } from "../types";
import { dayAria, DAYS, dayLong, dayShort, isPast, isToday, nowPosition, slotLabel, weekRangeLabel } from "./dates";
import { freeTimes, NEW_LEN } from "./free-times";
import { findStop, isMoved, liveStops, placementOf } from "./state";

// Everything the page shows, worked out from the state and `now`. Components only render it.

export const kindWord = (k: StopKind): "job" | "estimate" => (k === "J" ? "job" : "estimate");
export const kindName = (k: StopKind): "Job" | "Estimate" => (k === "J" ? "Job" : "Estimate");

// The website without https and www, for the booking link.
export function siteOf(url: string): string {
  return url.split("//").pop()!.split("/")[0].replace("www.", "");
}
// The booking link shown (without https://): the sub-account's own "request a job" link, else the
// website's /book page, else "" (nothing is made up).
export function bookingLink(business: CalendarBusiness): string {
  const own = business.bookingJobUrl?.trim();
  if (own) return own.replace(/^https?:\/\//i, "");
  const site = siteOf(business.business_website_url ?? "");
  return site ? `${site}/book` : "";
}

export function daySummary(items: ReadonlyArray<{ kind: StopKind }>): string {
  if (!items.length) return "Nothing booked";
  const e = items.filter((x) => x.kind === "E").length;
  const j = items.length - e;
  const parts = [e ? `${e} ${e === 1 ? "estimate" : "estimates"}` : "", j ? `${j} ${j === 1 ? "job" : "jobs"}` : ""].filter(Boolean);
  return `${items.length} ${items.length === 1 ? "stop" : "stops"}: ${parts.join(", ")}`;
}

// The free times offered for the open stop (reschedule) or the add sheet. At most 3.
export function rescheduleOptions(state: CalendarState, now: Date): Placement[] {
  const stop = findStop(state, state.selId);
  return stop ? rescheduleOptionsFor(state, now, stop) : [];
}

export function addOptions(state: CalendarState, now: Date): Placement[] {
  if (!state.add) return [];
  const rest = freeTimes({
    stops: liveStops(state).map((s) => ({ ...s, ...s.place })), kind: state.add.kind, len: NEW_LEN[state.add.kind], now,
    count: state.add.slot ? 2 : 3, avoid: state.add.slot ?? undefined,
  });
  return state.add.slot ? [state.add.slot, ...rest] : rest;
}

export type EventView = {
  id: string; cls: string; len: number; selected: boolean; added: boolean; kind: StopKind;
  start: string; end: string; name: string; service: string; address: string;
};

export type DayView = { index: number; cls: string; pressed: boolean; label: string; num: number };

export type DetailView = {
  open: boolean; cls: string; kind: string; kindCls: string; name: string; service: string; address: string; when: string; status: string; first: string;
  moveCls: string; moveText: string; canReschedule: boolean; rescheduleCls: string; pickCls: string;
  options: Array<{ cls: string; text: string; place: Placement | null }>;
};

export type CalendarViewModel = {
  calCls: string; gridCls: string; weekText: string; dayText: string; dayTitle: string; daySummary: string; emptyCls: string;
  days: DayView[]; events: EventView[]; detail: DetailView;
  arrows: { prev: { cls: string; label: string }; next: { cls: string; label: string }; prevWeekCls: string; nextWeekCls: string };
  segThumb: string; seg: { week: { cls: string; pressed: boolean }; day: { cls: string; pressed: boolean } };
  now: { row: number; column: number; label: string } | null;
  hideTenAm: boolean;
  added: { open: boolean; text: string; name: string } | null;
  confirm: { open: boolean; title: string; body: string; canReschedule: boolean; yesText: string };
  undoDelete: { open: boolean; text: string };
  add: { open: boolean; title: string; error: string; options: Array<{ text: string; place: Placement }> };
  booking: { link: string; hours: string; copyText: string };
};

export function buildView(state: CalendarState, now: Date, business: CalendarBusiness): CalendarViewModel {
  const s = state;
  const weekView = s.view === "week";
  const live = liveStops(s);
  const inWeek = live.filter((x) => x.place.week === s.wk);
  const has = [0, 0, 0, 0, 0, 0, 0];
  inWeek.forEach((x) => { has[x.place.day] += 1; });
  const parity = s.bumps % 2 ? "-a" : "-b";

  const events: EventView[] = inWeek.map((x) => {
    const p = x.place;
    const over = !x.added && isPast(now, p, x.len);
    const cls = `fd-ev${x.added ? " fd-evn" : ""} is-${x.kind} is-d${p.day} is-t${p.start} is-l${x.len}`
      + (over ? " is-past" : "") + (s.selId === x.id ? " is-sel" : "") + (s.ev === "rs" && s.selId === x.id && !x.added ? ` is-new${parity}` : "");
    return {
      id: x.id, cls, len: x.len, selected: s.selId === x.id, added: !!x.added, kind: x.kind,
      start: slotLabel(p.start), end: slotLabel(p.start + x.len), name: x.name, service: x.service ?? "", address: x.address ?? "",
    };
  });

  const days: DayView[] = DAYS.map((_, d) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7 * s.wk + d);
    return {
      index: d,
      cls: `fd-cday${isToday(now, s.wk, d) ? " is-today" : ""}${s.sd === d ? " is-on" : ""}${has[d] ? " is-has" : ""}`,
      pressed: s.sd === d, label: dayAria(now, s.wk, d, has[d]), num: date.getDate(),
    };
  });

  const mine = inWeek.filter((x) => x.place.day === s.sd);
  const today = isToday(now, s.wk, s.sd);
  const dayText = dayLong(now, s.wk, s.sd);

  // The stop that is open. A stop you added has no panel, only a short line with Delete.
  const sel = findStop(s, s.selId);
  const selLive = sel && !s.deleted[sel.id] ? sel : undefined;
  const panelStop: Stop | undefined = selLive && !selLive.added ? selLive : undefined;
  const p = panelStop ? placementOf(s, panelStop) : null;
  const options = panelStop ? rescheduleOptions(s, now) : [];
  const moved = panelStop ? isMoved(s, panelStop.id) : false;
  const canMove = !!panelStop && !!p && (!isPast(now, p, panelStop.len) || moved);
  const last = s.lastMove;
  const showMove = !!panelStop && !!last && last.id === panelStop.id;
  const detail: DetailView = {
    open: !!panelStop,
    cls: `fd-cdet${panelStop && p ? ` is-on is-o${p.start}${p.day >= 4 ? " is-left" : ""}` : " is-off"}`,
    kind: panelStop ? kindName(panelStop.kind) : "",
    kindCls: `fd-kind ${panelStop?.kind === "J" ? "is-job" : "is-estimate"}`,
    name: panelStop?.name ?? "", service: panelStop?.service ?? "", address: panelStop?.address ?? "",
    when: panelStop && p ? `${dayShort(now, p.week, p.day)} · ${slotLabel(p.start)} to ${slotLabel(p.start + panelStop.len)}` : "",
    status: panelStop && p ? (moved ? REMINDER_DAY_BEFORE : isPast(now, p, panelStop.len) ? (panelStop.kind === "J" ? "This job day is over" : "This visit is over") : (panelStop.status ?? REMINDER_DAY_BEFORE)) : "",
    first: panelStop ? panelStop.name.split(" ")[0] : "",
    moveCls: `fd-dmv${showMove ? "" : " is-off"}`,
    // Phase 2: this is a line on screen only. Nothing is texted.
    moveText: showMove && panelStop && last ? `Moved from ${dayShort(now, last.from.week, last.from.day)}, ${slotLabel(last.from.start)}. ${panelStop.name.split(" ")[0]} got a text.` : "",
    canReschedule: canMove && !s.picking && options.length > 0,
    rescheduleCls: `fd-btn fd-drs${canMove && !s.picking && options.length ? "" : " is-off"}`,
    pickCls: `fd-dpk${canMove && s.picking ? "" : " is-off"}`,
    options: [0, 1, 2].map((k) => {
      const o = options[k];
      return { cls: `fd-btn is-plain fd-dsl${o ? "" : " is-off"}`, text: o ? `${dayShort(now, o.week, o.day)} · ${slotLabel(o.start)}` : "", place: o ?? null };
    }),
  };

  const addedSel = selLive?.added ? selLive : undefined;
  const ap = addedSel ? placementOf(s, addedSel) : null;
  const added = addedSel && ap ? { open: true, text: `${kindName(addedSel.kind)} for ${addedSel.name} · ${dayShort(now, ap.week, ap.day)} · ${slotLabel(ap.start)}`, name: addedSel.name } : null;

  const conf = findStop(s, s.confirmId);
  const confP = conf ? placementOf(s, conf) : null;
  const confCanRs = !!conf && !conf.added && !!confP && (!isPast(now, confP, conf.len) || isMoved(s, conf.id)) && rescheduleOptionsFor(s, now, conf).length > 0;
  const confirm = {
    open: !!conf,
    title: conf ? `Delete the ${kindWord(conf.kind)} for ${conf.name}?` : "",
    body: conf ? `${conf.name.split(" ")[0] || "The customer"} loses the spot${confP ? ` on ${dayShort(now, confP.week, confP.day)} at ${slotLabel(confP.start)}` : ""}.${confCanRs ? " Wrong time? Reschedule keeps the booking." : ""}` : "",
    canReschedule: confCanRs,
    yesText: `Delete ${conf ? kindWord(conf.kind) : "stop"}`,
  };

  const ld = s.lastDelete;
  const add = {
    open: !!s.add, title: s.add?.kind === "J" ? "New job" : "New estimate", error: s.addError,
    options: addOptions(s, now).map((place) => ({ place, text: `${dayShort(now, place.week, place.day)} · ${slotLabel(place.start)}` })),
  };

  const arrow = (prev: boolean, cls: string) => `fd-ibtn fd-carr${prev ? " fd-cprev" : ""} ${cls}`;
  const np = nowPosition(now);
  const showNow = s.wk === 0 && weekView && np !== null;
  return {
    calCls: `fd-cal${s.wk === 0 ? " is-w1" : ""} is-sd${s.sd}${weekView ? "" : " is-day"}`,
    gridCls: `fd-cg${s.ev === "nav" || s.ev === "view" || (s.ev === "rs" && s.sw) ? ` is-sw${s.sw % 2 ? "-a" : "-b"}` : ""}`,
    weekText: weekRangeLabel(now, s.wk), dayText,
    dayTitle: dayText + (today ? " · Today" : ""),
    daySummary: daySummary(mine),
    emptyCls: `fd-cempty${mine.length ? " is-off" : ""}`,
    days, events, detail,
    arrows: {
      prev: { cls: arrow(true, "fd-cdesk"), label: weekView ? "The week before" : "The day before" },
      next: { cls: arrow(false, "fd-cdesk"), label: weekView ? "The week after" : "The day after" },
      prevWeekCls: arrow(true, "fd-cphone"), nextWeekCls: arrow(false, "fd-cphone"),
    },
    segThumb: `fd-cst${weekView ? "" : " is-day"}`,
    seg: { week: { cls: `fd-csb${weekView ? " is-on" : ""}`, pressed: weekView }, day: { cls: `fd-csb${weekView ? "" : " is-on"}`, pressed: !weekView } },
    now: showNow && np ? { row: np.row, column: np.column, label: np.label } : null,
    // The design hides the 10 AM label because its now line sits there; keep that only when it does.
    hideTenAm: showNow && np?.row === 7,
    added,
    confirm,
    undoDelete: { open: !!ld, text: ld ? `Deleted the ${kindWord(ld.kind)} for ${ld.name}.` : "" },
    add,
    booking: { link: bookingLink(business), hours: business.business_hours, copyText: s.linkCopied ? "Copied" : "Copy link" },
  };
}

function rescheduleOptionsFor(state: CalendarState, now: Date, stop: Stop): Placement[] {
  return freeTimes({ stops: liveStops(state).map((x) => ({ ...x, ...x.place })), kind: stop.kind, len: stop.len, now, ignoreId: stop.id, avoid: placementOf(state, stop) });
}
