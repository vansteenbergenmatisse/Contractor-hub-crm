"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requestNewLead } from "@/shared/lib/new-lead-event";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { MENU_GROUPS, PAGE_PATH, PAGE_TITLE, TAB_PAGES, pageFromPath } from "../nav";
import { addToOverride, dropExpiredOverride, nextOverrideExpiry, patchBusiness, settleOverride, type BusinessOverride } from "../api/business";
import { ROW_PICK_EVENT, mergeSearchRows, rowParam, sameRows } from "../api/search";
import { createFocusReturn, focusables, isShown, viewClass } from "../api/focus";
import { detectMac, findUndo, isTyping, moveRow, shortcutFor } from "../api/keys";
import { clearLiveBrand, customProps } from "../api/brand-cleanup";
import { signOut } from "../api/sign-out";
import { SHEET_SELECTOR, clearSheetStyle, findBack, isPhone, press, pressSheetClose, sheetOnTop } from "../api/gestures";
import { useDialog } from "../hooks/use-dialog";
import { UndoContext, createUndoRegistry } from "../hooks/use-undo-shortcut";
import { useSheetSwipe } from "../hooks/use-sheet-swipe";
import { useEdgeSwipe } from "../hooks/use-edge-swipe";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import type { Business, PageKey, ReasonRequest, SearchRow, SendTimerRequest } from "../types";
import { FeedbackSheet } from "./FeedbackSheet";
import { useGestures } from "./GestureLayer";
import { Icon } from "./Icon";
import { PageStateProvider } from "./PageState";
import { ReasonDialog } from "./ReasonDialog";
import { SearchSheet } from "./SearchSheet";
import { SendTimerDialog } from "./SendTimerDialog";
import { ShortcutHelp } from "./ShortcutHelp";
import { ShellContext, type ShellApi } from "./ShellContext";

const noSubscribe = () => () => {};

export type ShellFrameProps = {
  business: Business;
  searchRows: readonly SearchRow[];
  initialInboxCount?: number;
  children: ReactNode;
  said: string;
  onSay: (text: string) => void;
};

