const THREE = window.THREE;

const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp = (a,b,t)=>a+(b-a)*t;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const LR = mulberry32(20260906);
const h1 = n => { const s=Math.sin(n*12.9898)*43758.5453; return s-Math.floor(s); };
const PAL = [0xe8442e,0xf5a623,0xffd23f,0x3ec6a5,0x3b7ff0,0x9b59d0,0xff5fa2,0x2ec4b6].map(c=>new THREE.Color(c));
const INKC = new THREE.Color(0x101018);
const BLUE = new THREE.Color(0x24409e);
const RED  = new THREE.Color(0xd23b2f);

const GRAV=-58, JUMP=22, RUN=9.5, MAXINK=30;
const TAU=Math.PI*2;

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0xf7f3ea);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 400);
cam.position.set(0,6,30);

const pxScale = ()=> renderer.domElement.height*0.5/Math.tan(THREE.MathUtils.degToRad(25));

const SPLAT_VS = `
attribute float size; attribute float alpha; attribute float texid; attribute vec3 pcolor;
varying vec3 vC; varying float vA; varying float vT;
uniform float px;
void main(){
  vC=pcolor; vA=alpha; vT=texid;
  vec4 mv = modelViewMatrix*vec4(position,1.0);
  gl_PointSize = size*px/max(0.001,-mv.z);
  gl_Position = projectionMatrix*mv;
}`;
const SPLAT_FS = `
uniform sampler2D map;
varying vec3 vC; varying float vA; varying float vT;
void main(){
  float a = texture2D(map, vec2(gl_PointCoord.x*0.25 + vT*0.25, gl_PointCoord.y)).a * vA;
  if(a<0.02) discard;
  gl_FragColor = vec4(mix(vec3(1.0), vC, min(a,1.0)), 1.0);
}`;
const FILL_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const FILL_FS = `
uniform sampler2D map; uniform vec3 color; uniform float flash; uniform vec2 celloff;
varying vec2 vUv;
void main(){
  float a = texture2D(map, vec2(vUv.x*0.25+celloff.x, vUv.y)).a;
  if(a<0.02) discard;
  gl_FragColor = vec4(mix(vec3(1.0), mix(color,vec3(1.0),flash), a), 1.0);
}`;

function splatAtlas(){
  const c=document.createElement('canvas'); c.width=1024; c.height=256;
  const g=c.getContext('2d');
  for(let i=0;i<4;i++){
    g.save(); g.translate(i*256+128,128);
    const n=11+(LR()*6|0);
    g.fillStyle='#000'; g.beginPath();
    for(let k=0;k<=n;k++){
      const ang=(k%n)/n*TAU;
      const r=58+34*Math.sin(ang*2.7+i*3)+22*Math.sin(ang*5.1+i)+(LR()-0.5)*26;
      const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
      if(k===0)g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.closePath(); g.fill();
    for(let d=0;d<8;d++){
      const ang=LR()*TAU, dist=72+LR()*52;
      g.beginPath(); g.arc(Math.cos(ang)*dist,Math.sin(ang)*dist,3+LR()*11,0,TAU); g.fill();
    }
    g.globalCompositeOperation='destination-out';
    for(let s=0;s<4;s++){
      g.strokeStyle='rgba(0,0,0,'+(0.2+LR()*0.3)+')'; g.lineWidth=4+LR()*7;
      g.beginPath(); const a0=LR()*TAU;
      g.moveTo(Math.cos(a0)*12,Math.sin(a0)*12);
      g.quadraticCurveTo((LR()-0.5)*90,(LR()-0.5)*90,Math.cos(a0+1.5)*(50+LR()*30),Math.sin(a0+1.5)*(50+LR()*30));
      g.stroke();
    }
    g.restore();
  }
  return new THREE.CanvasTexture(c);
}
const splatTex = splatAtlas();

function mkPS(max,z,order){
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(max*3), col=new Float32Array(max*3),
        sz=new Float32Array(max), al=new Float32Array(max), tx=new Float32Array(max);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcolor',new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size',new THREE.BufferAttribute(sz,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha',new THREE.BufferAttribute(al,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('texid',new THREE.BufferAttribute(tx,1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,60,0),500);
  const mat=new THREE.ShaderMaterial({
    uniforms:{map:{value:splatTex},px:{value:pxScale()}},
    vertexShader:SPLAT_VS, fragmentShader:SPLAT_FS,
    transparent:true, blending:THREE.MultiplyBlending, depthWrite:false
  });
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.position.z=z; pts.renderOrder=order;
  scene.add(pts);
  return {pts,geo,mat,cursor:0,arr:[],max,a:{pos,col,sz,al,tx}};
}
function spawnPS(S,x,y,vx,vy,color,size,tex,grav,life,drag,fade){
  const i=S.cursor; S.cursor=(i+1)%S.max;
  const {pos,col,sz,al,tx}=S.a;
  pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=(Math.random()-0.5)*0.25;
  col[i*3]=color.r; col[i*3+1]=color.g; col[i*3+2]=color.b;
  sz[i]=size; al[i]=1; tx[i]=tex;
  let e=S.arr[i]; if(!e){e={};S.arr[i]=e;}
  e.vx=vx; e.vy=vy; e.g=grav; e.life=life; e.t=0; e.drag=drag||0; e.fade=fade||0; e.alive=true; e.sp=1;
  return i;
}
function stepPS(S,dt){
  const {pos,al}=S.a; let dirty=false;
  for(let i=0;i<S.max;i++){
    const e=S.arr[i]; if(!e||!e.alive)continue;
    if(e.life>=900){continue;}
    e.t+=dt;
    if(e.t>=e.life){ e.alive=false; al[i]=0; dirty=true; continue; }
    e.vy+=e.g*dt;
    if(e.drag){const k=Math.exp(-e.drag*dt);e.vx*=k;e.vy*=k;}
    pos[i*3]+=e.vx*dt; pos[i*3+1]+=e.vy*dt;
    const k=1-e.t/e.life;
    al[i]=e.fade>0? k*k : (e.sp>0?clamp(e.sp,0,1):1);
    dirty=true;
  }
  if(dirty){ S.geo.attributes.position.needsUpdate=true; S.geo.attributes.alpha.needsUpdate=true; }
}
function killPS(S,i){ S.a.al[i]=0; if(S.arr[i])S.arr[i].alive=false; }

const FX=mkPS(760,0.65,10), DEC=mkPS(300,-0.15,3), PB=mkPS(180,0.55,9), EB=mkPS(420,0.45,8);
function makeDecal(x,y,color,size){ const i=spawnPS(DEC,x,y,0,0,color,size,(Math.random()*4)|0,0,999,0,0); DEC.a.al[i]=0.55; }
function burst(x,y,n,speed,colors,sizeBase){
  for(let k=0;k<n;k++){
    const a=Math.random()*TAU, sp=speed*(0.25+Math.random()*0.9);
    const c=colors[(Math.random()*colors.length)|0];
    spawnPS(FX,x,y,Math.cos(a)*sp,Math.sin(a)*sp+2,c,(sizeBase||0.5)*(0.5+Math.random()),(Math.random()*4)|0,-16,0.5+Math.random()*0.7,0.5,1);
  }
}

function makeSK(max,color,opa,opaB){
  const grp=new THREE.Group();
  const mk=(o)=>{
    const maxLines=max*2;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(maxLines*6),3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,60,0),500);
    const m=new THREE.LineBasicMaterial({color,transparent:true,opacity:o,depthWrite:false});
    const l=new THREE.LineSegments(g,m); l.frustumCulled=false; grp.add(l);
    return {g,a:g.attributes.position,mat:m,maxLines};
  };
  return {group:grp,a:mk(opa),b:mk(opaB)};
}
function drawSK(sk,segs,amp,tq,seed){
  const parts=[[sk.a,seed],[sk.b,seed+31.7]];
  for(const p of parts){
    const o=p[0], sd=p[1];
    let lines=0; const A=o.a.array;
    for(let i=0;i<segs.length;i++){
      if(lines+2>o.maxLines)break;
      const s=segs[i];
      let lx=s[0],ly=s[1];
      for(let sub=1;sub<=2;sub++){
        const t=sub/2;
        let mx=s[0]+(s[2]-s[0])*t, my=s[1]+(s[3]-s[1])*t;
        mx+=(h1((i*3+sub)*12.9898+sd*7.23+tq*49.19)-0.5)*amp;
        my+=(h1((i*5+sub)*7.131+sd*3.11+tq*49.19)-0.5)*amp;
        const o2=lines*6;
        A[o2]=lx;A[o2+1]=ly;A[o2+2]=0;A[o2+3]=mx;A[o2+4]=my;A[o2+5]=0;
        lines++; lx=mx; ly=my;
      }
    }
    o.g.setDrawRange(0,lines*2); o.a.needsUpdate=true;
  }
}
function circ(cx,cy,r,n,s){
  for(let i=0;i<n;i++){
    const a1=i/n*TAU, a2=(i+1)/n*TAU;
    s.push([cx+Math.cos(a1)*r,cy+Math.sin(a1)*r,cx+Math.cos(a2)*r,cy+Math.sin(a2)*r]);
  }
}
function kneeAt(hx,hy,fx,fy,l1,l2,dir){
  let dx=fx-hx,dy=fy-hy,d=Math.hypot(dx,dy);
  d=clamp(d,0.02,l1+l2-0.01);
  const base=Math.atan2(fy-hy,fx-hx);
  const ca=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1);
  const a=base+dir*Math.acos(ca);
  return [hx+Math.cos(a)*l1, hy+Math.sin(a)*l1];
}

