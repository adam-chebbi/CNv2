import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { chairPositions, type AreaGeometry, type FloorElement, type PlanTable } from '../../data/floorScene';
import type { FloorAsset } from '../api';
import type { TableLook } from './FloorCanvas2D';
import { modelUrl, resolveMaterial } from './materials';

// 3D view of one area (loaded on demand). Same data and same table states as the 2D plan; tapping
// a table does the same thing. 1 plan cm = 0.01 scene unit (metres); plan y → scene z.

interface Props {
  geometry: AreaGeometry;
  tables: PlanTable[];
  elements: FloorElement[];
  assets: FloorAsset[];
  look?: (t: PlanTable) => TableLook;
  onTable?: (id: string) => void;
  className?: string;
}

const M = 0.01;
const textures = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');
const gltfLoader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Group>>();

const surface = (key: string | null | undefined, assets: FloorAsset[], fallback: string, sizeCm: [number, number]): THREE.MeshStandardMaterial => {
  const m = resolveMaterial(key, assets);
  const mat = new THREE.MeshStandardMaterial({ color: key ? m.color : fallback, roughness: 0.75 });
  if (key && m.url) {
    let tex = textures.get(m.url);
    if (!tex) {
      tex = textureLoader.load(m.url, undefined, undefined, () => undefined);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.set(m.url, tex);
    }
    const t = tex.clone();
    t.repeat.set(sizeCm[0] / m.tileCm, sizeCm[1] / m.tileCm);
    t.needsUpdate = true;
    mat.map = t;
    mat.color.set('#ffffff');
  }
  return mat;
};

const label = (text: string, sub?: string): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, sub ? 112 : 80, 24);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 48);
  if (sub) {
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillText(sub, 128, 96);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.6, 0.3, 1);
  sprite.renderOrder = 10;
  return sprite;
};

const box = (w: number, h: number, d: number, mat: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const buildElement = (el: FloorElement, assets: FloorAsset[]): THREE.Object3D => {
  const g = new THREE.Group();
  const w = el.width * M;
  const d = el.height * M;
  const h = Math.max(el.elevationCm, 1) * M;
  const color = el.color ?? '#bbbbbb';
  switch (el.kind) {
    case 'zone': {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35 }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.002;
      g.add(plane);
      break;
    }
    case 'window': {
      const glass = box(w, h, d, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.1 }));
      glass.position.y = 0.9 + h / 2;
      g.add(glass);
      break;
    }
    case 'column': {
      const mesh = el.width === el.height ? new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 24), surface(el.material, assets, color, [el.width * 3, el.elevationCm])) : box(w, h, d, surface(el.material, assets, color, [el.width, el.elevationCm]));
      mesh.castShadow = true;
      mesh.position.y = h / 2;
      g.add(mesh);
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.24, h * 0.3, 16), new THREE.MeshStandardMaterial({ color: '#a0674b' }));
      pot.position.y = h * 0.15;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) / 2, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      leaves.scale.y = (h * 0.75) / Math.min(w, d);
      leaves.position.y = h * 0.3 + h * 0.36;
      leaves.castShadow = true;
      g.add(pot, leaves);
      break;
    }
    case 'model': {
      const url = modelUrl(el.assetId, assets);
      const placeholder = box(w, h, d, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.25 }));
      placeholder.position.y = h / 2;
      g.add(placeholder);
      if (url) {
        let p = models.get(url);
        if (!p) {
          p = gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
          models.set(url, p);
        }
        p.then((scene) => {
          const obj = scene.clone(true);
          const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
          const k = Math.min(w / (size.x || 1), d / (size.z || 1), h / (size.y || 1));
          obj.scale.setScalar(k);
          obj.traverse((o) => {
            o.castShadow = true;
          });
          g.remove(placeholder);
          g.add(obj);
        }).catch(() => undefined);
      }
      break;
    }
    default: {
      const mesh = box(w, h, d, surface(el.material, assets, color, [el.width, el.elevationCm]));
      mesh.position.y = h / 2;
      if (el.kind === 'door') (mesh.material as THREE.MeshStandardMaterial).color.set(color);
      g.add(mesh);
    }
  }
  g.position.set((el.x + el.width / 2) * M, 0, (el.y + el.height / 2) * M);
  g.rotation.y = (-el.rotation * Math.PI) / 180;
  return g;
};

