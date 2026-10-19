const fs=require("fs");
const rd=f=>fs.readFileSync(f+".jsonl","utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const tasks=["T1","T2","T3","T4","T5","T6"];
const vals=(f)=>{const r=rd(f);const o={};for(const t of tasks)o[t]=r.filter(x=>x.task===t).map(x=>x.declarations);return o};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
let rng=12345;const rand=()=>{rng=(rng*1103515245+12345)%2147483648;return rng/2147483648};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// stratified permutation: statistic = sum over tasks of (meanB-meanA)/scale_t ; one-sided (B lower)
function strat(A,B,scaleRel,N=20000){
  const stat=(A,B)=>tasks.reduce((s,t)=>{const sc=scaleRel?Math.max(1,mean(A[t].concat(B[t]))):1;return s+(mean(B[t])-mean(A[t]))/sc},0);
  const obs=stat(A,B);let c=0;
  for(let i=0;i<N;i++){const A2={},B2={};for(const t of tasks){const p=shuffle(A[t].concat(B[t]));A2[t]=p.slice(0,A[t].length);B2[t]=p.slice(A[t].length)}if(stat(A2,B2)<=obs+1e-9)c++}
  return [obs.toFixed(3),(c/N).toFixed(4)];
}
function signflip(A,B,rel){const d=tasks.map(t=>{const sc=rel?Math.max(1,mean(A[t].concat(B[t]))):1;return (mean(B[t])-mean(A[t]))/sc});const obs=d.reduce((s,x)=>s+x,0);let c=0,n=0;for(let m=0;m<64;m++){let s=0;d.forEach((x,i)=>s+=((m>>i)&1?-1:1)*x);n++;if(s<=obs+1e-9)c++}return (c/n).toFixed(4)}
const cmp=[["b1-current","d2"],["d2","b2"],["b1-current","a1"],["b1-current","c-pr5"],["b1-current","d1"]];
for(const [a,b] of cmp){const A=vals(a),B=vals(b);console.log(a,"->",b,"strat-abs",strat(A,B,false),"strat-rel",strat(A,B,true),"signflip-abs",signflip(A,B,false),"signflip-rel",signflip(A,B,true))}
// within-task SD pooled across all arms
const arms=["b1-current","a1","a2","a3","a4","c-pr4","c-pr5","d1","d2","b2"];
const sdT={},muT={};
for(const t of tasks){let ss=0,df=0;for(const a of arms){const v=vals(a)[t];const m=mean(v);ss+=v.reduce((s,x)=>s+(x-m)**2,0);df+=v.length-1}sdT[t]=Math.sqrt(ss/df);muT[t]=mean(vals("b1-current")[t])}
console.log("within-task SD",JSON.stringify(sdT),"B1 mu",JSON.stringify(muT));
// cost per run
for(const a of ["b0-none","b0-current","b1-current","d2","b2"]){const r=rd(a);console.log(a,"cost/run",(r.reduce((s,x)=>s+x.costUsd,0)/r.length).toFixed(3),"turns/run",(r.reduce((s,x)=>s+(x.turns||0),0)/r.length).toFixed(1))}
module.exports={sdT,muT};
