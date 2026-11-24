"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLOR_GROUPS, ESSENTIAL_KEYS } from "../api/fields";
import { imageKindOf } from "../api/image-keys";
import type { AccountLayout } from "../api/load-values";
import { prepareImageFile } from "../api/prepare-image";
import { dirtyKeysOf, prepareSave, type SettingsState } from "../api/state";
import { PROTECTED_STEPS, STEPS, clearedKeys, keysByStep, type ProtectedId } from "../api/steps";
import { UNKNOWN_CONNECTIONS } from "../api/connections";
import { isClearableKey } from "../api/validate";
import { useCurrentStep } from "../hooks/use-current-step";
import { useSaveValues } from "../hooks/use-save-values";
import { useSettings } from "../hooks/use-settings";
import { useSignOut } from "../hooks/use-sign-out";
import type { Field, ImageUploader, PhoneNumbersSource, PrepareImage, SaveValues, SectionKey } from "../types";
import { ChoicesPanel } from "./ChoicesPanel";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { ImageChange } from "./ImageChange";
import { MobileBar } from "./MobileBar";
import { ProtectedFolder, type FolderMode } from "./ProtectedFolder";
import { StepCard, type StepContext } from "./StepCard";
import { StepRail } from "./StepRail";
import "./settings-guided.css";

type Props = {
  initial?: SettingsState;
  initialValues?: Record<string, string>;
  initialSection?: SectionKey;
  // From a good server read: the image hosts. Never a value.
  account?: AccountLayout;
  // The account's phone numbers, read on the server; a promise while that read runs.
  // Left out: the row says "Not available yet".
  phoneNumbers?: PhoneNumbersSource;
  readOnly?: boolean;
  // Given only when this owner may save to the sub-account. Without it Save lasts for this visit.
  saveValues?: SaveValues;
  // Given only when the server flags allow Change image for this owner.
  uploadImage?: ImageUploader;
  prepareImage?: PrepareImage;
};

