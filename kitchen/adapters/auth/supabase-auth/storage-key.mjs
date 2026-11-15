// supabase-js names the key it keeps a session under from the API host's first label, so the
// state this adapter writes is found only under the name the app's own client derives from the
// same URL: `127.0.0.1` gives `sb-127-auth-token`, `abc.supabase.co` gives `sb-abc-auth-token`.
export const storageKey = (apiUrl) => `sb-${new URL(apiUrl).hostname.split(".")[0]}-auth-token`;
