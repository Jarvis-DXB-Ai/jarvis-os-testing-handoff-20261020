import * as T from 'three';
import fingerPads from './finger-pads.json';
export type KeyboardTarget={center:number[];right:number[];forward:number[];keyboardTop?:number};
type Hand={side:'L'|'R';upper:T.Bone;elbow:T.Bone;wrist:T.Bone;index:T.Bone;pinky:T.Bone;tip:T.Bone;target:T.Vector3};
type Finger={side:'L'|'R';number:number;joints:T.Bone[];tip:T.Bone;pad:T.Vector3};
export type KeyboardPose={root:T.Object3D;hands:Hand[];fingers:Finger[];keyHeight:number;right:T.Vector3;forward:T.Vector3;maxError:number};
const v=Array.from({length:20},()=>new T.Vector3()),q=Array.from({length:5},()=>new T.Quaternion()),m=Array.from({length:2},()=>new T.Matrix4());
function turn(bone:T.Bone,delta:T.Quaternion){
 const parent=bone.parent;if(!parent)return;parent.getWorldQuaternion(q[3]);q[4].copy(q[3]).invert().multiply(delta).multiply(q[3]);bone.quaternion.premultiply(q[4]);bone.updateWorldMatrix(true,true);
}
function tipPosition(hand:Hand,out:T.Vector3){
 hand.tip.getWorldPosition(out);hand.tip.parent!.getWorldPosition(v[18]);v[19].copy(out).sub(v[18]).multiplyScalar(.75);return out.add(v[19]);
}
function orientPalm(pose:KeyboardPose,hand:Hand){
 hand.wrist.getWorldPosition(v[0]);hand.index.getWorldPosition(v[1]);hand.pinky.getWorldPosition(v[2]);tipPosition(hand,v[3]);
 const along=v[4].copy(v[3]).sub(v[0]).normalize(),across=v[5].copy(v[1]).sub(v[2]);across.addScaledVector(along,-across.dot(along)).normalize();
 const normal=v[6].crossVectors(along,across).normalize();m[0].makeBasis(across,normal,along);
 const desired=v[7].copy(pose.forward).addScaledVector(T.Object3D.DEFAULT_UP,-.06).normalize(),side=v[8].copy(pose.right).multiplyScalar(hand.side==='L'?-1:1);side.addScaledVector(desired,-side.dot(desired)).normalize();
 const up=v[9].crossVectors(desired,side).normalize();m[1].makeBasis(side,up,desired);
 q[0].setFromRotationMatrix(m[1]).multiply(q[1].setFromRotationMatrix(m[0]).invert());turn(hand.wrist,q[0]);
}
function solveArm(pose:KeyboardPose,hand:Hand,target:T.Vector3){
 hand.upper.getWorldPosition(v[0]);hand.elbow.getWorldPosition(v[1]);hand.wrist.getWorldPosition(v[2]);
 const upper=v[0].distanceTo(v[1]),lower=v[1].distanceTo(v[2]),axis=v[3].copy(target).sub(v[0]);
 const distance=T.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.001,upper+lower-.001);axis.normalize();
 const reach=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-reach*reach));
 const pole=v[4].copy(pose.right).multiplyScalar(hand.side==='L'?.6:-.6).addScaledVector(pose.forward,-.35).addScaledVector(T.Object3D.DEFAULT_UP,-.5);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
 const elbow=v[5].copy(v[0]).addScaledVector(axis,reach).addScaledVector(pole,height);
 q[0].setFromUnitVectors(v[6].copy(v[1]).sub(v[0]).normalize(),v[7].copy(elbow).sub(v[0]).normalize());turn(hand.upper,q[0]);
 hand.elbow.getWorldPosition(v[0]);hand.wrist.getWorldPosition(v[1]);q[0].setFromUnitVectors(v[6].copy(v[1]).sub(v[0]).normalize(),v[7].copy(target).sub(v[0]).normalize());turn(hand.elbow,q[0]);
}
export function createKeyboardPose(root:T.Object3D,target:KeyboardTarget,nameFor:(o:T.Object3D)=>string):KeyboardPose{
 const bones=new Map<string,T.Bone>();root.traverse(o=>{if(o instanceof T.Bone)bones.set(nameFor(o),o);});
 const right=new T.Vector3().fromArray(target.right).normalize(),forward=new T.Vector3().fromArray(target.forward).normalize(),hands:Hand[]=[];
 for(const side of ['L','R'] as const){const names=['upperarm01','lowerarm01','wrist','finger2-1','finger5-1','finger3-3'];const values=names.map(n=>bones.get(n+'.'+side));if(values.some(b=>!b))throw Error('Missing keyboard arm chain '+root.name+side);
  const [upper,elbow,wrist,index,pinky,tip]=values as T.Bone[];hands.push({side,upper,elbow,wrist,index,pinky,tip,target:new T.Vector3().fromArray(target.center).addScaledVector(right,side==='L'?.085:-.085).addScaledVector(forward,.008)});
 }
 const seatId=root.userData.officeSeat??root.name.replace(/^agent:/,'');
 const pads=fingerPads[seatId as keyof typeof fingerPads] as Record<string,number[]>|undefined;if(!pads)throw Error('Missing physical finger pads '+seatId);
 const fingers:Finger[]=[];for(const side of ['L','R'] as const)for(const number of [2,3,4,5]){
  const joints=[1,2,3].map(j=>bones.get('finger'+number+'-'+j+'.'+side));if(joints.some(b=>!b)||!pads[side+number])throw Error('Missing typing finger '+seatId+side+number);
  fingers.push({side,number,joints:joints as T.Bone[],tip:joints[2]!,pad:new T.Vector3().fromArray(pads[side+number])});
 }
 const pose={root,hands,fingers,keyHeight:target.keyboardTop??target.center[1]-.0085,right,forward,maxError:0};applyKeyboardPose(pose);return pose;
}
/** Correct the existing arm joints after the clip; keep body placement, bone lengths and finger motion. */
export function applyKeyboardPose(pose:KeyboardPose){
 let max=0;for(const hand of pose.hands){
  for(let pass=0;pass<2;pass++){orientPalm(pose,hand);hand.wrist.getWorldPosition(v[10]);tipPosition(hand,v[11]);const target=v[12].copy(hand.target).sub(v[11]).add(v[10]);solveArm(pose,hand,target);orientPalm(pose,hand);}
  max=Math.max(max,tipPosition(hand,v[13]).distanceTo(hand.target));
 }pose.maxError=max;
}
export function keyboardErrors(pose:KeyboardPose){return pose.hands.map(hand=>tipPosition(hand,v[13]).distanceTo(hand.target));}
/** Copy endpoints on cloned tracks so the source glTF clip remains untouched. */
function closeQuaternionLoop(clip:T.AnimationClip){
 const closed=clip.clone();for(const track of closed.tracks)if(track instanceof T.QuaternionKeyframeTrack&&track.values.length>=8){track.values.set(track.values.subarray(0,4),track.values.length-4);}return closed;
}
/** Solve once at load, then play ordinary quaternion tracks; no per-frame IK. */
export function bakeKeyboardClip(rig:{root:T.Object3D;mixer:T.AnimationMixer;clip:T.AnimationClip;action:T.AnimationAction},pose:KeyboardPose){
 const input=rig.clip;rig.action.stop();rig.mixer.uncacheClip(input);rig.clip=closeQuaternionLoop(input);rig.action=rig.mixer.clipAction(rig.clip);
 const old=rig.clip,steps=Math.max(1,Math.ceil(old.duration*24)),times=new Float32Array(steps+1);
 const bones=pose.hands.flatMap(hand=>[hand.upper,hand.elbow,hand.wrist]),values=bones.map(()=>new Float32Array((steps+1)*4));
 rig.action.reset().play();
 for(let i=0;i<=steps;i++){const time=old.duration*i/steps;times[i]=time;rig.mixer.setTime(time);applyKeyboardPose(pose);for(let b=0;b<bones.length;b++)bones[b].quaternion.toArray(values[b],i*4);}
 rig.action.stop();rig.mixer.uncacheClip(old);
 const names=new Set(bones.map(b=>b.name+'.quaternion'));
 rig.clip=closeQuaternionLoop(new T.AnimationClip('typing',old.duration,[...old.tracks.filter(t=>!names.has(t.name)),...bones.map((bone,i)=>new T.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values[i]))]));
 applyKeyboardPose(pose);rig.action=rig.mixer.clipAction(rig.clip);
 bakeFingerStrikes(rig,pose);
}
function fingerHeight(finger:Finger,height:number){
 for(let pass=0;pass<6;pass++)for(const joint of finger.joints){
  const point=finger.tip.localToWorld(v[14].copy(finger.pad)),error=height-point.y;if(Math.abs(error)<.00003)return;
  joint.getWorldPosition(v[15]);const offset=v[16].copy(point).sub(v[15]),axis=v[17].set(-offset.z,0,offset.x),reach=axis.length();if(reach<.0001)continue;axis.divideScalar(reach);
  q[0].setFromAxisAngle(axis,T.MathUtils.clamp(error/reach,-.18,.18));turn(joint,q[0]);
 }
}
/** Each physical fingertip lifts independently and returns to the key plane. Load-time bake only. */
function bakeFingerStrikes(rig:{mixer:T.AnimationMixer;clip:T.AnimationClip;action:T.AnimationAction},pose:KeyboardPose){
 const old=rig.clip,steps=Math.ceil(old.duration*24),times=new Float32Array(steps+1),bones=pose.fingers.flatMap(f=>f.joints),base=bones.map(b=>b.quaternion.clone()),values=bones.map(()=>new Float32Array((steps+1)*4));
 rig.action.reset().play();
 for(let i=0;i<=steps;i++){
  const time=old.duration*i/steps;times[i]=time;for(let b=0;b<bones.length;b++)bones[b].quaternion.copy(base[b]);rig.mixer.setTime(time);
  for(const finger of pose.fingers){const phase=(finger.number-2)*.9+(finger.side==='R'?Math.PI:0),cycles=finger.number%2?3:2,lift=.008*(.5-.5*Math.cos(2*Math.PI*cycles*time/old.duration+phase));fingerHeight(finger,pose.keyHeight+.001+lift);}
  for(let b=0;b<bones.length;b++)bones[b].quaternion.toArray(values[b],i*4);
 }
 rig.action.stop();rig.mixer.uncacheClip(old);for(let b=0;b<bones.length;b++)bones[b].quaternion.copy(base[b]);
 const names=new Set(bones.map(b=>b.name+'.quaternion'));rig.clip=closeQuaternionLoop(new T.AnimationClip('typing',old.duration,[...old.tracks.filter(t=>!names.has(t.name)),...bones.map((bone,i)=>new T.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values[i]))]));
 for(const finger of pose.fingers)fingerHeight(finger,pose.keyHeight+.001);rig.action=rig.mixer.clipAction(rig.clip);
}
