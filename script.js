const form = document.querySelector("#signup-form");
const usernameInput = document.querySelector("#username");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const termsInput = document.querySelector("#terms");
const passwordToggle = document.querySelector(".password-toggle");
const passwordMeter = document.querySelector(".password-meter");
const passwordHint = document.querySelector("#password-hint");
const googleButton = document.querySelector("#google-signup");
const appleButton = document.querySelector("#apple-signup");
const signInButton = document.querySelector("#signin-button");
const notice = document.querySelector("#notice");
const CURRENT_TERMS_VERSION = "2026-08-29";

const fields = {
  username: {
    input: usernameInput,
    message: "Use 3–24 letters, numbers, underscores, or hyphens.",
    isValid: (value) => /^[a-zA-Z0-9_-]{3,24}$/.test(value),
  },
  email: {
    input: emailInput,
    message: "Enter a valid email address.",
    isValid: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },
  password: {
    input: passwordInput,
    message: "Your password needs 8+ characters, a number, and an uppercase letter.",
    isValid: (value) => value.length >= 8 && /[A-Z]/.test(value) && /\d/.test(value),
  },
};

function showNotice(message, type) {
  notice.textContent = message;
  notice.className = `notice visible ${type}`;
}

function clearNotice() {
  notice.textContent = "";
  notice.className = "notice";
}

function validateField(name) {
  const field = fields[name];
  const value = field.input.value.trim();
  const valid = field.isValid(value);
  const wrapper = field.input.closest(".field");
  const error = wrapper.querySelector(".error");

  wrapper.classList.toggle("invalid", !valid);
  field.input.setAttribute("aria-invalid", String(!valid));
  error.textContent = valid ? "" : field.message;
  return valid;
}

function getPasswordStrength(value) {
  if (!value) return 0;

  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score += 1;
  return score;
}

function updatePasswordMeter() {
  const strength = getPasswordStrength(passwordInput.value);
  const labels = [
    "Use 8+ characters with a number and uppercase letter.",
    "Password strength: weak",
    "Password strength: fair",
    "Password strength: good",
    "Password strength: strong",
  ];

  passwordMeter.dataset.strength = String(strength);
  passwordHint.textContent = labels[strength];
}

Object.entries(fields).forEach(([name, field]) => {
  field.input.addEventListener("blur", () => validateField(name));
  field.input.addEventListener("input", () => {
    clearNotice();
    if (field.input.closest(".field").classList.contains("invalid")) {
      validateField(name);
    }
  });
});

passwordInput.addEventListener("input", updatePasswordMeter);

passwordToggle.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  passwordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  passwordToggle.setAttribute("aria-pressed", String(!showing));
  passwordInput.focus();
});

termsInput.addEventListener("change", () => {
  document.querySelector("#terms-error").classList.remove("visible");
  clearNotice();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  const validFields = Object.keys(fields).map(validateField).every(Boolean);
  const termsError = document.querySelector("#terms-error");
  const acceptedTerms = termsInput.checked;

  termsError.textContent = acceptedTerms ? "" : "Please accept the terms to continue.";
  termsError.classList.toggle("visible", !acceptedTerms);

  if (!validFields || !acceptedTerms) {
    const firstInvalid = form.querySelector('[aria-invalid="true"], input:invalid');
    firstInvalid?.focus();
    return;
  }

  const submitButton = form.querySelector(".submit-button");
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Creating account…";

  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email: emailInput.value.trim(),
      password: passwordInput.value,
      options: { data: { username: usernameInput.value.trim(), terms_version: CURRENT_TERMS_VERSION } },
    });

    if (error) throw error;

    if (data.session) {
      window.location.href = "dashboard.html";
      return;
    }

    showNotice(
      "Check your email to confirm your account, then sign in to view your portfolio.",
      "success",
    );
  } catch (error) {
    showNotice(error.message || "We could not create your account. Please try again.", "info");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Create account";
  }
});

async function signInWithProvider(provider, button) {
  clearNotice();
  sessionStorage.setItem("legofolio-oauth-terms-version", CURRENT_TERMS_VERSION);
  const originalText = button.lastChild.textContent;
  button.disabled = true;
  button.lastChild.textContent = " Connecting…";
  try {
    const { error } = await window.supabaseClient.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: new URL("dashboard.html", window.location.href).href,
        scopes: provider === "apple" ? "name email" : "email profile",
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });
    if (error) throw error;
  } catch (error) {
    sessionStorage.removeItem("legofolio-oauth-terms-version");
    button.disabled = false;
    button.lastChild.textContent = originalText;
    showNotice(error.message || `We could not connect to ${provider}. Please try again.`, "info");
  }
}

googleButton.addEventListener("click", () => signInWithProvider("google", googleButton));
appleButton.addEventListener("click", () => signInWithProvider("apple", appleButton));

signInButton.addEventListener("click", async () => {
  clearNotice();

  if (!emailInput.value.trim() || !passwordInput.value) {
    showNotice("Enter your email address and password, then choose Sign in.", "info");
    emailInput.focus();
    return;
  }

  signInButton.disabled = true;
  signInButton.textContent = "Signing in…";

  try {
    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) throw error;
    window.location.href = "dashboard.html";
  } catch (error) {
    showNotice(error.message || "We could not sign you in. Please try again.", "info");
  } finally {
    signInButton.disabled = false;
    signInButton.textContent = "Sign in";
  }
});
