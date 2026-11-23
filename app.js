import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const viewport=$('#viewport'),stage=$('#stage'),canvas=$('#canvas');
let renderer,model,kitchen,materials=[],ready=false,spinning=false,coverVisible=true;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,.005,20);
const target=new THREE.Vector3(0,0,0);
const pose={perspective:[-.2382,.81172,1.2398],top:[0,1.6,.0001],underside:[.5,-.95,1.20],edge:[.05,.06,1.50]};
let controls,undersideFill;
function announce(t){$('#announcement').textContent=t;}
function syncDisplay(){
  if(model)model.visible=coverVisible;
  if(kitchen)kitchen.visible=!coverVisible||$('#setting').checked;
  if(undersideFill)undersideFill.visible=coverVisible&&!$('#setting').checked;
  if(renderer)renderer.shadowMap.needsUpdate=true;
  measure.visible=coverVisible&&$('#dimensions').checked;
  $('#measure-labels').style.display=measure.visible?'block':'none';
  $('#cover-toggle').textContent=coverVisible?'Hide cover':'Show cover';
  viewport.setAttribute('aria-label',coverVisible?'3D sink cover, seated on the steel shelf. Drag to orbit.':'Uncovered sink and steel support shelf. Drag to orbit.');
  if(!$('#still').hidden){
    $('#still').src=coverVisible?'assets/sink-cover-preview.png?v=fitted1':'assets/sink-shelf-uncovered.png?v=fitted1';
    $('#still').alt=coverVisible?'Cover level with the marble countertop':'Exposed steel shelf around the sink opening';
  }
}
function stillPreview(){
  $('#still').hidden=false;
  $('#loading').classList.add('hidden');
  $('#viewer-help').textContent='Rendered view · Hide or show the cover';
  for(const element of $$('[data-view], .swatch, #dimensions, #wireframe, #setting, #spin, #reset'))element.disabled=true;
  syncDisplay();
}
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xeaf1f5,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;
  controls.minDistance=.18;controls.maxDistance=3;controls.autoRotateSpeed=.8;
  controls.target.copy(target);camera.position.fromArray(pose.perspective);controls.update();
  const studio=new THREE.Scene();
  studio.background=new THREE.Color(.105,.110,.122);
  for(const [x,y,z,w,h,r,g,b] of [[-2,2,1,2.6,3,3.0,2.48,2.06],[3,1,-1,1,2.8,1.55,1.66,1.82],[-1,3,-2,3.4,.65,2.3,1.87,1.53]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b),side:THREE.DoubleSide}));
    panel.position.set(x,y,z);panel.lookAt(0,0,0);studio.add(panel);
  }
  const envGen=new THREE.PMREMGenerator(renderer);
  scene.environment=envGen.fromScene(studio,.04).texture;
  scene.environmentIntensity=.78;
  envGen.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
  controls.addEventListener('start',()=>{$$('[data-view]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});});
  scene.add(new THREE.HemisphereLight(0xfff2de,0x57463d,.48));
  const key=new THREE.DirectionalLight(0xffead2,2.4);
  key.position.set(-.62,1.05,.56);
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-.72,right:.72,top:.65,bottom:-.65,near:.12,far:2.5});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias=.00016;
  key.shadow.bias=-.00008;
  key.shadow.radius=2;
  key.shadow.intensity=.78;
  scene.add(key);
  const windowFill=new THREE.DirectionalLight(0xe8efff,1.0);
  windowFill.position.set(.50,.92,.62);scene.add(windowFill);
  const rimLight=new THREE.DirectionalLight(0xffe5c9,.80);
  rimLight.position.set(.40,.52,-.72);scene.add(rimLight);
  undersideFill=new THREE.DirectionalLight(0xdbebff,.86);
  undersideFill.position.set(.35,-.72,.35);scene.add(undersideFill);
}catch(error){renderer=null;console.error(error);}
const measure=new THREE.Group();measure.visible=false;scene.add(measure);
const lineMaterial=new THREE.LineBasicMaterial({color:0x6095af,transparent:true,opacity:.8,depthTest:false});
function line(points){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,lineMaterial);l.renderOrder=5;measure.add(l);}
const labelPositions = [];

