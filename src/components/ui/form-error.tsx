export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-medium text-red-600">{message}</p>;
}

export async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body?.error?.details && Array.isArray(body.error.details) && body.error.details.length > 0) {
    const messages = body.error.details
      .map((issue: { path?: string[]; message?: string }) => {
        const fieldName = issue.path && issue.path.length > 0 ? issue.path.join(".") : "";
        return fieldName ? `${fieldName}: ${issue.message}` : issue.message;
      })
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  if (body?.error?.message) return body.error.message as string;
  if (response.status === 429) return "Too many requests. Wait a moment and try again.";
  if (response.status >= 500) return "The service is temporarily unavailable. Please try again.";
  return "We could not process that request. Review the information and try again.";
}
