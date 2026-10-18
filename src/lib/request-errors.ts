/** Why a request to Supabase failed; decides whether a retry makes sense. */
export type RequestFailureReason = "offline" | "auth" | "temporary" | "permanent";

export class RemoteRequestError extends Error {
    readonly reason: RequestFailureReason;

    constructor(reason: RequestFailureReason, message: string) {
        super(message);
        this.name = "RemoteRequestError";
        this.reason = reason;
    }
}

// SQLSTATE codes the server may resolve on its own after a retry.
const TEMPORARY_SQLSTATES = new Set(["40001", "40P01", "55P03", "57014"]);
// PostgREST codes for an expired or invalid JWT.
const AUTH_ERROR_CODES = new Set(["PGRST301", "PGRST302", "PGRST303"]);

type RequestError = {
    status?: number;
    code?: string;
};

/** Distinguishes network, auth and server errors (CLAUDE.md §5). */
export function classifyRequestError(error: RequestError): RequestFailureReason {
    const status = error.status ?? 0;
    const code = error.code ?? "";

    // postgrest-js reports a failed fetch as status 0 with an empty code.
    if (status === 0 && code === "") return "offline";
    if (status === 401 || AUTH_ERROR_CODES.has(code)) return "auth";
    if (status >= 500 || status === 408 || status === 429) return "temporary";
    if (TEMPORARY_SQLSTATES.has(code)) return "temporary";
    return "permanent";
}

type ResponseWithError = {
    error: { message: string; code?: string } | null;
    status: number;
};

/** Turns a failed postgrest-js response into a classified error. */
export function toRequestError({ error, status }: ResponseWithError): RemoteRequestError | null {
    if (!error) return null;
    return new RemoteRequestError(
        classifyRequestError({ status, code: error.code }),
        error.message,
    );
}