type Tab = "det" | "conn" | "ch";
const TABS: { id: Tab; label: string; section: SectionKey }[] = [
  { id: "det", label: "Your details", section: "biz" },
  { id: "conn", label: "Connections", section: "conn" },
  { id: "ch", label: "Your choices", section: "choice" },
];
const tabOf = (section: SectionKey): Tab => (section === "conn" ? "conn" : section === "choice" || section === "soon" ? "ch" : "det");
const ALL_STEPS = [...STEPS, ...PROTECTED_STEPS];
const RAIL_IDS = ALL_STEPS.map((step) => step.id);
const titleOf = (id: string) => ALL_STEPS.find((step) => step.id === id)?.title ?? "";
const scrollToCard = (id: string) => document.getElementById(`s-card-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });

// Page content for /settings, inside the app shell: three tabs, seven steps that save on their own,
// and the protected Services and areas.
export function SettingsPage({ initial, initialValues, initialSection, account, phoneNumbers, readOnly = false, saveValues, uploadImage, prepareImage = prepareImageFile }: Props) {
  const live = !!saveValues && !readOnly;
  const { state, dispatch, filter, extras, notLoaded } = useSettings(initial, initialValues, initialSection, UNKNOWN_CONNECTIONS, live, account);
  const remote = useSaveValues(state, dispatch, saveValues);
  const signOut = useSignOut();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [jumpTo, setJumpTo] = useState<{ id: string } | null>(null);
  const [reviewStep, setReviewStep] = useState<string | null>(null);
  // A new object on every press, so pressing Save again shows the waiting review again.
  const [reviewShown, setReviewShown] = useState<{ id: string } | null>(null);
  const reviewOpener = useRef<HTMLButtonElement | null>(null);
  const [folder, setFolder] = useState<{ id: ProtectedId; mode: FolderMode } | null>(null);
  // The folder whose last save finished. Cleared as soon as that folder is opened again.
  const [folderSaved, setFolderSaved] = useState<ProtectedId | null>(null);
  // A new object per save from the phone bar, whose result can sit off-screen.
  const [reveal, setReveal] = useState<{ id: string } | null>(null);
  const { values, draft, err } = state;
  const tab = tabOf(state.sec);
  const dirtyKeys = dirtyKeysOf(values, draft);
  const colorKeys = COLOR_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
  const shownJoined = [...ESSENTIAL_KEYS, ...extras, ...colorKeys].filter((key) => filter.items[`cv-${key}`]).join("|");
  const keys = useMemo(() => keysByStep(shownJoined ? shownJoined.split("|") : []), [shownJoined]);
  const current = useCurrentStep(RAIL_IDS, tab === "det");
  const loadFailed = notLoaded && (live || readOnly);
  const errShown = !!err && tab === "det" && !!filter.items[`cv-${err.key}`];
  const topMessage = (errShown ? null : err?.message) ?? (loadFailed ? (readOnly ? "Your details did not load. Reload this page to try again." : "Your details did not load, so nothing can be saved. Reload this page to try again.") : null);

  // Handlers read the newest state through a ref, so they stay stable and memoized cards do not redraw.
  const latest = useRef({ state, keys, live, remote });
  useEffect(() => { latest.current = { state, keys, live, remote }; });

  const runSave = useCallback(async (id: string, allowClear: boolean) => {
    const { state: now, keys: all, live: isLive, remote: saver } = latest.current;
    const stepKeys = all[id as keyof typeof all] ?? [];
    reviewOpener.current = null;
    setReviewStep(null);
    if (isLive) return saver.save({ step: id, keys: stepKeys, allowClear });
    const bad = prepareSave(now, stepKeys).problem;
    dispatch({ type: "save", keys: stepKeys, step: id });
    return !bad;
  }, [dispatch]);

  const requestSave = useCallback((id: string) => {
    const { state: now, keys: all, live: isLive } = latest.current;
    const stepKeys = all[id as keyof typeof all] ?? [];
    const cleared = clearedKeys(stepKeys, now.values, now.draft);
    // A required value left empty goes to the normal check, which names it.
    if (isLive && cleared.length > 0 && cleared.every(isClearableKey)) {
      if (document.activeElement instanceof HTMLButtonElement) reviewOpener.current = document.activeElement;
      setReviewStep(id);
      setReviewShown({ id });
      return null;
    }
    return runSave(id, false);
  }, [runSave]);

  const revert = useCallback((id: string) => {
    const { keys: all } = latest.current;
    dispatch({ type: "revert", keys: all[id as keyof typeof all] ?? [] });
    reviewOpener.current = null;
    setReviewStep((step) => (step === id ? null : step));
  }, [dispatch]);

  const onEdit = useCallback((key: string, value: string) => dispatch({ type: "edit", key, value }), [dispatch]);
  // Focus waits on the card's heading, because the panel closes and Save is disabled while saving.
  // The result message takes it over when the save ends.
  const onConfirmClear = useCallback((id: string) => {
    const heading = document.getElementById(`s-t-${id}`);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    void runSave(id, true).then(() => setReveal({ id }));
  }, [runSave]);
  // Focus moves before the panel closes, so it is never lost with the Go back button.
  const onKeep = useCallback((id: string) => {
    const opener = reviewOpener.current;
    reviewOpener.current = null;
    const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`#s-card-${id} .ga-nx`);
    target?.focus();
    setReviewStep(null);
  }, []);
  const onFolderMode = useCallback((id: ProtectedId, mode: FolderMode) => {
    if (mode !== "locked") setFolderSaved((done) => (done === id ? null : done));
    setFolder(mode === "locked" ? null : { id, mode });
  }, []);
  const onFolderLock = useCallback((id: ProtectedId) => { revert(id); setFolder(null); }, [revert]);
  const onFolderSave = useCallback((id: ProtectedId) => {
    const { state: now, keys: all } = latest.current;
    // Only a save that really had something to write may report success.
    const hasChanges = prepareSave(now, all[id] ?? []).changedKeys.length > 0;
    void runSave(id, true).then((ok) => {
      if (ok) { setFolderSaved(hasChanges ? id : null); setFolder(null); } else setFolder({ id, mode: "edit" });
    });
  }, [runSave]);
  const jump = useCallback((id: string) => { setSheetOpen(false); setJumpTo({ id }); scrollToCard(id); }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Runs after the sheet has closed and handed focus back, so the chosen step keeps it.
  useEffect(() => {
    if (!jumpTo) return;
    const heading = document.getElementById(`s-t-${jumpTo.id}`);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [jumpTo]);

  // Runs once the panel is on the page. It sits below the fields, so a tall card would hide it.
  useEffect(() => {
    if (!reviewShown) return;
    const heading = document.getElementById(`s-r-${reviewShown.id}`);
    heading?.focus({ preventScroll: true });
    heading?.closest(".ga-rv")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [reviewShown]);

  // The save result sits in the card footer, which can be off-screen behind the phone bar.
  useEffect(() => {
    if (!reveal) return;
    const message = document.querySelector<HTMLElement>(`#s-card-${reveal.id} .ga-foot :is(.ga-fe, .fd-okl)`);
    message?.focus({ preventScroll: true });
    message?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [reveal]);

  const imageControl = useCallback((f: Field, saved: string, dirty: boolean) => {
    const kind = imageKindOf(f.key);
    if (!uploadImage || readOnly || !kind) return null;
    return (
      <ImageChange
        fieldKey={f.key}
        label={f.label}
        kind={kind}
        current={saved}
        dirty={dirty}
        upload={uploadImage}
        prepare={prepareImage}
        onValue={(key, value, saved) => dispatch({ type: "imageValue", key, value, saved })}
      />
    );
  }, [uploadImage, readOnly, prepareImage, dispatch]);

  const context = useMemo<StepContext>(() => ({
    live, readOnly, blocked: live && loadFailed, imageHosts: account?.imageHosts,
    onEdit, onSave: requestSave, onConfirmClear, onKeep, onCancel: revert, imageControl,
  }), [live, readOnly, loadFailed, account?.imageHosts, onEdit, requestSave, onConfirmClear, onKeep, revert, imageControl]);

  // A link such as ?section=colors lands on its step.
  useEffect(() => {
    if (initialSection === "colors") scrollToCard("col");
  }, [initialSection]);

  const visible = (id: keyof typeof keys) => {
    if (!onlyEmpty) return keys[id];
    return keys[id].filter((key) => (values[key] ?? "").trim() === "" || err?.key === key);
  };
  const errorFor = (stepKeys: readonly string[]) => (err && errShown && stepKeys.includes(err.key) ? err : null);
  const dirtyStep = ALL_STEPS.find((step) => keys[step.id].some((key) => dirtyKeys.includes(key)));
  const dirtyIsOpenFolder = dirtyStep && PROTECTED_STEPS.some((step) => step.id === dirtyStep.id);
  const mobileTitle = dirtyStep && !dirtyIsOpenFolder ? dirtyStep.title : null;
  const shownProtected = PROTECTED_STEPS.filter((step) => keys[step.id].length > 0);

  return (
    <div className="sv-app" data-sec={state.sec} data-open={state.open ? "1" : "0"} data-q={filter.active ? "1" : "0"}>
      <div className="sv-head">
        <h1 className="sv-h1">Settings</h1>
        <p className="sv-lead">Your business details in {STEPS.length} steps, all on one page. Fill them top to bottom and save each step.</p>
      </div>

      <div className="sv-segw">
        <div className="sv-seg" role="tablist" aria-label="Settings parts">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className={`sv-sg${tab === t.id ? " is-on" : ""}`} aria-selected={tab === t.id} onClick={() => dispatch({ type: "go", section: t.section })}>{t.label}</button>
          ))}
        </div>
      </div>

      <p className={`fd-lerr fd-ste${topMessage ? "" : " is-off"}`} id="fd-st-err" role="alert">{topMessage ?? ""}</p>
      {readOnly ? <p className="ga-note">You are viewing this account. Nothing can be changed here.</p> : null}
      {!live && !readOnly ? <p className="ga-note">Changes last until you close or reload this page.</p> : null}

      <div className="ga-grid" hidden={tab !== "det"}>
        <StepRail keys={keys} values={values} dirtyKeys={dirtyKeys} current={current} sheetOpen={sheetOpen} onlyEmpty={onlyEmpty} onOnlyEmpty={() => setOnlyEmpty((on) => !on)} onJump={jump} onCloseSheet={closeSheet} />
        <div className="ga-stack" inert={sheetOpen}>
          {STEPS.map((step, i) => (keys[step.id].length === 0 ? null : (
            <StepCard
              key={step.id}
              step={step}
              number={i + 1}
              total={STEPS.length}
              keys={keys[step.id]}
              shownKeys={visible(step.id)}
              values={values}
              draft={draft}
              error={errorFor(keys[step.id])}
              current={current === step.id}
              saving={state.saving && state.saveStep === step.id}
              anySaving={state.saving}
              savedHere={state.ok && state.saveStep === step.id}
              problem={!state.saving && state.saveStep === step.id ? state.saveProblem : null}
              reviewing={reviewStep === step.id}
              context={context}
            />
          )))}
          {shownProtected.length > 0 ? (
            <section className="ga-prot" aria-labelledby="s-t-prot">
              <header className="ga-ph">
                <div className="ga-hdt">
                  <div className="ga-phr"><h2 className="ga-t" id="s-t-prot">Services and areas</h2><span className="ga-pchip">Protected</span></div>
                  <p className="ga-line">These names build the service and area pages of your website. Each folder unlocks one at a time and you check every change before it {live || readOnly ? "saves" : "applies"}.</p>
                </div>
              </header>
              <ol className="ga-how"><li><span>1</span>Unlock one folder</li><li><span>2</span>Make your change</li><li><span>3</span>Check it and {live || readOnly ? "save" : "apply"}. It locks again.</li></ol>
              {shownProtected.map((step) => (
                <ProtectedFolder
                  key={step.id}
                  step={step}
                  keys={keys[step.id]}
                  values={values}
                  draft={draft}
                  mode={folder?.id === step.id ? folder.mode : "locked"}
                  error={errorFor(keys[step.id])}
                  problem={!state.saving && state.saveStep === step.id ? state.saveProblem : null}
                  live={live}
                  saved={folderSaved === step.id}
                  readOnly={readOnly}
                  blocked={live && loadFailed}
                  saving={state.saving && state.saveStep === step.id}
                  anySaving={state.saving}
                  otherOpen={!!folder && folder.id !== step.id}
                  onMode={onFolderMode}
                  onEdit={onEdit}
                  onLock={onFolderLock}
                  onSave={onFolderSave}
                />
              ))}
            </section>
          ) : null}
        </div>
      </div>

      <ConnectionsPanel phone={phoneNumbers} hidden={tab !== "conn"} />
      <ChoicesPanel hidden={tab !== "ch"} />

      {tab === "det" ? (
        <>
          <button type="button" className={`ga-shs${sheetOpen ? " is-on" : ""}`} aria-label="Close steps" tabIndex={sheetOpen ? 0 : -1} onClick={() => setSheetOpen(false)} />
          <MobileBar
            dirtyTitle={mobileTitle}
            currentTitle={titleOf(current)}
            saving={state.saving}
            savingHere={state.saving && state.saveStep === dirtyStep?.id}
            failed={!state.saving && !!state.saveProblem && state.saveStep === dirtyStep?.id}
            blocked={live && loadFailed}
            readOnly={readOnly}
            onOpenSheet={() => setSheetOpen(true)}
            onSave={() => {
              if (!dirtyStep) return;
              const { id } = dirtyStep;
              void requestSave(id)?.then(() => setReveal({ id }));
            }}
            onCancel={() => { if (dirtyStep) revert(dirtyStep.id); }}
          />
        </>
      ) : null}

      <button
        type="button"
        className="sv-btn is-plain sv-out"
        onClick={() => {
          setSignOutFailed(false);
          void signOut().then((ok) => setSignOutFailed(!ok));
        }}
      >Sign out</button>
      {signOutFailed ? <p className="fd-lerr" role="alert">Could not sign out. Try again.</p> : null}
    </div>
  );
}
