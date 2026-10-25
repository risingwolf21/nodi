import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth-provider";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { PublicPage } from "@/features/public/PublicPage";
import { publicPageToken } from "@/features/public/public-page";
import { LegalPage } from "@/features/legal/LegalPage";
import { legalPageFromSearch } from "@/features/legal/legal-page";

// A public link is read without signing in, outside the account's app;
// so are the Impressum and the privacy policy.
const publicToken = publicPageToken(location.search);
const legalPage = legalPageFromSearch(location.search);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {legalPage ? (
            <LegalPage kind={legalPage} />
        ) : publicToken === null ? (
            <AuthProvider>
                <App />
            </AuthProvider>
        ) : (
            <PublicPage token={publicToken} />
        )}
        <UpdatePrompt />
    </StrictMode>,
);