// GLB world coordinates are metres, with height on Y and depth on Z.
function addCoverDimensions(cover) {
  const bounds = new THREE.Box3().setFromObject(cover, true);
  const {min, max} = bounds;
  const y = max.y + .004;
  const front = max.z + .026;
  const right = max.x + .026;
  const tick = .008;
  line([[min.x, y, front], [max.x, y, front]]);
  line([[right, y, min.z], [right, y, max.z]]);
  for (const x of [min.x, max.x]) {
    line([[x, y, front - tick], [x, y, front + tick]]);
  }
  for (const z of [min.z, max.z]) {
    line([[right - tick, y, z], [right + tick, y, z]]);
  }
  const width = ((max.x - min.x) * 1000).toFixed(1);
  const depth = ((max.z - min.z) * 1000).toFixed(1);
  $('#width-label').textContent = width + ' mm';
  $('#depth-label').textContent = depth + ' mm';
  labelPositions.push(
    ['#width-label', new THREE.Vector3((min.x + max.x) / 2, y, front + .013)],
    ['#depth-label', new THREE.Vector3(right + .021, y, (min.z + max.z) / 2)]
  );
}
function resize(){if(!renderer)return;const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.max(.19,.32/camera.aspect)));camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);
function view(name){if(!controls)return;controls.target.copy(target);if(name==='perspective')controls.target.set(.01967,.01486,-.00544);camera.position.fromArray(pose[name]);if(coverVisible&&name!=='top')$('#setting').checked=name==='perspective';syncDisplay();controls.update();$$('[data-view]').forEach(b=>{const on=b.dataset.view===name;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on)});announce(name+' view');}
function stopSpin(){spinning=false;if(controls)controls.autoRotate=false;$('#spin').setAttribute('aria-pressed','false');$('#spin').innerHTML='<span aria-hidden="true">⟳</span> Auto rotate';}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{stopSpin();view(b.dataset.view)}));
$('#reset').addEventListener('click',()=>{stopSpin();view('perspective')});canvas.addEventListener('dblclick',()=>{stopSpin();view('perspective')});
$('#spin').addEventListener('click',()=>{if(!ready)return;spinning=!spinning;controls.autoRotate=spinning;$('#spin').setAttribute('aria-pressed',spinning);$('#spin').innerHTML='<span aria-hidden="true">⟳</span> '+(spinning?'Stop rotation':'Auto rotate')});
$('#dimensions').addEventListener('change',syncDisplay);
$('#wireframe').addEventListener('change',e=>materials.forEach(m=>m.wireframe=e.target.checked));
$('#setting').addEventListener('change',syncDisplay);
let sinkBeforeHide=true;
$('#cover-toggle').addEventListener('click',()=>{
  coverVisible=!coverVisible;
  if(coverVisible)$('#setting').checked=sinkBeforeHide;
  else{sinkBeforeHide=$('#setting').checked;$('#setting').checked=true;}
  const isStill=!$('#still').hidden;
  $('#setting').disabled=!coverVisible||isStill;
  $('#dimensions').disabled=!coverVisible||isStill;
  syncDisplay();
  announce(coverVisible?'Cover shown.':'Cover hidden. The steel support shelf is exposed.');
});
$$('.swatch').forEach(b=>b.addEventListener('click',()=>{if(!ready)return;materials.forEach(m=>m.color.set(b.dataset.color));$$('.swatch').forEach(s=>{s.classList.toggle('selected',s===b);s.setAttribute('aria-pressed',s===b)});$('#finish-name').textContent=b.getAttribute('aria-label').replace(' finish','')}));
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen()}catch{announce('Fullscreen is unavailable in this browser.')}});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Expand viewer');resize()});
viewport.addEventListener('keydown',e=>{if(!controls)return;const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));let used=true;switch(e.key){case'ArrowLeft':spherical.theta-=.12;break;case'ArrowRight':spherical.theta+=.12;break;case'ArrowUp':spherical.phi-=.12;break;case'ArrowDown':spherical.phi+=.12;break;case'+':case'=':spherical.radius*=.9;break;case'-':spherical.radius*=1.1;break;case'Home':view('perspective');return;default:used=false;}if(used){e.preventDefault();stopSpin();spherical.makeSafe();spherical.radius=THREE.MathUtils.clamp(spherical.radius,.18,3);camera.position.setFromSpherical(spherical).add(controls.target);controls.update();}});
if(renderer){
  const loader=new GLTFLoader();
  view('perspective');
  loader.load('assets/sink-setting.glb?v=fitted1',gltf=>{
    kitchen=gltf.scene;
    kitchen.traverse(o=>{
      if(!o.isMesh)return;
      const inShadowArea=!o.name.startsWith('Backsplash');
      o.castShadow=inShadowArea;
      o.receiveShadow=inShadowArea;
    });
    scene.add(kitchen);syncDisplay();
  },undefined,stillPreview);
  loader.load('assets/sink-cover.glb?v=fitted1',gltf=>{
    model=gltf.scene;scene.add(model);addCoverDimensions(model);
    model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.material=o.material.clone();o.material.wireframe=$('#wireframe').checked;materials.push(o.material);});
    ready=true;$('#loading').classList.add('hidden');syncDisplay();resize();announce('Model loaded. Drag to explore.');
  },p=>{if(p.total)$('#load-message').textContent='Opening your model… '+Math.round(p.loaded/p.total*100)+'%';},stillPreview);
  let last=performance.now();
  function frame(time){requestAnimationFrame(frame);const dt=Math.min((time-last)/1000,.05);last=time;controls.update(dt);if(measure.visible){for(const [id,p]of labelPositions){const q=p.clone().project(camera);const el=$(id);el.style.left=((q.x*.5+.5)*viewport.clientWidth)+'px';el.style.top=((-q.y*.5+.5)*viewport.clientHeight)+'px';el.style.visibility=q.z<1?'visible':'hidden';}}renderer.render(scene,camera);}
  requestAnimationFrame(frame);
}else stillPreview();
