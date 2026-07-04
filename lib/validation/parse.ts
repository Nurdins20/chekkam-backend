import { ZodType } from "zod";
import { ValidationError } from "@/lib/errors";

/** Parses `data` against `schema`, throwing a request-friendly ValidationError on failure. */
export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(issue.message, issue.path.join(".") || undefined);
  }
  return result.data;
}
