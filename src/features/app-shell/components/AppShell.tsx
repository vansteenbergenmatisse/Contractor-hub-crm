"use client";

import { PageStateProvider } from "./PageState";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MENU_GROUPS, PAGE_PATH, PAGE_TITLE, TAB_PAGES, pageFromPath } from "../nav";
import { patchBusiness, pickPatch, type BusinessPatch } from "../api/business";
import { ROW_PICK_EVENT, rowParam } from "../api/search";
import { createFocusReturn, focusables, isShown, viewClass } from "../api/focus";
import { detectMac, findUndo, isTyping, moveRow, shortcutFor } from "../api/keys";
import { useDialog } from "../hooks/use-dialog";
import { UndoContext, createUndoRegistry } from "../hooks/use-undo-shortcut";
import type { Business, PageKey, ReasonRequest, SearchRow, SendTimerRequest } from "../types";
import { BrandLogo } from "./BrandLogo";
import { FeedbackSheet } from "./FeedbackSheet";
import { Icon } from "./Icon";
import { ReasonDialog } from "./ReasonDialog";
import { SearchSheet } from "./SearchSheet";
import { SendTimerDialog } from "./SendTimerDialog";
import { ShortcutHelp } from "./ShortcutHelp";
import { ShellContext, type ShellApi } from "./ShellContext";

const noSubscribe = () => () => {};

