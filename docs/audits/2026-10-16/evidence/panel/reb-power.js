let s=987654321;const rand=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)/4294967296)};
const norm=()=>{let u=0,v=0;while(!u)u=rand();v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function signP(w,n){let p=0,c=1;for(let k=0;k<=n;k++){if(k>=w)p+=c/2**n;c=c*(n-k)/(k+1)}return p}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function flipP(d,N=1000){const o=mean(d);let c=0;for(let i=0;i<N;i++){const s=mean(d.map(x=>rand()<.5?-x:x));if(s<=o+1e-9)c++}return (c+1)/(N+1)}
// binary trap, fail=1; master lowers fail rate by Delta. Calibrated: none fail rate p0 in [lo,hi].
function sim(K,R,lo,hi,Delta,sims=500){let pw={flip:0,strat:0,typeI_strat:0};for(const D of [Delta,0]){for(let k=0;k<sims;k++){const A=[],B=[],d=[];for(let t=0;t<K;t++){const p0=lo+rand()*(hi-lo);const p1=Math.min(1,Math.max(0,p0-D+0.15*norm()*(D>0)));const a=[],b=[];for(let r=0;r<R;r++){a.push(rand()<p0?1:0);b.push(rand()<p1?1:0)}A.push(a);B.push(b);d.push(mean(b)-mean(a))}
 const st=(A,B)=>A.reduce((s,a,t)=>s+mean(B[t])-mean(a),0);const o=st(A,B);let c=0;for(let i=0;i<400;i++){const A2=[],B2=[];A.forEach((a,t)=>{const p=shuffle(a.concat(B[t]));A2.push(p.slice(0,R));B2.push(p.slice(R))});if(st(A2,B2)<=o+1e-9)c++}const sp=(c+1)/401;
 if(D>0){if(flipP(d)<=.05)pw.flip++;if(sp<=.05)pw.strat++}else if(sp<=.05)pw.typeI_strat++}}
 for(const x in pw)pw[x]=(pw[x]/sims).toFixed(2);return pw}
for(const [K,R] of [[4,3],[6,3],[8,3],[6,5],[8,4]])for(const D of [0.3,0.5])console.log(`traps K=${K} R=${R} none-fail .5-.9 Delta=${D}`,JSON.stringify(sim(K,R,0.5,0.9,D)));
