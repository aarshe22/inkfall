const THREE = window.THREE;
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp = (a,b,t)=>a+(b-a)*t;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const LR = mulberry32(777);
const h1 = n => { const s=Math.sin(n*12.9898)*43758.5453; return s-Math.floor(s); };
const TAU=Math.PI*2;
const PAL = [0xe8442e,0xf5a623,0xffd23f,0x3ec6a5,0x3b7ff0,0x9b59d0,0xff5fa2].map(c=>new THREE.Color(c));

const SEG=8, DRAW=170, ROADH=4.0, EYE=1.9, CD=1/Math.tan(THREE.MathUtils.degToRad(35));
const VMAX=140;

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0xf7f3ea);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.5, 6000);
scene.add(cam);

/* ---------------- paper page (screen-fixed) ---------------- */
const bgScene = new THREE.Scene();
const bgCam = new THREE.Camera();
const paperQuad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
  depthTest:false, depthWrite:false,
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999,1.0);}`,
  fragmentShader:`
    varying vec2 vUv; uniform float aspect;
    float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 v=vUv*vec2(aspect*9.0,9.0);
      vec3 col=vec3(0.973,0.957,0.925);
      col-=step(0.988,hh(floor(v*5.0)))*0.05*vec3(0.6,0.65,1.0);
      float row=floor(v.y);
      float ly=fract(v.y+0.014*sin(v.x*2.6+row*13.0));
      float d=min(ly,1.0-ly);
      col=mix(col,vec3(0.55,0.66,0.83),smoothstep(0.04,0.0,d)*0.45);
      float mgx=abs(vUv.x-0.075+0.004*sin(v.y*0.8));
      col=mix(col,vec3(0.86,0.44,0.42),smoothstep(0.0035,0.0,mgx)*0.55);
      float holes=0.0;
      holes=max(holes,smoothstep(0.024,0.017,length(vec2((vUv.x-0.046)*aspect,vUv.y-0.22))));
      holes=max(holes,smoothstep(0.024,0.017,length(vec2((vUv.x-0.046)*aspect,vUv.y-0.50))));
      holes=max(holes,smoothstep(0.024,0.017,length(vec2((vUv.x-0.046)*aspect,vUv.y-0.78))));
      col=mix(col,vec3(0.90,0.88,0.82),holes*0.75);
      gl_FragColor=vec4(col,1.0);
    }`
,uniforms:{aspect:{value:innerWidth/innerHeight}}
}));
paperQuad.frustumCulled=false; bgScene.add(paperQuad);
renderer.autoClear=false;

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
const sndSplat=()=>{noiseS(0.18,900,110,0.5);tone(160,55,0.2,'sine',0.35);};
const sndTick=()=>tone(1500,700,0.045,'triangle',0.15);
const sndBell=()=>{tone(1568,1568,0.25,'triangle',0.22);tone(2093,2093,0.4,'triangle',0.16,0.08);};
const sndBeep=()=>tone(660,660,0.12,'square',0.2);
const sndGo=()=>{tone(1046,1046,0.4,'square',0.25);noiseS(0.4,1800,300,0.3);};
const sndScrub=()=>noiseS(0.14,700,180,0.22);
const sndEnd=()=>{tone(300,60,1.2,'sawtooth',0.4);noiseS(1.0,700,60,0.4);};
let eng=null;
function engOn(){
  const a=ac(); if(!a||eng)return;
  try{
    const o=a.createOscillator(); o.type='sawtooth';
    const o2=a.createOscillator(); o2.type='square';
    const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420;
    const g=a.createGain(); g.gain.value=0.05;
    const g2=a.createGain(); g2.gain.value=0.035;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(MG);
    o.start(); o2.start(); eng={o,o2,f,g};
  }catch(e){}
}
function engSet(v,on){
  if(!eng)return;
  const a=ac(); if(!a)return;
  eng.o.frequency.setTargetAtTime(36+v*0.85,a.currentTime,0.04);
  eng.o2.frequency.setTargetAtTime(18+v*0.43,a.currentTime,0.04);
  eng.f.frequency.setTargetAtTime(300+v*5,a.currentTime,0.05);
  eng.g.gain.setTargetAtTime(on?0.045:0,a.currentTime,0.15);
}

/* ---------------- pen doodle sprite textures ---------------- */
function penTex(w,h,draw){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d');
  const jl=(x1,y1,x2,y2)=>{
    g.beginPath(); g.moveTo(x1,y1);
    const n=Math.max(1,Math.round(Math.hypot(x2-x1,y2-y1)/22));
    for(let i=1;i<=n;i++){const t=i/n; g.lineTo(x1+(x2-x1)*t+(Math.random()-0.5)*3.4, y1+(y2-y1)*t+(Math.random()-0.5)*3.4);}
    g.stroke();
  };
  draw(g,jl);
  const t=new THREE.CanvasTexture(c); return t;
}
const INKP='#1c2a6e';
function scribbleFill(g,x,y,r,squash){
  g.beginPath();
  for(let a=0;a<=12;a+=1){ const ang=a/12*TAU; const rr=r*(1+0.18*Math.sin(ang*3+x)); g.lineTo(x+Math.cos(ang)*rr, y+Math.sin(ang)*rr*(squash||1)); }
  g.closePath(); g.fill(); g.stroke();
}
const TEX={};
TEX.tree=penTex(128,192,(g,jl)=>{
  g.strokeStyle=INKP; g.fillStyle='rgba(28,42,110,0.13)'; g.lineWidth=4.6;
  jl(g,64,190,64,140); jl(g,58,190,69,142);
  g.beginPath();
  for(let a=0;a<=14;a+=1){const ang=a/14*TAU; const r=44+16*Math.sin(ang*4.3+2)+(Math.random()-0.5)*10; g.lineTo(64+Math.cos(ang)*r, 108+Math.sin(ang)*r*0.92);}
  g.closePath(); g.fill(); g.stroke();
  g.beginPath();
  for(let a=0;a<=12;a+=1){const ang=a/12*TAU; const r=26+8*Math.sin(ang*3.1)+(Math.random()-0.5)*6; g.lineTo(50+Math.cos(ang)*r*0.8, 92+Math.sin(ang)*r*0.7);}
  g.stroke();
  g.lineWidth=3; jl(g,64,150,44,128); jl(g,64,142,84,120);
});
TEX.pennant=penTex(128,256,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=5;
  jl(g,40,250,44,20);
  g.lineWidth=4; g.fillStyle='rgba(210,59,47,0.35)';
  g.beginPath(); g.moveTo(46,26); g.quadraticCurveTo(84,34,110,52); g.quadraticCurveTo(80,66,48,74); g.closePath();
  g.fill(); g.stroke();
  g.beginPath(); g.arc(44,16,6,0,TAU); g.stroke();
});
TEX.fans=penTex(256,140,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=3.6;
  const xs=[40,86,150,206];
  for(let i=0;i<xs.length;i++){
    const x=xs[i],b=118;
    g.beginPath(); g.arc(x,b-42,8,0,TAU); g.stroke();
    jl(g,x,b-34,x,b-12);
    jl(g,x,b-28,x-13,b-44-(i%2)*8);
    jl(g,x,b-28,x+13,b-44-((i+1)%2)*8);
    jl(g,x,b-12,x-8,b); jl(g,x,b-12,x+8,b);
  }
  g.lineWidth=3; g.fillStyle='rgba(28,42,110,0.10)';
  jl(g,26,58,230,52); jl(g,26,74,230,68); jl(g,26,58,26,74); jl(g,230,52,230,68);
  g.fillStyle=INKP; g.font='17px "Segoe Print","Comic Sans MS",cursive'; g.textAlign='center';
  g.fillText('INK! INK!',128,70);
});
TEX.drums=penTex(192,128,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=4;
  const drum=(x,y)=>{
    jl(g,x-22,y,x-22,y+44); jl(g,x+22,y,x+22,y+44);
    g.beginPath(); g.ellipse(x,y,22,8,0,0,TAU); g.stroke();
    jl(g,x-22,y+16,x+22,y+16); jl(g,x-22,y+30,x+22,y+30);
  };
  drum(60,70); drum(120,74); drum(90,26);
  g.strokeStyle='#d23b2f'; g.lineWidth=3;
  jl(g,38,90,82,90); jl(g,98,94,142,94);
});
TEX.mtn=penTex(512,160,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=4.4;
  let px=6,py=152;
  const pts=[[50,40],[110,95],[170,22],[250,110],[320,30],[390,100],[455,52],[506,152]];
  for(const p of pts){ jl(g,px,py,p[0],p[1]); px=p[0];py=p[1]; }
  g.lineWidth=1.6; g.globalAlpha=0.65;
  for(const [mx,my] of [[170,22],[320,30],[50,40],[455,52]]){
    for(let k=1;k<7;k++){ const t=k/8; jl(g,mx-30*t,my+ (152-my)*t+2,mx+26*t,my+(152-my)*t-4); }
  }
});
TEX.cloud=penTex(256,80,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=4; g.globalAlpha=0.85;
  jl(g,20,58,60,50);
  g.beginPath(); g.arc(80,44,20,Math.PI*0.9,Math.PI*2.1); g.stroke();
  g.beginPath(); g.arc(120,38,24,Math.PI*0.95,Math.PI*2.15); g.stroke();
  g.beginPath(); g.arc(164,46,17,Math.PI*1.05,Math.PI*2.05); g.stroke();
  jl(g,182,56,236,52);
});
TEX.sun=penTex(160,160,(g,jl)=>{
  g.strokeStyle='#c98a1e'; g.lineWidth=4.4;
  g.beginPath(); g.arc(80,80,34,0,TAU); g.stroke();
  for(let i=0;i<12;i++){ const a=i/12*TAU+0.2; jl(g,80+Math.cos(a)*42,80+Math.sin(a)*42,80+Math.cos(a)*(54+((i*37)%14)),80+Math.sin(a)*(54+((i*37)%14))); }
});
function signTex(text){
  return penTex(256,128,(g,jl)=>{
    g.strokeStyle=INKP; g.lineWidth=5;
    jl(g,18,26,238,22); jl(g,238,22,242,88); jl(g,242,88,20,92); jl(g,20,92,18,26);
    jl(g,60,92,54,124); jl(g,196,90,204,124);
    g.fillStyle=INKP; g.font='28px "Segoe Print","Comic Sans MS",cursive'; g.textAlign='center';
    g.fillText(text,128,66);
  });
}
TEX.signs=[signTex('INK CO. 500'),signTex('BALLPOINT BRICKS'),signTex('NO. 2 PENCIL'),signTex('DO NOT ERASE'),signTex('PEN 4 TIRES'),signTex('REFILL OR DIE')];
function carTex(color,front){
  return penTex(256,224,(g)=>{
    g.strokeStyle=color; g.lineWidth=7; g.lineCap='round';
    const j=(x1,y1,x2,y2)=>{ g.beginPath(); g.moveTo(x1,y1);
      const n=Math.max(1,Math.round(Math.hypot(x2-x1,y2-y1)/26));
      for(let i=1;i<=n;i++){const t=i/n; g.lineTo(x1+(x2-x1)*t+(Math.random()-0.5)*4,y1+(y2-y1)*t+(Math.random()-0.5)*4);}
      g.stroke(); };
    if(!front){
      g.strokeStyle='#14141c'; g.lineWidth=30; g.globalAlpha=0.85;
      g.beginPath(); g.moveTo(52,196); g.lineTo(52,168); g.stroke();
      g.beginPath(); g.moveTo(204,196); g.lineTo(204,168); g.stroke();
      g.globalAlpha=1;
      g.strokeStyle=color; g.lineWidth=7;
      j(64,120,192,120); j(64,120,72,158); j(192,120,184,158); j(72,158,184,158);
      j(30,112,226,110); j(30,112,34,86); j(226,110,222,86); j(34,86,222,86);
      g.lineWidth=4; j(30,112,22,128); j(226,110,236,126);
      g.strokeStyle='#14141c'; g.lineWidth=3;
      g.beginPath(); g.arc(110,104,15,Math.PI,0); g.stroke();
      g.beginPath(); g.arc(148,103,15,Math.PI,0); g.stroke();
      j(96,100,124,102); j(134,101,162,100);
      g.strokeStyle=color; g.fillStyle=color+'22';
      g.beginPath(); g.arc(128,158,15,0,TAU); g.fill(); g.stroke();
      g.fillStyle='#14141c'; g.font='bold 20px cursive'; g.fillText('7',124,164);
      j(84,176,172,176);
    } else {
      g.strokeStyle=color; g.lineWidth=5;
      j(80,190,176,190); j(80,190,92,130); j(176,190,164,130); j(92,130,164,130);
      j(96,128,120,104); j(160,128,136,104); j(120,104,136,104);
      g.strokeStyle='#14141c'; g.lineWidth=22; g.globalAlpha=0.8;
      g.beginPath(); g.moveTo(66,190); g.lineTo(60,166); g.stroke();
      g.beginPath(); g.moveTo(190,190); g.lineTo(196,166); g.stroke();
      g.globalAlpha=1;
      g.strokeStyle=color; g.lineWidth=3.5;
      j(96,120,160,120);
    }
  });
}
TEX.cars=[carTex('#d23b2f'),carTex('#e08a1e'),carTex('#2a7fd0'),carTex('#7d4bc8'),carTex('#1fa088'),carTex('#d1479e')];
TEX.carsFront=[carTex('#d23b2f',1),carTex('#e08a1e',1),carTex('#2a7fd0',1),carTex('#7d4bc8',1),carTex('#1fa088',1),carTex('#d1479e',1)];
TEX.player=penTex(320,256,(g)=>{
  g.strokeStyle='#16225e'; g.lineWidth=9; g.lineCap='round';
  const j=(x1,y1,x2,y2)=>{ g.beginPath(); g.moveTo(x1,y1);
    const n=Math.max(1,Math.round(Math.hypot(x2-x1,y2-y1)/26));
    for(let i=1;i<=n;i++){const t=i/n; g.lineTo(x1+(x2-x1)*t+(Math.random()-0.5)*4.5,y1+(y2-y1)*t+(Math.random()-0.5)*4.5);}
    g.stroke(); };
  g.strokeStyle='#14141c'; g.lineWidth=40; g.globalAlpha=0.9;
  g.beginPath(); g.moveTo(58,224); g.lineTo(58,186); g.stroke();
  g.beginPath(); g.moveTo(262,224); g.lineTo(262,186); g.stroke();
  g.globalAlpha=1;
  g.strokeStyle='#16225e'; g.lineWidth=8;
  j(80,148,240,148); j(80,148,92,196); j(240,148,228,196); j(92,196,228,196);
  j(20,136,300,134); j(20,136,26,104); j(300,134,294,104); j(26,104,294,104);
  g.lineWidth=5; j(20,136,8,158); j(300,134,312,156); j(150,104,146,88); j(172,104,176,88); j(146,88,176,88);
  g.strokeStyle='#d23b2f'; g.lineWidth=6;
  j(60,110,84,108); j(236,109,262,107);
  g.strokeStyle='#16225e'; g.lineWidth=4.5;
  g.beginPath(); g.arc(142,126,17,Math.PI,0); g.stroke();
  g.beginPath(); g.arc(184,126,17,Math.PI,0); g.stroke();
  j(126,122,158,124); j(168,124,202,122);
  g.strokeStyle='#16225e'; g.lineWidth=4;
  j(104,208,216,208); j(120,222,200,222);
});
TEX.banner=penTex(512,128,(g,jl)=>{
  g.strokeStyle=INKP; g.lineWidth=5.5;
  jl(g,8,10,504,8); jl(g,8,86,504,84);
  jl(g,30,86,18,126); jl(g,484,84,496,126);
  g.fillStyle=INKP;
  for(let x=8;x<504;x+=34){ for(let r=0;r<2;r++){ if(((x/34)+r)%2===0) g.fillRect(x,12+r*36,34,36); } }
  g.fillStyle='rgba(247,243,234,0.95)'; g.fillRect(120,26,272,48);
  g.font='34px "Segoe Print","Comic Sans MS",cursive'; g.textAlign='center';
  g.fillStyle=INKP; g.fillText('START / FINISH',256,62);
});

/* splat atlas for paint FX */
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
    g.restore();
  }
  return new THREE.CanvasTexture(c);
}
const splatTex=splatAtlas();
const FX=new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
  uniforms:{map:{value:splatTex},px:{value:innerHeight*renderer.getPixelRatio()*CD/2}},
  vertexShader:`attribute float size; attribute float alpha; attribute float texid; attribute vec3 pcolor;
    varying vec3 vC; varying float vA; varying float vT; uniform float px;
    void main(){ vC=pcolor; vA=alpha; vT=texid;
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=size*px/max(0.001,-mv.z);
      gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`uniform sampler2D map; varying vec3 vC; varying float vA; varying float vT;
    void main(){ float a=texture2D(map,vec2(gl_PointCoord.x*0.25+vT*0.25,gl_PointCoord.y)).a*vA;
      if(a<0.02) discard; gl_FragColor=vec4(mix(vec3(1.0),vC,min(a,1.0)),1.0); }`,
  transparent:true, blending:THREE.MultiplyBlending, depthWrite:false
}));
{
  const MAX=500;
  const geo=FX.geometry;
  const pos=new Float32Array(MAX*3), col=new Float32Array(MAX*3), sz=new Float32Array(MAX), al=new Float32Array(MAX), tx=new Float32Array(MAX);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcolor',new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size',new THREE.BufferAttribute(sz,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha',new THREE.BufferAttribute(al,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('texid',new THREE.BufferAttribute(tx,1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),6000);
  FX.frustumCulled=false; FX.renderOrder=25; scene.add(FX);
  FX.userData={MAX,pos,col,sz,al,tx,arr:[],cur:0};
}
function splat(wx,wy,wz,n,colors,speed,sizeBase){
  const U=FX.userData,{pos,col,sz,al,tx}=U;
  for(let k=0;k<n;k++){
    const i=U.cur; U.cur=(i+1)%U.MAX;
    pos[i*3]=wx+(Math.random()-0.5)*0.6; pos[i*3+1]=wy+Math.random()*0.8; pos[i*3+2]=wz+(Math.random()-0.5)*0.6;
    const c=colors[(Math.random()*colors.length)|0];
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    sz[i]=(sizeBase||0.6)*(0.4+Math.random()*0.9); al[i]=1; tx[i]=(Math.random()*4)|0;
    const a=Math.random()*TAU, sp=speed*(0.3+Math.random());
    U.arr[i]={x:pos[i*3],y:pos[i*3+1],z:pos[i*3+2],vx:Math.cos(a)*sp,vy:2+Math.random()*sp,
      vz:Math.sin(a)*sp*0.4,t:0,life:0.6+Math.random()*0.7,i};
  }
}
function stepFX(dt){
  const U=FX.userData,{pos,col,sz,al,tx}=U; let dirty=false;
  for(let k=0;k<U.MAX;k++){
    const e=U.arr[k]; if(!e)continue;
    e.t+=dt;
    if(e.t>=e.life){ al[e.i]=0; U.arr[k]=null; dirty=true; continue; }
    e.vy-=22*dt;
    e.x+=e.vx*dt; e.y+=e.vy*dt; e.z+=e.vz*dt;
    pos[e.i*3]=e.x; pos[e.i*3+1]=e.y; pos[e.i*3+2]=e.z;
    al[e.i]=Math.pow(1-e.t/e.life,2);
    dirty=true;
  }
  if(dirty){
    FX.geometry.attributes.position.needsUpdate=true;
    FX.geometry.attributes.alpha.needsUpdate=true;
    FX.geometry.attributes.pcolor.needsUpdate=true;
    FX.geometry.attributes.size.needsUpdate=true;
  }
}

/* ---------------- sprite pools ---------------- */
const pools=[];
function mkPool(tex,count){
  const items=[];
  for(let i=0;i<count;i++){
    const mat=new THREE.SpriteMaterial({map:tex,transparent:true,blending:THREE.MultiplyBlending,depthWrite:false,opacity:0});
    const s=new THREE.Sprite(mat);
    s.renderOrder=3;
    scene.add(s); items.push(s);
  }
  const p={items,used:0}; pools.push(p); return p;
}
function use(p){ if(p.used>=p.items.length)return null; const s=p.items[p.used++]; s.material.opacity=0; return s; }
let POOL={};

/* ---------------- track ---------------- */
let OBS=[];
const track={curve:[],y:[]};
function buildTrack(){
  const C=[],Y=[];
  const push=(n,curve,hill)=>{};
  const cum=(n,curve,dh)=>{
    const yStart=(Y.length?Y[Y.length-1]:0);
    for(let i=0;i<n;i++){
      const t=i/Math.max(1,n-1), e=Math.sin(t*Math.PI);
      C.push(curve*e);
      Y.push(yStart+dh*e);
    }
  };
  cum(44,0,0);
  cum(58,1.7,0);
  cum(24,0,0);
  cum(46,-2.4,0);
  cum(40,0,16);
  cum(52,1.1,0);
  cum(38,0,-19);
  cum(34,2.0,0);
  cum(34,-2.0,6);
  cum(26,0,-6);
  cum(54,-1.3,0);
  cum(36,0,12);
  cum(40,-1.8,0);
  cum(34,0,-12);
  cum(52,1.5,0);
  cum(42,0,-14);
  cum(26,-1.1,0);
  cum(48,0,13);
  cum(44,1.9,0);
  cum(36,0,-13);
  cum(50,-2.2,0);
  cum(40,0,0);
  cum(60,0,0);
  const N=C.length;
  for(let i=0;i<N;i++) Y[i]-=Y[N-1]*i/N;
  track.curve=C; track.y=Y;
  OBS.length=0;
  for(let i=20;i<N-6;i+=1+(LR()*3|0)){
    const side=LR()<0.5?-1:1;
    OBS.push({seg:i,off:side*(ROADH+2.2+LR()*10),type:'tree',h:5.5+LR()*4});
    if(LR()<0.3)OBS.push({seg:i+1,off:-side*(ROADH+4+LR()*8),type:'tree',h:4.5+LR()*4});
  }
  for(let i=0;i<N;i+=64+(LR()*30|0)){
    OBS.push({seg:i,off:(LR()<0.5?-1:1)*(ROADH+3.2+LR()*4),type:'sign',tex:(LR()*TEX.signs.length)|0});
  }
  for(let i=6;i<N;i+=9){
    const side=(Math.floor(i/9)%2)?1:-1;
    OBS.push({seg:i,off:side*(ROADH+1.15),type:'pennant'});
  }
  for(let i=40;i<N-20;i+=80+(LR()*50|0)){
    if(Math.abs(track.curve[i])>0.3)continue;
    const side=(LR()<0.5?-1:1);
    OBS.push({seg:i,off:side*(ROADH+5.5+LR()*3),type:'fans'});
    OBS.push({seg:i+2,off:side*(ROADH+6.5+LR()*3),type:'fans'});
  }
  for(let i=10;i<N-6;i+=1){
    if(track.curve[i]>1.35&&i%12===0){
      const side=track.curve[i]>0?1:-1;
      OBS.push({seg:i,off:side*(ROADH+2.3),type:'drums'});
    }
  }
  const coneSegs=[];
  for(let i=70;i<N-30;i+=85+(LR()*60|0)){
    const cx=(LR()*1.4-0.7);
    for(let k=0;k<3;k++) coneSegs.push({seg:i+k*3,x:clamp(cx+k*0.12,-0.72,0.72),alive:true});
  }
  track.cones=coneSegs;
  track.N=N; track.len=N*SEG;
}
buildTrack();

/* dynamic line layers (screen-space scene) */
const scrScene = new THREE.Scene();
const scrCam = new THREE.OrthographicCamera(0,innerWidth,0,innerHeight,-100,100);
function dynLines(max,color,opa){
  const g=new THREE.BufferGeometry();
  const arr=new Float32Array(max*6);
  g.setAttribute('position',new THREE.BufferAttribute(arr,3).setUsage(THREE.DynamicDrawUsage));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),9000);
  const m=new THREE.LineBasicMaterial({color,transparent:true,opacity:opa,depthWrite:false,depthTest:false});
  const l=new THREE.LineSegments(g,m); l.frustumCulled=false; scrScene.add(l);
  return {geo:g,mat:m,arr,n:0,max};
}
const LN={
  edgeL:dynLines(700,0x24326e,0.92), edgeR:dynLines(700,0x24326e,0.92),
  dash:dynLines(400,0x3b4f96,0.9), rumble:dynLines(300,0x2c3f78,0.85),
  wall:dynLines(1600,0x141420,0.9)
};
const LFOFF=[[0,0],[1.4,0.6],[-1.4,-0.6],[0.5,-1.3]];
function lput(L,x1,y1,z1,x2,y2,z2){
  for(const o of LFOFF){
    if(L.n>=L.max)break;
    const b=L.n*6,a=L.arr;
    a[b]=x1+o[0];a[b+1]=y1+o[1];a[b+2]=0;a[b+3]=x2+o[0];a[b+4]=y2+o[1];a[b+5]=0;
    L.n++;
  }
}

