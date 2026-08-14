import { Children, cloneElement, forwardRef, isValidElement, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import "./CardSwap.css";

export const SwapCard = forwardRef(({ className = "", ...props }, ref) => <article ref={ref} {...props} className={`card-swap__card ${className}`.trim()} />);
SwapCard.displayName = "SwapCard";

const slot = (index, x, y, total) => ({ x: index * x, y: -index * y, z: -index * x * 1.35, zIndex: total - index });

export function CardSwap({ width = 560, height = 440, cardDistance = 46, verticalDistance = 42, delay = 5200, pauseOnHover = true, activeIndex = 0, onActiveChange, onCardClick, skewAmount = 2, children }) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const refs = useMemo(() => items.map(() => ({ current: null })), [items.length]);
  const order = useRef(items.map((_, index) => index));
  const timer = useRef(null);
  const timeline = useRef(null);
  const root = useRef(null);
  const callbacks = useRef({ onActiveChange, pauseOnHover });
  const restartTimer = useRef(null);

  callbacks.current = { onActiveChange, pauseOnHover };

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    refs.forEach((ref, index) => gsap.set(ref.current, { ...slot(index, cardDistance, verticalDistance, refs.length), xPercent: -50, yPercent: -50, skewY: reduced ? 0 : skewAmount, force3D: true }));
    callbacks.current.onActiveChange?.(order.current[0] ?? 0);
    if (reduced || refs.length < 2) return undefined;
    const swap = () => {
      const [front, ...rest] = order.current;
      const nextOrder = [...rest, front];
      const current = refs[front].current;
      const tl = gsap.timeline();
      timeline.current = tl;
      order.current = nextOrder;
      callbacks.current.onActiveChange?.(nextOrder[0]);
      tl.to(current, { y: "+=420", opacity: 0, duration: 0.62, ease: "power2.in" });
      rest.forEach((index, position) => tl.to(refs[index].current, { ...slot(position, cardDistance, verticalDistance, refs.length), duration: 0.78, ease: "power3.out" }, 0.35 + position * 0.06));
      const back = slot(refs.length - 1, cardDistance, verticalDistance, refs.length);
      tl.set(current, { zIndex: back.zIndex }).to(current, { ...back, opacity: 1, duration: 0.72, ease: "power3.out" }, 0.55);
    };
    const schedule = () => {
      clearInterval(timer.current);
      timer.current = window.setInterval(swap, delay);
    };
    restartTimer.current = schedule;
    schedule();
    const pause = () => { if (callbacks.current.pauseOnHover) { timeline.current?.pause(); clearInterval(timer.current); } };
    const resume = () => { if (callbacks.current.pauseOnHover) { timeline.current?.play(); schedule(); } };
    root.current?.addEventListener("mouseenter", pause);
    root.current?.addEventListener("mouseleave", resume);
    return () => {
      clearInterval(timer.current);
      timeline.current?.kill();
      restartTimer.current = null;
      root.current?.removeEventListener("mouseenter", pause);
      root.current?.removeEventListener("mouseleave", resume);
    };
  }, [cardDistance, delay, refs, skewAmount, verticalDistance]);

  useEffect(() => {
    const nextActive = Number(activeIndex);
    if (!Number.isInteger(nextActive) || nextActive < 0 || nextActive >= refs.length || order.current[0] === nextActive) return;

    clearInterval(timer.current);
    timeline.current?.kill();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextOrder = [nextActive, ...order.current.filter((index) => index !== nextActive)];
    order.current = nextOrder;
    callbacks.current.onActiveChange?.(nextActive);

    if (reduced) {
      nextOrder.forEach((index, position) => gsap.set(refs[index].current, { ...slot(position, cardDistance, verticalDistance, refs.length), opacity: 1 }));
      return;
    }

    const tl = gsap.timeline({ onComplete: () => restartTimer.current?.() });
    timeline.current = tl;
    nextOrder.forEach((index, position) => {
      const target = slot(position, cardDistance, verticalDistance, refs.length);
      tl.set(refs[index].current, { zIndex: target.zIndex }, 0);
      tl.to(refs[index].current, { ...target, opacity: 1, duration: 0.72, ease: "power3.out" }, position * 0.045);
    });
  }, [activeIndex, cardDistance, refs, verticalDistance]);

  return <div ref={root} className="card-swap" style={{ width, height }}>{items.map((child, index) => isValidElement(child) ? cloneElement(child, { key: child.key ?? index, ref: (node) => { refs[index].current = node; }, style: { width, height, ...child.props.style }, onClick: (event) => { child.props.onClick?.(event); onCardClick?.(index); } }) : child)}</div>;
}
