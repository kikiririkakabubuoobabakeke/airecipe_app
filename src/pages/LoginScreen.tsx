import { useState, type FormEvent } from "react";
import {
  createGoogleLoginUrl,
  loginWithPassword,
  sendPasswordResetEmail,
  updatePasswordWithTokens,
  type AuthTokenPair,
  type AuthUser,
} from "../lib/authApi";
import { useI18n } from "../lib/useI18n";

type LoginScreenProps = {
  passwordResetTokens?: AuthTokenPair | null;
  onAuthenticated?: (user: AuthUser) => void;
  onNavigateToRegister?: () => void;
};

export default function LoginScreen({
  passwordResetTokens,
  onAuthenticated,
  onNavigateToRegister,
}: LoginScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isPasswordReset = Boolean(passwordResetTokens);

  const handleLogin = async (event?: FormEvent) => {
    event?.preventDefault();

    if (isPasswordReset) {
      if (!passwordResetTokens || !password) {
        setErrorMessage(t("login.newPasswordRequired"));
        return;
      }

      setIsLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      try {
        const result = await updatePasswordWithTokens(
          passwordResetTokens,
          password,
        );
        setStatusMessage(t("login.passwordUpdateSuccess"));
        onAuthenticated?.(result.user);
        setIsLoading(false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("login.passwordUpdateFailed"),
        );
        setIsLoading(false);
      }
      return;
    }

    if (!email || !password) return;
    setIsLoading(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const result = await loginWithPassword(email, password);
      setStatusMessage(t("login.success"));
      onAuthenticated?.(result.user);
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("login.failed"),
      );
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const result = await createGoogleLoginUrl(window.location.origin);
      window.location.href = result.url;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("login.googleFailed"),
      );
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setErrorMessage(t("login.resetEmailRequired"));
      return;
    }

    setIsLoading(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await sendPasswordResetEmail(email, window.location.origin);
      setStatusMessage(t("login.resetSent"));
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("login.resetFailed"),
      );
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-brand">
          <div className="auth-logo">
            <img src="/app-icon.png" alt="" />
          </div>
          <strong>{t("app.name")}</strong>
        </div>

        {isPasswordReset ? (
          <>
            <input
              type="email"
              name="email"
              value=""
              autoComplete="username"
              readOnly
              hidden
            />
            <p className="auth-note">
              {t("login.passwordResetMode")}
            </p>
          </>
        ) : (
          <div className="auth-field">
            <label>{t("login.email")}</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="username"
            />
          </div>
        )}

        <div className="auth-field">
          <label>
            {isPasswordReset ? t("login.newPassword") : t("login.password")}
          </label>
          <input
            type="password"
            name={isPasswordReset ? "new-password" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isPasswordReset ? "new-password" : "current-password"}
          />
          {!isPasswordReset ? (
            <button
              type="button"
              className="auth-link"
              onClick={handlePasswordReset}
              disabled={isLoading}
            >
              {t("login.forgotPassword")}
            </button>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="status-message auth-status-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="status-message error-message auth-status-message" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            isLoading || !password || (!isPasswordReset && !email)
          }
          className="primary-button auth-button"
        >
          {isLoading
            ? t("login.loading")
            : isPasswordReset
              ? t("login.updatePassword")
              : t("login.submit")}
        </button>

        {!isPasswordReset ? (
          <>
            <div className="auth-divider">
              <span />
              <em>{t("login.or")}</em>
              <span />
            </div>

            <button
              type="button"
              onClick={onNavigateToRegister}
              className="secondary-button auth-button"
            >
              {t("login.register")}
            </button>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="secondary-button auth-button auth-google-button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {t("login.google")}
            </button>
          </>
        ) : null}
      </form>
    </main>
  );
}