/* ---------------- audio ---------------- */
let AC=null,MG=null,NOISE=null;
function ac(){
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); MG=AC.createGain(); MG.gain.value=0.5; MG.connect(AC.destination);}catch(e){AC=null;} }
  if(AC&&AC.state==='suspended')AC.resume();
  return AC;
}
function tone(f0,f1,dur,type,vol,delay){
  const a=ac(); if(!a)return;
  try{
    const t0=a.currentTime+(delay||0);
    const o=a.createOscillator(),g=a.createGain();
    o.type=type; o.frequency.setValueAtTime(Math.max(1,f0),t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t0+dur);
    g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    o.connect(g); g.connect(MG); o.start(t0); o.stop(t0+dur+0.05);
  }catch(e){}
}
function noiseS(dur,f0,f1,vol,delay){
  const a=ac(); if(!a)return;
  try{
    if(!NOISE){ NOISE=a.createBuffer(1,a.sampleRate,a.sampleRate); const d=NOISE.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; }
    const t0=a.currentTime+(delay||0);
    const src=a.createBufferSource(); src.buffer=NOISE; src.loop=true;
    const f=a.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(f0,t0); f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t0+dur);
    const g=a.createGain(); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
    src.connect(f); f.connect(g); g.connect(MG); src.start(t0); src.stop(t0+dur+0.05);
  }catch(e){}
}
const sndPew=()=>tone(820,180,0.08,'square',0.14);
const sndDry=()=>tone(140,90,0.06,'square',0.1);
const sndTick=()=>tone(1500,700,0.045,'triangle',0.16);
const sndJump=()=>tone(280,520,0.12,'triangle',0.2);
const sndDash=()=>noiseS(0.16,2400,260,0.35);
const sndClip=()=>{tone(1900,2600,0.05,'square',0.18);noiseS(0.06,3000,800,0.14);};
const sndSplat=()=>{noiseS(0.16,800,110,0.5);tone(150,60,0.18,'sine',0.3);};
const sndHurt=()=>{tone(320,70,0.35,'sawtooth',0.38);noiseS(0.2,600,120,0.3);};
const sndDie=()=>{tone(400,40,0.9,'sawtooth',0.5);noiseS(0.7,900,80,0.5);};
const sndCaw=()=>{tone(520,140,0.35,'sawtooth',0.16);tone(560,150,0.35,'sawtooth',0.12,0.03);};
const sndRoar=()=>{tone(90,38,1.4,'sawtooth',0.5);noiseS(1.2,300,60,0.4);};
const sndPhase=()=>{tone(200,900,0.5,'square',0.18);tone(90,45,0.8,'sawtooth',0.4);};
const sndWin=()=>[523,659,784,1047,1319].forEach((f,i)=>tone(f,f,0.18,'triangle',0.24,i*0.13));
let drone=null;
function droneOn(){
  const a=ac(); if(!a||drone)return;
  try{
    const o=a.createOscillator(); o.type='sawtooth'; o.frequency.value=49;
    const lfo=a.createOscillator(); lfo.frequency.value=0.22;
    const lg=a.createGain(); lg.gain.value=14; lfo.connect(lg); lg.connect(o.frequency);
    const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=240;
    const g=a.createGain(); g.gain.value=0.07;
    o.connect(f); f.connect(g); g.connect(MG); o.start(); lfo.start();
    drone={o,lfo,g};
  }catch(e){}
}
function droneOff(){
  if(!drone||!AC)return;
  try{ drone.g.gain.linearRampToValueAtTime(0.0001,AC.currentTime+1.2); drone.o.stop(AC.currentTime+1.3); drone.lfo.stop(AC.currentTime+1.3); }catch(e){}
  drone=null;
}

/* ---------------- world ---------------- */
const PLAT=[], WALL=[];
let mx=0, my=7, side=1;
PLAT.push({cx:0,top:0,w:30});
while(my<114){
  my+=3.0+LR()*1.1;
  const inCor=(my>50&&my<71)||(my>88&&my<106);
  if(inCor){
    PLAT.push({cx:(LR()-0.5)*3,top:my,w:5.4+(LR()<0.4?1.2:0)});
  } else {
    const w=4.2+LR()*3.2;
    const cx=side*(1.5+LR()*(10.5-w/2));
    const p={cx,top:my,w};
    if(LR()<0.15&&my>14){ p.move=true; p.ox=cx; p.amp=2.4+LR()*1.8; p.spd=0.7+LR()*0.8; p.ph=LR()*TAU; }
    PLAT.push(p);
    if(LR()<0.25){
      const w2=4+LR()*2.5;
      PLAT.push({cx:-side*(2+LR()*(9.5-w2/2)),top:my-0.3,w:w2});
    }
  }
  side*=-1;
}
PLAT.push({cx:0,top:117.5,w:9});
PLAT.push({cx:0,top:124,w:44});
PLAT.push({cx:-13,top:131.5,w:5});
PLAT.push({cx:13,top:131.5,w:5});

const CORR=[{x:4.6,y0:50,y1:71},{x:6.6,y0:88,y1:106}];
WALL.push({x0:-17.5,x1:-15,y0:-6,y1:116},{x0:15,x1:17.5,y0:-6,y1:116});
WALL.push({x0:-24.5,x1:-22,y0:124,y1:152},{x0:22,x1:24.5,y0:124,y1:152});
for(const c of CORR){ WALL.push({x0:-c.x-2,x1:-c.x,y0:c.y0,y1:c.y1},{x0:c.x,x1:c.x+2,y0:c.y0,y1:c.y1}); }

const ENEMIES=[];
{ let flip=0;
  for(const p of PLAT){
    if(p.top<13||p.top>114||p.move)continue;
    if(p.w<4.5&&LR()<0.5)continue;
    if(LR()<0.55){
      const tur=(flip++%3===2);
      ENEMIES.push({tur,x:p.cx,y:p.top+(tur?0.72:0.5),plat:p,hp:tur?4:3,vx:0,vy:0,f:1,ph:LR()*TAU,cd:1+LR()*2,aim:0,recoil:0,seed:LR()*9,on:false,sk:null,dead:false});
    }
  }
}
const skPool=[]; for(let i=0;i<18;i++)skPool.push(makeSK(42,0x26263c,0.95,0.32));
const skPlayer=makeSK(150,0x16225e,0.96,0.35); skPlayer.group.children.forEach(c=>c.renderOrder=8); scene.add(skPlayer.group);
const skBoss=makeSK(320,0x0c0c16,0.96,0.4); skBoss.group.children.forEach(c=>c.renderOrder=7); scene.add(skBoss.group);

function landCheck(x,y,prevY,halfW,halfH,vy){
  if(vy>0)return null;
  const bot=y-halfH, pbot=prevY-halfH;
  let best=null;
  for(const p of PLAT){
    const t=p.top;
    if(bot<=t+0.03&&pbot>=t-0.06&&Math.abs(x-p.cx)<=p.w/2+halfW*0.9){ if(best===null||t>best)best=t; }
  }
  return best;
}

