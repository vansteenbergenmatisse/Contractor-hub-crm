// Runs `run` once after `ms`. Returns the function that cancels it.
export function afterPause(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}
