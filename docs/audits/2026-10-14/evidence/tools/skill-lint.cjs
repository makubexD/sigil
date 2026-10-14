const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../../../../catalog');
const files=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?w(p):files.push(p);}})(root);
const skills=files.filter(f=>/SKILL\.md$|\.skill\.md$/.test(f)), agents=files.filter(f=>/\.agent\.md$/.test(f));
function lint(f){const t=fs.readFileSync(f,'utf8');const fm=(t.match(/^---\n([\s\S]*?)\n---/)||['',''])[1];const body=t.slice(fm.length+8);
 const desc=fm+'';return{f:path.relative(root,f),kb:+(t.length/1024).toFixed(1),
 negTrigger:/not for|do not use|don't use|NOT for|instead use|use .* instead/i.test(desc),
 redFlags:/^#+ .*(red flag|anti-pattern|avoid|common mistake)/im.test(body),
 rationalizations:/^#+ .*rationali/im.test(body),
 verification:/^#+ .*(verif|checklist|done when|definition of done)/im.test(body),
 examples:/```/.test(body),
 badGood:/(❌|✅|\bBad\b|\bGood\b|Avoid:|Prefer:)/.test(body)};}
for(const [name,set] of [['skills',skills],['agents',agents]]){const r=set.map(lint);const c=k=>r.filter(x=>x[k]).length;
 console.log(name,r.length,'avgKB',(r.reduce((s,x)=>s+x.kb,0)/r.length).toFixed(1),'maxKB',Math.max(...r.map(x=>x.kb)),
 '| negTrigger',c('negTrigger'),'redFlags',c('redFlags'),'rationalizations',c('rationalizations'),'verification',c('verification'),'codeExamples',c('examples'),'bad/good',c('badGood'));}
