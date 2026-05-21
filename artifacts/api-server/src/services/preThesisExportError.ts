export type PreThesisExportErrorCode =
  | "NOT_FOUND"
  | "BUILD_IN_PROGRESS"
  | "BUILD_FAILED"
  | "EXPORT_FAILED";

export class PreThesisExportError extends Error {
  readonly code: PreThesisExportErrorCode;

  constructor(message: string, code: PreThesisExportErrorCode) {
    super(message);
    this.name = "PreThesisExportError";
    this.code = code;
  }
}

export function preThesisExportHttpStatus(code: PreThesisExportErrorCode): number {
  switch (code) {
    case "BUILD_IN_PROGRESS":
      return 409;
    case "NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}
