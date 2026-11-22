import { describe, expect, it } from "vitest";
import { fillFacts } from "@/shared/lib/fill-facts";

const none = { businessToken: "business", personToken: "owner", business: "", person: "" };

describe("fillFacts: a missing name shows nothing", () => {
  it.each([
    ["Hi {first name}, this is {owner} from {business}. Thanks for reaching out. How can we help?", "Hi {first name}. Thanks for reaching out. How can we help?"],
    ["You are booked, {first name}. {business} comes {day} at {time}.", "You are booked, {first name}. We come {day} at {time}."],
    ["Reminder: {owner} from {business} visits {day} at {time}. Reply C to confirm.", "Reminder: we visit {day} at {time}. Reply C to confirm."],
    ["Hi {first name}, {owner} from {business} here. Anything we can help with this season?", "Hi {first name}. Anything we can help with this season?"],
    ["Hi {first name}, would you leave {business} a quick review? {review link}", "Hi {first name}, would you leave a quick review? {review link}"],
    ["This is {business}. {owner} calls.", "We call."],
  ])("%s", (text, want) => {
    expect(fillFacts(text, none)).toBe(want);
  });
  it("keeps the one name it has", () => {
    expect(fillFacts("Hi, this is {owner} from {business}.", { ...none, business: "Test Co" })).toBe("Hi, this is Test Co.");
    expect(fillFacts("Hi, this is {owner} from {business}.", { ...none, person: "Sam" })).toBe("Hi, this is Sam.");
  });
});