/* traffic */
const CARN=[];
function spawnTraffic(){
  CARN.length=0;
  for(let k=0;k<14;k++){
    CARN.push({z:(60+LR()*(track.len-140)),x:(LR()*1.6-0.8),v:VMAX*(0.38+LR()*0.3),col:(LR()*TEX.cars.length)|0,paint:0});
  }
}
spawnTraffic();

/* ---------------- player / state ---------------- */
const P={z:0,x:0,v:0};
let state='title',T=0,last=performance.now(),tS=0;
let clockT=65,lap=1,lapT=0,best=0,painted=0,shake=0,flashV=0;
let cdT=0,steerVis=0,gForce=0,endShown=false;
const mouse={x:0,y:0};
const key={};
addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  key[e.code]=true;
  if(e.code==='KeyR')location.reload();
  if(e.code==='Enter'&&state==='title')startGame();
});
addEventListener('keyup',e=>key[e.code]=false);
addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);
  cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix();
  scrCam.right=innerWidth; scrCam.bottom=innerHeight; scrCam.updateProjectionMatrix();
  FX.material.uniforms.px.value=renderer.domElement.height*CD/2;
  paperQuad.material.uniforms.aspect.value=innerWidth/innerHeight;
});
function flash(color,amt){ $('flash').style.background=color; flashV=amt; }
function showHint(msg){ const h=$('hint'); h.textContent=msg; h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
$('t1').innerHTML=[...'INKFALL'].map(ch=>`<span style="transform:rotate(${(Math.random()*10-5).toFixed(1)}deg) translateY(${(Math.random()*6-3).toFixed(1)}px)">${ch}</span>`).join('');
function startGame(){
  $('title').style.display='none';
  $('hud').style.display='block';
  ac(); engOn();
  state='countdown'; cdT=0;
  showHint('W — gas · A/D — steer · cross the line before the ink runs dry');
}
$('title').addEventListener('pointerdown',startGame);

/* ---------------- update ---------------- */
function wrapD(d){ const L=track.len; d=((d%L)+L)%L; if(d>L/2)d-=L; return d; }
function update(dt){
  T+=dt; tS=T;
  shake*=Math.exp(-3.5*dt);
  flashV*=Math.exp(-5*dt); $('flash').style.opacity=flashV;

  if(state==='countdown'){
    cdT+=dt;
    if(cdT<2.6){
      const prevSec=Math.floor((cdT-dt)*1.6), nowSec=Math.floor(cdT*1.6);
      if(nowSec>prevSec&&nowSec<=3) sndBeep();
    } else if(!update._go){ update._go=true; sndGo(); }
    if(cdT>3.1){ state='play'; }
    return;
  }
  if(state!=='play')return;

  clockT-=dt; lapT+=dt;
  const sec=Math.ceil(clockT);
  if(sec<=5&&sec>0&&Math.ceil(clockT+dt)>sec) sndBeep();
  if(clockT<=0){
    state='over'; sndEnd(); engSet(0,false); flash('#141420',0.5);
    $('endsub').textContent=`${lap-1} lap${lap-1===1?'':'s'} · ${best?('BEST LAP '+best.toFixed(2)+'s'):'no clean lap'} · PAINTED ${painted}`;
    $('endtitle').textContent='OUT OF INK';
    setTimeout(()=>$('endscr').style.display='flex',700);
    return;
  }

  const st=(key.KeyD||key.ArrowRight?1:0)-(key.KeyA||key.ArrowLeft?1:0);
  steerVis=lerp(steerVis,st,dt*8);
  const vFrac=P.v/VMAX;
  const gas=key.KeyW||key.ArrowUp, brk=key.KeyS||key.ArrowDown;

  const zi=clamp(Math.floor(P.z/SEG),0,track.N-1);
  const curveNow=track.curve[zi];
  gForce=lerp(gForce,curveNow*vFrac,dt*4);

  const off=Math.abs(P.x)>1;
  const vmaxEff=off?VMAX*0.45:VMAX;
  if(gas) P.v+=52*dt;
  else if(brk) P.v-=95*dt;
  else P.v-=14*dt;
  if(P.v>vmaxEff) P.v-=48*dt;
  P.v=clamp(P.v,0,VMAX);
  if(off&&P.v>40&&Math.random()<0.5)sndScrub();

  P.x+=st*dt*(1.05+0.95*vFrac);
  P.x-=curveNow*vFrac*vFrac*dt*0.85;
  P.x=clamp(P.x,-1.6,1.6);

  const pz=P.z;
  P.z+=P.v*dt;
  if(P.z>=track.len){
    P.z-=track.len;
    lap++; clockT+=55; sndBell(); flash('#2a4aa0',0.18);
    const lt=lapT; lapT=0;
    if(!best||lt<best)best=lt;
    for(const c of track.cones) c.alive=true;
    showHint('lap '+lap+' · +55 ink');
  }

  /* traffic */
  for(const c of CARN){
    if(c.paint>0){ c.paint-=dt; continue; }
    c.z=(c.z+c.v*dt)%track.len;
    const dz=wrapD(c.z-P.z);
    if(dz>-1&&dz<3.4&&Math.abs(c.x-P.x)*ROADH<1.75){
      c.paint=5+LR()*4;
      painted++; clockT=Math.max(0,clockT-1.5);
      P.v*=0.55; shake=0.6; sndSplat(); flash('#e8442e',0.25);
      const roadY=track.y[Math.floor(P.z/SEG)%track.N];
      const wp=cameraSpaceToWorld((c.x)*ROADH*0.7,roadY+0.7,clamp(dz,18,500));
      splat(wp.x,wp.y,wp.z,20,[PAL[c.col%PAL.length],PAL[(c.col+3)%PAL.length],PAL[(c.col+5)%PAL.length]],14,0.7);
    } else if(dz<-300){
      if(LR()<0.002){ c.z=(P.z+300+LR()*900)%track.len; c.x=LR()*1.6-0.8; }
    }
  }
  /* cones */
  for(const c of track.cones){
    if(!c.alive)continue;
    const dz=wrapD(c.seg*SEG-P.z);
    if(dz>-0.5&&dz<2.4&&Math.abs(c.x-P.x)*ROADH<1.0){
      c.alive=false; P.v*=0.82; shake=0.3; sndSplat();
      const roadY2=track.y[Math.floor(P.z/SEG)%track.N];
      const wp=cameraSpaceToWorld(c.x*ROADH,roadY2+0.4,Math.max(15,dz));
      splat(wp.x,wp.y,wp.z,12,[new THREE.Color(0xe08a1e),PAL[1]],9,0.5);
    }
  }
}
function cameraSpaceToWorld(x,y,rz){
  const v=new THREE.Vector3(x,y,-rz);
  v.applyQuaternion(cam.quaternion); v.add(cam.position);
  return v;
}

/* ---------------- render ---------------- */
function renderRoad(){
  for(const k in LN)LN[k].n=0;
  for(const p of pools)p.used=0;

  const W=innerWidth,H=innerHeight;
  const N=track.N;
  const base=clamp(Math.floor(P.z/SEG),0,N-1);
  const basePct=(P.z%SEG)/SEG;
  const camXw=P.x*ROADH;
  const camY=lerp(track.y[base],track.y[(base+1)%N],basePct)+EYE;

  let xa=0, dxa=-track.curve[base]*basePct;
  let maxy=H*1.2;
  const tq=Math.floor(T*9);
  const jit=(i)=>(h1(i*3.7+tq*49.1)-0.5)*2.4;

  const bounds=[];
  for(let k=0;k<=DRAW;k++){
    const rz=Math.max(0.1,(k+1-basePct)*SEG);
    const kpx=CD/rz*(H/2);
    const i1=(base+k)%N;
    const X=W/2+(xa-camXw)*kpx;
    const Y=H/2-(track.y[i1]-camY)*kpx;
    const Wd=ROADH*kpx;
    const vis=Y<maxy;
    bounds.push({X,Y,Wd,kpx,rz,vis});
    if(vis&&Y<maxy)maxy=Y;
    xa+=dxa; dxa+=track.curve[(base+k)%N];
  }
  if(state!=='over'){
    for(let k=1;k<bounds.length;k++){
      const b0=bounds[k-1],b1=bounds[k];
      if(!b1.vis)continue;
      const fade=clamp(1.45-b1.rz/1250,0,1);
      if(fade<=0.02)continue;
      const i1=(base+k)%N;
      lput(LN.edgeL,b0.X-b0.Wd+jit(i1),b0.Y,0,b1.X-b1.Wd+jit(i1+1),b1.Y,0);
      lput(LN.edgeR,b0.X+b0.Wd+jit(i1+2),b0.Y,0,b1.X+b1.Wd+jit(i1+3),b1.Y,0);
      if(i1%2===0) lput(LN.dash,b0.X+jit(i1+4),b0.Y,0,b1.X+jit(i1+5),b1.Y,0);
      if(i1%3===0){
        const ex=(Math.floor(i1/3)%2)?1:-1;
        lput(LN.rumble,b0.X+ex*b0.Wd*1.02,b0.Y,0,b1.X+ex*b1.Wd*1.3,b1.Y,0);
      }
      if(track.curve[i1]>1.2){
        lput(LN.wall,b0.X+b0.Wd*1.55,b0.Y-b0.Wd*0.16,0,b1.X+b1.Wd*1.55,b1.Y-b1.Wd*0.16,0);
        lput(LN.wall,b0.X-b0.Wd*1.55,b0.Y-b0.Wd*0.16,0,b1.X-b1.Wd*1.55,b1.Y-b1.Wd*0.16,0);
      }
      if(i1<3){
        lput(LN.wall,b0.X-b0.Wd*1.5,b0.Y,0,b0.X+b0.Wd*1.5,b0.Y,0);
      }
    }
    for(const L of Object.values(LN)){
      L.geo.attributes.position.needsUpdate=true;
      L.geo.setDrawRange(0,L.n*2);
    }
  }

  const put=(pool,sx,sy,rz,kpx,wWorld,hWorld,fade)=>{
    if(fade<=0.03)return;
    const s=use(pool); if(!s)return;
    setSprite(s,sx,sy,rz,kpx,wWorld,hWorld,fade);
  };
  for(const o of OBS){
    let n=o.seg-base; if(n<0)n+=N;
    if(n<1||n>=DRAW-1)continue;
    const b=bounds[n]; if(!b||!b.vis)continue;
    const sx=b.X+o.off*b.kpx;
    const fade=clamp(1.45-b.rz/1250,0,1);
    if(o.type==='tree') put(POOL.tree,sx,b.Y,b.rz,b.kpx,o.h*0.62,o.h,fade);
    else if(o.type==='sign') put(POOL.sign[o.tex%POOL.sign.length],sx,b.Y,b.rz,b.kpx,3.4,1.7,fade);
    else if(o.type==='pennant') put(POOL.pennant,sx,b.Y,b.rz,b.kpx,1.3,7.2,fade);
    else if(o.type==='fans') put(POOL.fans,sx,b.Y,b.rz,b.kpx,5.6,2.8,fade);
    else if(o.type==='drums') put(POOL.drums,sx,b.Y,b.rz,b.kpx,2.6,1.8,fade);
  }
  for(const c of track.cones){
    if(!c.alive)continue;
    let n=c.seg-base; if(n<0)n+=N;
    if(n<1||n>=DRAW-1)continue;
    const b=bounds[n]; if(!b||!b.vis)continue;
    put(POOL.cone,b.X+c.x*ROADH*b.kpx,b.Y,b.rz,b.kpx,0.8,1.0,clamp(1.45-b.rz/900,0,1));
  }
  for(const c of CARN){
    if(c.paint>0)continue;
    const dz=wrapD(c.z-P.z);
    if(dz<=0)continue;
    const n=Math.floor(dz/SEG);
    if(n<1||n>=DRAW-1)continue;
    const b=bounds[n]; if(!b||!b.vis)continue;
    put(POOL.car[c.col],b.X+c.x*ROADH*b.kpx,b.Y,b.rz,b.kpx,2.5,2.1,clamp(1.5-b.rz/1100,0,1));
  }
  {
    let bn=(2-base+N)%N;
    if(bn<DRAW-2){
      const b=bounds[bn];
      if(b&&b.vis) put(POOL.banner,b.X,b.Y,b.rz,b.kpx,11.5,2.9,clamp(1.5-b.rz/1300,0,1));
    }
  }
}
function setSprite(s,sx,sy,rz,kpx,wWorld,hWorld,fade){
  const v=new THREE.Vector3((sx-innerWidth/2)*rz/(CD*innerHeight/2),
                            (innerHeight/2-sy)*rz/(CD*innerHeight/2),
                            -Math.max(0.5,rz));
  v.applyQuaternion(cam.quaternion); v.add(cam.position);
  s.position.copy(v);
  s.scale.set(wWorld,hWorld,1);
  s.material.opacity=clamp(fade,0,1);
}

/* ---------------- HUD ---------------- */
let lastT=-1;
function hud(){
  const t=Math.max(0,clockT);
  const s=t.toFixed(1);
  const cv=$('clock');
  if(s!==lastT){ lastT=s; cv.textContent=s; cv.classList.toggle('low',t<10); }
  $('lapv').textContent=lap;
  $('bestv').textContent='BEST '+(best?best.toFixed(2):'--.--');
  $('spdv').textContent=Math.round(P.v*1.55);
  $('paintv').textContent=painted;
}

/* ---------------- main loop ---------------- */
let titleDrift=0;
function loop(now){
  requestAnimationFrame(loop);
  let dt=Math.min((now-last)/1000,0.033); last=now;
  update(dt);
  stepFX(dt);

  if(state==='title'){
    titleDrift+=dt;
    P.v=VMAX*0.5;
    P.z=(P.z+P.v*dt)%track.len;
    P.x=Math.sin(titleDrift*0.5)*0.4;
  }
  updateCamera(dt);
  renderRoad();
  skyDrift();
  hud();
  engSet(P.v,state==='play'||state==='countdown');

  renderer.clear();
  renderer.render(bgScene,bgCam);
  renderer.clearDepth();
  renderer.render(scrScene,scrCam);
  renderer.render(scene,cam);
}
function updateCamera(dt){
  const N=track.N;
  const zi=clamp(Math.floor(P.z/SEG),0,N-1);
  const pct=(P.z%SEG)/SEG;
  const y=lerp(track.y[zi],track.y[(zi+1)%N],pct);
  const ahead=Math.floor((P.z+30)%track.len/SEG);
  const yAhead=track.y[ahead];
  const pitch=Math.atan2(yAhead-y,30)*0.55;
  const tq=Math.floor(T*9);
  const bob=P.v*0.00015*Math.sin(T*33)+ (Math.abs(P.x)>1?Math.sin(T*46)*0.05:0);
  cam.position.set(
    P.x*ROADH+(h1(tq*3+1)-0.5)*0.05+(Math.random()-0.5)*shake*0.7,
    y+EYE+0.55+bob+(h1(tq*7+2)-0.5)*0.05+(Math.random()-0.5)*shake*0.5,
    P.z
  );
  cam.rotation.set(pitch,0,-gForce*0.045+(h1(tq*11)-0.5)*0.004+(Math.random()-0.5)*shake*0.02);
  cam.rotation.order='YXZ';
  const carS=15;
  playerCar.position.set(steerVis*1.1-gForce*2.6,-6.4,-carS);
  playerCar.scale.set(6.4,5.1,1);
  playerCar.material.rotation=steerVis*0.02+gForce*0.05;
}
const playerCar=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.player,transparent:true,blending:THREE.MultiplyBlending,depthWrite:false}));
playerCar.renderOrder=20; cam.add(playerCar);

