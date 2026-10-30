const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const LIM=10;
const MAP=require('./map.js'),boxes=MAP.boxes;
const srv=http.createServer((q,r)=>{const f=q.url.startsWith('/map.js')?'map.js':'index.html';fs.readFile(path.join(__dirname,f),(e,d)=>{r.writeHead(200,{'Content-Type':f==='map.js'?'application/javascript':'text/html'});r.end(d)})});
const wss=new WebSocketServer({server:srv});
const rooms=[];let nid=1;
const send=(p,m)=>{if(p.ws.readyState===1)p.ws.send(JSON.stringify(m))};
const bc=(r,m)=>r.players.forEach(p=>send(p,m));
const spawn=t=>MAP.spawn(t);
function getRoom(mode){let r=rooms.find(r=>r.mode===mode&&!r.started);if(!r){r={mode,players:[],started:false,score:[0,0],over:false};rooms.push(r)}return r}
function endRoom(r,w){if(r.over)return;r.over=true;r.started=false;bc(r,{t:'end',w,sc:r.score});const i=rooms.indexOf(r);if(i>-1)rooms.splice(i,1)}
function wall(o,d){let best=1e9;for(const[x,z,w,dd,h]of boxes){let t0=0,t1=1e9,ok=true;const mn=[x-w/2,0,z-dd/2],mx=[x+w/2,h,z+dd/2];
 for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-9){if(o[i]<mn[i]||o[i]>mx[i]){ok=false;break}}
 else{let a=(mn[i]-o[i])/d[i],b=(mx[i]-o[i])/d[i];if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1){ok=false;break}}}
 if(ok&&t0<best)best=t0}return best}
wss.on('connection',ws=>{
 const p={ws,id:nid++,room:null,team:0,hp:100,x:0,y:0,z:0,yaw:0,k:0,d:0,dead:0,name:'Player'};
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.t==='join'&&!p.room){const mode=[1,2,3,4].includes(m.mode)?m.mode:1;const r=getRoom(mode);p.room=r;
   p.team=r.players.filter(q=>q.team===0).length<=r.players.filter(q=>q.team===1).length?0:1;
   p.name=String(m.name||'').replace(/[^\w \-]/g,'').slice(0,12)||'Player';Object.assign(p,spawn(p.team));r.players.push(p);
   send(p,{t:'hello',id:p.id,team:p.team,x:p.x,z:p.z});
   if(r.players.length===mode*2){r.started=true;bc(r,{t:'start'})}else bc(r,{t:'wait',n:r.players.length,need:mode*2})}
  if(!p.room||!p.room.started||p.dead)return;
  if(m.t==='s'){p.x=+m.x||0;p.y=+m.y||0;p.z=+m.z||0;p.yaw=+m.yaw||0}
  if(m.t==='shoot'&&Array.isArray(m.o)&&Array.isArray(m.d)&&Date.now()-(p.ls||0)>90){p.ls=Date.now();
   const o=m.o.map(Number),l=Math.hypot(...m.d.map(Number))||1,d=m.d.map(v=>Number(v)/l);const wd=wall(o,d);let best=null,bd=1e9;
   for(const q of p.room.players){if(q.team===p.team||q.dead)continue;
    for(const h of [0.5,1.2,1.65]){const c=[q.x-o[0],q.y+h-o[1],q.z-o[2]],t=c[0]*d[0]+c[1]*d[1]+c[2]*d[2];if(t<0||t>wd)continue;
     const px=c[0]-d[0]*t,py=c[1]-d[1]*t,pz=c[2]-d[2]*t,rad=h>1.5?.25:.4;
     if(px*px+py*py+pz*pz<rad*rad&&t<bd){bd=t;best={q,head:h>1.5}}}}
   if(best){const q=best.q;q.hp-=best.head?100:34;send(p,{t:'hit',head:best.head});
    if(q.hp<=0){q.dead=1;q.d++;p.k++;bc(p.room,{t:'kill',a:p.name,v:q.name,head:best.head});p.room.score[p.team]++;if(p.room.score[p.team]>=LIM)endRoom(p.room,p.team);
     setTimeout(()=>{q.hp=100;q.dead=0;Object.assign(q,spawn(q.team));send(q,{t:'respawn',x:q.x,z:q.z})},3000)}
    else send(q,{t:'hp',hp:q.hp})}}
 });
 ws.on('close',()=>{const r=p.room;if(!r)return;r.players=r.players.filter(q=>q!==p);
 if(r.started&&!r.over){const a=r.players.some(q=>q.team===0),b=r.players.some(q=>q.team===1);if(!a||!b)endRoom(r,a?0:1)}
 if(!r.players.length&&rooms.includes(r))rooms.splice(rooms.indexOf(r),1);else if(!r.started&&!r.over)bc(r,{t:'wait',n:r.players.length,need:r.mode*2})});
});
setInterval(()=>{for(const r of rooms)if(r.started)bc(r,{t:'w',p:r.players.map(q=>({id:q.id,team:q.team,x:q.x,y:q.y,z:q.z,yaw:q.yaw,dead:q.dead,k:q.k,d:q.d,n:q.name})),sc:r.score})},50);
setInterval(()=>wss.clients.forEach(c=>c.readyState===1&&c.ping()),25000);
srv.listen(process.env.PORT||3000,()=>console.log('Open http://localhost:'+(process.env.PORT||3000)));
