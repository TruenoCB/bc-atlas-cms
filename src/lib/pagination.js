export const PAGE_SIZE = 100;

export function pageCount(totalItems, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
}

export function clampPage(page, totalItems, pageSize = PAGE_SIZE) {
  const numericPage = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1;
  return Math.min(Math.max(1, numericPage), pageCount(totalItems, pageSize));
}

export function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const currentPage = clampPage(page, items.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: currentPage,
    pageSize,
    total: items.length,
    totalPages: pageCount(items.length, pageSize),
  };
}
