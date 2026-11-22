"use client";

import { PageAction, useShell } from "@/features/app-shell";
import { useQuotesKept } from "@/features/quotes";
import { CalendarCard, Greeting, MoneyCards, NeedsCard, nextLabel, nextTodo, numClass, openCount, useToday } from "@/features/today";
import { quoteDocFor, SAMPLE_MONEY, STOPS, TODOS } from "../../../src/features/today/mock";

// The to-do, calendar and money cards on made-up rows, for the tests of their behaviour. The real
// page renders none of this until those sections have a real source.
export function SampleToday({ ownerFirst }: { ownerFirst?: string }) {
  const first = useShell().business?.first ?? ownerFirst;
  const [quotes] = useQuotesKept();
  const today = useToday(TODOS, (todo) => quoteDocFor(todo, quotes.quotes));
  const { state } = today;
  const next = nextTodo(state, TODOS);
  return (
    <>
      <Greeting first={first} left={openCount(state, TODOS)} numClass={numClass(state)} />
      <NeedsCard todos={TODOS} state={state} onFilter={today.setFilter} onPress={today.press} onUndo={today.undo} />
      <CalendarCard stops={STOPS} state={state} />
      <MoneyCards data={SAMPLE_MONEY} />
      {next ? <PageAction><button type="button" className="fd-btn fx-accb" onClick={today.pressNext}>{nextLabel(next)}</button></PageAction> : null}
    </>
  );
}
