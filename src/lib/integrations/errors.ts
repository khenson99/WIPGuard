export class IntegrationAuthError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "IntegrationAuthError";
    this.provider = provider;
  }
}

export class IntegrationConfigError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "IntegrationConfigError";
    this.provider = provider;
  }
}