/* static world sketch */
const wsegs=[];
const J=()=>LR()-0.5;
function sline(x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
  const n=clamp(Math.round(len/1.5),1,40);
  let lx=x1,ly=y1;
  for(let i=1;i<=n;i++){
    const t=i/n, e=(i<n?0.09:0.04);
    const mx2=x1+dx*t+J()*e, my2=y1+dy*t+J()*e;
    wsegs.push([lx,ly,mx2,my2]); lx=mx2; ly=my2;
  }
}
function rectWall(x0,x1,y0,y1){
  sline(x0,y0,x0,y1); sline(x1,y0,x1,y1); sline(x0,y0,x1,y0); sline(x0,y1,x1,y1);
  for(let yy=y0+1.2;yy<y1-1.4;yy+=2.4){ sline(x0+0.1,yy,x1-0.1,yy+1.3); }
}
function drawPlatStatic(p){
  const y=p.top,x0=p.cx-p.w/2,x1=p.cx+p.w/2;
  sline(x0,y,x1,y);
  sline(x0,y-0.02,x0,y-0.42); sline(x1,y-0.02,x1,y-0.42);
  const nh=Math.round(p.w/2.2)+1;
  for(let i=0;i<nh;i++){ const hx=x0+0.4+LR()*Math.max(0.1,p.w-0.9); sline(hx,y-0.08,hx+0.4,y-0.6); }
}
sline(-15.2,0,15.2,0);
for(let hx=-14;hx<14;hx+=1.7) sline(hx,0-0.15,hx+0.8,0-0.85);
rectWall(-17.5,-15,-6,116); rectWall(15,17.5,-6,116);
rectWall(-24.5,-22,124,152); rectWall(22,24.5,124,152);
sline(-22.4,124,22.4,124); sline(-22.4,123.5,22.4,123.5);
for(let hx=-21;hx<21;hx+=2) sline(hx,123.9,hx+0.9,123.1);
for(const c of CORR) rectWall(-c.x-2,-c.x,c.y0,c.y1), rectWall(c.x,c.x+2,c.y0,c.y1);
for(const p of PLAT){ if(!p.move) drawPlatStatic(p); }
for(let ay=10;ay<112;ay+=16){ sline(0,ay,0,ay+1.7); sline(0,ay+1.7,-0.45,ay+1.1); sline(0,ay+1.7,0.45,ay+1.1); }
for(const c of CORR){
  sline(-8,c.y0+2,-c.x-1.2,c.y0+6); sline(-c.x-1.2,c.y0+6,-c.x-2.4,c.y0+5.6); sline(-c.x-1.2,c.y0+6,-c.x-1.4,c.y0+4.6);
  sline(8,c.y0+2,c.x+1.2,c.y0+6); sline(c.x+1.2,c.y0+6,c.x+2.4,c.y0+5.6); sline(c.x+1.2,c.y0+6,c.x+1.4,c.y0+4.6);
}
const skWorld=makeSK(1400,0x2c3f78,0.9,0.28);
skWorld.group.children.forEach(c=>c.renderOrder=2);
drawSK(skWorld,wsegs,0.05,3,11);

const movers=PLAT.filter(p=>p.move);
for(const m of movers){ m.sk=makeSK(16,0x2c3f78,0.9,0.28); m.sk.group.children.forEach(c=>c.renderOrder=2); scene.add(m.sk.group); }

/* ---------------- paper bg + doodles ---------------- */
const paper=new THREE.Mesh(new THREE.PlaneGeometry(170,430), new THREE.ShaderMaterial({
  vertexShader:`varying vec2 vW; void main(){ vW=(modelMatrix*vec4(position,1.0)).xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    varying vec2 vW;
    float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec3 col=vec3(0.973,0.957,0.925);
      float sp=hh(floor(vW*46.0));
      col-=step(0.988,sp)*0.055*vec3(0.6,0.65,1.0);
      col-=0.012*step(0.5,hh(floor(vW*7.0)));
      float row=floor(vW.y/1.6);
      float ly=fract(vW.y/1.6+0.012*sin(vW.x*2.2+row*13.0));
      float d=min(ly,1.0-ly)*1.6;
      col=mix(col,vec3(0.55,0.66,0.83),smoothstep(0.055,0.0,d)*0.5);
      if(vW.y>122.5){
        float gx=fract(vW.x/1.6); float dx=min(gx,1.0-gx)*1.6;
        col=mix(col,vec3(0.6,0.7,0.85),smoothstep(0.05,0.0,dx)*0.26);
      }
      float mgx=abs(vW.x+11.9+0.12*sin(vW.y*0.7));
      col=mix(col,vec3(0.86,0.44,0.42),smoothstep(0.09,0.0,mgx)*0.55);
      gl_FragColor=vec4(col,1.0);
    }`
}));
paper.position.set(0,140,-26); paper.renderOrder=0; scene.add(paper);

function doodleAtlas(){
  const c=document.createElement('canvas'); c.width=512; c.height=128;
  const g=c.getContext('2d');
  g.strokeStyle='#2c3450'; g.lineWidth=3.5; g.lineCap='round';
  const jl=(x1,y1,x2,y2)=>{ g.beginPath(); g.moveTo(x1+(Math.random()-0.5)*4,y1+(Math.random()-0.5)*4);
    g.quadraticCurveTo((x1+x2)/2+(Math.random()-0.5)*10,(y1+y2)/2+(Math.random()-0.5)*10,x2,y2); g.stroke(); };
  g.save(); g.translate(64,64);
  g.beginPath(); for(let a=0;a<15;a+=0.18){ const r=a*3.6; const x=Math.cos(a)*r,y=Math.sin(a)*r; a===0?g.moveTo(x,y):g.lineTo(x,y);} g.stroke(); g.restore();
  g.save(); g.translate(192,70);
  jl(0,20,0,-8); g.beginPath(); g.arc(0,-16,8,0,TAU); g.stroke();
  jl(0,20,-9,38); jl(0,20,9,38); jl(0,2,-13,12); jl(0,2,13,-4);
  g.beginPath(); g.moveTo(20,-40); g.quadraticCurveTo(30,-52,22,-60); g.quadraticCurveTo(16,-66,22,-74); g.stroke();
  g.fillRect(19,-26,5,5); g.restore();
  g.save(); g.translate(320,64);
  jl(-40,25,30,-18); jl(30,-18,16,-16); jl(30,-18,26,-4);
  jl(-30,35,35,30); jl(28,26,38,32); jl(28,38,36,34); g.restore();
  g.save(); g.translate(448,64);
  g.beginPath(); g.arc(0,-8,16,Math.PI,0); g.lineTo(14,12); g.lineTo(-14,12); g.closePath(); g.stroke();
  g.fillStyle='#2c3450'; g.beginPath(); g.arc(-6,-8,4.5,0,TAU); g.fill(); g.beginPath(); g.arc(6,-8,4.5,0,TAU); g.fill();
  jl(-6,12,-6,22); jl(0,12,0,22); jl(6,12,6,22); jl(-16,16,16,16); g.restore();
  return new THREE.CanvasTexture(c);
}
const doodleTex=doodleAtlas();
{
  const cellMats=[];
  for(let i=0;i<4;i++){
    const t=doodleTex.clone(); t.needsUpdate=true;
    t.repeat.set(0.25,1); t.offset.set(i*0.25,0);
    cellMats.push(new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:0.5,depthWrite:false}));
  }
  const q=new THREE.PlaneGeometry(1,1);
  const place=(x,y,cell,s)=>{
    const m=new THREE.Mesh(q,cellMats[cell]);
    m.position.set(x,y,-3); m.scale.setScalar(s); m.renderOrder=1;
    m.rotation.z=(LR()-0.5)*0.3; scene.add(m);
  };
  for(let i=0;i<15;i++){
    place((i%2?13.2:-13.2)+(LR()-0.5)*1.4, 6+i*7+LR()*3, (LR()*4)|0, 2.1+LR()*0.8);
  }
  for(let i=0;i<7;i++) place((LR()-0.5)*34, 132+LR()*18, LR()<0.5?0:3, 1.6+LR());
  place(-6,120.5,1,2.4); place(6,121,3,2.6);
}

/* ---------------- player ---------------- */
const P={x:0,y:2,vx:0,vy:0,halfW:0.42,halfH:0.85,face:1,gy:null,groundPlat:null,coyote:0,ifr:0,hurtT:0,touch:0,wasVyFall:0,
  hp:4,ink:MAXINK,shotCD:0,shotT:0,dash:0,dashCD:0,dashx:1,dashy:0,aimA:0,jb:0,run:0,dead:false,deadT:0,pbot:-99};
