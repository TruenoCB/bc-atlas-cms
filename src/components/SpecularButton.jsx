import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle, Color } from "ogl";
import "./SpecularButton.css";

const PAD = 20;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;
  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

export default function SpecularButton({
  children = "Get Started",
  size = "lg",
  radius = 18,
  tint = "#ffffff",
  tintOpacity = 0,
  blur = 0,
  textColor = "#f5f5f5",
  lineColor = "#ffffff",
  baseColor = "#525252",
  intensity = 1,
  shineSize = 10,
  shineFade = 40,
  thickness = 1,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  disabled = false,
  onClick,
  className = "",
  type = "button",
  href,
  target,
  rel,
  renderEffect = true,
  ...buttonProps
}) {
  const buttonRef = useRef(null);
  const effectRef = useRef(null);
  const propsRef = useRef({});

  propsRef.current = { radius, lineColor, baseColor, intensity, shineSize, shineFade, thickness, speed, followMouse, proximity, autoAnimate };

  useEffect(() => {
    const button = buttonRef.current;
    const effect = effectRef.current;
    if (!button || !effect || !renderEffect) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr, webgl: 2 });
    } catch {
      button.dataset.specularFallback = "true";
      return undefined;
    }

    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      button.dataset.specularFallback = "true";
      return undefined;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    effect.appendChild(gl.canvas);
    const sizeRef = { w: 1, h: 1 };
    const resize = () => {
      const rect = button.getBoundingClientRect();
      sizeRef.w = rect.width;
      sizeRef.h = rect.height;
      renderer.setSize(rect.width + PAD * 2, rect.height + PAD * 2);
      program.uniforms.uCenter.value = [(PAD + rect.width / 2) * dpr, (PAD + rect.height / 2) * dpr];
      program.uniforms.uHalfSize.value = [(rect.width / 2) * dpr, (rect.height / 2) * dpr];
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(button);
    resize();

    let pointerAngle = null;
    let proximityT = 0;
    const onPointerMove = (event) => {
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance === 0) {
        const nx = (event.clientX - centerX) / (rect.width / 2);
        const ny = (centerY - event.clientY) / (rect.height / 2);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
      } else {
        pointerAngle = Math.atan2(centerY - event.clientY, event.clientX - centerX);
      }
      const progress = Math.max(0, 1 - distance / Math.max(propsRef.current.proximity, 1));
      proximityT = progress * progress * (3 - 2 * progress);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0;
    let last = performance.now();
    let animationFrame = 0;
    const line = new Color();
    const base = new Color();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const update = (now) => {
      animationFrame = requestAnimationFrame(update);
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      const current = propsRef.current;
      if (!reducedMotion) idleAngle += current.speed * delta;
      const steer = !reducedMotion && current.followMouse && pointerAngle != null && (!current.autoAnimate || proximityT > 0);
      const target = steer ? pointerAngle : idleAngle;
      const difference = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += difference * (1 - Math.exp(-delta * 7));
      const brightTarget = reducedMotion ? 0 : current.autoAnimate ? 1 : proximityT;
      bright += (brightTarget - bright) * (1 - Math.exp(-delta * 8));

      line.set(current.lineColor);
      base.set(current.baseColor);
      program.uniforms.uAngle.value = angle;
      program.uniforms.uRadius.value = Math.min(current.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr;
      program.uniforms.uLineColor.value = [line.r, line.g, line.b];
      program.uniforms.uBaseColor.value = [base.r, base.g, base.b];
      program.uniforms.uIntensity.value = current.intensity * bright;
      program.uniforms.uShineSize.value = (current.shineSize * Math.PI) / 180;
      program.uniforms.uShineFade.value = (current.shineFade * Math.PI) / 180;
      program.uniforms.uThickness.value = current.thickness * dpr;
      renderer.render({ scene: mesh });
    };
    animationFrame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      if (gl.canvas.parentNode === effect) effect.removeChild(gl.canvas);
    };
  }, [renderEffect]);

  const Element = href ? "a" : "button";
  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--sb-pointer-x", `${((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100}%`);
    event.currentTarget.style.setProperty("--sb-pointer-y", `${((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100}%`);
    buttonProps.onPointerMove?.(event);
  };

  return (
    <Element
      {...buttonProps}
      ref={buttonRef}
      type={href ? undefined : type}
      disabled={href ? undefined : disabled}
      aria-disabled={href && disabled ? "true" : undefined}
      href={disabled ? undefined : href}
      target={target}
      rel={rel}
      onClick={onClick}
      onPointerMove={handlePointerMove}
      data-specular-css={renderEffect ? undefined : "true"}
      className={`specular-button specular-button--${size}${className ? ` ${className}` : ""}`}
      style={{
        "--sb-radius": `${radius}px`,
        "--sb-tint": tint,
        "--sb-tint-opacity": tintOpacity,
        "--sb-blur": `${blur}px`,
        "--sb-text-color": textColor,
        "--sb-pointer-x": "50%",
        "--sb-pointer-y": "50%",
      }}
    >
      <span ref={effectRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </Element>
  );
}

export function PrimarySpecularButton({ className = "", size = "md", ...props }) {
  return (
    <SpecularButton
      size={size}
      radius={4}
      tint="#a56cff"
      tintOpacity={0.11}
      blur={8}
      textColor="#eee8f4"
      lineColor="#d5b2ff"
      baseColor="#6f4b9f"
      intensity={1.05}
      shineSize={12}
      shineFade={48}
      thickness={0.9}
      speed={0.24}
      proximity={230}
      className={`specular-primary${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
