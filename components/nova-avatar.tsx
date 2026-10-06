"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
export type NovaMood = "idle" | "thinking" | "listening" | "speaking" | "celebrating";

/** A real, self-contained WebGL character. No remote models, textures, or camera access. */
export function NovaAvatar({ mode = "idle", compact = false }: { mode?: NovaMood; compact?: boolean }) {
  const mount = useRef<HTMLDivElement>(null), state = useRef({ mode, paused: false, waveUntil: 0, dirty: true });
  const [ready, setReady] = useState(false), [fallback, setFallback] = useState(false), [paused, setPaused] = useState(false), [waving, setWaving] = useState(false);
  useEffect(() => { state.current.mode = mode; state.current.dirty = true; }, [mode]);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { const off = query.matches || localStorage.getItem("nova-motion") === "off"; setPaused(off); state.current.paused = off; state.current.dirty = true; };
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let disposed = false, cleanup = () => {};
    import("three").then(T => {
      if (disposed || !mount.current) return;
      const host = mount.current;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try { const canvas=document.createElement("canvas"), context=canvas.getContext("webgl2",{alpha:true,antialias:true,powerPreference:"low-power"}); if(!context){setFallback(true);return;} renderer = new T.WebGLRenderer({ canvas,context,alpha: true, antialias: true, powerPreference: "low-power" }); } catch { setFallback(true); return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
      renderer.domElement.setAttribute("aria-hidden", "true"); host.appendChild(renderer.domElement);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(36, 1, .1, 40);
      camera.position.set(0, .25, 6.8); camera.lookAt(0, .15, 0);
      scene.add(new T.HemisphereLight(0xe1f6ff, 0x6d78b8, 2.4));
      const key = new T.DirectionalLight(0xffffff, 4); key.position.set(-3, 4, 5); scene.add(key);
      const rim = new T.DirectionalLight(0x51ceff, 3); rim.position.set(3, 1, -2); scene.add(rim);
      const fill = new T.PointLight(0x8290ff, 7, 9); fill.position.set(-2,-1,2); scene.add(fill);
      const white = new T.MeshPhysicalMaterial({ color:0xeaf0ff, roughness:.2, metalness:.18, clearcoat:1, clearcoatRoughness:.12 });
      const dark = new T.MeshPhysicalMaterial({ color:0x07152c, roughness:.14, metalness:.3, clearcoat:1 });
      const blue = new T.MeshPhysicalMaterial({ color:0x286cf8, roughness:.18, metalness:.4, clearcoat:1 });
      const glow = new T.MeshStandardMaterial({ color:0x64eeff, emissive:0x28ceff, emissiveIntensity:2, roughness:.2 });
      const silver = new T.MeshStandardMaterial({color:0x9daed2,metalness:.7,roughness:.25});
      const robot = new T.Group(); scene.add(robot);
      const ellipsoid = (parent: InstanceType<typeof T.Group>, material: InstanceType<typeof T.Material>, position: number[], scale: number[]) => { const mesh = new T.Mesh(new T.SphereGeometry(1,40,28), material); mesh.position.set(position[0],position[1],position[2]); mesh.scale.set(scale[0],scale[1],scale[2]); parent.add(mesh); return mesh; };
      const body = new T.Group(); body.position.y=-.55; robot.add(body);
      ellipsoid(body,white,[0,0,0],[.65,.7,.5]);
      ellipsoid(body,blue,[0,.05,.485],[.27,.27,.045]);
      const star = new T.Shape(); for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,r=i%2?.088:.18,x=Math.cos(angle)*r,y=Math.sin(angle)*r;if(i===0)star.moveTo(x,y);else star.lineTo(x,y);}star.closePath();
      const badge = new T.Mesh(new T.ExtrudeGeometry(star,{depth:.015,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:2,steps:1}),glow); badge.position.set(0,.05,.536);body.add(badge);
      const head = new T.Group(); head.position.y=.58; robot.add(head);
      ellipsoid(head,white,[0,0,0],[1.03,.77,.65]);
      ellipsoid(head,silver,[0,-.03,.488],[.88,.57,.19]);
      ellipsoid(head,dark,[0,-.03,.53],[.84,.535,.195]);
      const arc = (parent: InstanceType<typeof T.Group>, x:number,y:number,z:number,r:number,start:number,end:number,width:number) => { const pts=[];for(let i=0;i<=32;i++){const a=start+(end-start)*i/32;pts.push(new T.Vector3(x+Math.cos(a)*r,y+Math.sin(a)*r,z));}const mesh=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),32,width,8,false),glow);parent.add(mesh);return mesh;};
      const leftEye=new T.Group(),rightEye=new T.Group();leftEye.position.set(-.34,.04,.714);rightEye.position.set(.34,.04,.714);head.add(leftEye,rightEye);
      arc(leftEye,0,0,0,.135,.1,Math.PI-.1,.032);arc(rightEye,0,0,0,.135,.1,Math.PI-.1,.032);
      const smile=arc(head,0,-.13,.737,.115,Math.PI*1.12,Math.PI*1.88,.026);
      const eyeLight = new T.PointLight(0x33ddff, .45, 1.5); eyeLight.position.set(0,0,1); head.add(eyeLight);
      for(const side of [-1,1]) { const ear=new T.Group();ear.position.set(side*.96,-.02,0);ear.rotation.z=Math.PI/2;head.add(ear);const disk=new T.Mesh(new T.CylinderGeometry(.27,.27,.15,40),blue);ear.add(disk);const ring=new T.Mesh(new T.TorusGeometry(.2,.025,10,40),glow);ring.rotation.x=Math.PI/2;ring.position.y=side*-.085;ear.add(ring); }
      const antenna = new T.Mesh(new T.CapsuleGeometry(.035,.39,4,12),silver); antenna.position.set(.51,.77,-.03);antenna.rotation.z=-.35;head.add(antenna);
      const bulb=ellipsoid(head,blue,[.6,1.02,-.03],[.11,.11,.11]);
      const leftArm=new T.Group(),rightArm=new T.Group();leftArm.position.set(-.58,-.37,0);rightArm.position.set(.58,-.37,0);robot.add(leftArm,rightArm);
      for(const [arm,side] of [[leftArm,-1],[rightArm,1]] as const) {ellipsoid(arm,dark,[0,0,0],[.17,.17,.17]);const limb=new T.Mesh(new T.CapsuleGeometry(.155,.35,8,20),white);limb.position.set(side*.16,-.13,0);limb.rotation.z=side*.85;arm.add(limb);ellipsoid(arm,glow,[side*.25,-.21,.015],[.035,.11,.12]);}
      const ring=new T.Mesh(new T.TorusGeometry(.62,.014,8,64),new T.MeshBasicMaterial({color:0x51dafd,transparent:true,opacity:.65}));ring.rotation.x=Math.PI/2;ring.position.y=-1.36;scene.add(ring);
      const shadow=new T.Mesh(new T.CircleGeometry(.7,48),new T.MeshBasicMaterial({color:0x748ad2,transparent:true,opacity:.1,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.39;scene.add(shadow);
      let visible=true,frame=0,last=0,time=0; const pointer={x:0,y:0};
      const resize=()=>{const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();state.current.dirty=true;};
      const observer=new ResizeObserver(resize);observer.observe(host);resize();
      const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;state.current.dirty=true;});intersection.observe(host);
      const move=(e:PointerEvent)=>{const r=host.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width-.5;pointer.y=(e.clientY-r.top)/r.height-.5;};
      const leave=()=>{pointer.x=0;pointer.y=0;};host.addEventListener("pointermove",move);host.addEventListener("pointerleave",leave);
      const lost=(e:Event)=>{e.preventDefault();setFallback(true);};renderer.domElement.addEventListener("webglcontextlost",lost);
      const animate=(now:number)=>{frame=requestAnimationFrame(animate);if(!visible||document.hidden||now-last<33)return;const s=state.current;if(s.paused&&!s.dirty)return;time+=Math.min((now-last)/1000,.05);last=now;const t=s.paused?0:time;
        robot.position.y=Math.sin(t*1.8)*.07;robot.rotation.y=s.paused?-.08:Math.sin(t*.65)*.08+pointer.x*.28;
        head.rotation.x=s.paused?0:Math.sin(t*.8)*.025+pointer.y*.12;head.rotation.z=s.mode==="listening"?-.12:Math.sin(t*.9)*.025;
        leftArm.rotation.z=Math.sin(t*1.6)*.07;rightArm.rotation.z=s.waveUntil>now&&!s.paused?-1.9+Math.sin(t*12)*.3:Math.sin(t*1.6+1)*.08;
        const blink = t%5.3>5.12 ? .15 : 1;leftEye.scale.y=rightEye.scale.y=blink;
        smile.scale.y=s.mode==="speaking"&&!s.paused?.7+Math.sin(t*13)*.3:1;
        bulb.scale.setScalar(s.mode==="thinking"?.11*(1+Math.sin(t*6)*.18):.11);
        glow.emissiveIntensity=s.mode==="listening"?2.5+Math.sin(t*4)*.6:2;
        ring.scale.setScalar(1+Math.sin(t*1.8)*.04);shadow.scale.setScalar(1-Math.sin(t*1.8)*.05);
        if(s.mode==="celebrating"&&!s.paused){robot.rotation.z=Math.sin(t*5)*.09;leftArm.rotation.z=1.4;}else robot.rotation.z=0;
        renderer.render(scene,camera);s.dirty=false;
      };frame=requestAnimationFrame(animate);setReady(true);
      cleanup=()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();host.removeEventListener("pointermove",move);host.removeEventListener("pointerleave",leave);renderer.domElement.removeEventListener("webglcontextlost",lost);scene.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose());}});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
    }).catch(()=>!disposed&&setFallback(true));
    return()=>{disposed=true;cleanup();};
  },[]);
  useEffect(()=>{if(!waving)return;const timer=setTimeout(()=>setWaving(false),1800);return()=>clearTimeout(timer);},[waving]);
  const toggle=()=>{const next=!paused;setPaused(next);state.current.paused=next;state.current.dirty=true;localStorage.setItem("nova-motion",next?"off":"on");};
  return <div className={`nova-avatar ${compact?"compact":""} ${paused?"motion-paused":""} ${waving?"waving":""}`}><div ref={mount} className="nova-stage" style={{visibility:fallback?"hidden":"visible"}} />{(!ready||fallback)&&<img className="nova-fallback" src="/art/nova.png" alt="Nova, a friendly white robot with glowing blue eyes" />}<div className="nova-avatar-controls"><button type="button" className="nova-wave" onClick={()=>{state.current.waveUntil=performance.now()+1800;state.current.dirty=true;setWaving(true);}} aria-label="Wave to Nova">{waving?"Hi there! ✨":mode==="thinking"?"Thinking…":mode==="listening"?"Listening…":mode==="speaking"?"Speaking…":"Say hi to Nova"}</button>{(ready||fallback)&&<button type="button" aria-label={paused?"Enable Nova animation":"Pause Nova animation"} onClick={toggle}>{paused?<Play size={13}/>:<Pause size={13}/>}</button>}</div><span className="sr-only" role="status">Nova is {waving?"greeting you":mode}. {fallback?"Illustrated fallback; WebGL is unavailable.":ready?"3D character.":"Loading 3D character."} {paused?"Animation paused.":"Animation active."}</span></div>;
}
