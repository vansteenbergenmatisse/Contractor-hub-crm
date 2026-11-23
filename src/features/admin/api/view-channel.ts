// Tells this browser's other tabs that the viewed client changed, so no tab keeps a banner naming the
// previous client. Browsers without BroadcastChannel simply skip it.
const CHANNEL = "client-view";

export function announceViewChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("changed");
  channel.close();
}

export function onViewChange(listener: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = listener;
  return () => channel.close();
}