// The signed-in frame: side menu on a computer, top bar, floating tab bar and a menu drawer on a
// phone, the page action bar, and the shared pop-ups. Pages render inside it as `children`.
export function AppShell({ business: serverBusiness, searchRows, initialInboxCount = 0, children }: { business: Business; searchRows: readonly SearchRow[]; initialInboxCount?: number; children: ReactNode }) {
  const router = useRouter();
  const page: PageKey = pageFromPath(usePathname() ?? "/");
  const [drawer, setDrawer] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [search, setSearch] = useState(false);
  const [actions, setActions] = useState<Record<string, ReactNode>>({});
  const [pushed, setPushedState] = useState<Record<string, boolean>>({});
  const [send, setSend] = useState<{ id: number; request: SendTimerRequest } | null>(null);
  const sendCount = useRef(0);
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const [inboxCount, setInboxCount] = useState(initialInboxCount);
  const [scrolled, setScrolled] = useState(false);
  const [entered, setEntered] = useState(false);
  // Settings edits for this browser session only (no persistence, nothing sent).
  const [override, setOverride] = useState<BusinessPatch>({});
  const business = useMemo(() => patchBusiness(serverBusiness, override), [serverBusiness, override]);
  const [drawerBack] = useState(createFocusReturn);
  const [feedbackBack] = useState(createFocusReturn);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Recent searches live here, not in the search sheet, so they survive closing it (design `uxRecent`).
  const [recent, setRecent] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  // Off a Mac the shortcut hints say Ctrl (design `uxMac`); the server and hydration assume a Mac.
  const mac = useSyncExternalStore(noSubscribe, detectMac, () => true);
  const [said, setSaid] = useState("");
  const [skipShown, setSkipShown] = useState(false);
  const [undo] = useState(createUndoRegistry);

  // A new page starts with the menu and the feedback sheet closed (state adjusted while rendering).
  const [seenPage, setSeenPage] = useState(page);
  if (seenPage !== page) {
    setSeenPage(page);
    setDrawer(false);
    setFeedback(false);
    setScrolled(false);
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

  // A polite spoken line (design `uxSay`), e.g. "Undone." after ⌘Z.
  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(""), 4000);
    return () => clearTimeout(id);
  }, [said]);

  // The design's keyboard shortcuts (logic `uxKeys`). Sheets catch Escape and Tab themselves.
  const keys = useRef({ search, help, modal: false, page });
  useEffect(() => {
    keys.current = { search, help, modal: send !== null || reason !== null, page };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = keys.current;
      if (now.search || now.help || event.defaultPrevented) return;
      const action = shortcutFor(event, isTyping(event.target));
      if (action === "search") {
        event.preventDefault();
        setDrawer(false);
        drawerBack.forget();
        setSearch(true);
      } else if (action === "help") {
        event.preventDefault();
        if (now.modal) return;
        setDrawer(false);
        drawerBack.forget();
        setHelp(true);
      } else if (action === "settings") {
        event.preventDefault();
        router.push(PAGE_PATH.settings);
      } else if (action === "newLead") {
        event.preventDefault();
        router.push(`${PAGE_PATH.leads}?add=1`);
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
  }, [drawerBack, router, undo]);

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
  useDialog(navRef, closeDrawer, drawer);

  const api = useMemo<ShellApi>(
    () => ({
      business,
      setAction: (id, node) => setActions((a) => { const next = { ...a }; if (node === null) delete next[id]; else next[id] = node; return next; }),
      setPushed: (id, value) => setPushedState((p) => { if (!!p[id] === value) return p; const next = { ...p }; if (value) next[id] = true; else delete next[id]; return next; }),
      sendTimer: (request) => setSend({ id: (sendCount.current += 1), request }),
      askReason: setReason,
      openSearch: () => { setDrawer(false); drawerBack.forget(); setSearch(true); },
      openFeedback: () => { setDrawer(false); drawerBack.forget(); feedbackBack.remember(document.activeElement); setFeedback(true); },
      setInboxCount,
      updateBusiness: (patch) => setOverride((o) => ({ ...o, ...pickPatch(patch) })),
    }),
    [business, drawerBack, feedbackBack],
  );

  const go = useCallback((key: PageKey) => {
    setDrawer(false);
    drawerBack.forget();
    if (key !== page) router.push(PAGE_PATH[key]);
  }, [page, router, drawerBack]);

  async function signOut() {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } finally {
      router.push("/sign-in");
      router.refresh();
    }
  }

  const isPushed = Object.keys(pushed).length > 0;
  const actionNodes = Object.values(actions);
  const hasAction = actionNodes.length > 0 && !isPushed;
  const navClass = (key: PageKey) => `fd-nav${page === key ? " is-on" : ""}`;
  const tabClass = (key: PageKey) => `fd-tab${page === key ? " is-on" : ""}`;
  const badge = (
    <span className={`fd-badge${inboxCount ? "" : " is-off"}`} aria-label={`${inboxCount} need a reply`}>{inboxCount}</span>
  );

  return (
    <ShellContext.Provider value={api}>
      <UndoContext.Provider value={undo}>
      <PageStateProvider>
      <div className="fd-app brand-scope is-appframe">
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
            <span className="fd-bt"><span className="fd-bname">{business.name}</span><span className="fd-bsub">{business.tag}</span></span>
            <button type="button" ref={drawerClose} className="fd-x" aria-label="Close menu" onClick={closeDrawer}><Icon name="close" size={20} strokeWidth={2} /></button>
          </div>
          <button type="button" className="fd-dsearch" aria-label="Search customers, quotes and invoices" onClick={api.openSearch}><Icon name="search" size={18} /><span>Search</span></button>
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
            <button type="button" className="fd-link fd-out" onClick={signOut}>Sign out</button>
          </div>
        </nav>
        <main ref={mainRef} id="fd-main" tabIndex={-1} className={`fd-main${isPushed ? "" : ` fx-cap${hasAction ? " fx-capacc" : ""}`}`} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}>
          <header className={`fd-mtop${scrolled ? " is-sc is-ttl" : ""}`}>
            <button type="button" className="fd-ibtn fd-menub" aria-label="Open menu" aria-expanded={drawer} onClick={openDrawer}><Icon name="menu" size={21} strokeWidth={2} /><span>Menu</span></button>
            <span className="fd-bname">{business.name}</span>
            <span className="fx-mttl" aria-hidden="true">{PAGE_TITLE[page]}</span>
            <span className="fd-tools"><button type="button" className="fd-ibtn fd-callb" aria-label="Call a customer" data-fx-noact="1"><Icon name="call" size={20} /><span>Call</span></button></span>
          </header>
          <header className="fd-top">
            <button type="button" className="fd-search" aria-label="Search customers, quotes and invoices" aria-keyshortcuts="Meta+F" onClick={api.openSearch}><Icon name="search" size={18} /><span className="fx-sph">Search</span><kbd className="fx-kbd" aria-hidden="true">{mac ? "⌘F" : "Ctrl F"}</kbd></button>
            <span className="fd-tools">
              <button type="button" className="fd-btn is-plain fd-callb" aria-label="Call a customer" data-fx-noact="1"><Icon name="call" size={16} strokeWidth={2} />Call</button>
              <button type="button" className="fd-btn is-plain" onClick={() => router.push(`${PAGE_PATH.leads}?add=1`)}><Icon name="plus" size={16} strokeWidth={2.2} />New lead</button>
            </span>
          </header>
          <div key={page} className={viewClass(page, isPushed, entered)} data-pg={page} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setEntered(true); }}>{children}</div>
        </main>
        <div className={`fx-tcap${isPushed ? " fd-hid" : ""}`}>
          <div className={`fx-acc${hasAction ? "" : " fd-hid"}`} role="toolbar" aria-label="Page actions">{actionNodes}</div>
          <nav className="fd-tabs" aria-label="Main pages">
            {TAB_PAGES.map((key) => (
              <button key={key} type="button" className={tabClass(key)} aria-current={page === key ? "page" : undefined} onClick={() => go(key)}>
                <Icon name={key} size={22} strokeWidth={1.9} />
                <span className="fd-tn">{PAGE_TITLE[key]}</span>
                {key === "inbox" ? badge : null}
              </button>
            ))}
            <button type="button" className={`fd-tab fx-tmore${TAB_PAGES.includes(page) ? "" : " is-on"}`} aria-haspopup="dialog" aria-expanded={drawer} onClick={openDrawer}>
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
          rows={searchRows}
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
