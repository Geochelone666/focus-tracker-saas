export const UNAVAILABLE_MESSAGE = "Couldn't reach the sign-in service. Check your connection and try again.";

// Network failures and auth-server outages surface as raw text like "fetch failed";
// show something a person can act on instead. Normal auth errors pass through.
export function authErrorMessage(error: { message?: string; name?: string; status?: number }) {
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500 || !error.message) {
    return UNAVAILABLE_MESSAGE;
  }
  return error.message;
}
