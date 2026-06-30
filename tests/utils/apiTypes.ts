export interface ApiSearchResult {
  query: string;
  results: any;
  responseTime: number;
  statusCode: number;
  error?: string;
}
