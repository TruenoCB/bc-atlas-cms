import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export function Pagination({ page, totalPages, onPageChange, className = "" }) {
  const pages = Math.max(1, Number(totalPages) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const hasPrevious = current > 1;
  const hasNext = current < pages;

  return (
    <nav className={`minimal-pagination${className ? ` ${className}` : ""}`} aria-label="Pagination">
      <button type="button" aria-label="Previous page" disabled={!hasPrevious} onClick={() => hasPrevious && onPageChange(current - 1)}>
        <CaretLeft size={14} weight="light" />
      </button>
      <span aria-current="page">{current}</span>
      <button type="button" aria-label="Next page" disabled={!hasNext} onClick={() => hasNext && onPageChange(current + 1)}>
        <CaretRight size={14} weight="light" />
      </button>
    </nav>
  );
}
