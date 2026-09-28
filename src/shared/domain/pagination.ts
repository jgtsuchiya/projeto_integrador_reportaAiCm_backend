export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Página pedida pelo cliente. `page` começa em 1. */
export interface PageRequest {
  page: number;
  pageSize: number;
}

/** Resposta padrão das listagens paginadas. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
