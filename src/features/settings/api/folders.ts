import { CATCH_ALL, LAYOUT, arrangeKeys, placeKey } from "./layout";

// The folder view of the layout (layout.ts). `name` is the folder's name in HighLevel (data only,
// never shown). `keys` lists the folder's exact keys in order; numbered keys are placed by pattern.
export type FolderId = string;
export type Folder = { id: FolderId; title: string; name: string | null; keys: readonly string[] };

export const FOLDERS: readonly Folder[] = [...LAYOUT, CATCH_ALL].map((f) => ({
  id: f.id,
  title: f.title,
  name: f.highLevelName,
  keys: f.groups.flatMap((g) => g.keys ?? []),
}));

const folderOfKey = (key: string) => placeKey(key)?.folder ?? CATCH_ALL;

export const folderIdOfKey = (key: string): FolderId => folderOfKey(key).id;

// Words a search can find a key's folder by.
export function folderSearchText(key: string): string {
  const { title, highLevelName } = folderOfKey(key);
  return highLevelName ? `${title} ${highLevelName}` : title;
}

export type ShownFolder = { folder: Folder; keys: string[] };

// The folders that hold any of `keys`, in layout order, each with its keys in the folder's order.
export function foldersFor(keys: readonly string[]): ShownFolder[] {
  return arrangeKeys(keys).map(({ folder, keys: own }) => ({ folder: FOLDERS.find((f) => f.id === folder.id) as Folder, keys: own }));
}
