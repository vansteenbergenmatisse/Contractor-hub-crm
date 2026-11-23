// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "../../../src/features/auth/components/ForgotPasswordForm";
import { InviteAcceptForm } from "../../../src/features/auth/components/InviteAcceptForm";
import { ResetPasswordForm } from "../../../src/features/auth/components/ResetPasswordForm";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../../src/features/auth/types";

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

function fillReset(password: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("New password again"), { target: { value: password } });
}
const save = () => screen.getByRole("button", { name: "Save password" });

describe("the invite form", () => {
  it("states what is left and the password minimum before submit", () => {
    render(<InviteAcceptForm code="c" email="a@example.test" />);
    expect(screen.getByText(`Add your name and a password of at least ${MIN_PASSWORD_LENGTH} characters. Then sign in.`)).toBeInTheDocument();
  });

  it("does not call the goal reached while sign-in is still left", async () => {
    render(<InviteAcceptForm code="c" email="a@example.test" />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x".repeat(MIN_PASSWORD_LENGTH) } });
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByText("Account created")).toBeInTheDocument();
    expect(screen.getByText("Last step: sign in with your email and the password you just chose.")).toBeInTheDocument();
    expect(screen.queryByText("You are in")).toBeNull();
  });

  it("makes the only way forward a filled button on a dead invite", () => {
    render(<InviteAcceptForm code="c" email={null} />);
    expect(screen.getByRole("link", { name: "Go to sign in" }).className).toContain("is-fill");
  });

  it("capitalizes the name field only", () => {
    render(<InviteAcceptForm code="c" email="a@example.test" />);
    expect(screen.getByLabelText("Your name").getAttribute("autocapitalize")).toBe("words");
    expect(screen.getByLabelText("Email").getAttribute("autocapitalize")).toBe("none");
    expect(screen.getByLabelText("Password").getAttribute("autocapitalize")).toBe("none");
  });

  it("keeps a shown password uncapitalized", () => {
    render(<InviteAcceptForm code="c" email="a@example.test" />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("autocapitalize")).toBe("none");
  });
});

describe("the forgot password form", () => {
  it("fills the only link after sending and keeps the secondary link plain", async () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("link", { name: "Back to sign in" }).className).toContain("is-plain");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await screen.findByText("Check your email");
    expect(screen.getByRole("link", { name: "Back to sign in" }).className).toContain("is-fill");
  });
});

describe("the reset password form", () => {
  it("swaps Save for a new-link action when the link has expired", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    render(<ResetPasswordForm token="tok" />);
    fillReset("x".repeat(MIN_PASSWORD_LENGTH));
    fireEvent.click(save());
    const link = await screen.findByRole("link", { name: "Ask for a new link" });
    expect(link.getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByRole("alert")).toHaveTextContent("This link has expired. Ask for a new one.");
    expect(screen.queryByRole("button", { name: "Save password" })).toBeNull();
  });

  it("does not resend an expired link when the form is submitted again", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const { container } = render(<ResetPasswordForm token="tok" />);
    fillReset("x".repeat(MIN_PASSWORD_LENGTH));
    fireEvent.click(save());
    await screen.findByRole("link", { name: "Ask for a new link" });
    fireEvent.submit(container.querySelector("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call a valid link expired when the password is too long", async () => {
    render(<ResetPasswordForm token="tok" />);
    fillReset("x".repeat(MAX_PASSWORD_LENGTH + 1));
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(save()).toBeInTheDocument();
  });

  it("keeps Save after a server error so the person can retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    render(<ResetPasswordForm token="tok" />);
    fillReset("x".repeat(MIN_PASSWORD_LENGTH));
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again."));
    expect(save()).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ask for a new link" })).toBeNull();
  });
});
