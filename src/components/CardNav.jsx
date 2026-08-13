import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { gsap } from "gsap";
import "./CardNav.css";

export function CardNav({ items = [], activeView, onNavigate, accountLabel = "Sign in", onAccount }) {
  const [expanded, setExpanded] = useState(false);
  const navRef = useRef(null);
  const cardsRef = useRef([]);
  const timelineRef = useRef(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const targetHeight = () => Math.min(500, 76 + (nav.querySelector(".card-nav__content")?.scrollHeight ?? 0));
    gsap.set(nav, { height: 58, overflow: "hidden" });
    gsap.set(cardsRef.current, { y: 34, opacity: 0 });
    const timeline = gsap.timeline({ paused: true })
      .to(nav, { height: targetHeight, duration: 0.38, ease: "power3.out" })
      .to(cardsRef.current, { y: 0, opacity: 1, duration: 0.34, ease: "power3.out", stagger: 0.055 }, "-=0.18");
    timelineRef.current = timeline;
    return () => timeline.kill();
  }, [items]);

  const toggle = () => {
    if (expanded) timelineRef.current?.reverse(); else timelineRef.current?.play(0);
    setExpanded((current) => !current);
  };

  const navigate = (view) => {
    onNavigate(view);
    timelineRef.current?.reverse();
    setExpanded(false);
  };

  return (
    <div className="mobile-card-nav">
      <nav ref={navRef} className={`card-nav${expanded ? " open" : ""}`} aria-label="Mobile navigation">
        <div className="card-nav__top">
          <button type="button" className={`card-nav__menu${expanded ? " open" : ""}`} aria-label={expanded ? "Close navigation" : "Open navigation"} aria-expanded={expanded} onClick={toggle}><span /><span /></button>
          <button type="button" className="card-nav__brand" onClick={() => navigate("Home")} aria-label="B.C home"><span className="brand-dot-matrix">B.C</span></button>
          <button type="button" className="card-nav__account" onClick={onAccount}>{accountLabel}</button>
        </div>
        <div className="card-nav__content" aria-hidden={!expanded}>
          {items.map((group, index) => (
            <section key={group.label} ref={(node) => { cardsRef.current[index] = node; }} className="card-nav__card">
              <span>{group.label}</span>
              <div>{group.links.map((link) => <button type="button" key={link.view} className={activeView === link.view ? "active" : ""} onClick={() => navigate(link.view)}><ArrowUpRight size={13} />{link.label}</button>)}</div>
            </section>
          ))}
        </div>
      </nav>
    </div>
  );
}
