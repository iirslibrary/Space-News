window.googleIdToken = null;
window.googleUserEmail = null;

const GOOGLE_CLIENT_ID = "585110924508-lfjo1ma5u0cpqe0qihpj0d3mlb7344sp.apps.googleusercontent.com";

const ALLOWED_EMAILS = [
    "iirslibrary@gmail.com",
    "person1@gmail.com",
    "person2@gmail.com",
    "person3@gmail.com"
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

function getProtectedContainers() {
    const explicitProtected = document.getElementById("protectedContent");
    if (explicitProtected) return [explicitProtected];

    const fallbacks = [];
    document.querySelectorAll(".news-card, .news-list, .review-section, .articles-wrap").forEach(el => {
        fallbacks.push(el);
    });

    return fallbacks;
}

function setProtectedVisibility(isVisible) {
    const protectedContainers = getProtectedContainers();

    protectedContainers.forEach(el => {
        el.style.display = isVisible ? "" : "none";
    });

    document.querySelectorAll(".flag-checkbox").forEach(cb => {
        cb.disabled = !isVisible;
        if (!isVisible) cb.checked = false;
    });
}

function setActionButtonsEnabled(enabled) {
    const flagBtn = document.getElementById("flagSubmitBtn");
    const publishBtn = document.getElementById("publishBtn");

    [flagBtn, publishBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? "1" : "0.6";
        btn.style.cursor = enabled ? "pointer" : "not-allowed";
    });
}

function updateReviewerUI(message = "") {
    const signedInUser = document.getElementById("signedInUser");
    const signInBtnWrap = document.getElementById("googleSignInBtn");
    const authMessage = document.getElementById("authMessage");

    const isAuthorized =
        !!window.googleUserEmail &&
        ALLOWED_EMAILS.includes(window.googleUserEmail.toLowerCase().trim());

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
        }

        if (authMessage) {
            authMessage.textContent = "";
        }

        setProtectedVisibility(true);
        setActionButtonsEnabled(true);

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
        authMessage.textContent = message || "Please sign in with an authorized Google account to review, flag, or publish.";
    }

    setProtectedVisibility(false);
    setActionButtonsEnabled(false);
}

function signOutReviewer() {
    window.googleIdToken = null;
    window.googleUserEmail = null;

    if (window.google && google.accounts && google.accounts.id) {
        try {
            google.accounts.id.disableAutoSelect();
        } catch (error) {
            console.warn("Google disableAutoSelect failed:", error);
        }
    }

    updateReviewerUI("Signed out successfully.");
    renderGoogleButton();
    showToast("Signed out", "You have been signed out.", "success");
}

function handleGoogleSignIn(response) {
    if (!response || !response.credential) {
        showToast("Login failed", "Google sign-in did not return a valid credential.", "error");
        return;
    }

    window.googleIdToken = response.credential;

    const payload = parseJwt(response.credential);
    if (!payload) {
        window.googleIdToken = null;
        window.googleUserEmail = null;
        updateReviewerUI("Could not decode Google sign-in response.");
        showToast("Login failed", "Could not decode Google sign-in response.", "error");
        return;
    }

    const email = String(payload.email || "").toLowerCase().trim();
    const emailVerified = !!payload.email_verified;

    if (!email || !emailVerified) {
        window.googleIdToken = null;
        window.googleUserEmail = null;
        updateReviewerUI("Google account email is missing or not verified.");
        showToast("Login failed", "Google account email is missing or not verified.", "error");
        return;
    }

    if (!ALLOWED_EMAILS.includes(email)) {
        window.googleIdToken = null;
        window.googleUserEmail = null;
        updateReviewerUI(`This account (${email}) is not authorized.`);
        showToast("Unauthorized", `This account (${email}) is not authorized.`, "error");
        return;
    }

    window.googleUserEmail = email;
    updateReviewerUI();

    showToast(
        "Signed in",
        `Logged in as ${window.googleUserEmail}. You can now flag and publish.`,
        "success"
    );
}

function renderGoogleButton() {
    const signInContainer = document.getElementById("googleSignInBtn");
    if (!signInContainer) return;

    signInContainer.innerHTML = "";

    google.accounts.id.renderButton(signInContainer, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 250
    });
}

function initializeGoogleSignIn() {
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
    const headers = {
        "Content-Type": "application/json"
    };

    if (window.googleIdToken) {
        headers["Authorization"] = `Bearer ${window.googleIdToken}`;
    }

    return headers;
}

function requireGoogleLogin() {
    const email = (window.googleUserEmail || "").toLowerCase().trim();
    const authorized = !!window.googleIdToken && !!email && ALLOWED_EMAILS.includes(email);

    if (!authorized) {
        showToast("Sign in required", "Please sign in with an authorized Google account before flagging or publishing.", "error");
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

        const response = await fetch("https://space-news-sage.vercel.app/api/submit-flags", {
            method: "POST",
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

        const response = await fetch("https://space-news-sage.vercel.app/api/submit-flags", {
            method: "POST",
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

document.addEventListener("DOMContentLoaded", () => {
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

    updateReviewerUI("Please sign in with an authorized Google account to continue.");
    initializeGoogleSignIn();
});
