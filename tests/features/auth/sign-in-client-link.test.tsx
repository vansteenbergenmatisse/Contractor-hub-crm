// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSignInBrand } = vi.hoisted(() => ({ loadSignInBrand: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/brand", () => ({ loadSignInBrand }));

import { ForgotPasswordForm } from "../../../src/features/auth/components/ForgotPasswordForm";
import { ResetPasswordForm } from "../../../src/features/auth/components/ResetPasswordForm";
import { SignInForm } from "../../../src/features/auth/components/SignInForm";
import SignInPage from "../../../src/app/sign-in/page";
import ForgotPage from "../../../src/app/forgot-password/page";
import ResetPage from "../../../src/app/reset-password/page";

const BRAND = {
  client: "sample-roofing",
  name: "Sample Roofing",
  logoUrl: null,
  backgroundUrl: "https://assets.cdn.filesafe.space/x/hero.jpg",
  css: ":root:root:root,.brand-scope.brand-scope.brand-scope{--main-color:#123456}",
};

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  loadSignInBrand.mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
});

const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
const page = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element);
const params = (value: Record<string, string | string[] | undefined>) => ({ searchParams: Promise.resolve(value) });

describe("the sign-in presentation", () => {
  it("shows the product brand and no style or image with no client", () => {
    const { container } = render(<SignInForm />);
    expect(screen.getByText("Contractor Hub")).toBeInTheDocument();
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(href(/forgot password/i)).toBe("/forgot-password");
  });

  it("shows the client's name, colors and background", () => {
    const { container } = render(<SignInForm brand={BRAND} />);
    expect(screen.getByText("Sample Roofing")).toBeInTheDocument();
    expect(screen.queryByText("Contractor Hub")).toBeNull();
    expect(container.querySelector("style")?.textContent).toContain("--main-color:#123456");
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(BRAND.backgroundUrl);
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("sends only email, password and remember-me when signing in through a client link", async () => {
    render(<SignInForm brand={BRAND} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@example.test", password: "secret-password", rememberMe: true });
  });
});

describe("client is kept between the pages", () => {
  it("sign-in links to forgot password with the client", () => {
    render(<SignInForm brand={BRAND} />);
    expect(href(/forgot password/i)).toBe("/forgot-password?client=sample-roofing");
  });

  it("forgot password links back and asks for a reset page with the client", async () => {
    render(<ForgotPasswordForm brand={BRAND} />);
    expect(href(/back to sign in/i)).toBe("/sign-in?client=sample-roofing");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@example.test", redirectTo: "/reset-password?client=sample-roofing" });
    expect(await screen.findByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/sign-in?client=sample-roofing");
  });

  it("forgot password without a client keeps today's request", async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).redirectTo).toBe("/reset-password");
  });

  it("the broken reset link keeps the client", () => {
    render(<ResetPasswordForm token={null} brand={BRAND} />);
    expect(href(/ask for a new link/i)).toBe("/forgot-password?client=sample-roofing");
  });
});

describe("the pages", () => {
  it.each([
    ["sign-in", () => SignInPage(params({ client: "sample-roofing" }))],
    ["forgot", () => ForgotPage(params({ client: "sample-roofing" }))],
    ["reset", () => ResetPage(params({ client: "sample-roofing", token: "tok" }))],
  ])("%s passes the raw value only to the brand loader and renders its result", async (_name, open) => {
    loadSignInBrand.mockResolvedValue(BRAND);
    const html = await page(open());
    expect(loadSignInBrand).toHaveBeenCalledWith("sample-roofing");
    expect(html).toContain("Sample Roofing");
  });

  it("an unknown or malformed client gives the same markup as no client", async () => {
    const plain = await page(SignInPage(params({})));
    for (const client of ["nobody-here", "<script>alert(1)</script>", "https://evil.test", ["a", "b"]]) {
      expect(await page(SignInPage(params({ client })))).toBe(plain);
    }
  });

  it("never renders the raw value as a link target", async () => {
    const html = await page(ForgotPage(params({ client: "https://evil.test" })));
    expect(html).not.toContain("evil.test");
  });
});