// The frame itself (AppShell wraps it in the gesture layer).
export function ShellFrame({ business: serverBusiness, searchRows, initialInboxCount = 0, children, said, onSay: setSaid }: ShellFrameProps) {
  const router = useRouter();
  const gestures = useGestures();
  const page: PageKey = pageFromPath(usePathname() ?? "/");
  // The tab or menu item lights up on tap while the page loads. Only the highlight uses it:
  // aria-current and the view stay on the page that is really open.
  const [shownPage, setShownPage] = useOptimistic(page);
  const [, startNav] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const refreshDone = useRef<((ok: boolean) => void) | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [search, setSearch] = useState(false);
  const [actions, setActions] = useState<Record<string, { node: ReactNode; hidden: boolean }>>({});
  const [pushed, setPushedState] = useState<Record<string, boolean>>({});
  const [send, setSend] = useState<{ id: number; request: SendTimerRequest } | null>(null);
  const sendCount = useRef(0);
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const [inboxCount, setInboxCount] = useState(initialInboxCount);
  const [inboxPartial, setInboxPartial] = useState(false);
  // Phone top bar (design `uxTtl`): glass once the page scrolls (`sc`), the page title in it once the
  // page's large title has passed under the bar (`ttl`).
  const [bar, setBar] = useState({ sc: false, ttl: false });
  // Search rows handed in (useSearchRows), by page; they replace the layout's rows for it. The newest
  // hand-in wins. `seed` remembers the last seed, so coming back to Today with the same one keeps what the
  // page itself handed in since. This state dies with the frame, which is keyed by user and tenant.
  const [handedRows, setHandedRows] = useState<Partial<Record<SearchRow["page"], { rows: readonly SearchRow[]; seed?: readonly SearchRow[] }>>>({});
  const liveRows = useMemo(() => {
    const byPage: Partial<Record<SearchRow["page"], readonly SearchRow[]>> = {};
    for (const key of Object.keys(handedRows) as SearchRow["page"][]) byPage[key] = handedRows[key]?.rows;
    return mergeSearchRows(searchRows, byPage);
  }, [searchRows, handedRows]);
  const [entered, setEntered] = useState(false);
  // Saved Settings values on screen until the server shows a different value for that field.
  const [storedOverride, setOverride] = useState<BusinessOverride>(() => ({ patch: {}, base: serverBusiness, savedAt: {} }));
  const override = settleOverride(storedOverride, serverBusiness);
  if (override !== storedOverride) setOverride(override);
  const business = useMemo(() => patchBusiness(serverBusiness, override.patch), [serverBusiness, override.patch]);
  // At its age limit a held value goes in the same transition as a fresh server render, so a save the
  // server does hold never flashes back to the old value.
  useEffect(() => {
    const at = nextOverrideExpiry(override);
    if (at === null) return;
    const timer = setTimeout(() => {
      startNav(() => {
        router.refresh();
        setOverride((current) => dropExpiredOverride(current, at));
      });
    }, Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [override, router, startNav]);
  const [drawerBack] = useState(createFocusReturn);
  const [feedbackBack] = useState(createFocusReturn);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  // Recent searches live here, not in the search sheet, so they survive closing it (design `uxRecent`).
  const [recent, setRecent] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  // Off a Mac the shortcut hints say Ctrl (design `uxMac`); the server and hydration assume a Mac.
  const mac = useSyncExternalStore(noSubscribe, detectMac, () => true);
  const [skipShown, setSkipShown] = useState(false);
  const [undo] = useState(createUndoRegistry);

  // A new page starts with the menu and the feedback sheet closed (state adjusted while rendering).
  const [seenPage, setSeenPage] = useState(page);
  if (seenPage !== page) {
    setSeenPage(page);
    setDrawer(false);
    setFeedback(false);
    setBar({ sc: false, ttl: false });
    setEntered(false);
  }

  // The open menu drawer takes focus on its close button (or its first item where that is hidden).
  useEffect(() => {
    if (!drawer) return;
    const id = setTimeout(() => {
      const close = drawerClose.current;
      const target = close && isShown(close) ? close : navRef.current ? focusables(navRef.current)[0] : null;
      target?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [drawer]);

  // The spoken line clears after 4s, so the same words can be said again.
  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(""), 4000);
    return () => clearTimeout(id);
  }, [said, setSaid]);

  // The design's keyboard shortcuts (logic `uxKeys`). Sheets catch Escape and Tab themselves.
  const keys = useRef({ search, help, page });
  useEffect(() => {
    keys.current = { search, help, page };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = keys.current;
      // An open row menu takes the keyboard: only Escape, which the gesture layer handles (design `uxKeys`).
      if (now.search || now.help || gestures.isMenuOpen() || event.defaultPrevented) return;
      const action = shortcutFor(event, isTyping(event.target));
      if (action === "search") {
        event.preventDefault();
        setDrawer(false);
        drawerBack.forget();
        setSearch(true);
      } else if (action === "help") {
        event.preventDefault();
        setDrawer(false);
        drawerBack.forget();
        setHelp(true);
      } else if (action === "settings") {
        event.preventDefault();
        router.push(PAGE_PATH.settings);
      } else if (action === "newLead") {
        event.preventDefault();
        if (!requestNewLead()) router.push(`${PAGE_PATH.leads}?add=1`);
      } else if (action === "undo") {
        const registered = undo.top();
        const button = registered ? null : findUndo(document.querySelector(`[data-pg="${now.page}"]`));
        if (!registered && !button) return;
        event.preventDefault();
        if (registered) registered();
        else button?.click();
        setSaid("Undone.");
      } else if (action === "rowDown" || action === "rowUp") {
        if (moveRow(event.target, action === "rowDown" ? 1 : -1)) event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerBack, gestures, router, undo, setSaid]);

  // The form opens over the current page. Without it mounted, the Leads page opens it.
  const openNewLead = () => {
    if (!requestNewLead()) router.push(`${PAGE_PATH.leads}?add=1`);
  };

  const openDrawer = () => {
    setFeedback(false);
    feedbackBack.forget();
    drawerBack.remember(document.activeElement);
    setDrawer(true);
  };
  const closeDrawer = () => {
    setDrawer(false);
    drawerBack.restore();
  };
  const closeFeedback = () => {
    setFeedback(false);
    feedbackBack.restore();
  };
  const closeHelp = useCallback(() => setHelp(false), []);
  // The open drawer is a sheet: Escape closes it, Tab stays inside, focus goes back to More / Menu.
  // A page sheet open on top of the drawer takes Escape first (design `uxEsc`: the visible one closes).
  useDialog(navRef, closeDrawer, drawer, { yieldTo: () => sheetOnTop(navRef.current) });

  // Phone gestures (design logic "UX round"). The open drawer closes with a swipe down; the design's other
  // sheets (reason and send dialogs, a page's .fd-cf / stop detail / add sheets) close the way their own
  // Cancel, close or Back button does; a tap on the dimmed area next to a .fd-cf sheet does the same.
  useSheetSwipe(navRef, closeDrawer, { enabled: drawer });
  useSheetSwipe(appRef, pressSheetClose, { selector: SHEET_SELECTOR });
  // A swipe from the left edge presses the page's own Back when it shows one (design `uxEdge`); with no
  // Back on screen the edge does nothing.
  useEdgeSwipe(appRef, {
    enabled: !drawer,
    slide: viewRef,
    canStart: () => findBack(viewRef.current) !== null,
    onSwipe: () => {
      const back = findBack(viewRef.current);
      if (back) press(back);
    },
  });
  // Pull to refresh re-renders the page from the server (read-only; client state such as drafts stays).
  // It counts as done when the transition settles, which says nothing about the data, so the line stays
  // a neutral "Refreshed". Offline it fails at once. Settings keeps its fields, so a pull would change nothing.
  useEffect(() => {
    if (refreshing || !refreshDone.current) return;
    refreshDone.current(true);
    refreshDone.current = null;
  }, [refreshing]);
  const onRefresh = useCallback(() => {
    if (navigator.onLine === false) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      refreshDone.current = resolve;
      startRefresh(() => router.refresh());
    });
  }, [router]);
  usePullToRefresh(mainRef, { enabled: page !== "settings", slide: viewRef, bar: barRef, onRefresh });
  const onBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    const t = event.target;
    if (!isPhone() || !(t instanceof HTMLElement) || !t.classList.contains("fd-cf") || t.classList.contains("is-off")) return;
    const sheet = t.querySelector<HTMLElement>(".fd-cfb");
    if (!sheet) return;
    pressSheetClose(sheet);
    clearSheetStyle(sheet);
  };

  const api = useMemo<ShellApi>(
    () => ({
      business,
      setAction: (id, node, hidden = false) => setActions((a) => { const next = { ...a }; if (node === null) delete next[id]; else next[id] = { node, hidden }; return next; }),
      setPushed: (id, value) => setPushedState((p) => { if (!!p[id] === value) return p; const next = { ...p }; if (value) next[id] = true; else delete next[id]; return next; }),
      sendTimer: (request) => setSend({ id: (sendCount.current += 1), request }),
      askReason: setReason,
      openSearch: () => { setDrawer(false); drawerBack.forget(); setSearch(true); },
      openFeedback: () => { setDrawer(false); drawerBack.forget(); feedbackBack.remember(document.activeElement); setFeedback(true); },
      setInboxCount: (n, partial = false) => { setInboxCount(n); setInboxPartial(partial); },
      updateBusiness: (patch, options) => {
        const savedAt = options?.expires ? Date.now() : null;
        setOverride((o) => addToOverride(o, patch, serverBusiness, savedAt));
      },
      signOut,
      setSearchRows: (key, rows, options) => setHandedRows((all) => {
        const now = all[key];
        if (!options?.seed) return sameRows(now?.rows, rows) ? all : { ...all, [key]: { ...now, rows } };
        // An empty seed can mean the leads were unavailable, so it never clears rows search already has.
        if (sameRows(now?.seed, rows) || (rows.length === 0 && now?.rows.length)) return all;
        return { ...all, [key]: { rows, seed: rows } };
      }),
    }),
    [business, serverBusiness, drawerBack, feedbackBack],
  );

  const go = useCallback((key: PageKey) => {
    setDrawer(false);
    drawerBack.forget();
    // Choosing the page already open still closes the feedback sheet (design `nav`).
    setFeedback(false);
    feedbackBack.forget();
    // Compared with the page the tabs show, so a tap back during a load cancels that load (last tap wins).
    if (key === shownPage) return;
    startNav(() => {
      setShownPage(key);
      router.push(PAGE_PATH[key]);
    });
  }, [shownPage, router, drawerBack, feedbackBack, setShownPage]);

  // When the frame goes away, Settings' hand-set colors go with it (api/brand-cleanup.ts).
  useEffect(() => {
    const before = customProps(document.documentElement.style);
    return () => clearLiveBrand(document, before);
  }, []);

  // The phone top bar follows the page's scroll (design `uxTtl`, phone only).
  const onMainScroll = (main: HTMLElement) => {
    if (!isPhone()) return;
    const sc = main.scrollTop > 2;
    const h = viewRef.current?.querySelector(".fd-pt, .fd-h1");
    const top = barRef.current;
    const ttl = !!h && !!top && isShown(h) && h.getBoundingClientRect().bottom < top.getBoundingClientRect().bottom - 4;
    setBar((b) => (b.sc === sc && b.ttl === ttl ? b : { sc, ttl }));
  };

  const isPushed = Object.keys(pushed).length > 0;
  const actionList = Object.entries(actions);
  const hasAction = actionList.some(([, a]) => !a.hidden) && !isPushed;
  const navClass = (key: PageKey) => `fd-nav${shownPage === key ? " is-on" : ""}`;
  const tabClass = (key: PageKey) => `fd-tab${shownPage === key ? " is-on" : ""}`;
  const badge = (
    <span className={`fd-badge${inboxCount ? "" : " is-off"}`} aria-label={inboxPartial ? `at least ${inboxCount} unread` : `${inboxCount} unread`}>{inboxPartial ? `${inboxCount}+` : inboxCount}</span>
  );

  return (
    <ShellContext.Provider value={api}>
      <UndoContext.Provider value={undo}>
      <PageStateProvider>
      <div ref={appRef} className="fd-app brand-scope is-appframe" onClick={onBackdrop}>
        <a
          href="#fd-main"
          className={skipShown ? "fd-btn is-fill" : "fx-vh"}
          style={skipShown ? { position: "fixed", top: 8, left: 8, zIndex: 60 } : undefined}
          onFocus={() => setSkipShown(true)}
          onBlur={() => setSkipShown(false)}
          onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}
        >
          Skip to main content
        </a>
        <button type="button" className={`fd-scrim${drawer ? " is-open" : ""}`} aria-label="Close menu" onClick={closeDrawer} />
        <nav ref={navRef} className={`fd-side${drawer ? " is-open" : ""}`} aria-label="Main menu">
          <div className="fd-brand">
            <BrandLogo url={business.logoUrl} initials={business.init} />
            <span className="fd-bt"><span className="fd-bname"><span className="fd-h">{business.name}</span></span><span className="fd-bsub"><span className="fd-h">{business.tag}</span></span></span>
            <button type="button" ref={drawerClose} className="fd-x" aria-label="Close menu" onClick={closeDrawer}><Icon name="close" size={20} strokeWidth={2} /></button>
          </div>
          <button type="button" className="fd-dsearch" aria-label="Search customers" onClick={api.openSearch}><Icon name="search" size={18} /><span>Search</span></button>
          {MENU_GROUPS.map((group) => (
            <div key={group.title} style={{ display: "contents" }}>
              <p className="fd-grp">{group.title}</p>
              {group.pages.map((key) => (
                <button key={key} type="button" className={navClass(key)} aria-current={page === key ? "page" : undefined} onClick={() => go(key)} data-tab={TAB_PAGES.includes(key) ? 1 : undefined}>
                  <Icon name={key} />
                  <span className="fd-nl">{PAGE_TITLE[key]}</span>
                  {key === "inbox" ? badge : null}
                </button>
              ))}
            </div>
          ))}
          <div className="fd-sp" aria-hidden="true" />
          <div className="fd-low">
            <button type="button" className={navClass("settings")} aria-current={page === "settings" ? "page" : undefined} onClick={() => go("settings")}><Icon name="settings" /><span className="fd-nl">Settings</span></button>
            <button type="button" className="fd-nav" onClick={api.openFeedback}><Icon name="feedback" /><span className="fd-nl">Send feedback</span></button>
          </div>
          <div className="fd-me">
            <span className="fd-av" aria-hidden="true"><span>{business.ownerInit}</span></span>
            <span className="fd-bt"><span className="fd-mname">{business.owner}</span><span className="fd-bsub">Owner</span></span>
            <button type="button" className="fd-link fd-out" onClick={() => void signOut().catch(() => setSaid("Could not sign out. Try again."))}>Sign out</button>
          </div>
        </nav>
        <main ref={mainRef} id="fd-main" tabIndex={-1} className={`fd-main${isPushed ? "" : ` fx-cap${hasAction ? " fx-capacc" : ""}`}`} onScroll={(event) => onMainScroll(event.currentTarget)}>
          <header ref={barRef} className={`fd-mtop${bar.sc ? " is-sc" : ""}${bar.ttl ? " is-ttl" : ""}`}>
            <button type="button" className="fd-ibtn fd-menub" aria-label="Open menu" aria-expanded={drawer} onClick={openDrawer}><Icon name="menu" size={21} strokeWidth={2} /><span>Menu</span></button>
            <span className="fd-bname">{business.name}</span>
            <span className="fx-mttl" aria-hidden="true">{PAGE_TITLE[page]}</span>
            {/* Not in .fd-tools: the stylesheet hides that group under 1024px. Icons only, so the centered page title still fits at 320px. */}
            <span style={{ display: "flex", flex: "none", alignItems: "center", gap: 4, marginLeft: "auto" }}><button type="button" className="fd-ibtn fd-callb" aria-label="Call a customer, not available yet" title="Not available yet" disabled data-fx-noact="1"><Icon name="call" size={20} /></button><button type="button" className="fd-ibtn" aria-label="New lead" title="New lead" onClick={openNewLead}><Icon name="plus" size={20} strokeWidth={2.2} /></button></span>
          </header>
          <header className="fd-top">
            <button type="button" className="fd-search" aria-label="Search customers" aria-keyshortcuts="Meta+F" onClick={api.openSearch}><Icon name="search" size={18} /><span className="fx-sph">Search</span><kbd className="fx-kbd" aria-hidden="true">{mac ? "⌘F" : "Ctrl F"}</kbd></button>
            <span className="fd-tools">
              <button type="button" className="fd-btn is-plain fd-callb" aria-label="Call a customer, not available yet" title="Not available yet" disabled data-fx-noact="1"><Icon name="call" size={16} strokeWidth={2} />Call</button>
              <button type="button" className="fd-btn is-plain" onClick={openNewLead}><Icon name="plus" size={16} strokeWidth={2.2} />New lead</button>
            </span>
          </header>
          <div key={page} ref={viewRef} className={viewClass(page, isPushed, entered)} data-pg={page} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setEntered(true); }}>{children}</div>
        </main>
        <div className={`fx-tcap${isPushed ? " fd-hid" : ""}`}>
          <div className={`fx-acc${hasAction ? "" : " fd-hid"}`} role="toolbar" aria-label="Page actions">
            {actionList.map(([id, a]) => (
              <div key={id} className={a.hidden ? "fd-hid" : undefined} style={{ display: "contents" }}>{a.node}</div>
            ))}
          </div>
          <nav className="fd-tabs" aria-label="Main pages">
            {TAB_PAGES.map((key) => (
              <button key={key} type="button" className={tabClass(key)} aria-current={page === key ? "page" : undefined} onClick={() => go(key)}>
                <Icon name={key} size={22} strokeWidth={1.9} />
                <span className="fd-tn">{PAGE_TITLE[key]}</span>
                {key === "inbox" ? badge : null}
              </button>
            ))}
            <button type="button" className={`fd-tab fx-tmore${TAB_PAGES.includes(shownPage) ? "" : " is-on"}`} aria-haspopup="dialog" aria-expanded={drawer} onClick={openDrawer}>
              <Icon name="more" size={22} /><span className="fd-tn">More</span>
            </button>
          </nav>
          <button type="button" className="fx-tsrch" aria-label="Search" onClick={api.openSearch}><Icon name="search" size={22} strokeWidth={2} /><span className="fx-tsl">Search</span></button>
        </div>
        <FeedbackSheet open={feedback} first={business.first} onClose={closeFeedback} />
        <ReasonDialog request={reason} onClose={() => setReason(null)} />
        {send ? <SendTimerDialog key={send.id} request={send.request} onClose={() => setSend(null)} /> : null}
        <p className="fx-live" aria-live="polite">{said}</p>
      </div>
      {search ? (
        <SearchSheet
          rows={liveRows}
          recent={recent}
          onRecentChange={setRecent}
          isMac={mac}
          onClose={() => setSearch(false)}
          onOpen={(row) => {
            setSearch(false);
            router.push(row.href);
            const id = rowParam(row.href.slice(row.href.indexOf("?")));
            if (id) window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: id }));
          }}
        />
      ) : null}
      {help && !search ? <ShortcutHelp mac={mac} onClose={closeHelp} /> : null}
      </PageStateProvider>
      </UndoContext.Provider>
    </ShellContext.Provider>
  );
}