const buildTable = (t: PlanTable, l: TableLook, assets: FloorAsset[]): THREE.Group => {
  const g = new THREE.Group();
  g.userData.tableId = t.id;
  const w = t.width * M;
  const d = t.height * M;
  const topMat = surface(t.material, assets, l.fill, [t.width, t.height]);
  const top = t.shape === 'round' ? new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.04, 32), topMat) : box(w, 0.04, d, topMat);
  if (t.shape === 'round') top.scale.z = d / w;
  top.position.y = 0.75;
  top.castShadow = true;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.73, 12), new THREE.MeshStandardMaterial({ color: '#2f2f33', metalness: 0.6, roughness: 0.4 }));
  leg.position.y = 0.365;
  g.add(top, leg);
  const chairMat = new THREE.MeshStandardMaterial({ color: '#6b4f3a', roughness: 0.8 });
  for (const c of chairPositions(t)) {
    const chair = new THREE.Group();
    const seat = box(0.4, 0.05, 0.4, chairMat);
    seat.position.y = 0.45;
    const back = box(0.4, 0.4, 0.05, chairMat);
    back.position.set(0, 0.67, 0.18);
    chair.add(seat, back);
    chair.position.set(c.x * M, 0, c.y * M);
    chair.rotation.y = (-c.angle * Math.PI) / 180;
    g.add(chair);
  }
  if (l.halo) {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(Math.max(w, d) / 2 + 0.45, 40), new THREE.MeshBasicMaterial({ color: l.halo, transparent: true, opacity: 0.45 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    ring.userData.pulse = Boolean(l.pulse);
    g.add(ring);
  }
  g.rotation.y = (-t.rotation * Math.PI) / 180;
  const holder = new THREE.Group();
  holder.add(g);
  const tag = label(t.name, l.lines?.[0]);
  tag.position.y = 1.45;
  holder.add(tag);
  holder.position.set((t.x + t.width / 2) * M, 0, (t.y + t.height / 2) * M);
  holder.userData.tableId = t.id;
  if (l.dim) holder.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.setValues?.({ transparent: true, opacity: 0.4 }));
  return holder;
};

export const FloorScene3D: React.FC<Props> = ({ geometry, tables, elements, assets, look, onTable, className }) => {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; content: THREE.Group } | null>(null);
  const onTableRef = useRef(onTable);
  onTableRef.current = onTable;

  // Renderer, camera, lights and controls live as long as the component.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4efe8');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 2;
    controls.maxDistance = 60;
    scene.add(new THREE.HemisphereLight('#fff6e8', '#6b5a4a', 1.1));
    const sun = new THREE.DirectionalLight('#ffe2b8', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    const content = new THREE.Group();
    scene.add(content);
    state.current = { renderer, scene, camera, controls, content };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const ray = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      for (const hit of ray.intersectObjects(content.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.tableId) o = o.parent;
        if (o) {
          onTableRef.current?.(o.userData.tableId as string);
          return;
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    let frame = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      controls.update();
      const pulse = 0.3 + 0.25 * (1 + Math.sin(time / 250));
      content.traverse((o) => {
        if (o.userData.pulse) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
      });
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  // Place the camera once per area size.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const cx = (geometry.widthCm * M) / 2;
    const cz = (geometry.depthCm * M) / 2;
    const span = Math.max(geometry.widthCm, geometry.depthCm) * M;
    s.camera.position.set(cx, span * 0.85, cz + span * 0.9);
    s.controls.target.set(cx, 0, cz);
    const sun = s.scene.children.find((o) => o instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    sun.position.set(cx - span * 0.4, span, cz - span * 0.3);
    sun.target.position.set(cx, 0, cz);
    const cam = sun.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.updateProjectionMatrix();
  }, [geometry.widthCm, geometry.depthCm]);

  // Content is rebuilt when the plan or the table states change (a few hundred meshes at most).
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.content.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    });
    s.content.clear();
    const W = geometry.widthCm * M;
    const D = geometry.depthCm * M;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), surface(geometry.floorMaterial, assets, '#efe7dc', [geometry.widthCm, geometry.depthCm]));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, D / 2);
    floor.receiveShadow = true;
    s.content.add(floor);
    // Back walls full height, front walls low so the camera always sees inside.
    const wallMat = new THREE.MeshStandardMaterial({ color: geometry.wallColor, roughness: 0.9 });
    const H = geometry.wallHeightCm * M;
    const t = 0.15;
    const walls: [number, number, number, number, number][] = [
      [W / 2, H, -t / 2, W + t * 2, t],
      [-t / 2, H, D / 2, t, D],
      [W + t / 2, 0.3, D / 2, t, D],
      [W / 2, 0.3, D + t / 2, W + t * 2, t],
    ];
    for (const [x, h, z, w, d] of walls) {
      const wall = box(w, h, d, wallMat);
      wall.position.set(x, h / 2, z);
      s.content.add(wall);
    }
    elements.forEach((e) => s.content.add(buildElement(e, assets)));
    tables.forEach((tb) => s.content.add(buildTable(tb, look?.(tb) ?? { fill: '#f5efe6', stroke: '#8b6b4a' }, assets)));
  }, [geometry, tables, elements, assets, look]);

  return <div ref={host} className={`rounded-xl overflow-hidden bg-stone-100 ${className ?? ''}`} />;
};

export default FloorScene3D;
