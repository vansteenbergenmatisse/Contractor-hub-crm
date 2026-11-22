import { describe, expect, it } from "vitest";
import { fillFacts } from "@/shared/lib/fill-facts";
import { joinParts } from "@/shared/lib/join-parts";

const base = { businessToken: "name", personToken: "first" };

describe("fillFacts", () => {
  it("fills the exact values it is given (made-up)", () => {
    const out = fillFacts("Hi, this is {name}. {first} from {name} calls. {site}", { ...base, business: "Test Co", person: "Sam", values: { site: "test.example" } });
    expect(out).toBe("Hi, this is Test Co. Sam from Test Co calls. test.example");
  });
  it("reads 'our team' for a missing name or person, capitalised at a sentence start", () => {
    const none = { ...base, business: "", person: "" };
    expect(fillFacts("This is {name}. {first} calls.", none)).toBe("This is our team. Our team calls.");
    expect(fillFacts("{first} from {name} visits.", none)).toBe("Our team visits.");
    expect(fillFacts("{first} from {name} visits.", { ...none, business: "Test Co" })).toBe("Test Co visits.");
  });
  it("leaves out an empty value and closes the gap", () => {
    expect(fillFacts("Call {phone}, please.", { ...base, business: "", person: "", values: { phone: "" } })).toBe("Call, please.");
  });
  it("leaves tokens it does not know alone", () => {
    expect(fillFacts("Hi {customer}", { ...base, business: "", person: "" })).toBe("Hi {customer}");
  });
});

describe("joinParts", () => {
  it("joins only the parts that have a value", () => {
    expect(joinParts(["a", "b"])).toBe("a · b");
    expect(joinParts(["", "b"])).toBe("b");
    expect(joinParts(["a", null, "  "])).toBe("a");
    expect(joinParts(["", undefined])).toBe("");
    expect(joinParts(["x", "y"], ", ")).toBe("x, y");
  });
});

describe("fillFacts: values with dollar patterns", () => {
  it("keeps $& and $' in a value as literal text", () => {
    const out = fillFacts("Book here: {link}.", { ...base, business: "A", person: "B", values: { link: "https://x.test/p?a=$&b=$'c" } });
    expect(out).toBe("Book here: https://x.test/p?a=$&b=$'c.");
  });
});