POOL.tree=mkPool(TEX.tree,120);
POOL.sign=TEX.signs.map(t=>mkPool(t,4));
POOL.pennant=mkPool(TEX.pennant,30);
POOL.fans=mkPool(TEX.fans,10);
POOL.drums=mkPool(TEX.drums,26);
POOL.car=TEX.cars.map(t=>mkPool(t,4));
POOL.cone=mkPool(TEX.carsFront[0],12);
POOL.banner=mkPool(TEX.banner,1);

/* sky doodles attached to camera (positions as screen fractions of each depth) */
const SKY=[];
function skySpr(tex,fx,fy,z,wFrac,hFrac,order,par){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,blending:THREE.MultiplyBlending,depthWrite:false,opacity:0.9}));
  const halfH=z/CD, halfW=halfH*(innerWidth/innerHeight);
  s.position.set(fx*halfW,fy*halfH,-z);
  s.scale.set(wFrac*halfH,hFrac*halfH,1);
  s.renderOrder=order; s.userData={fx,fy,z,par};
  cam.add(s); SKY.push(s); return s;
}
skySpr(TEX.sun,0.52,0.52,3400,0.30,0.30,-50,40);
for(let i=0;i<10;i++)skySpr(TEX.cloud,-0.88+i*0.196,0.14+((i*47)%17)*0.011,3000,0.16+((i*29)%8)*0.014,(0.16+((i*29)%8)*0.014)*0.31,-40,240);
for(let i=0;i<4;i++)skySpr(TEX.mtn,-0.72+i*0.48,0.052,2600,0.42,0.132,-45,260);
function skyDrift(){
  for(const s of SKY){
    const u=s.userData;
    const halfW=u.z/CD*(innerWidth/innerHeight);
    let x=u.fx*halfW-gForce*u.par;
    if(s.material.map===TEX.cloud) x+=Math.sin(T*0.06+u.fx*7)*halfW*0.09;
    s.position.x=x;
  }
}

window.__INK={st:()=>state,p:P,clock:()=>clockT,lap:()=>lap,cars:CARN,cones:()=>track.cones,len:()=>track.len,
  pcar:()=>({vis:playerCar.visible,pos:playerCar.position.toArray(),par:playerCar.parent===cam,op:playerCar.material.opacity,map:!!playerCar.material.map})};
requestAnimationFrame(loop);
