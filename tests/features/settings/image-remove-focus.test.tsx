// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImageUploader, PrepareImage } from "@/features/settings";
import { ImageChange } from "../../../src/features/settings/components/ImageChange";

afterEach(cleanup);

function Field({ upload }: { upload: ImageUploader }) {
  const [draft, setDraft] = useState("https://assets.cdn.filesafe.space/a.webp");
  const saved = "https://assets.cdn.filesafe.space/a.webp";
  const prepare = vi.fn<PrepareImage>();
  return (
    <ImageChange
      fieldKey="1_our_work_before" label="Project 1, before" kind="photo" current={saved} dirty={draft !== saved}
      upload={upload} prepare={prepare} onValue={vi.fn()} onClear={() => setDraft("")}
    />
  );
}

describe("Image picker: Remove by keyboard", () => {
  it("keeps focus inside the picker and announces what happens next", async () => {
    const user = userEvent.setup();
    render(<Field upload={vi.fn()} />);
    const remove = screen.getByRole("button", { name: "Remove image" });
    remove.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).not.toBe(document.body);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Save this step to remove the image/);
    expect(document.activeElement).toBe(status);
  });
});
