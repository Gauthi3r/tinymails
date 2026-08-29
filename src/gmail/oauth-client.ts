export interface DesktopOAuthClient {
  clientId: string;
  clientSecret: string;
  projectId?: string;
  authUri: string;
  tokenUri: string;
}

export class OAuthClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthClientValidationError";
  }
}

export function parseDesktopOAuthClient(input: unknown): DesktopOAuthClient {
  const root = asRecord(input);
  const installed = root ? asRecord(root.installed) : null;
  if (!installed) {
    throw new OAuthClientValidationError("Choose a Desktop app OAuth client JSON file.");
  }

  const clientId = stringField(installed, "client_id");
  const clientSecret = stringField(installed, clientSecretKey);
  const authUri = stringField(installed, "auth_uri");
  const tokenUri = stringField(installed, "token_uri");
  const projectId = optionalStringField(installed, "project_id");
  if (!clientId || !clientSecret || !authUri || !tokenUri) {
    throw new OAuthClientValidationError("The OAuth client file is missing required fields.");
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    throw new OAuthClientValidationError("The OAuth client file has an invalid Google client ID.");
  }
  if (
    authUri !== "https://accounts.google.com/o/oauth2/auth" ||
    tokenUri !== "https://oauth2.googleapis.com/token"
  ) {
    throw new OAuthClientValidationError("The OAuth client file does not use Google's endpoints.");
  }

  return {
    clientId,
    clientSecret,
    ...(projectId ? { projectId } : {}),
    authUri,
    tokenUri,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
  return stringField(record, key) ?? undefined;
}

const clientSecretKey = "client_secret";