const stats={kills:0,clip:0};
let state='title', T=0, last=performance.now();
const mouse={x:innerWidth/2,y:innerHeight/2,down:false,aim:{x:0,y:0}};
const key={},pressed={};
let shake=0, flashV=0, camT={x:0,y:6}, deadShown=false, bossOn=false, elapsed=0, hintT=0;

addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(!key[e.code])pressed[e.code]=true;
  key[e.code]=true;
  if(e.code==='KeyR')location.reload();
  if(e.code==='Enter'&&state==='title')startGame();
});
addEventListener('keyup',e=>key[e.code]=false);
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
addEventListener('mousedown',e=>{if(e.button===0)mouse.down=true;});
addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);
  cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix();
  [FX,DEC,PB,EB].forEach(S=>S.mat.uniforms.px.value=pxScale());
});

function updAim(){
  const v=new THREE.Vector3((mouse.x/innerWidth)*2-1,-(mouse.y/innerHeight)*2+1,0.5).unproject(cam);
  const dir=v.sub(cam.position).normalize();
  const t=-cam.position.z/dir.z;
  mouse.aim.x=cam.position.x+dir.x*t; mouse.aim.y=cam.position.y+dir.y*t;
}

function updPlayer(dt){
  if(P.ifr>0)P.ifr-=dt;
  if(P.dash>0)P.dash-=dt;
  if(P.dashCD>0)P.dashCD-=dt;
  if(P.hurtT>0)P.hurtT-=dt;
  if(P.shotCD>0)P.shotCD-=dt;
  if(P.shotT>0)P.shotT-=dt;
  if(P.jb>0)P.jb-=dt;
  P.ink=Math.min(MAXINK,P.ink+9*dt);

  if(pressed.Space)P.jb=0.12;
  const L=(key.KeyA||key.ArrowLeft), R=(key.KeyD||key.ArrowRight);
  const ix=(R?1:0)-(L?1:0);

  if(P.groundPlat&&P.groundPlat.move&&P.gy!==null)P.x+=P.groundPlat.dx||0;

  if(P.dash>0){
    P.vx=P.dashx*38; P.vy=P.dashy*38;
    if(Math.random()<0.9)spawnPS(FX,P.x-P.dashx*0.35,P.y-P.dashy*0.35,0,0,BLUE,0.3,0,0,0.16,0,1);
  } else {
    const accel=P.gy!==null?150:95;
    P.vx+=ix*accel*dt;
    if(Math.abs(P.vx)>RUN){
      P.vx*=Math.exp(-2.5*dt);
      if(Math.abs(P.vx)<RUN)P.vx=Math.sign(P.vx)*RUN;
    } else P.vx=clamp(P.vx,-RUN,RUN);
    if(ix===0&&P.gy!==null&&Math.abs(P.vx)<=RUN+0.1)P.vx*=Math.exp(-9*dt);
    P.vy+=GRAV*dt; if(P.vy<-42)P.vy=-42;
    if(P.touch!==0&&P.vy<0&&((P.touch<0&&L)||(P.touch>0&&R))){
      P.vy=Math.max(P.vy,-7); P.coyote=0.09;
      if(Math.random()<0.35)spawnPS(FX,P.x+P.touch*0.45,P.y-0.3,0,-2,BLUE,0.2,1,4,0.3,0,1);
    }
    if(P.jb>0){
      if(P.gy!==null||P.coyote>0){ P.vy=JUMP; P.gy=null; P.groundPlat=null; P.coyote=0; P.jb=0; sndJump(); }
      else if(P.touch!==0){ P.vy=18.5; P.vx=-P.touch*11.5; P.face=-P.touch; P.jb=0; sndJump();
        for(let k=0;k<5;k++)spawnPS(FX,P.x+P.touch*0.4,P.y-0.4+(k-2)*0.25,P.touch*3,(Math.random()-0.5)*4,BLUE,0.22,1,-6,0.35,1,1); }
    }
    if(P.vy>0&&!key.Space)P.vy*=Math.exp(-10*dt);
  }
  if(P.coyote>0&&P.gy===null)P.coyote-=dt;

  if(P.gy!==null)P.run+=Math.abs(P.vx)*dt*2.4+dt*2; else P.run+=dt*1.5;

  updAim();
  const adx=mouse.aim.x-P.x;
  if(Math.abs(adx)>0.35)P.face=adx>0?1:-1;
  P.aimA=Math.atan2(mouse.aim.y-(P.y+0.42),mouse.aim.x-P.x);

  if(mouse.down&&state==='play'&&!P.dead){
    if(P.shotCD<=0){
      if(P.ink>=1.2){
        P.shotCD=0.115; P.ink-=1.2; P.shotT=0.06;
        const a=P.aimA+(Math.random()-0.5)*0.05;
        const bx=P.x+Math.cos(P.aimA)*0.95, by=P.y+0.42+Math.sin(P.aimA)*0.95;
        spawnPS(PB,bx,by,Math.cos(a)*46+P.vx*0.25,Math.sin(a)*46,BLUE,0.24,3,0,0.9,0,1);
        P.vx-=Math.cos(a)*4; sndPew();
      } else sndDry();
    }
  }

  const shiftP=pressed.ShiftLeft||pressed.ShiftRight;
  if(shiftP&&P.dashCD<=0&&P.dash<=0){
    let dx=(R?1:0)-(L?1:0), dy=(key.KeyW||key.ArrowUp?1:0)-(key.KeyS||key.ArrowDown?1:0);
    if(dx===0&&dy===0)dx=P.face;
    const l=Math.hypot(dx,dy);
    P.dashx=dx/l; P.dashy=dy/l;
    P.dash=0.13; P.dashCD=0.5; P.ifr=Math.max(P.ifr,0.26);
    sndDash();
  }

  P.touch=0;
  P.x+=P.vx*dt;
  for(const w of WALL){
    if(P.y+P.halfH>w.y0+0.05&&P.y-P.halfH<w.y1-0.05&&P.x+P.halfW>w.x0&&P.x-P.halfW<w.x1){
      const penL=(P.x+P.halfW)-w.x0, penR=w.x1-(P.x-P.halfW);
      if(penL<penR){ P.x=w.x0-P.halfW; P.touch=-1; if(P.vx>0)P.vx=0; }
      else { P.x=w.x1+P.halfW; P.touch=1; if(P.vx<0)P.vx=0; }
    }
  }
  P.pbot=P.y-P.halfH;
  const prevYc=P.y;
  P.y+=P.vy*dt;
  const wasGy=P.gy;
  const land=landCheck(P.x,P.y,prevYc,P.halfW,P.halfH,P.vy);
  if(land!==null){
    P.y=land+P.halfH; P.vy=0; P.gy=land;
    P.groundPlat=PLAT.find(p=>p.top===land&&Math.abs(P.x-p.cx)<=p.w/2+P.halfW)||null;
    P.coyote=0.09;
    if(wasGy===null&&P.wasVyFall<-14){ shake=Math.max(shake,0.12); noiseS(0.08,500,150,0.15); }
  } else { P.gy=null; P.groundPlat=null; }
  P.wasVyFall=P.vy;

  if(P.y<-12&&!P.dead){P.hp=1;P.ifr=0;hurtPlayer(0);}
}

function hurtPlayer(fromX,ignoreIfr){
  if(P.dead)return;
  if(P.ifr>0&&!ignoreIfr)return;
  P.hp--; P.ifr=1.1; P.hurtT=1.1;
  shake=0.55; flash('#e8442e',0.4); sndHurt();
  burst(P.x,P.y,14,9,[RED,BLUE,INKC],0.5);
  P.vx=(P.x<fromX?-1:1)*9; P.vy=8; P.dash=0;
  if(P.hp<=0){
    P.dead=true; P.deadT=0;
    burst(P.x,P.y,44,14,[BLUE,RED,INKC,new THREE.Color(0x16225e)],0.7);
    sndDie(); flash('#141420',0.55);
  }
}

/* ---------------- enemies ---------------- */
const BATS=[];
for(let i=0;i<5;i++){
  const sk=makeSK(30,0x1a1a28,0.95,0.3);
  sk.group.children.forEach(c=>c.renderOrder=4);
  BATS.push({on:false,x:0,y:0,vx:0,vy:0,hp:2,ph:LR()*TAU,sk});
}

function despawnEnemy(e){ if(e.on&&e.sk){ scene.remove(e.sk.group); skPool.push(e.sk); e.sk=null; e.on=false; } }

