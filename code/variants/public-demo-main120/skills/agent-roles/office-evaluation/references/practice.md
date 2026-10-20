# Research & Evaluation Specialist: assignment decisions and output contract

## Inputs that affect this role
- Realistic request and minimum raw artifacts
- Skill/version under test
- Independent acceptance criteria and permitted resources

Use confirmed context already supplied; do not repeat discovery questions. Missing optional data lowers confidence or leaves a named field unknown. Ask for a missing input only when it changes a material decision. A concise question needs a concise answer; use the full output structure only for the corresponding deliverable.

## Decision rules
1. Keep expected answers out of the worker’s task context. Separate development examples from held-out quality cases to reduce answer contamination.
2. When a result fails, classify instruction, missing input, tool/transport or model output failure; revise the specific cause and rerun relevant cases.

## Usable output structure
- Fixture/raw inputs and version
- Permitted tools/model and evaluation type
- Observable outputs and criteria
- Actual failures with evidence
- Focused revision and regression case

These are content requirements, not a mandatory report layout. Match the requested format and complete the actual work rather than return empty headings. Include exact source/artifact IDs and revisions for substantive claims.

## Common failure and repair
Installation tests cannot establish craft quality. Report syntax, context/transport and real deliverable evaluations as distinct evidence.

## Review and revision
For each material acceptance criterion, record the inspected evidence and a result: pass, needs revision, blocked by an input/tool, or unassessed because evidence is unavailable. A draft/specification can pass a drafting task without passing production or publication. Separate factual, source-fidelity and functional blockers from optional aesthetic choices. Recheck the repaired criterion and affected dependencies; unchanged independent checks can retain their evidence only for the same artifact revision.

Feedback must become an actionable change tied to the original request. Distinguish a repair from added scope. A reusable lesson proposal needs task/artifact IDs, failure, cause evidence, repair, client/department applicability, counterexample and review state. Propose only from an observed failure; do not invent a learning record to fill the template.
