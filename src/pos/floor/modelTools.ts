import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Helpers on 3D models (.glb), loaded on demand with three.js: a thumbnail for the catalogue and
// the 2D plan, and the real dimensions of the object so a dropped model arrives to scale.

const loader = new GLTFLoader();
const scenes = new Map<string, Promise<THREE.Group>>();
const thumbs = new Map<string, Promise<string>>();

const load = (url: string): Promise<THREE.Group> => {
  let p = scenes.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene);
    scenes.set(url, p);
    p.catch(() => scenes.delete(url));
  }
  return p;
};

/** Real size of the model in centimetres (glTF units are metres): width (x), depth (z), height (y). */
export const modelSizeCm = async (url: string): Promise<{ width: number; depth: number; height: number }> => {
  const size = new THREE.Box3().setFromObject(await load(url)).getSize(new THREE.Vector3());
  const cm = (v: number) => Math.min(2000, Math.max(5, Math.round(v * 100)));
  return { width: cm(size.x), depth: cm(size.z), height: cm(size.y) };
};

let renderer: THREE.WebGLRenderer | null = null;

/** Three-quarter view of the model on a transparent background, as a PNG data URL (cached). */
export const modelThumbnail = (url: string, px = 160): Promise<string> => {
  let p = thumbs.get(url);
  if (p) return p;
  p = load(url).then((model) => {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(px, px, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a6a', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.8);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    const obj = model.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    scene.add(obj);
    const r = Math.max(size.x, size.y, size.z) || 1;
    const camera = new THREE.PerspectiveCamera(35, 1, r / 100, r * 20);
    camera.position.set(r * 1.3, r * 0.9, r * 1.6);
    camera.lookAt(0, 0, 0);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  });
  thumbs.set(url, p);
  p.catch(() => thumbs.delete(url));
  return p;
};