function drawGrim(e){
  const s=[],x=e.x,y=e.y,f=e.f,ph=e.ph;
  for(let i=0;i<4;i++){
    const bx=x+((i<2)?0.42:-0.5)*f, p2=ph+i*1.7;
    const fx2=bx+Math.sin(p2)*0.3, fy=y-0.5-Math.max(0,Math.sin(p2))*0.12;
    s.push([bx,y-0.12,fx2,fy]);
  }
  let px0=x-1.05*f,py0=y-0.05;
  for(let i=1;i<=6;i++){
    const t=i/6, nx=lerp(x-1.05*f,x+0.75*f,t), ny=lerp(y-0.05,y+0.32,t)+(i%2?0.16:0);
    s.push([px0,py0,nx,ny]); px0=nx; py0=ny;
  }
  circ(x+0.98*f,y+0.33,0.3,8,s,0.03);
  s.push([x+0.72*f,y+0.62,x+1.22*f,y+0.45]);
  s.push([x+1.05*f,y+0.2,x+1.42*f,y+0.13]);
  s.push([x+1.42*f,y+0.13,x+1.28*f,y+0.02]);
  s.push([x-1.05*f,y+0.02,x-1.5*f,y+0.4]);
  s.push([x-1.5*f,y+0.4,x-1.85*f,y+0.25]);
  return s;
}
function drawTur(e){
  const s=[],x=e.x,y=e.y;
  const n=13;
  let px0=x+0.75+0.1*Math.sin(0),py0=y;
  for(let i=1;i<=n;i++){
    const a=i/n*TAU;
    const r=0.72+0.14*Math.sin(a*3+e.seed)+0.08*Math.sin(a*7);
    const nx=x+Math.cos(a)*r, ny=y+Math.sin(a)*r*0.9;
    s.push([px0,py0,nx,ny]);
    px0=nx; py0=ny;
  }
  circ(x+0.28*e.fAim,y+0.18,0.14,6,s,0.02);
  const rl=e.recoil>0?-0.15:0;
  const ca=Math.cos(e.aim),sa=Math.sin(e.aim);
  const bx2=x+ca*(1.05+rl),by2=y+0.1+sa*(1.05+rl);
  s.push([x+ca*0.6,y+0.1+sa*0.6,bx2,by2]);
  s.push([x+ca*0.6-sa*0.14,y+0.1+sa*0.6+ca*0.14,bx2-sa*0.14,by2+ca*0.14]);
  s.push([x-0.75,y-0.7,x-0.3,y-0.55]); s.push([x-0.3,y-0.55,x+0.2,y-0.62]); s.push([x+0.2,y-0.62,x+0.75,y-0.68]);
  return s;
}
function drawBat(b){
  const s=[],x=b.x,y=b.y,fl=Math.sin(T*14+b.ph);
  for(const sd of[-1,1]){
    const tip=[x+sd*(0.85+Math.abs(fl)*0.15),y+fl*0.45*sd*0+fl*0.5];
    const mid=[x+sd*0.45,y+0.28+fl*0.22];
    s.push([x+sd*0.15,y,mid[0],mid[1]]); s.push([mid[0],mid[1],tip[0],tip[1]]);
    s.push([tip[0],tip[1],x+sd*0.55,y-0.18]); s.push([x+sd*0.55,y-0.18,x+sd*0.2,y-0.1]);
    s.push([x+sd*0.1,y+0.14,x+sd*0.22,y+0.34]);
  }
  circ(x,y,0.17,6,s,0.02);
  s.push([x-0.07,y+0.03,x+0.07,y+0.03]);
  return s;
}

function updateEnemy(e,dt,plat){
  if(e.tur){
    const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy);
    e.aim=Math.atan2(dy,dx); e.fAim=dx>=0?1:-1;
    if(e.recoil>0)e.recoil-=dt;
    if(d<21&&Math.abs(P.y-e.y)<12&&!P.dead){
      e.cd-=dt;
      if(e.cd<=0){
        e.cd=1.4+LR()*1.4; e.recoil=0.12;
        const a=e.aim;
        spawnPS(EB,e.x+Math.cos(a)*1.15,e.y+0.1+Math.sin(a)*1.15,Math.cos(a)*8,Math.sin(a)*8,INKC,0.5,3,1.6,7,0,1);
        tone(240,120,0.1,'square',0.1);
      }
    }
    drawSK(e.sk,drawTur(e),0.02,Math.floor(T*9),e.seed);
  } else {
    e.vy+=GRAV*dt;
    const dx=P.x-e.x;
    const chasing=Math.abs(P.y-e.y)<6&&Math.abs(dx)<16&&!P.dead;
    e.f=dx>0?1:-1;
    e.vx=chasing?Math.sign(dx)*3.4:Math.sin(T*0.7+e.seed)*1.2;
    const prevY=e.y;
    e.y+=e.vy*dt;
    const land=landCheck(e.x,e.y,prevY,0.45,0.5,e.vy);
    if(land!==null){ e.y=land+0.5; e.vy=0; }
    e.x+=e.vx*dt;
    e.x=clamp(e.x,-13.6,13.6);
    e.ph+=dt*(Math.abs(e.vx)*1.8+3);
    if(!P.dead&&Math.abs(P.x-e.x)<1.05&&Math.abs(P.y-e.y)<1.2)hurtPlayer(e.x);
    drawSK(e.sk,drawGrim(e),0.02,Math.floor(T*9),e.seed);
  }
}

/* ---------------- boss ---------------- */
const boss={on:false,x:0,y:140,hp:180,max:180,t:0,flash:0,scale:0,st:0,stT:0,tx:0,ty:0,
  atkT:3,atkIdx:0,spin:0,q:[],rainT:0,sprT:0,sprA:0,batT:5,phase2:false,dead:false,dieT:0,rb:0,
  anchorY:138,pulse:0};
const geoQuad=new THREE.PlaneGeometry(1,1);
const bossBody=new THREE.Mesh(geoQuad,new THREE.ShaderMaterial({
  uniforms:{map:{value:splatTex},color:{value:new THREE.Color(0x0a0a12)},flash:{value:0},celloff:{value:new THREE.Vector2(0,0)}},
  vertexShader:FILL_VS,fragmentShader:FILL_FS,transparent:true,blending:THREE.MultiplyBlending,depthWrite:false
}));
bossBody.scale.setScalar(9); bossBody.visible=false; bossBody.renderOrder=5; scene.add(bossBody);
const eyeMat=new THREE.MeshBasicMaterial({color:0xf7f3ea,transparent:true});
const eyeL=new THREE.Mesh(new THREE.CircleGeometry(0.45,14),eyeMat); eyeL.renderOrder=6; eyeL.visible=false; scene.add(eyeL);
const eyeR=eyeL.clone(); eyeR.renderOrder=6; scene.add(eyeR);
const pupMat=new THREE.MeshBasicMaterial({color:0x101018,transparent:true});
const pupL=new THREE.Mesh(new THREE.CircleGeometry(0.15,10),pupMat); pupL.renderOrder=7.5; pupL.visible=false; scene.add(pupL);
const pupR=pupL.clone(); pupR.renderOrder=7.5; scene.add(pupR);

function bossShot(x,y,a,sp,grav){ spawnPS(EB,x,y,Math.cos(a)*sp,Math.sin(a)*sp,INKC,0.55,3,grav||0,14,0,1); }

function spawnBoss(){
  bossOn=true; boss.on=true; boss.x=0; boss.y=146; boss.anchorY=138;
  boss.t=0; boss.hp=boss.max; boss.st=0; boss.atkT=2.8; boss.q=[];
  bossBody.visible=eyeL.visible=eyeR.visible=pupL.visible=pupR.visible=true;
  droneOn(); sndRoar(); flash('#141420',0.5); shake=0.7;
  $('bossbar').style.display='block';
  showHint('SHIFT — air-dash THROUGH the ink');
}

