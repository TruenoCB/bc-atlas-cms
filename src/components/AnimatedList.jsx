import { useRef } from "react";
import { motion, useInView } from "motion/react";
import "./AnimatedList.css";

function AnimatedItem({ children, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.25, once: true });
  return (
    <motion.div ref={ref} data-index={index} className="animated-list__row"
      initial={{ y: 22, opacity: 0 }} animate={inView ? { y: 0, opacity: 1 } : { y: 22, opacity: 0 }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.045, 0.18), ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export function AnimatedList({ items = [], renderItem, className = "" }) {
  return <div className={`animated-list${className ? ` ${className}` : ""}`}>{items.map((item, index) => <AnimatedItem key={item.id ?? index} index={index}>{renderItem(item, index)}</AnimatedItem>)}</div>;
}
