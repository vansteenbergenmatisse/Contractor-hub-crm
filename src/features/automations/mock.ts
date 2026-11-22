// MOCK DATA (Phase 2). The design's sample workflow set, grouped by the HighLevel workflow folders.
// Replaced in Phase 3 by the sub-account's real workflows (read through the HighLevel workflow API).
// Never treat any value here as a real business fact. Business details in the texts are {tokens};
// HighLevel fills them per customer, and the page resolves the business ones from the sub-account's custom values.
import type { Automation, Who } from "./types";

type Seed = [folder: string, name: string, when: number, wait: number, does: string, stop: number, who: Who, ran: number, msg: string];

export const MOCK_FOLDERS = ["Lead Capture", "Instant Replies", "Follow-Up + Booking", "Reviews", "Campaigns", "AI Agents"] as const;

const SEEDS: Seed[] = [
  ["Lead Capture", "Lead capture", 0, 0, "Makes the contact and a card in New Lead.", 0, "auto", 13, ""],
  ["Instant Replies", "Instant reply and same-day follow-ups", 0, 0, "One text at once, then 3 follow-ups the same day.", 1, "auto", 13, "Hi {first name}, this is {owner} from {business}. Thanks for reaching out. How can we help?"],
  ["Instant Replies", "Owner ping", 1, 1, "Pings your phone about the lead that waits.", 0, "auto", 2, "A new lead waits on you: {first name}, {service}."],
  ["Follow-Up + Booking", "Later-day chase", 2, 4, "Texts on day 2, 4, 7 and 14. Then the card moves to Check Back Later.", 3, "auto", 6, "Hi {first name}, still need help with {service}? Reply here and we set a time."],
  ["Follow-Up + Booking", "Online booking", 14, 0, "The job date lands in your calendar. The card moves to Job Scheduled. You get an alert.", 0, "auto", 4, "You are booked, {first name}. {business} comes {day} at {time}."],
  ["Follow-Up + Booking", "Estimate reminders", 3, 3, "A reminder 24 hours and 1 hour before the visit. The customer confirms with C.", 4, "auto", 5, "Reminder: {owner} from {business} visits {day} at {time}. Reply C to confirm."],
  ["Follow-Up + Booking", "Quote follow-up", 5, 5, "Follow-up texts on day 2, 6, 12 and 25. A decline gets one question: why?", 5, "auto", 5, "Hi {first name}, any questions about the quote? Happy to help."],
  ["Follow-Up + Booking", "Booking link after a yes", 6, 0, "Sends the customer a link to pick the job date.", 0, "auto", 1, "Great news, {first name}. Pick your job date here: {booking link}"],
  ["Follow-Up + Booking", "Job reminder", 7, 2, "A reminder the day before the job.", 0, "auto", 6, "Reminder: your {service} is tomorrow at {time}."],
  ["Follow-Up + Booking", "Invoice and payment reminders", 9, 6, "Payment reminders 3, 7 and 14 days after the due date.", 6, "auto", 3, "Friendly reminder: invoice {number} for {amount} is open. Pay here: {pay link}"],
  ["Follow-Up + Booking", "Check-in texts", 10, 7, "A seasonal check-in every 1 to 3 months.", 7, "auto", 4, "Hi {first name}, {owner} from {business} here. Anything we can help with this season?"],
  ["Follow-Up + Booking", "Stop on Lost", 11, 0, "Stops every text to that customer.", 0, "auto", 1, ""],
  ["Reviews", "Thank-you and review request", 8, 0, "A thank-you and a Google review request, one hour after the job is done.", 0, "auto", 2, "Thank you, {first name}. Would you leave us a review? {review link}"],
  ["Reviews", "Referral ask", 8, 8, "One text the day after. It asks for a referral and names your reward.", 0, "auto", 2, "Hi {first name}, know someone who needs {main keyword}? Reply YES. {referral reward}"],
  ["Campaigns", "Review campaign to old leads", 12, 0, "Asks past customers for a Google review. It skips people who already left one.", 0, "you", 0, "Hi {first name}, would you leave {business} a quick review? {review link}"],
  ["Campaigns", "Promotion campaign", 13, 0, 'Texts old leads your seasonal offer: "{seasonal offer}"', 0, "you", 0, "Hi {first name}, {seasonal offer}"],
  ["AI Agents", "AI quote builder", 4, 0, "Builds the quote from your service and price. You approve it on Quotes.", 0, "ok", 5, ""],
];

export function mockAutomations(): Automation[] {
  return SEEDS.map(([folder, name, when, wait, does, stop, who, ran, msg], i) => ({
    id: `wf-${i + 1}`, folder, name, when, wait, does, stop, who, ran, msg,
    on: true, gone: false, mine: false, changed: false,
  }));
}
