export function securityFailClosed() {
  return (
    process.env.FORTE_SECURITY_FAIL_CLOSED === "true" ||
    process.env.NODE_ENV === "production"
  );
}

export class SecurityBackendUnavailableError extends Error {
  readonly code = "SECURITY_BACKEND_UNAVAILABLE";

  constructor() {
    super("Security backend unavailable");
    this.name = "SecurityBackendUnavailableError";
  }
}
