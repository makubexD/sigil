let s=987654321;const rand=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)/4294967296)};
const norm=()=>{let u=0,v=0;while(!u)u=rand();v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function signP(w,n){let p=0,c=1;for(let k=0;k<=n;k++){if(k>=w)p+=c/2**n;c=c*(n-k)/(k+1)}return p}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function stratP(A,B,N=400){const st=(A,B)=>A.reduce((s,a,t)=>s+(mean(B[t])-mean(a))/Math.max(1,mean(a.concat(B[t]))),0);const o=st(A,B);let c=0;for(let i=0;i<N;i++){const A2=[],B2=[];A.forEach((a,t)=>{const p=shuffle(a.concat(B[t]));A2.push(p.slice(0,a.length));B2.push(p.slice(a.length))});if(st(A2,B2)<=o+1e-9)c++}return (c+1)/(N+1)}
function flipP(d,N=400){const o=mean(d);let c=0;for(let i=0;i<N;i++){const s=mean(d.map(x=>rand()<.5?-x:x));if(s<=o+1e-9)c++}return (c+1)/(N+1)}
function sim(K,R,delta,tau,frozenFrac,sims=300){let p={sign:0,signFloor:0,flip:0,strat:0};
 for(let k=0;k<sims;k++){const A=[],B=[],d=[];let w=0,l=0;
  for(let t=0;t<K;t++){const mu=3+rand()*17;const cv=0.08+rand()*0.25;const frozen=rand()<frozenFrac;
   const dt=frozen?0:delta+tau*norm();
   const a=[],b=[];for(let r=0;r<R;r++){a.push(frozen?mu:Math.max(1,Math.round(mu*(1+cv*norm()))));b.push(frozen?mu:Math.max(1,Math.round(mu*(1-dt)*(1+cv*norm()))))}
   A.push(a);B.push(b);const di=(mean(b)-mean(a))/Math.max(1,mean(a.concat(b)));d.push(di);if(di<0)w++;else if(di>0)l++}
  const sp=signP(w,w+l);if(sp<=.05)p.sign++;if(sp<=.05&&(w-l)/K>=.2)p.signFloor++;if(flipP(d)<=.05)p.flip++;if(stratP(A,B)<=.05)p.strat++}
 for(const x in p)p[x]=(p[x]/sims).toFixed(2);return p}
console.log("declarations-type metric; delta=true mean relative reduction, tau=task heterogeneity SD, 1/6 tasks frozen (like T3)");
for(const [K,R] of [[6,3],[10,3],[12,3],[16,2],[16,3]])for(const [d,tau] of [[0,0.1],[0.1,0.1],[0.2,0.15],[0.3,0.15]])console.log(`K=${K} R=${R} delta=${d} tau=${tau}`,JSON.stringify(sim(K,R,d,tau,1/6)));
// binary trap outcome
function simBin(K,R,p0lo,p0hi,Delta,sims=400){let pw={sign:0,strat:0};for(let k=0;k<sims;k++){const A=[],B=[];let w=0,l=0;for(let t=0;t<K;t++){const p0=p0lo+rand()*(p0hi-p0lo);const p1=Math.min(1,Math.max(0,p0+Delta+0.15*norm()));const a=[],b=[];for(let r=0;r<R;r++){a.push(rand()<p0?0:1);b.push(rand()<p1?0:1)}/*1=fail; lower better*/A.push(a);B.push(b);const di=mean(b)-mean(a);if(di<0)w++;else if(di>0)l++}
 if(signP(w,w+l)<=.05)pw.sign++;
 // stratified perm on raw fails (no scaling)
 const st=(A,B)=>A.reduce((s,a,t)=>s+mean(B[t])-mean(a),0);const o=st(A,B);let c=0;for(let i=0;i<400;i++){const A2=[],B2=[];A.forEach((a,t)=>{const p=shuffle(a.concat(B[t]));A2.push(p.slice(0,R));B2.push(p.slice(R))});if(st(A2,B2)<=o+1e-9)c++}if((c+1)/401<=.05)pw.strat++}
 for(const x in pw)pw[x]=(pw[x]/sims).toFixed(2);return pw}
console.log("binary trap: none-arm trap-pass p0 in [lo,hi], rules raise pass by Delta");
for(const [K,R] of [[6,3],[8,3],[10,3],[8,5],[12,3]])for(const D of [0.2,0.35,0.5])console.log(`K=${K} R=${R} p0 0.2-0.6 Delta=${D}`,JSON.stringify(simBin(K,R,0.2,0.6,D)));
