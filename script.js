const form = document.querySelector("#signup-form");
const usernameInput = document.querySelector("#username");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const termsInput = document.querySelector("#terms");
const passwordToggle = document.querySelector(".password-toggle");
const passwordMeter = document.querySelector(".password-meter");
const passwordHint = document.querySelector("#password-hint");
const googleButton = document.querySelector("#google-signup");
const notice = document.querySelector("#notice");

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

form.addEventListener("submit", (event) => {
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

  window.setTimeout(() => {
    showNotice(
      `Welcome, ${usernameInput.value.trim()}! Your form is ready to connect to an account API.`,
      "success",
    );
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Create account";
  }, 700);
});

googleButton.addEventListener("click", () => {
  clearNotice();
  showNotice(
    "Google sign-up is ready for your OAuth client ID and backend callback.",
    "info",
  );
});
