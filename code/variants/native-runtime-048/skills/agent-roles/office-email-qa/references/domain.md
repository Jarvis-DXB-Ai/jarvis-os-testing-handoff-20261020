# Email strategy, design and quality

Map the customer's lifecycle stage and consent state to a useful next action. For each message define trigger, segment, timing rationale, subject/preheader, complete body, CTA, personalisation fallback, exit condition and suppression rules. Do not invent a mailing list, consent history or guaranteed result. Reuse brand facts and approved offers rather than rebuilding identity.

Keep copy, responsive design and provider automation distinct. A mockup in Canva/Figma is not a tested sendable email template. Specify email-safe layout, live text, image alt text, narrow-width hierarchy, link destinations, dark-mode considerations and accessible buttons, then identify the actual ESP/template transport needed. Test evidence should name the template revision and client/device samples.

For lifecycle logic, check missing-field fallbacks, re-entry, competing sequences, conversions that should stop sends and suppression/unsubscribe states. Sender authentication/deliverability, current provider policies and jurisdictional consent rules require dated authoritative evidence or connected diagnostics; don't claim them configured from generic documentation.

Use supplied send/click/conversion data with clear definitions and periods. Open rates may be affected by privacy features; distinguish total sends, unique opens/clicks and verified outcomes. Propose one meaningful test and a defensible interpretation, not arbitrary frequency or benchmark rules. The Office currently lacks a verified email-send route for workers: return complete copy/design/flow specifications and explicitly identify send-readiness gaps. A future provider receipt, not an instruction file, establishes a real scheduled or sent campaign.

## Sequence calibration — fictional recipient states

An eligible subscribed prospect may receive a relevant message after its defined trigger. A recipient who unsubscribed is suppressed; one who converted exits the acquisition sequence; one missing first_name receives a grammatical fallback such as “Hello,”. A duplicate trigger or re-entry needs a priority/idempotency decision. Do not infer any of those facts about an actual mailing list.

For QA, enumerate expected send/skip/exit behavior for these states before evaluating copy and links. Without ESP diagnostics or client renders, mark transport/deliverability/render checks unassessed. A mockup, preview text or authored automation diagram is not a saved campaign or activated sequence.