function updBossSegs(){
  const s=[],bx=boss.x,by=boss.y,t=T;
  const n=16; let px0,py0;
  for(let i=0;i<=n;i++){
    const a=i%n/n*TAU;
    let r=2.7+0.35*Math.sin(a*3+t*2)+0.25*Math.sin(a*5-t*1.3);
    if(Math.sin(a)<-0.3)r+=0.45*Math.abs(Math.sin(t*2.2+a*7));
    const x=bx+Math.cos(a)*r,y=by+Math.sin(a)*r;
    if(i>0)s.push([px0,py0,x,y]); px0=x;py0=y;
  }
  for(const sd of[-1,1]){
    const bxx=bx+sd*2.0,byy=by+1.1;
    const flap=Math.sin(t*(boss.phase2?9:4.5));
    const tips=[];
    for(let i=0;i<8;i++){
      let ang=0.05+i*0.215+flap*0.14;
      const len=4.4+1.9*Math.sin(i*1.9)+Math.sin(t*2+i)*0.3;
      const ex=bx+sd*Math.cos(ang)*len, ey=byy+Math.sin(ang)*len;
      let lx=bxx,ly=byy;
      for(let k=1;k<=3;k++){
        const u=k/3;
        const cx=lerp(bxx,ex,u)+(-sd*Math.sin(ang))*Math.sin(u*Math.PI)*0.7*(0.5+0.5*flap);
        const cy=lerp(byy,ey,u)+Math.cos(ang)*Math.sin(u*Math.PI)*0.6*(1-flap*0.5);
        s.push([lx,ly,cx,cy]); lx=cx;ly=cy;
      }
      tips.push([ex,ey]);
    }
    for(let i=0;i<tips.length-1;i++){
      const [ax2,ay2]=tips[i],[cxs,cys]=tips[i+1];
      const mmx=(ax2+cxs)/2+(bx-(ax2+cxs)/2)*0.3, mmy=(ay2+cys)/2+(by-(ay2+cys)/2)*0.3;
      s.push([ax2,ay2,mmx,mmy]); s.push([mmx,mmy,cxs,cys]);
    }
  }
  const cy0=by+3.0;
  let lx=bx-1.3,ly=cy0;
  for(let i=1;i<=6;i++){
    const nx=bx-1.3+2.6*i/6, ny=cy0+(i%2?0.75:0.05);
    s.push([lx,ly,nx,ny]); lx=nx;ly=ny;
  }
  s.push([bx-1.3,cy0,bx+1.3,cy0+0.05]);
  const bt=boss.st===1?0.09:0.02;
  s.push([bx+0.45,by+1.25+bt,bx-0.35,by+0.95-bt]);
  s.push([bx-0.45,by+1.25+bt,bx+0.35,by+0.95-bt]);
  for(let i=0;i<3;i++){
    const dx2=bx-1.2+i*1.2;
    const l=0.5+0.5*Math.sin(t*3+i*2.1);
    s.push([dx2,by-2.6,dx2+0.05*Math.sin(t*5+i),by-2.6-l]);
  }
  drawSK(skBoss,s,boss.st===1?0.07:0.035,Math.floor(T*9),7);
  boss.pulse*=Math.exp(-6*(1/60));
  const sc=9*(1+0.05*Math.sin(T*2.5)+boss.pulse*0.1)*Math.min(1,boss.scale);
  bossBody.scale.setScalar(sc);
  bossBody.position.set(bx,by,0.2);
  bossBody.rotation.z=0.08*Math.sin(T*0.9);
  bossBody.material.uniforms.flash.value=boss.flash;
  const look=Math.atan2(P.y-(by+0.85),P.x-bx);
  for(const [ey2,px2] of[[eyeL,bx-0.95],[eyeR,bx+0.95]]){
    ey2.position.set(px2,by+0.85,0.4);
  }
  const gxx=Math.cos(look)*0.17,gyy=Math.sin(look)*0.17;
  const ps=boss.st===1?1.7:(boss.phase2?1.3:1);
  pupL.scale.setScalar(ps); pupR.scale.setScalar(ps);
  pupL.position.set(bx-0.95+gxx,by+0.85+gyy,0.5);
  pupR.position.set(bx+0.95+gxx,by+0.85+gyy,0.5);
  pupMat.color.copy(boss.phase2?RED:new THREE.Color(0x101018));
}

function updateBoss(dt){
  boss.t+=dt; boss.flash*=Math.exp(-9*dt);
  if(boss.dead){
    boss.dieT+=dt; boss.rb-=dt;
    boss.scale=1+0.12*Math.sin(boss.dieT*30);
    if(boss.rb<=0){
      boss.rb=0.07;
      burst(boss.x+(Math.random()-0.5)*5,boss.y+(Math.random()-0.5)*5,8,11,[PAL[(Math.random()*PAL.length)|0],PAL[(Math.random()*PAL.length)|0]],0.6);
      noiseS(0.1,1200,300,0.2);
    }
    updBossSegs();
    if(boss.dieT>2.1){
      burst(boss.x,boss.y,80,20,PAL,0.9);
      for(let k=0;k<EB.max;k++)if(EB.arr[k]&&EB.arr[k].alive)killPS(EB,k);
      for(const b of BATS){ if(b.on){b.on=false;scene.remove(b.sk.group);} }
      bossBody.visible=eyeL.visible=eyeR.visible=pupL.visible=pupR.visible=false;
      skBoss.group.visible=false;
      boss.on=false; bossOn=false;
      droneOff(); sndWin(); flash('#ffd23f',0.5);
      shake=0.6;
      $('bossbar').style.display='none';
      setTimeout(()=>{ if(!P.dead){ state='win'; showEnd('THE GOD IS DRY.',`ERASED ${stats.kills} · CLIPPED ${stats.clip} · ${Math.floor(elapsed)}s`);} },1000);
    }
    return;
  }
  if(boss.t<1.4){ boss.scale=Math.pow(boss.t/1.4,2); updBossSegs(); return; }
  boss.scale=1;
  if(!boss.phase2&&boss.hp<=boss.max/2){
    boss.phase2=true;
    sndPhase(); flash('#e8442e',0.45); shake=0.5;
    for(let k=0;k<24;k++)bossShot(boss.x,boss.y,k/24*TAU,6.2,0.5);
    boss.baton=1; pupMat.color.copy(RED);
    boss.anchorY=136;
    showHint('it is angry now.');
  }
  if(boss.st===0){
    const spd=boss.phase2?5.5:3.2;
    boss.x+=clamp(P.x-boss.x,-1,1)*spd*dt;
    boss.x=clamp(boss.x,-17,17);
    boss.y=lerp(boss.y,boss.anchorY+Math.sin(T*0.7)*1.6,dt*2);
    boss.atkT-=dt;
    if(boss.atkT<=0){
      boss.atkIdx=(boss.atkIdx+1)%3;
      if(boss.atkIdx===0){
        for(let k=0;k<14;k++)bossShot(boss.x,boss.y,k/14*TAU+boss.spin,5.8+(boss.phase2?1.6:0),0.4);
        boss.spin+=0.4; sndCaw(); boss.atkT=boss.phase2?1.7:2.5;
      } else if(boss.atkIdx===1){
        for(let k=0;k<4;k++)boss.q.push({t:0.14*k,f:()=>{ const a=Math.atan2(P.y-boss.y,P.x-boss.x); bossShot(boss.x,boss.y,a+(Math.random()-0.5)*0.08,10.5,0); tone(300,150,0.08,'square',0.08); }});
        boss.atkT=boss.phase2?1.9:2.6;
      } else {
        boss.rainT=1.7; boss.atkT=boss.phase2?2.2:3;
      }
    }
    if(boss.rainT>0){
      boss.rainT-=dt;
      if(Math.random()<dt*10){
        const rx=clamp(P.x+(Math.random()-0.5)*14,-20.5,20.5);
        bossShot(rx,boss.y+11,-Math.PI/2+(Math.random()-0.5)*0.4,7.5,3);
      }
    }
    const specialCD=boss.phase2?6.5:9;
    boss.specT=(boss.specT||specialCD)-dt;
    if(boss.specT<=0){
      boss.specT=specialCD;
      if(boss.phase2){
        boss.sprT=2.3; boss.sprA=Math.random()*TAU;
      } else {
        boss.st=1; boss.stT=0.65;
      }
    }
    if(boss.sprT>0){
      boss.sprT-=dt; boss.sprA+=dt*5.2;
      if(!boss.sprTick||T-boss.sprTick>0.09){
        boss.sprTick=T;
        bossShot(boss.x,boss.y,boss.sprA,6.4,0.3);
        bossShot(boss.x,boss.y,boss.sprA+Math.PI,6.4,0.3);
      }
    }
    boss.batT-=dt;
    if(boss.phase2&&boss.batT<=0){
      boss.batT=6;
      const free=BATS.find(b=>!b.on);
      if(free){ free.on=true; free.hp=2; free.x=boss.x+(Math.random()<0.5?-18:18); free.y=boss.y-2; scene.add(free.sk.group); sndCaw(); }
    }
    for(const q of boss.q)q.t-=dt;
    while(boss.q.length&&boss.q[0].t<=0){ boss.q.shift().f(); }
  } else if(boss.st===1){
    boss.stT-=dt;
    if(boss.stT<=0){
      boss.st=2; boss.tx=clamp(P.x,-19,19); boss.ty=clamp(P.y,127,141); sndCaw();
    }
  } else if(boss.st===2){
    const dx=boss.tx-boss.x,dy=boss.ty-boss.y,d=Math.hypot(dx,dy);
    const sp=27;
    if(d<0.6){ boss.st=0; boss.stT=0.7; sndCaw(); shake=Math.max(shake,0.4); burst(boss.x,boss.y,10,8,[INKC],0.4); }
    else {
      boss.x+=dx/d*sp*dt; boss.y+=dy/d*sp*dt;
      if(Math.random()<0.8)spawnPS(FX,boss.x+(Math.random()-0.5)*4,boss.y-1.5,-dx/d*4,-dy/d*4,INKC,0.45,2,-3,0.4,0,1);
    }
    if(Math.abs(boss.x)>20.6){
      boss.st=0; boss.stT=1.2; sndCaw(); shake=Math.max(shake,0.6);
      burst(boss.x,boss.y,16,10,[INKC,new THREE.Color(0x555566)],0.5);
      noiseS(0.3,300,60,0.5);
    }
  }
  if(!P.dead&&Math.hypot(P.x-boss.x,P.y-boss.y)<2.9)hurtPlayer(boss.x);
  if(boss.st===0)boss.stT=Math.max(0,boss.stT-dt);
  updBossSegs();
}

