// Erros previstos da API, sem carregar detalhes internos do banco para a resposta HTTP.
export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
