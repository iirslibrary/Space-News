window.googleIdToken = null;
window.googleUserEmail = null;

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

function updateReviewerUI() {
    const signedInUser = document.getElementById("signedInUser");
    const signInBtnWrap = document.getElementById("googleSignInBtn");
    const flagBtn = document.getElementById("flagSubmitBtn");
    const publishBtn = document.getElementById("publishBtn");

    if (window.googleUserEmail) {
        if (signedInUser) {
            signedInUser.style.display = "block";
            signedInUser.textContent = `Signed in: ${window.googleUserEmail}`;
        }
        if (signInBtnWrap) {
            signInBtnWrap.style.display = "none";
        }
        if (flagBtn) {
            flagBtn.disabled = false;
            flagBtn.style.opacity = "1";
            flagBtn.style.cursor = "pointer";
        }
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.style.opacity = "1";
            publishBtn.style.cursor = "pointer";
        }
    } else {
        if (signedInUser) {
            signedInUser.style.display = "none";
            signedInUser.textContent = "";
        }
        if (signInBtnWrap) {
            signInBtnWrap.style.display = "block";
        }
        if (flagBtn) {
            flagBtn.disabled = true;
            flagBtn.style.opacity = "0.6";
            flagBtn.style.cursor = "not-allowed";
        }
        if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.style.opacity = "0.6";
            publishBtn.style.cursor = "not-allowed";
        }
    }
}

function handleGoogleSignIn(response) {
    if (!response || !response.credential) {
        showToast("Login failed", "Google sign-in did not return a valid credential.", "error");
        return;
    }

    window.googleIdToken = response.credential;

    const payload = parseJwt(response.credential);
    if (!payload) {
        showToast("Login failed", "Could not decode Google sign-in response.", "error");
        return;
    }

    window.googleUserEmail = payload.email || null;
    updateReviewerUI();

    showToast(
        "Signed in",
        `Logged in as ${window.googleUserEmail || "reviewer"}. You can now flag and publish.`,
        "success"
    );
}

function initializeGoogleSignIn() {
    const init = () => {
        if (!window.google || !google.accounts || !google.accounts.id) {
            setTimeout(init, 300);
            return;
        }

        google.accounts.id.initialize({
            client_id: "585110924508-lfjo1ma5u0cpqe0qihpj0d3mlb7344sp.apps.googleusercontent.com",
            callback: handleGoogleSignIn,
            ux_mode: "popup"
        });

        const signInContainer = document.getElementById("googleSignInBtn");
        if (signInContainer) {
            google.accounts.id.renderButton(signInContainer, {
                theme: "outline",
                size: "large",
                text: "signin_with",
                shape: "rectangular",
                logo_alignment: "left",
                width: 250
            });
        }
    };

    init();
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

    updateReviewerUI();
    initializeGoogleSignIn();
});

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
    if (!window.googleIdToken) {
        showToast("Sign in required", "Please sign in with Google before flagging or publishing.", "error");
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
