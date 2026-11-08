(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const W = 400;
  const levels = [
    ['发呆厚泽',0,25,'#b7d2a8'],['微笑厚泽',1,30,'#edd16f'],
    ['嘟嘴厚泽',2,35,'#9bcdc6'],['惊讶厚泽',3,42,'#d3b4d8'],
    ['开心厚泽',4,49,'#eda57e'],['闪亮厚泽',0,62,'#88b9d2'],
    ['快乐加倍',1,68,'#e7a2b8'],['表情大师',3,76,'#b3aeed'],
    ['大厚泽',4,82,'#e9bd4b']
  ];
  const shapes = [
    // Five distinct silhouettes, tied to the five expressions at every tier.
    [[.1,-1],[1,.75],[-1,.95]],
    [[-.05,-1],[1,.05],[.05,1],[-1,-.05]],
    [[-.6,-.85],[.7,-.75],[1,.85],[-1,.85]],
    [[-.95,-.2],[-.65,-.65],[.15,-.8],[.9,-.4],[1,.15],[.55,.65],[-.3,.8],[-.9,.45]],
    [[-.15,-1],[.95,-.35],[.65,.95],[-.75,.8],[-1,-.25]]
  ];
  const shapeNames=['三角','菱形','梯形','扁豆','五角'];
  const levelShape=level=>shapes[levels[level][1]];
  const shapeCSS = level => 'polygon('+levelShape(level).map(([x,y])=>`${50+x*46}% ${50+y*46}%`).join(',')+')';
  function shapePath(level,r) {ctx.beginPath();levelShape(level).forEach(([x,y],i)=>{if(i)ctx.lineTo(x*r,y*r);else ctx.moveTo(x*r,y*r);});ctx.closePath();}
  function vertices(p) {const c=Math.cos(p.angle),s=Math.sin(p.angle);return levelShape(p.level).map(([x,y])=>({x:p.x+p.r*(x*c-y*s),y:p.y+p.r*(x*s+y*c)}));}
  function contact(a,b) {
    if(Math.abs(a.x-b.x)>(a.r+b.r)*1.42||Math.abs(a.y-b.y)>(a.r+b.r)*1.42)return null;
    const av=vertices(a),bv=vertices(b);let depth=Infinity,nx=0,ny=0;
    for(const poly of [av,bv])for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],len=Math.hypot(q.x-p.x,q.y-p.y),x=-(q.y-p.y)/len,y=(q.x-p.x)/len;
      let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
      for(const v of av){const d=v.x*x+v.y*y;amin=Math.min(amin,d);amax=Math.max(amax,d);}
      for(const v of bv){const d=v.x*x+v.y*y;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
      const overlap=Math.min(amax,bmax)-Math.max(amin,bmin);if(overlap<-.4)return null;
      if(overlap<depth){depth=Math.max(0,overlap);nx=x;ny=y;}
    }
    if((b.x-a.x)*nx+(b.y-a.y)*ny<0){nx=-nx;ny=-ny;}return {nx,ny,depth};
  }
  function contain(p) {const vs=vertices(p),left=Math.min(...vs.map(v=>v.x)),right=Math.max(...vs.map(v=>v.x)),bottom=Math.max(...vs.map(v=>v.y));if(left<0){p.x-=left;p.vx=Math.abs(p.vx)*.25;}if(right>W){p.x-=right-W;p.vx=-Math.abs(p.vx)*.25;}if(bottom>H){p.y-=bottom-H;p.vy=p.vy>25?-p.vy*.13:0;p.vx*=.97;}}
  const crops = [[100,150,950],[80,125,950],[65,370,1000],[95,140,960],[85,80,970]];
  const photos = Array.from({length:5}, (_, i) => { const im = new Image(); im.src = `face-${i}.jpg`; return im; });
  let pieces=[], sparks=[], score=0, best=0, highest=0, next=0, aim=W/2, cooldown=0, last=0, accumulator=0, timer;
  let H=440, dpr=1, activePointer=null, paused=false;
  try { best = Number(localStorage.getItem('houze-best-v1')) || 0; } catch {}
  $('#best').textContent = best;
  const audio = new Audio(); audio.loop=true; audio.volume=.35; audio.preload='none';
  let soundOn=false, audioBusy=false;
  let sfxOn=true;
  try{sfxOn=localStorage.getItem('houze-sfx-v1')!=='off';}catch{}
  const toast = text => { clearTimeout(timer); $('#toast').textContent=text; $('#toast').classList.add('visible'); timer=setTimeout(()=>$('#toast').classList.remove('visible'),1600); };
  function updateNext() { $('#next').src=photos[levels[next][1]].src; $('#next').style.clipPath=shapeCSS(next); $('#next-name').textContent=levels[next][0]; }
  levels.slice(0,5).forEach((l,i)=>{const el=document.createElement('div');el.className='specimen';el.style.setProperty('--rim',l[3]);el.style.setProperty('--shape',shapeCSS(i));el.innerHTML=`<img src="face-${l[1]}.jpg" alt="${l[0]}，${shapeNames[i]}轮廓"><span>${['发呆','微笑','嘟嘴','惊讶','开心'][i]}厚泽</span><small>${shapeNames[i]}</small>`;$('#gallery').append(el);});
  function resize() { const rect=canvas.getBoundingClientRect(); dpr=Math.min(window.devicePixelRatio||1,2); H=W*rect.height/rect.width; canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr); ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0); for(const p of pieces) {p.x=Math.max(p.r,Math.min(W-p.r,p.x));p.y=Math.min(H-p.r,p.y);} }
  function create(level,x,y,vx=0,vy=0) {return {level,x,y,vx,vy,r:levels[level][2],born:performance.now(),angle:0};}
  function drop() { if(paused||performance.now()<cooldown)return; cooldown=performance.now()+340; const r=levels[next][2]; pieces.push(create(next,Math.max(r+2,Math.min(W-r-2,aim)),r+10)); next=Math.random()<.6?0:Math.random()<.7?1:2; updateNext(); }
  function reward(level,x,y) {const gain=level===9?2000:Math.pow(2,level)*10;score+=gain;$('#score').textContent=score;if(score>best){best=score;$('#best').textContent=best;try{localStorage.setItem('houze-best-v1',String(best));}catch{}}highest=Math.max(highest,Math.min(level,8));$('#level-text').textContent=`最高 Lv.${highest+1}`;toast(level===9?'双倍大厚泽！ +2000':`${levels[level][0]} · +${gain}`);for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,s=80+Math.random()*130;sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color:levels[Math.min(level,8)][3]});}if(sfxOn) ping(level); }
  let audioCtx;
  function unlockAudio(){if(!sfxOn)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});}catch{}}
  function ping(level){
    if(!sfxOn||!audioCtx||audioCtx.state!=='running')return;
    try{
      const t=audioCtx.currentTime,base=1046.5*Math.pow(2,Math.min(level,8)/24);
      // A short bell: a clear fundamental and a softer, rapidly decaying overtone.
      for(const [ratio,volume,decay] of [[1,.13,.34],[2.76,.035,.14]]){
        const tone=audioCtx.createOscillator(),gain=audioCtx.createGain();tone.type='sine';tone.frequency.setValueAtTime(base*ratio,t);tone.connect(gain);gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.006);gain.gain.exponentialRampToValueAtTime(.0001,t+decay);
        tone.start(t);tone.stop(t+decay+.02);tone.onended=()=>{tone.disconnect();gain.disconnect();};
      }
    }catch{}
  }
  function step(dt) {
    for(const p of pieces){p.vy+=820*dt;p.vx*=.998;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle=Math.max(-.35,Math.min(.35,p.angle+p.vx*dt*.006));}
    const removed=new Set(), added=[];
    for(let pass=0;pass<5;pass++){
      for(const p of pieces){if(!removed.has(p))contain(p);}
      for(let i=0;i<pieces.length;i++){const a=pieces[i];if(removed.has(a))continue;for(let j=i+1;j<pieces.length;j++){const b=pieces[j];if(removed.has(b))continue;const hit=contact(a,b);if(!hit)continue;if(a.level===b.level){removed.add(a);removed.add(b);const level=a.level+1,x=(a.x+b.x)/2,y=(a.y+b.y)/2;if(level<levels.length)added.push(create(level,x,y,(a.vx+b.vx)*.35,-40));reward(level,x,y);break;}const {nx,ny,depth:overlap}=hit,ma=a.r*a.r,mb=b.r*b.r;a.x-=nx*overlap*mb/(ma+mb);a.y-=ny*overlap*mb/(ma+mb);b.x+=nx*overlap*ma/(ma+mb);b.y+=ny*overlap*ma/(ma+mb);const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(relative<0){const imp=-1.08*relative/(1/ma+1/mb);a.vx-=imp*nx/ma;a.vy-=imp*ny/ma;b.vx+=imp*nx/mb;b.vy+=imp*ny/mb;}}}
    }
    if(removed.size) pieces=pieces.filter(p=>!removed.has(p)).concat(added);
    for(const p of sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt*1.5;}sparks=sparks.filter(p=>p.life>0);
  }
  function drawFace(level,x,y,r,alpha=1,angle=0) {const l=levels[level],im=photos[l[1]],crop=crops[l[1]];ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(angle);ctx.shadowColor='#2149312b';ctx.shadowBlur=6;ctx.shadowOffsetY=3;shapePath(level,r);ctx.fillStyle=l[3];ctx.fill();ctx.shadowColor='transparent';ctx.save();shapePath(level,r-2);ctx.clip();if(im.complete&&im.naturalWidth)ctx.drawImage(im,crop[0],crop[1],crop[2],crop[2],-r,-r,2*r,2*r);ctx.restore();ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle=l[3];shapePath(level,r-1.5);ctx.stroke();ctx.fillStyle='#234c40';ctx.textAlign='center';if(level===8){ctx.font='25px serif';ctx.fillText('♛',0,-r+18);}ctx.restore();}
  function render(){ctx.clearRect(0,0,W,H);const r=levels[next][2],x=Math.max(r+2,Math.min(W-r-2,aim));ctx.save();ctx.strokeStyle='#95b08c66';ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(x,r*2+18);ctx.lineTo(x,H-12);ctx.stroke();ctx.restore();drawFace(next,x,r+10,r,.28);for(const p of pieces){const age=Math.min(1,(performance.now()-p.born)/150);drawFace(p.level,p.x,p.y,p.r*(.7+.3*age),1,p.angle);}for(const p of sparks){ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,3*p.life,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function loop(time){if(!last)last=time;const elapsed=Math.min((time-last)/1000,.05);last=time;if(!paused){accumulator+=elapsed;while(accumulator>=1/120){step(1/120);accumulator-=1/120;}}render();requestAnimationFrame(loop);}
  function setAim(e){const box=canvas.getBoundingClientRect();aim=(e.clientX-box.left)*W/box.width;}
  canvas.addEventListener('pointerdown',e=>{if(activePointer!==null)return;unlockAudio();e.preventDefault();activePointer=e.pointerId;setAim(e);canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(activePointer===e.pointerId||e.pointerType==='mouse')setAim(e);});
  canvas.addEventListener('pointerup',e=>{if(activePointer!==e.pointerId)return;setAim(e);activePointer=null;drop();});
  canvas.addEventListener('pointercancel',()=>{activePointer=null;});
  canvas.addEventListener('keydown',e=>{unlockAudio();if(e.key==='ArrowLeft'){aim-=14;e.preventDefault();}if(e.key==='ArrowRight'){aim+=14;e.preventDefault();}aim=Math.max(0,Math.min(W,aim));if(e.code==='Space'||e.code==='Enter'){e.preventDefault();drop();}});
  function openDialog(el){paused=true;if(el.showModal)el.showModal();else el.setAttribute('open','');}
  function closeDialog(el){if(el.close)el.close();else el.removeAttribute('open');paused=false;last=0;accumulator=0;}
  $('#help').onclick=()=>openDialog($('#help-dialog'));$('#got-it').onclick=$('.dialog-close').onclick=()=>closeDialog($('#help-dialog'));
  $('#restart').onclick=()=>{if(!pieces.length&&!score)return reset();openDialog($('#restart-dialog'));};$('#cancel-restart').onclick=()=>closeDialog($('#restart-dialog'));$('#confirm-restart').onclick=()=>{closeDialog($('#restart-dialog'));reset();};
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{paused=false;last=0;}));
  function reset(){pieces=[];sparks=[];score=0;highest=0;next=0;cooldown=0;aim=W/2;$('#score').textContent='0';$('#level-text').textContent='最高 Lv.1';updateNext();toast('新的厚泽，新的快乐！');}
  function setMusicUI(){ $('#music').textContent=soundOn?'♫ 音乐已开':'♫ 音乐已关';$('#music').setAttribute('aria-pressed',String(soundOn)); }
  function setSfxUI(){ $('#sfx').textContent=sfxOn?'♪ 合成音已开':'♪ 合成音已关';$('#sfx').setAttribute('aria-pressed',String(sfxOn)); }
  $('#sfx').onclick=()=>{sfxOn=!sfxOn;try{localStorage.setItem('houze-sfx-v1',sfxOn?'on':'off');}catch{}setSfxUI();if(sfxOn){unlockAudio();if(audioCtx)audioCtx.resume().then(()=>ping(1)).catch(()=>{});}};
  setSfxUI();
  $('#music').onclick=async()=>{if(audioBusy)return;audioBusy=true;try{if(soundOn){audio.pause();soundOn=false;}else{if(!audio.src)audio.src=''+$('#track').value;await audio.play();soundOn=true;}}catch{soundOn=false;toast('音乐暂时没播放成功，再点一下试试');}finally{audioBusy=false;setMusicUI();}};
  $('#track').onchange=async()=>{const resume=soundOn;audio.pause();audio.src=''+$('#track').value;if(resume){try{await audio.play();}catch{soundOn=false;toast('点音乐按钮继续播放');}}setMusicUI();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.pause();paused=true;}else{paused=!!document.querySelector('dialog[open]');last=0;accumulator=0;if(soundOn)audio.play().catch(()=>{soundOn=false;setMusicUI();});}});
  window.addEventListener('resize',resize);resize();updateNext();requestAnimationFrame(loop);
})();
