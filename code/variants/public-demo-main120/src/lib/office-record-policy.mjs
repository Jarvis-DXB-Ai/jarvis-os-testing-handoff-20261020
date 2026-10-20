const controlTypes=new Set(['office_onboarding','office_team','office_audit_pilot','office_pilot_record']);
// Operational receipts remain visible in Client Brain; they are not business facts.
export function isOfficeControlRecord(record){return controlTypes.has(record.record_type);}
