// Where the cursor and the scroll go when the editor opens or closes. Small DOM shapes so the tests
// can pass a stand-in for `document`.

type Focusable = {
  focus: (options?: { preventScroll?: boolean }) => void;
  scrollIntoView?: (options?: { block?: "center" }) => void;
};
type Scroller = { scrollTop: number };
export type FocusDoc = {
  getElementById: (id: string) => Focusable | null;
  querySelector: (selector: string) => Scroller | null;
};

export function isPhone(win: { innerWidth: number }): boolean {
  return win.innerWidth < 1024;
}

// Opening: the cursor goes to the name field. On a phone the editor is a pushed screen, so it starts
// at the top.
export function focusEditor(doc: FocusDoc, phone: boolean): void {
  if (phone) {
    const main = doc.querySelector(".fd-main");
    if (main) main.scrollTop = 0;
  }
  const name = doc.getElementById("fd-au-name");
  if (!name) return;
  if (phone) name.focus({ preventScroll: true });
  else name.focus();
}

// Closing (Back, Cancel or Save): back to the row that was edited. Its Edit button gets the focus.
export function returnToRow(doc: FocusDoc, rowId: string, phone: boolean): void {
  const row = doc.getElementById(`fd-au-${rowId}`);
  if (!row) return;
  if (phone) row.scrollIntoView?.({ block: "center" });
  const edit = doc.getElementById(`fd-au-edit-${rowId}`);
  if (!edit) return;
  if (phone) edit.focus({ preventScroll: true });
  else edit.focus();
}
