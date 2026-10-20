// Only explicit whole-response limits are machine-enforced. Per-caption and
// per-section limits remain scoped review criteria, never guessed as global caps.
export function outputWordCount(output){return String(output??'').match(/[\p{L}\p{N}]+(?:['’’-][\p{L}\p{N}]+)*/gu)?.length??0;}
// Read limits only from an explicit whole-artifact criterion. This tolerates
// compact owner input ("the900–1200word contract") without treating limits on
// individual captions, sections or slide copy as limits on the whole package.
export function outputLengthLimits(criterion){
  const text=String(criterion??'');
  if(!/^(?:the\s+)?(?:(?:entire|whole|total|complete|final)\s+)?(?:response|deliverable|output|text)\b/i.test(text))return null;
  const sentence=text.split(/[.!?]/)[0];
  const number='(\\d{1,3}(?:,\\d{3})+|\\d+)';
  const range=new RegExp(`${number}\\s*[-–—]\\s*${number}\\s*-?\\s*words?\\b|between\\s+${number}\\s+and\\s+${number}\\s*words?\\b`,'i').exec(sentence);
  const maximum=new RegExp(`\\b(?:at most|no more than|maximum(?: of)?|max(?:imum)?[: ]*|under|fewer than|less than)\\s*${number}\\s*words?\\b`,'i').exec(sentence);
  const match=range??maximum;
  if(!match||/\b(?:each|per|section|caption|slide|story|paragraph|heading|title)\b/i.test(sentence.slice(0,match.index)))return null;
  if(/^\s*(?:per\s+|(?:for|in)\s+(?:each|every)\s+)(?:section|caption|slide|story|paragraph|heading|title)\b/i.test(sentence.slice(match.index+match[0].length)))return null;
  // Approximate targets guide drafting but are not strict machine gates.
  if(/\b(?:about|roughly|approximately|around)\s*$/i.test(sentence.slice(0,match.index)))return null;
  const value=n=>Number(n.replaceAll(',',''));
  if(range){const min=value(range[1]??range[3]),max=value(range[2]??range[4]);return min<=max?{min,max}:null;}
  const max=value(maximum[1])-(/^(?:under|fewer than|less than)\b/i.test(maximum[0])?1:0);
  return {min:0,max};
}
export function assembledOutputContract(criteria=[]){
  const limits=criteria.map(outputLengthLimits).filter(Boolean);
  if(!limits.length)return 'Follow the owner\'s requested length and format. If no length is specified, keep the finished artifact concise; do not add a generic 1500-word target.';
  const min=Math.max(...limits.map(l=>l.min)),max=Math.min(...limits.map(l=>l.max));
  if(min>max)throw new Error('Whole-deliverable length requirements contradict each other.');
  return `The entire finished deliverable must contain ${min?`${min}–${max}`:`at most ${max}`} words, including all headings, caveats and notes. Use the same Unicode lexical word counter as final QA; punctuation-only tokens do not count. Aim inside the allowed boundary. This applies to the final artifact, not internal head reports.`;
}
export function enforceOutputChecks(qa,output) {
  const count=outputWordCount(output);
  const checks=qa.checks.map(check=>{
    const limit=outputLengthLimits(check.criterion);
    if(!limit||count>=limit.min&&count<=limit.max)return check;
    return {...check,pass:false,evidence:`Deterministic length check: ${count} words across the entire response, outside ${limit.min}–${limit.max}. Headings, notes and appended commentary count. Model evidence: ${check.evidence}`};
  });
  return {...qa,checks,pass:qa.pass&&checks.every(check=>check.pass)};
}
