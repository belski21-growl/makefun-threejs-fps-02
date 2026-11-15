// SPDX-License-Identifier: MIT
// Lightweight post-processing for NORTHLIGHT, built on the vendored three.js
// core only — no addons, no extra dependencies, no network. Pipeline: the
// scene renders HDR (half-float) into a multisampled target, a soft-knee
// bright pass feeds a two-pass gaussian blur at half resolution, and a final
// composite adds the bloom, applies the ACES filmic curve + sRGB conversion,
// and finishes with a subtle vignette + film grain. The scene pass runs with
// NoToneMapping so the composite owns the tone curve (the renderer would
// otherwise tone-map twice). ?quality=low skips this whole module and the
// caller renders straight to the canvas with ACES on the renderer instead.
import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tMap;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float w = smoothstep(0.72, 1.15, l);
    gl_FragColor = vec4(c * w, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tMap;
  uniform vec2 uDir;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb * 0.227027;
    vec2 o1 = uDir * 1.384615;
    vec2 o2 = uDir * 3.230769;
    c += texture2D(tMap, vUv + o1).rgb * 0.3162162;
    c += texture2D(tMap, vUv - o1).rgb * 0.3162162;
    c += texture2D(tMap, vUv + o2).rgb * 0.0702703;
    c += texture2D(tMap, vUv - o2).rgb * 0.0702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uExposure;
  uniform float uTime;
  uniform float uBloomStrength;
  // ACES filmic approximation (Narkowicz).
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 c = aces((scene + bloom * uBloomStrength) * uExposure);
    c = toSrgb(c);
    // Vignette: gentle falloff toward the corners.
    vec2 d = vUv - 0.5;
    c *= 1.0 - dot(d, d) * 0.42;
    // Film grain: one hash per pixel, animated, kept faint.
    float g = hash(vUv * 913.7 + fract(uTime) * 173.1) - 0.5;
    c += g * 0.028;
    gl_FragColor = vec4(c, 1.0);
  }
`;

function makeQuadScene(material) {
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { quadScene, quadCam };
}

export function createPost(renderer, scene, camera) {
  const brightMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: BRIGHT_FRAG,
    uniforms: { tMap: { value: null } },
    depthTest: false,
    depthWrite: false,
  });
  const blurMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
    depthTest: false,
    depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uExposure: { value: 1.15 },
      uTime: { value: 0 },
      uBloomStrength: { value: 0.85 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const bright = makeQuadScene(brightMat);
  const blur = makeQuadScene(blurMat);
  const comp = makeQuadScene(compMat);

  let sceneRT = null;
  let brightRT = null;
  let blurRT = null;

  function disposeTargets() {
    for (const rt of [sceneRT, brightRT, blurRT]) if (rt) rt.dispose();
    sceneRT = null;
    brightRT = null;
    blurRT = null;
  }

  function setSize(width, height, pixelRatio) {
    disposeTargets();
    const w = Math.max(2, Math.round(width * pixelRatio));
    const h = Math.max(2, Math.round(height * pixelRatio));
    sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthBuffer: true,
    });
    const bw = Math.max(2, Math.round(w / 2));
    const bh = Math.max(2, Math.round(h / 2));
    brightRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.UnsignedByteType, depthBuffer: false });
    blurRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.UnsignedByteType, depthBuffer: false });
    blurMat.uniforms.uDir.value.set(1 / bw, 0);
  }

  function render() {
    if (!sceneRT) return;
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    // Bright pass: scene -> brightRT.
    brightMat.uniforms.tMap.value = sceneRT.texture;
    renderer.setRenderTarget(brightRT);
    renderer.render(bright.quadScene, bright.quadCam);
    // Blur horizontal: brightRT -> blurRT.
    blurMat.uniforms.tMap.value = brightRT.texture;
    blurMat.uniforms.uDir.value.set(1 / brightRT.width, 0);
    renderer.setRenderTarget(blurRT);
    renderer.render(blur.quadScene, blur.quadCam);
    // Blur vertical: blurRT -> brightRT.
    blurMat.uniforms.tMap.value = blurRT.texture;
    blurMat.uniforms.uDir.value.set(0, 1 / brightRT.height);
    renderer.setRenderTarget(brightRT);
    renderer.render(blur.quadScene, blur.quadCam);
    // Composite to the canvas.
    compMat.uniforms.tScene.value = sceneRT.texture;
    compMat.uniforms.tBloom.value = brightRT.texture;
    compMat.uniforms.uTime.value = performance.now() / 1000;
    renderer.setRenderTarget(null);
    renderer.render(comp.quadScene, comp.quadCam);
  }

  return { setSize, render, dispose: disposeTargets };
}
