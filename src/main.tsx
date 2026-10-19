import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth-provider";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { PublicPage } from "@/features/public/PublicPage";
import { publicPageToken } from "@/features/public/public-page";

// A public link is read without signing in, outside the account's app.
const publicToken = publicPageToken(location.search);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {publicToken === null ? (
            <AuthProvider>
                <App />
            </AuthProvider>
        ) : (
            <PublicPage token={publicToken} />
        )}
        <UpdatePrompt />
    </StrictMode>,
);
