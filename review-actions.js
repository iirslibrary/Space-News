window.googleIdToken = null;
window.googleUserEmail = null;
window.googleUserProfile = null;

const GOOGLE_CLIENT_ID = "585110924508-lfjo1ma5u0cpqe0qihpj0d3mlb7344sp.apps.googleusercontent.com";
const API_BASE = "https://space-news-sage.vercel.app";

const ALLOWED_EMAILS = [
    "iirslibrary@gmail.com",
    "ashshbsht@gmail.com",
    "maneesha.nano@gmail.com",
    "isr314@gmail.com"
].map(email => email.toLowerCase().trim());

function parseJwt(token) {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error("JWT parse error:", error);
        return null;
    }
}

function setCheckboxesVisible(visible) {
    document.querySelectorAll(".flag-checkbox").forEach(cb => {
        cb.style.display = visible ? "" : "none";
        cb.disabled = !visible;
        if (!visible) cb.checked = false;

        const label = cb.closest("label");
        if (label) {
            label.style.display = visible ? "" : "none";
        }
    });
}

function setActionButtonsVisible(visible) {
    document.querySelectorAll(".bottom-actions").forEach(actionBar => {
        actionBar.style.display = visible ? "" : "none";
    });

    document.querySelectorAll(".flag-submit-btn, .publish-btn").forEach(btn => {
        btn.style.display = visible ? "" : "none";
        btn.disabled = !visible;
    });
}

function updateReviewerUI(message = "") {
    const signedInUser = document.getElementById("signedInUser");
    const signInBtnWrap = document.getElementById("googleSignInBtn");
    const authMessage = document.getElementById("authMessage");

    const email = (window.googleUserEmail || "").toLowerCase().trim();
    const isAuthorized = !!email && ALLOWED_EMAILS.includes(email);

    if (isAuthorized) {
        if (signedInUser) {
            signedInUser.style.display = "block";
            signedInUser.innerHTML = `
                <div style="font-weight:600;">Signed in: ${window.googleUserEmail}</div>
                <button id="signOutBtn" type="button" style="margin-top:10px; padding:8px 14px; cursor:pointer;">
                    Sign out
                </button>
            `;
        }

        if (signInBtnWrap) {
            signInBtnWrap.style.display = "none";
            signInBtnWrap.innerHTML = "";
        }

        if (authMessage) {
            authMessage.textContent = "";
        }

        setCheckboxesVisible(true);
        setActionButtonsVisible(true);

        const signOutBtn = document.getElementById("signOutBtn");
        if (signOutBtn) {
            signOutBtn.addEventListener("click", signOutReviewer);
        }

        return;
    }

    if (signedInUser) {
        signedInUser.style.display = "none";
        signedInUser.textContent = "";
        signedInUser.innerHTML = "";
    }

    if (signInBtnWrap) {
        signInBtnWrap.style.display = "block";
    }

    if (authMessage) {
        authMessage.textContent =
            message || "Articles are public. Sign in with an authorized Google account to flag or publish.";
    }

    setCheckboxesVisible(false);
    setActionButtonsVisible(false);
}

async function checkExistingSession() {
    try {
        const response = await fetch(`${API_BASE}/api/session`, {
            method: "GET",
            credentials: "include"
        });

        const rawText = await response.text();
        let result = {};

        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch {
            result = {};
        }

        if (!response.ok || !result.authenticated || !result.user) {
            return null;
        }

        const email = String(result.user.email || "").toLowerCase().trim();

        if (!email || !ALLOWED_EMAILS.includes(email)) {
            return null;
        }

        return result.user;
    } catch (error) {
        console.warn("Session check failed:", error);
        return null;
    }
}

async function signOutReviewer() {
    window.googleIdToken = null;
    window.googleUserEmail = null;
    window.googleUserProfile = null;

    try {
        await fetch(`${API_BASE}/api/logout`, {
            method: "POST",
            credentials: "include"
        });
    } catch (error) {
        console.warn("Logout request failed:", error);
    }

    if (window.google && google.accounts && google.accounts.id) {
        try {
            google.accounts.id.disableAutoSelect();
        } catch (error) {
            console.warn("Google disableAutoSelect failed:", error);
        }
    }

    updateReviewerUI("Signed out successfully.");
    initializeGoogleSignIn();
    showToast("Signed out", "You have been signed out.", "success");
}

