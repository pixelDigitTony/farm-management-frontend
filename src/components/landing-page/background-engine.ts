import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type SceneInfo = { glb: string; desktopCamera: string; mobileCamera?: string; draco: boolean };
let lease: HTMLElement | null = null;
export async function mountBackground(
  host: HTMLElement,
  info: SceneInfo,
  options: {
    motion: boolean;
    color: string;
    cameraPreset?: string;
    signal: AbortSignal;
    onReady: () => void;
    onFailure: () => void;
  },
): Promise<() => void> {
  if (lease || options.signal.aborted) return () => {};
  lease = host;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    lease = null;
    options.onFailure();
    return () => {};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  let stopped = false,
    visible = true,
    frame = 0;
  let model: THREE.Group | undefined,
    camera: THREE.Camera | undefined,
    base: THREE.Vector3 | undefined;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.color);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8b8277, 2.5));
  const sun = new THREE.DirectionalLight(0xffeed8, 3);
  sun.position.set(8, 12, 6);
  scene.add(sun);
  const decoder = new DRACOLoader();
  decoder.setDecoderPath("/landing-assets/draco/");
  decoder.setWorkerLimit(1);
  const loader = new GLTFLoader();
  if (info.draco) loader.setDRACOLoader(decoder);
  function render() {
    if (stopped || !visible || !camera || document.hidden) return;
    if (options.motion && base) {
      const rect = host.getBoundingClientRect();
      const progress = THREE.MathUtils.clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
      camera.position.copy(base);
      camera.position.y += progress * 0.06;
    }
    renderer.render(scene, camera);
  }
  function requestRender() {
    if (stopped || frame || !visible || document.hidden) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }
  function resize() {
    if (stopped) return;
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    renderer.setSize(box.width, box.height, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
    }
    requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibility = new IntersectionObserver((entries) => {
    visible = Boolean(entries[0]?.isIntersecting);
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  });
  visibility.observe(host);
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => {
    event.preventDefault();
    options.onFailure();
    dispose();
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  const onScroll = () => {
    if (options.motion) requestRender();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  function disposeObject(object: THREE.Object3D) {
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      }
    });
  }
  function dispose() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibility.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("scroll", onScroll);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    options.signal.removeEventListener("abort", dispose);
    if (model) disposeObject(model);
    decoder.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    if (lease === host) lease = null;
  }
  options.signal.addEventListener("abort", dispose, { once: true });
  try {
    const gltf = await loader.loadAsync(info.glb);
    if (stopped) {
      disposeObject(gltf.scene);
      return dispose;
    }
    model = gltf.scene;
    model.updateMatrixWorld(true);
    const wanted = options.cameraPreset === "MOBILE" ? info.mobileCamera : info.desktopCamera;
    const authored = gltf.cameras.find(
      (c) => c.name === wanted || c.name === THREE.PropertyBinding.sanitizeNodeName(wanted ?? ""),
    );
    if (!authored) throw new Error("Scene camera missing");
    camera = authored.clone();
    camera.position.setFromMatrixPosition(authored.matrixWorld);
    camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().extractRotation(authored.matrixWorld),
    );
    base = camera.position.clone();
    model.traverse((node) => {
      if (node instanceof THREE.Light) node.intensity = 0;
    });
    scene.add(model, camera);
    resize();
    await renderer.compileAsync(scene, camera);
    if (stopped) return dispose;
    render();
    options.onReady();
    return dispose;
  } catch (error) {
    if (import.meta.env.DEV && !stopped) console.warn("Landing background uses its poster:", error);
    if (!stopped) options.onFailure();
    dispose();
    return dispose;
  }
}
