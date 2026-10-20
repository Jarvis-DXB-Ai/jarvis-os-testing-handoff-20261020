/** Drawing-buffer budget, separate from native-resolution HTML labels. */
export const pixelBudget = (mobile: boolean) => mobile ? 1_200_000 : 2_000_000;
export function ratioLimit(width: number, height: number, deviceRatio: number, mobile: boolean) {
 return Math.min(Math.max(1, deviceRatio || 1), mobile ? 2 : 1.5,
  Math.sqrt(pixelBudget(mobile) / Math.max(1, width * height)));
}
export type QualityState = {ratio:number;max:number;min:number;start:number;count:number;interval:number;cpu:number;slow:number;fast:number;changedAt:number;changes:number};
export function createQuality(max: number, now = 0): QualityState {
 return {ratio:max,max,min:Math.min(1,max),start:now,count:0,interval:0,cpu:0,slow:0,fast:0,changedAt:now,changes:0};
}
export function resizeQuality(q: QualityState, max: number, now: number) {
 q.max=max;q.min=Math.min(1,max);q.ratio=Math.max(q.min,Math.min(q.ratio,q.max));
 resetWindow(q,now);q.slow=0;q.fast=0;
}
function resetWindow(q:QualityState,now:number){q.start=now;q.count=0;q.interval=0;q.cpu=0;}
/** Render-completion intervals are a cadence signal, not GPU timing or measured display FPS. */
export function sampleQuality(q:QualityState,now:number,intervalMs:number,cpuMs:number,budgetMs:number) {
 if(!Number.isFinite(intervalMs)||!Number.isFinite(cpuMs)||intervalMs<=0||intervalMs>250){
  resetWindow(q,now);q.slow=0;q.fast=0;return;
 }
 q.count++;q.interval+=intervalMs;q.cpu+=cpuMs;
 if(now-q.start<2000||q.count<20)return;
 const interval=q.interval/q.count,cpu=q.cpu/q.count;
 const slow=interval>budgetMs*1.45||cpu>budgetMs*.85;
 const fast=interval<=budgetMs*1.18&&cpu<budgetMs*.65;
 q.slow=slow?q.slow+1:0;q.fast=fast?q.fast+1:0;
 if(now-q.changedAt>=6000){
  const next=q.slow>=2?Math.max(q.min,q.ratio-.125):q.fast>=3?Math.min(q.max,q.ratio+.125):q.ratio;
  if(next!==q.ratio){q.ratio=next;q.changedAt=now;q.changes++;q.slow=0;q.fast=0;}
 }
 resetWindow(q,now);
}