function updateBats(dt){
  for(const b of BATS){
    if(!b.on)continue;
    const dx=P.x-b.x,dy=(P.y+0.3)-b.y,d=Math.hypot(dx,dy)||1;
    b.vx=lerp(b.vx,dx/d*5.2,dt*2);
    b.vy=lerp(b.vy,dy/d*5.2+Math.sin(T*3+b.ph)*2,dt*2);
    b.x+=b.vx*dt; b.y=clamp(b.y+b.vy*dt,125.5,150);
    b.x=clamp(b.x,-21,21);
    if(!P.dead&&Math.hypot(P.x-b.x,P.y-b.y)<0.9){ hurtPlayer(b.x); b.x-=Math.sign(dx)*4; }
    drawSK(b.sk,drawBat(b),0.02,Math.floor(T*9),b.ph*3);
  }
}

/* ---------------- collisions with bullets ---------------- */
function bulletCollisions(dt){
  for(let i=0;i<PB.max;i++){
    const e=PB.arr[i]; if(!e||!e.alive)continue;
    const x=PB.a.pos[i*3],y=PB.a.pos[i*3+1];
    let hit=false;
    for(const en of ENEMIES){
      if(!en.on||en.dead)continue;
      if(Math.hypot(x-en.x,y-en.y)<(en.tur?0.85:0.95)){
        en.hp--; hit=true;
        burst(x,y,4,6,[PAL[(Math.random()*PAL.length)|0],BLUE],0.3);
        sndTick();
        if(en.hp<=0){
          en.dead=true; despawnEnemy(en); stats.kills++;
          burst(en.x,en.y,22,10,PAL,0.55); sndSplat(); shake=Math.max(shake,0.15);
          const g=PLAT.filter(p=>p.top<=en.y-0.3&&Math.abs(p.top-en.y)<4&&Math.abs(en.x-p.cx)<p.w/2+0.5).sort((a,b)=>b.top-a.top)[0];
          makeDecal(en.x,g?g.top+0.06:en.y-0.5,PAL[(Math.random()*PAL.length)|0],1.1+Math.random()*0.8);
        }
        break;
      }
    }
    if(!hit&&boss.on&&!boss.dead&&boss.scale>0.7){
      if(Math.hypot(x-boss.x,y-boss.y)<2.95){
        hit=true; boss.hp-=2; boss.flash=0.8; boss.pulse=1;
        burst(x,y,3,5,[BLUE,PAL[(Math.random()*PAL.length)|0]],0.28);
        sndTick();
        if(Math.random()<0.25)makeDecal(x,y,RED,0.5+Math.random()*0.5);
        if(boss.hp<=0){
          boss.dead=true; boss.dieT=0; boss.rb=0;
          sndRoar(); noiseS(0.9,500,60,0.5);
        }
      }
    }
    if(!hit){
      for(const b of BATS){
        if(!b.on)continue;
        if(Math.hypot(x-b.x,y-b.y)<0.55){
          hit=true; b.hp--; sndTick(); burst(x,y,4,6,[INKC,PAL[5]],0.3);
          if(b.hp<=0){ b.on=false; scene.remove(b.sk.group); stats.kills++; burst(b.x,b.y,16,9,PAL,0.5); sndSplat(); }
          break;
        }
      }
    }
    if(hit||Math.abs(x)>26||y>165||y<-5){ killPS(PB,i); }
  }
  for(let i=0;i<EB.max;i++){
    const e=EB.arr[i]; if(!e||!e.alive)continue;
    const x=EB.a.pos[i*3],y=EB.a.pos[i*3+1];
    e.sp=0.85+0.15*Math.sin(T*9+i);
    if(!P.dead&&Math.hypot(x-P.x,y-P.y)<0.58){
      if(P.dash>0){
        killPS(EB,i); stats.clip++; sndClip();
        burst(x,y,5,7,[BLUE,INKC],0.3);
      } else if(P.ifr<=0){
        killPS(EB,i); hurtPlayer(x);
      }
    }
    if(Math.abs(x)>25||y>165||y<-6||Math.abs(x)>25)killPS(EB,i);
  }
}

