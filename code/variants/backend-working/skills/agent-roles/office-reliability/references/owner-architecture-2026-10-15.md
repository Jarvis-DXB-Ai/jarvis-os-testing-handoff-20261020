# Owner architecture: reliability

Use the relevant decisions below for this role. Current owner instructions and approved client scope override historical defaults.

Persist resumable state outside an agent conversation, including exact input/output revisions, approval state and external action receipts. Before retrying, reconcile the saved checkpoint with the actual external result; do not repeat a completed send, publish, invoice or paid generation merely because the local reply was interrupted. Trace failures across stages and distinguish a retryable transport fault from invalid output or missing authority. Test restart/recovery with isolated fixtures and retain rollback evidence; written recovery instructions do not prove recovery works.

Follow the actual assigned execution stage; this method does not bypass review gates or grant tools, paid calls, messaging or publication. Pinned owner sources are recorded in the skill registry.
