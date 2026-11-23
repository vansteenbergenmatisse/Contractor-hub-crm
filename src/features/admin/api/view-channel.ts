// Tells this browser's other tabs that the viewed client changed, so no tab keeps a banner naming the
// previous client. Browsers without BroadcastChannel simply skip it.
const CHANNEL = "client-view";
// Not a secret: it only lets a tab ignore its own message, which would cancel its own navigation.
const TAB_ID = `${Date.now()}-${Math.random()}`;

export function announceViewChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(TAB_ID);
  channel.close();
}

export function onViewChange(listener: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    if (event.data !== TAB_ID) listener();
  };
  return () => channel.close();
}
