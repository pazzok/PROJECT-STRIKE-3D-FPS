import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Detect touch-capable devices independently of viewport width/orientation.
const touchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
  (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (touchDevice) document.body.classList.add('touch-device');

const canvas=document.querySelector('#game-canvas');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9bb6c1);
scene.fog=new THREE.Fog(0x9bb6c1,22,78);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.1,120);
camera.position.set(0,1.7,8);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=false;renderer.outputColorSpace=THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xe5f8ff,0x33404c,2.2));
const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(-8,15,6);scene.add(sun);
const mat=(color,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const floorMat=mat(0x53656a),wallMat=mat(0x35464d),trimMat=mat(0x53f3e5,.4,.2),crateMat=mat(0x65777a),darkMat=mat(0x18252b);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=0;scene.add(floor);
const grid=new THREE.GridHelper(80,80,0x77949a,0x60777d);grid.position.y=.012;scene.add(grid);
const solidObstacles=[];
function box(x,y,z,sx,sy,sz,material,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);m.position.set(x,y,z);scene.add(m);return m}
function solidBox(x,y,z,sx,sy,sz,material){const m=box(x,y,z,sx,sy,sz,material);solidObstacles.push({x,z,halfX:sx/2,halfZ:sz/2});return m}
function wall(x,z,sx,sz,h=3){solidBox(x,h/2,z,sx,h,sz,wallMat);box(x,h+.02,z,sx+.04,.07,sz+.04,trimMat,false)}
// Perimeter and tactical cover
wall(0,-17,36,.8,4);wall(0,17,36,.8,4);wall(-18,0,.8,34,4);wall(18,0,.8,34,4);
for(const [x,z,sx,sz] of [[-7,-7,3,2],[5,-9,2,4],[-3,0,4,1.5],[9,2,2.5,2.5],[-9,8,3,2],[3,10,4,1.5],[0,-13,5,1.2]]){solidBox(x,.75,z,sx,1.5,sz,crateMat);box(x,.3,z,sx+.06,.1,sz+.06,trimMat,false)}
// distant buildings beyond perimeter for a skyline
for(let i=0;i<12;i++){const x=-30+i*5;box(x,2.5,-25+(i%3)*1,3,5+(i%4),3,wallMat,false)}
// first-person weapon model
const weapon=new THREE.Group();camera.add(weapon);scene.add(camera);
const gunMat=mat(0x202b30,.4,.6),gunAccent=mat(0x53f3e5,.35,.2);
const body=new THREE.Mesh(new THREE.BoxGeometry(.22,.19,.68),gunMat);body.position.set(.36,-.28,-.68);weapon.add(body);
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.42,10),gunMat);barrel.rotation.x=Math.PI/2;barrel.position.set(.36,-.235,-1.13);weapon.add(barrel);
const stock=new THREE.Mesh(new THREE.BoxGeometry(.15,.13,.28),darkMat);stock.position.set(.35,-.3,-.28);weapon.add(stock);
const sight=new THREE.Mesh(new THREE.BoxGeometry(.08,.07,.12),gunAccent);sight.position.set(.36,-.16,-.78);weapon.add(sight);
const muzzleFlash=new THREE.PointLight(0x8fffee,0,3);muzzleFlash.position.set(.36,-.23,-1.32);weapon.add(muzzleFlash);
const raycaster=new THREE.Raycaster();const clock=new THREE.Clock();
let started=false,paused=false,health=100,ammo=30,reserve=120,kills=0,shots=0,hits=0,reloading=false,lastShot=0,damageCooldown=0;
const keys={};let yaw=0,pitch=0,moveX=0,moveY=0,joyActive=false,lookTouch=null,lookLastX=0,lookLastY=0,fireHeld=false;
let sensitivity=1;try{sensitivity=Number(localStorage.getItem('projectStrikeSensitivity'))||1}catch(_){}sensitivity=Math.max(.01,Math.min(10,sensitivity));
const sensitivityInput=document.querySelector('#sensitivity'),sensitivityValue=document.querySelector('#sensitivity-value');
function applySensitivity(value){sensitivity=Math.max(.01,Math.min(10,Number(value)||1));sensitivityInput.value=sensitivity.toFixed(2);sensitivityValue.textContent=sensitivity.toFixed(2);try{localStorage.setItem('projectStrikeSensitivity',sensitivity.toFixed(2))}catch(_){}}
applySensitivity(sensitivity);
const bots=[],botParts=[];const botMat=mat(0xd35c4a),botDark=mat(0x303b43),botGlow=mat(0xffb15e,.35,.1);
function makeBot(x,z){
 const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
 const torso=new THREE.Mesh(new THREE.BoxGeometry(.62,.8,.34),botMat);torso.position.y=1.18;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.23,12,10),botDark);head.position.y=1.78;g.add(head);
 const visor=new THREE.Mesh(new THREE.BoxGeometry(.29,.07,.04),botGlow);visor.position.set(0,1.8,-.215);g.add(visor);
 const leg1=new THREE.Mesh(new THREE.BoxGeometry(.2,.56,.23),botDark);leg1.position.set(-.17,.36,0);g.add(leg1);
 const leg2=leg1.clone();leg2.position.x=.17;g.add(leg2);
 const arm1=new THREE.Mesh(new THREE.BoxGeometry(.18,.58,.2),botDark);arm1.position.set(-.43,1.18,0);g.add(arm1);
 const arm2=arm1.clone();arm2.position.x=.43;g.add(arm2);
 const bot={g,hp:100,maxHp:100,phase:Math.random()*6.28,alive:true,parts:[torso,head,visor,leg1,leg2,arm1,arm2],shotTimer:2+Math.random()*3};bots.push(bot);for(const p of bot.parts){p.userData.bot=bot;botParts.push(p)}
}
function spawnBots(){for(const b of bots)scene.remove(b.g);bots.length=0;botParts.length=0;[[-11,-10],[10,-12],[12,8],[-12,12],[0,-5],[7,5]].forEach(p=>makeBot(...p))}
spawnBots();
function ui(id,val){document.getElementById(id).textContent=val}
function updateHud(){ui('health',Math.max(0,Math.round(health)));document.querySelector('#healthbar').style.width=Math.max(0,health)+'%';ui('kills',kills);ui('ammo',ammo);ui('accuracy',shots?Math.round(hits/shots*100)+'%':'0%')}
function start(){document.querySelector('#start-screen').classList.add('hidden');started=true;paused=false;document.querySelector('#pause-screen').classList.add('hidden');if(!touchDevice && matchMedia('(pointer:fine)').matches&&canvas.requestPointerLock)canvas.requestPointerLock();lastShot=0}
document.querySelector('#start').addEventListener('click',start);
const settingsScreen=document.querySelector('#settings-screen');let settingsReturn='start';
function openSettings(from){settingsReturn=from;settingsScreen.classList.remove('hidden');document.querySelector('#start-screen').classList.add('hidden');document.querySelector('#pause-screen').classList.add('hidden')}
function closeSettings(){settingsScreen.classList.add('hidden');if(settingsReturn==='pause')document.querySelector('#pause-screen').classList.remove('hidden');else document.querySelector('#start-screen').classList.remove('hidden')}
document.querySelector('#open-settings-start').addEventListener('click',()=>openSettings('start'));document.querySelector('#open-settings-pause').addEventListener('click',()=>openSettings('pause'));sensitivityInput.addEventListener('input',()=>applySensitivity(sensitivityInput.value));document.querySelector('#settings-default').addEventListener('click',()=>applySensitivity(1));document.querySelector('#settings-close').addEventListener('click',closeSettings);
const fullscreenButton=document.querySelector('#fullscreen-btn');
fullscreenButton.addEventListener('click',async()=>{
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
      if(screen.orientation && screen.orientation.lock){
        try{await screen.orientation.lock('landscape')}catch(_){}
      }
      fullscreenButton.textContent='⛶ 전체 화면 해제';
    }else{
      await document.exitFullscreen();
      fullscreenButton.textContent='⛶ 전체 화면';
    }
  }catch(_){
    ui('message','브라우저 메뉴에서 전체 화면 또는 홈 화면에 추가를 이용하세요');
  }
});
document.addEventListener('fullscreenchange',()=>{
  fullscreenButton.textContent=document.fullscreenElement?'⛶ 전체 화면 해제':'⛶ 전체 화면';
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});
function pause(){if(!started||health<=0)return;paused=true;document.querySelector('#pause-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock()}
document.querySelector('#resume').addEventListener('click',()=>{paused=false;document.querySelector('#pause-screen').classList.add('hidden');if(!touchDevice && matchMedia('(pointer:fine)').matches&&canvas.requestPointerLock)canvas.requestPointerLock()});
function reset(){health=100;ammo=30;reserve=120;kills=0;shots=0;hits=0;reloading=false;started=false;paused=false;camera.position.set(0,1.7,8);yaw=0;pitch=0;updateHud();spawnBots();document.querySelector('#end-screen').classList.add('hidden');document.querySelector('#pause-screen').classList.add('hidden');document.querySelector('#start-screen').classList.remove('hidden')}
document.querySelector('#restart').addEventListener('click',reset);document.querySelector('#again').addEventListener('click',reset);
function reload(){if(!started||paused||reloading||ammo===30||reserve<=0)return;reloading=true;ui('message','재장전 중...');setTimeout(()=>{if(!reloading)return;const n=Math.min(30-ammo,reserve);ammo+=n;reserve-=n;reloading=false;ui('message','훈련 봇을 찾아 사격하세요');updateHud()},900)}
document.querySelector('#reload').addEventListener('click',reload);document.querySelector('#mobile-reload').addEventListener('click',reload);addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyR')reload();if(e.code==='Escape')pause()});addEventListener('keyup',e=>keys[e.code]=false);
function shoot(){if(!started||paused||reloading||health<=0)return;const now=performance.now();if(now-lastShot<145)return;lastShot=now;if(ammo<=0){ui('message','탄약 없음 · 재장전하세요');return}ammo--;shots++;muzzleFlash.intensity=4;setTimeout(()=>muzzleFlash.intensity=0,55);weapon.position.z=.055;setTimeout(()=>weapon.position.z=0,65);
 raycaster.setFromCamera(new THREE.Vector2(0,0),camera);raycaster.far=65;const intersections=raycaster.intersectObjects(botParts,false);if(intersections.length){const bot=intersections[0].object.userData.bot;if(bot&&bot.alive){bot.hp-=34;hits++;document.querySelector('#hitmarker').style.opacity=1;setTimeout(()=>document.querySelector('#hitmarker').style.opacity=0,100);if(bot.hp<=0){bot.alive=false;bot.g.visible=false;kills++;ui('message','적 처치 +1');setTimeout(()=>{if(started)ui('message','훈련 봇을 찾아 사격하세요')},800)}else ui('message','명중!');}}
 updateHud();document.querySelector('#crosshair').style.transform='translate(-50%,-50%) scale(1.35)';setTimeout(()=>document.querySelector('#crosshair').style.transform='translate(-50%,-50%) scale(1)',65)
}
canvas.addEventListener('click',()=>{if(started&&!paused&&!touchDevice&&matchMedia('(pointer:fine)').matches){if(document.pointerLockElement!==canvas)canvas.requestPointerLock();else shoot()}});
addEventListener('mousedown',e=>{if(e.button===0&&started&&!paused&&!touchDevice&&matchMedia('(pointer:fine)').matches&&document.pointerLockElement===canvas)shoot()});
// Valorant-style yaw scale: 0.07 degrees per mouse count at sensitivity 1.00.
const VALORANT_DEG_PER_COUNT=0.07;
const AIM_RADIANS_PER_UNIT=VALORANT_DEG_PER_COUNT*Math.PI/180;
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&started&&!paused){yaw-=e.movementX*AIM_RADIANS_PER_UNIT*sensitivity;pitch-=e.movementY*AIM_RADIANS_PER_UNIT*sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch));camera.rotation.set(pitch,yaw,0,'YXZ')}});
const joy=document.querySelector('#joystick'),stick=document.querySelector('#stick');
joy.addEventListener('pointerdown',e=>{joyActive=true;joy.setPointerCapture(e.pointerId);moveJoy(e)});
joy.addEventListener('pointermove',e=>{if(joyActive)moveJoy(e)});function moveJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=34,d=Math.hypot(dx,dy);if(d>max){dx=dx/d*max;dy=dy/d*max}moveX=dx/max;moveY=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`}
function releaseJoy(){joyActive=false;moveX=0;moveY=0;stick.style.transform='translate(0,0)'}joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
document.querySelector('#fire').addEventListener('pointerdown',e=>{e.preventDefault();fireHeld=true;shoot()});for(const id of ['fire']){document.getElementById(id).addEventListener('pointerup',()=>fireHeld=false);document.getElementById(id).addEventListener('pointercancel',()=>fireHeld=false)}
document.querySelector('#jump').addEventListener('click',()=>{if(started&&!paused)camera.position.y=2.1;setTimeout(()=>camera.position.y=1.7,280)});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&started&&!paused){lookTouch=e.pointerId;lookLastX=e.clientX;lookLastY=e.clientY;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&lookTouch===e.pointerId&&started&&!paused){const dx=e.clientX-lookLastX,dy=e.clientY-lookLastY;lookLastX=e.clientX;lookLastY=e.clientY;yaw-=dx*AIM_RADIANS_PER_UNIT*sensitivity;pitch-=dy*AIM_RADIANS_PER_UNIT*sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch));camera.rotation.set(pitch,yaw,0,'YXZ')}});
canvas.addEventListener('pointerup',e=>{if(lookTouch===e.pointerId)lookTouch=null});
let elapsed=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
 if(started&&!paused&&health>0){
  // Move relative to the direction the camera is facing.
  const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0)-moveY;
  const side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+moveX;
  const dir=new THREE.Vector3(
    -Math.sin(yaw)*forward + Math.cos(yaw)*side,
    0,
    -Math.cos(yaw)*forward - Math.sin(yaw)*side
  );
  if(dir.length()>1)dir.normalize();
  const stepX=dir.x*5.4*dt,stepZ=dir.z*5.4*dt;
  // Axis-separated collision: the player cannot walk through walls or cover.
  const radius=.38;
  const nextX=Math.max(-16,Math.min(16,camera.position.x+stepX));
  if(!solidObstacles.some(o=>Math.abs(nextX-o.x)<o.halfX+radius&&Math.abs(camera.position.z-o.z)<o.halfZ+radius))camera.position.x=nextX;
  const nextZ=Math.max(-15,Math.min(15,camera.position.z+stepZ));
  if(!solidObstacles.some(o=>Math.abs(camera.position.x-o.x)<o.halfX+radius&&Math.abs(nextZ-o.z)<o.halfZ+radius))camera.position.z=nextZ;
  camera.position.y=1.7;
  if(fireHeld)shoot();
  for(const b of bots){if(!b.alive)continue;b.phase+=dt*.8;b.g.position.x+=Math.sin(b.phase)*dt*.38;b.g.position.z+=Math.cos(b.phase*.7)*dt*.28;b.g.lookAt(camera.position.x,0,camera.position.z);b.shotTimer-=dt;if(b.shotTimer<=0){b.shotTimer=2.5+Math.random()*2.5;if(Math.hypot(b.g.position.x-camera.position.x,b.g.position.z-camera.position.z)<12&&Math.random()<.58){health-=8;document.querySelector('#damage-flash').classList.remove('active');void document.querySelector('#damage-flash').offsetWidth;document.querySelector('#damage-flash').classList.add('active');updateHud();if(health<=0){health=0;started=false;ui('final-kills',kills);document.querySelector('#end-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock()}}}}
 }
 renderer.render(scene,camera)
}
animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7))});
setTimeout(()=>{const l=document.querySelector('#loading');l.style.opacity=0;setTimeout(()=>l.remove(),550)},1500);
updateHud();
