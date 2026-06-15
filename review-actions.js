document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    const html = document.documentElement;

    if (!btn) {
        console.warn("themeToggle button not found");
        return;
    }

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

async function submitFlags() {
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
            headers: {
                "Content-Type": "application/json"
            },
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
    try {
        showToast(
            "Publishing",
            "Finalizing this reviewed news list for circulation...",
            "success"
        );

        const response = await fetch("https://space-news-sage.vercel.app/api/submit-flags", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
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
