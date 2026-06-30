export interface ApiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  statusCode: number;
  error?: string;
}

export interface UiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  error?: string;
}