async function handleGoogleSignIn(response) {
    if (!response || !response.credential) {
        showToast("Login failed", "Google sign-in did not return a valid credential.", "error");
        return;
    }

    const payload = parseJwt(response.credential);
    if (!payload) {
        updateReviewerUI("Could not decode Google sign-in response.");
        showToast("Login failed", "Could not decode Google sign-in response.", "error");
        return;
    }

    const email = String(payload.email || "").toLowerCase().trim();
    const emailVerified = !!payload.email_verified;

    if (!email || !emailVerified) {
        updateReviewerUI("Google account email is missing or not verified.");
        showToast("Login failed", "Google account email is missing or not verified.", "error");
        return;
    }

    if (!ALLOWED_EMAILS.includes(email)) {
        updateReviewerUI(`This account (${email}) is not authorized for review actions.`);
        showToast("Unauthorized", `This account (${email}) is not authorized.`, "error");
        return;
    }

    try {
        const loginResponse = await fetch(`${API_BASE}/api/submit-flags`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${response.credential}`
            },
            body: JSON.stringify({
                action: "session_init"
            })
        });

        const rawText = await loginResponse.text();
        let result = {};

        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch {
            result = {};
        }

        if (!loginResponse.ok) {
            throw new Error(result.error || `Login failed with status ${loginResponse.status}`);
        }

        window.googleIdToken = response.credential;
        window.googleUserEmail = email;
        window.googleUserProfile = result.user || {
            email,
            name: payload.name || "",
            picture: payload.picture || ""
        };

        updateReviewerUI();

        showToast(
            "Signed in",
            `Logged in as ${window.googleUserEmail}. Review controls are now enabled.`,
            "success"
        );
    } catch (error) {
        console.error("Session login error:", error);
        window.googleIdToken = null;
        window.googleUserEmail = null;
        window.googleUserProfile = null;
        updateReviewerUI(error.message || "Failed to create reviewer session.");
        showToast("Login failed", error.message || "Failed to create reviewer session.", "error");
    }
}

function renderGoogleButton() {
    const signInContainer = document.getElementById("googleSignInBtn");
    if (!signInContainer || !window.google || !google.accounts || !google.accounts.id) return;

    signInContainer.innerHTML = "";
    signInContainer.style.width = "100%";
    signInContainer.style.display = "flex";
    signInContainer.style.justifyContent = "center";
    signInContainer.style.alignItems = "center";

    google.accounts.id.renderButton(signInContainer, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 260
    });

    setTimeout(() => {
        const child = signInContainer.firstElementChild;
        if (child) {
            child.style.margin = "0 auto";
            child.style.display = "block";
        }
    }, 50);
}

function initializeGoogleSignIn() {
    const signInContainer = document.getElementById("googleSignInBtn");
    const email = (window.googleUserEmail || "").toLowerCase().trim();
    const isAuthorized = !!email && ALLOWED_EMAILS.includes(email);

    if (isAuthorized) {
        if (signInContainer) {
            signInContainer.style.display = "none";
            signInContainer.innerHTML = "";
        }
        return;
    }

    const init = () => {
        if (!window.google || !google.accounts || !google.accounts.id) {
            setTimeout(init, 300);
            return;
        }

        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleSignIn,
            ux_mode: "popup"
        });

        renderGoogleButton();
    };

    init();
}

function showToast(title, message = "", type = "success") {
    const toast = document.getElementById("customToast");
    const toastTitle = document.getElementById("toastTitle");
    const toastMessage = document.getElementById("toastMessage");

    if (!toast || !toastTitle || !toastMessage) return;

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    toast.classList.remove("success", "error", "show");
    toast.classList.add(type);

    clearTimeout(window.toastTimer);
    toast.classList.add("show");

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2600);
}

function getAuthHeaders() {
    return {
        "Content-Type": "application/json"
    };
}

function requireGoogleLogin() {
    const email = (window.googleUserEmail || "").toLowerCase().trim();
    const authorized = !!email && ALLOWED_EMAILS.includes(email);

    if (!authorized) {
        showToast(
            "Sign in required",
            "Please sign in with an authorized Google account before flagging or publishing.",
            "error"
        );
        return false;
    }

    return true;
}

async function submitFlags() {
    if (!requireGoogleLogin()) return;

    const checkedBoxes = document.querySelectorAll(".flag-checkbox:checked");
    const flaggedUrls = Array.from(checkedBoxes).map(cb => cb.value);

    if (flaggedUrls.length === 0) {
        showToast("No selection", "Please select at least one article to flag.", "error");
        return;
    }

    try {
        showToast("Submitting", "Submitting flagged articles...", "success");

        const response = await fetch(`${API_BASE}/api/submit-flags`, {
            method: "POST",
            credentials: "include",
            headers: getAuthHeaders(),
            body: JSON.stringify({ flaggedUrls })
        });

        const rawText = await response.text();
        let result = {};

        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
            result = { error: rawText || "Unknown server response" };
        }

        if (!response.ok) {
            throw new Error(result.error || `Request failed with status ${response.status}`);
        }

        checkedBoxes.forEach(cb => {
            cb.checked = false;
        });

        showToast(
            "Submitted",
            "Flagged articles submitted. This page will reload shortly with updated results.",
            "success"
        );

        setTimeout(() => {
            window.location.reload();
        }, 30000);
    } catch (error) {
        console.error("Submit flags error:", error);
        showToast("Submit failed", error.message || "Failed to submit flagged articles.", "error");
    }
}

async function publishCurrentList() {
    if (!requireGoogleLogin()) return;

    try {
        showToast(
            "Publishing",
            "Finalizing this reviewed news list for circulation...",
            "success"
        );

        const response = await fetch(`${API_BASE}/api/submit-flags`, {
            method: "POST",
            credentials: "include",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: "publish"
            })
        });

        const rawText = await response.text();
        let result = {};

        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
            result = { error: rawText || "Unknown server response" };
        }

        if (!response.ok) {
            throw new Error(result.error || `Request failed with status ${response.status}`);
        }

        showToast(
            "Published",
            "This digest has been finalized for circulation. Reloading page...",
            "success"
        );

        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } catch (error) {
        console.error("Publish error:", error);
        showToast("Publish failed", error.message || "Failed to publish digest.", "error");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const btn = document.getElementById("themeToggle");
    const html = document.documentElement;

    if (!btn) {
        console.warn("themeToggle button not found");
    } else {
        try {
            if (localStorage.getItem("theme") === "light") {
                html.setAttribute("data-theme", "light");
                btn.textContent = "🌙";
            } else {
                html.removeAttribute("data-theme");
                btn.textContent = "☀️";
            }
        } catch (e) {
            console.warn("Theme storage unavailable:", e);
        }

        btn.addEventListener("click", () => {
            if (html.getAttribute("data-theme") === "light") {
                html.removeAttribute("data-theme");
                btn.textContent = "☀️";
                try {
                    localStorage.setItem("theme", "dark");
                } catch (e) {
                    console.warn("Theme storage unavailable:", e);
                }
            } else {
                html.setAttribute("data-theme", "light");
                btn.textContent = "🌙";
                try {
                    localStorage.setItem("theme", "light");
                } catch (e) {
                    console.warn("Theme storage unavailable:", e);
                }
            }
        });
    }

    updateReviewerUI("Checking reviewer session...");

    const sessionUser = await checkExistingSession();

    if (sessionUser) {
        window.googleUserEmail = String(sessionUser.email || "").toLowerCase().trim();
        window.googleUserProfile = sessionUser;
        updateReviewerUI();
    } else {
        window.googleIdToken = null;
        window.googleUserEmail = null;
        window.googleUserProfile = null;
        updateReviewerUI("Articles are public. Sign in with an authorized Google account to use review controls.");
        initializeGoogleSignIn();
    }
});