/* ---------------- HUD / UI ---------------- */
let lastHp=-1,lastInk=-1,lastK=-1,lastC=-1;
function hud(){
  if(P.hp!==lastHp){
    lastHp=P.hp;
    $('drops').innerHTML=[0,1,2,3].map(i=>`<div class="drop${i<P.hp?'':' lost'}"></div>`).join('');
  }
  const w=Math.round(clamp(P.ink/MAXINK,0,1)*100);
  if(w!==lastInk){ lastInk=w; $('inkfill').style.width=w+'%'; }
  if(stats.kills!==lastK){ lastK=stats.kills; $('kills').textContent='ERASED '+stats.kills; }
  if(stats.clip!==lastC){ lastC=stats.clip; $('clipped').textContent='CLIPPED '+stats.clip; }
  if(boss.on&&!boss.dead){ $('bossfill').style.width=Math.max(0,boss.hp/boss.max*100)+'%'; }
}
function flash(color,amt){ $('flash').style.background=color; flashV=amt; }
function showHint(msg){ const h=$('hint'); h.textContent=msg; h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
function showEnd(t,sub){ $('endtitle').textContent=t; $('endsub').textContent=sub; $('endscr').style.display='flex'; }
{
  const t='INKFALL';
  $('t1').innerHTML=[...t].map(ch=>`<span style="transform:rotate(${(Math.random()*10-5).toFixed(1)}deg) translateY(${(Math.random()*6-3).toFixed(1)}px)">${ch}</span>`).join('');
}
function startGame(){
  $('title').style.display='none';
  document.body.classList.add('playing');
  $('cross').style.display='block';
  $('hud').style.display='block';
  ac();
  state='play'; last=performance.now();
  showHint('A/D run · SPACE jump + wall-jump · SHIFT dash through bullets · CLICK shoot');
}
$('title').addEventListener('pointerdown',startGame);

/* ---------------- camera ---------------- */
function camUpdate(dt){
  if(state==='title'){
    camT.x=Math.sin(T*0.1)*3; camT.y=lerp(camT.y,4+((T*1.6)%26),dt*0.8);
    cam.position.set(camT.x,camT.y,30); cam.rotation.z=0;
    return;
  }
  let tx=P.dead?camT.x*0.98:P.x*0.8;
  let ty=(P.dead?P.y:P.y+2.6);
  if(bossOn){ tx=P.x*0.55; ty=Math.max(P.y,129)+3.5; }
  tx=clamp(tx,-10,10);
  const k=1-Math.exp(-5.5*dt);
  camT.x=lerp(camT.x,tx,k); camT.y=lerp(camT.y,ty,k);
  shake*=Math.exp(-4*dt);
  const tq=Math.floor(T*9);
  cam.position.set(
    camT.x+(Math.random()-0.5)*shake*1.8+(h1(tq*3+1)-0.5)*0.05,
    camT.y+(Math.random()-0.5)*shake*1.8+(h1(tq*7+2)-0.5)*0.05,
    lerp(cam.position.z,bossOn?36:30,dt*2)
  );
  cam.rotation.z=(h1(tq*11)-0.5)*0.004+(Math.random()-0.5)*shake*0.012;
}

/* ---------------- player draw ---------------- */
function buildPsegs(){
  const s=[];
  if(P.dead)return s;
  if(P.hurtT>0&&Math.floor(T*14)%2===0)return s;
  const x=P.x,y=P.y,f=P.face,dash=P.dash>0;
  const grounded=P.gy!==null;
  const wall=!grounded&&P.touch!==0&&P.vy<0;
  const hip=[x,y-0.12],sh=[x,y+0.42],hd=[x+(dash?f*0.25:0),y+0.86];
  if(dash){
    s.push([x-1.7*f,y+0.5,x-0.5*f,y+0.5],[x-2*f,y+0.05,x-0.7*f,y+0.05],[x-1.5*f,y-0.4,x-0.6*f,y-0.4]);
  }
  const ax=Math.cos(P.aimA),ay=Math.sin(P.aimA);
  let foot1,foot2;
  if(dash){ foot1=[x-0.6*f,y-0.72]; foot2=[x-0.15*f,y-0.85]; }
  else if(wall){ foot1=[x+P.touch*0.22,y-0.68]; foot2=[x-P.touch*0.08,y-0.85]; }
  else if(!grounded){ foot1=[x+0.3*f,y-0.52]; foot2=[x-0.24*f,y-0.74]; }
  else {
    foot1=[x+Math.sin(P.run)*0.5*f,y-0.85];
    foot2=[x+Math.sin(P.run+Math.PI)*0.5*f,y-0.85-Math.max(0,-Math.cos(P.run))*0.18];
  }
  for(const foot of[foot1,foot2]){
    const kn=kneeAt(hip[0],hip[1],foot[0],foot[1],0.45,0.45,f*1);
    s.push([hip[0],hip[1],kn[0],kn[1]]); s.push([kn[0],kn[1],foot[0],foot[1]]);
  }
  s.push([hip[0],hip[1],sh[0]+(dash?f*0.25:0),sh[1]]);
  circ(hd[0],hd[1],0.3,9,s,0.015);
  s.push([hd[0]+0.05*f,hd[1]+0.32,hd[0]+0.3*f,hd[1]+0.15]);
  const hand=[sh[0]+ax*0.78+(dash?f*0.25:0),sh[1]+ay*0.78];
  if(wall){
    s.push([sh[0],sh[1],x+P.touch*0.35,y+0.75]);
    s.push([x+P.touch*0.35,y+0.75,x+P.touch*0.45,y+1.05]);
    s.push([sh[0],sh[1],hand[0],hand[1]]);
  } else {
    s.push([sh[0],sh[1],hand[0],hand[1]]);
    const back=grounded&&Math.abs(P.vx)>1?[sh[0]-f*0.28,sh[1]-0.3+Math.sin(P.run+Math.PI)*0.12]:[hand[0]-ax*0.3-0.1*f,hand[1]-0.1];
    s.push([sh[0],sh[1],back[0],back[1]]);
  }
  s.push([hand[0],hand[1],hand[0]+ax*0.42,hand[1]+ay*0.42]);
  s.push([hand[0],hand[1],hand[0]-0.08,hand[1]-0.16]);
  if(P.shotT>0){
    const mx2=hand[0]+ax*0.52,my2=hand[1]+ay*0.52;
    for(let i=0;i<4;i++){
      const a2=P.aimA+(i/3-0.5)*1.4;
      s.push([mx2,my2,mx2+Math.cos(a2)*0.28,my2+Math.sin(a2)*0.28]);
    }
  }
  return s;
}

/* ---------------- main update ---------------- */
function updatePlay(dt){
  elapsed+=dt;
  for(const m of movers){
    const nx=m.ox+Math.sin(T*m.spd+m.ph)*m.amp;
    m.dx=nx-m.cx; m.cx=nx;
    const s=[];
    for(let x=nx-m.w/2;x<nx+m.w/2-0.3;x+=0.6)s.push([x,m.top,x+0.38,m.top]);
    s.push([nx-m.w/2,m.top,nx-m.w/2,m.top-0.4],[nx+m.w/2,m.top,nx+m.w/2,m.top-0.4]);
    for(const wx of[nx-m.w/2+0.2,nx+m.w/2-0.2])for(let i=0;i<6;i++){
      const a1=i/6*TAU,a2=(i+1)/6*TAU;
      s.push([wx+Math.cos(a1)*0.15,m.top-0.2+Math.sin(a1)*0.15,wx+Math.cos(a2)*0.15,m.top-0.2+Math.sin(a2)*0.15]);
    }
    drawSK(m.sk,s,0.02,Math.floor(T*9),m.ph*10);
  }
  if(!P.dead){
    updPlayer(dt);
    if(!bossOn&&P.y>119)spawnBoss();
  } else {
    P.vy+=GRAV*dt; const pyc=P.y; P.y+=P.vy*dt; P.x+=P.vx*dt; P.vx*=Math.exp(-3*dt);
    const land=landCheck(P.x,P.y,pyc,P.halfW,P.halfH,P.vy);
    if(land!==null){P.y=land+P.halfH;P.vy=0;}
    P.deadT+=dt;
    if(P.deadT>1.4&&!deadShown){ deadShown=true; state='dead'; showEnd('ERASED.',`the page fought back · ERASED ${stats.kills} · CLIPPED ${stats.clip}`); droneOff(); }
  }

  for(const en of ENEMIES){
    if(en.dead)continue;
    if(!en.on&&!bossOn&&P.y<en.y+2&&en.y-P.y<20&&Math.abs(en.x-P.x)<19){
      en.on=true; en.sk=skPool.pop()||makeSK(42,0x26263c,0.95,0.32);
      en.sk.group.children.forEach(c=>c.renderOrder=4);
      en.x=en.plat.cx; en.y=en.plat.top+(en.tur?0.72:0.5); en.vy=0;
      scene.add(en.sk.group);
    }
    if(en.on&&Math.abs(en.y-camT.y)>24)despawnEnemy(en);
    if(en.on)updateEnemy(en,dt,en.plat);
  }

  if(boss.on)updateBoss(dt);
  updateBats(dt);

  drawSK(skPlayer,buildPsegs(),0.022,Math.floor(T*9),5);
  camUpdate(dt);
}

function loop(now){
requestAnimationFrame(loop);

window.__INK={start:startGame,st:()=>state,p:P,boss,stats,
  tp:(x,y)=>{P.x=x;P.y=y;P.vy=0;},god:()=>bossOn,
  kill:()=>{if(boss.on&&!boss.dead){boss.hp=0;boss.dead=true;boss.dieT=0;boss.rb=0;sndRoar();}}};
  let dt=Math.min((now-last)/1000,0.033); last=now;
  if(state==='play'){ T+=dt; updatePlay(dt); }
  else if(state==='dead'||state==='win'){
    T+=dt;
    if(P.dead){ P.vy+=GRAV*dt; const pyc=P.y; P.y+=P.vy*dt; P.x+=P.vx*dt; P.vx*=Math.exp(-3*dt);
      const l2=landCheck(P.x,P.y,pyc,P.halfW,P.halfH,P.vy); if(l2!==null){P.y=l2+P.halfH;P.vy=0;} }
    if(boss.on&&boss.dead)updateBoss(dt);
    camUpdate(dt);
  }
  else { T+=dt; camUpdate(dt); }

  stepPS(FX,dt); stepPS(PB,dt);
  if(state==='play'||state==='win')stepPS(EB,dt);
  else { for(let i=0;i<EB.max;i++)if(EB.arr[i]&&EB.arr[i].alive)killPS(EB,i); }
  if(state==='play')bulletCollisions(dt);

  if(state!=='title'){ hud(); }
  flashV*=Math.exp(-5*dt); $('flash').style.opacity=flashV;
  const cr=$('cross'); cr.style.transform=`translate(${mouse.x}px,${mouse.y}px)`;
  for(const k in pressed)pressed[k]=false;
  renderer.render(scene,cam);
}
requestAnimationFrame(loop);
