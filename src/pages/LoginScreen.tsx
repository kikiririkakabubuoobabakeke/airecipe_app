import { useState, type CSSProperties, type FormEvent } from "react";
import {
  createGoogleLoginUrl,
  loginWithPassword,
  registerWithPassword,
  sendPasswordResetEmail,
  updatePasswordWithTokens,
  type AuthTokenPair,
  type AuthUser,
} from "../lib/authApi";
import { useI18n } from "../lib/useI18n";

type LoginScreenProps = {
  passwordResetTokens?: AuthTokenPair | null;
  onAuthenticated?: (user: AuthUser) => void;
};

export default function LoginScreen({
  passwordResetTokens,
  onAuthenticated,
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
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("login.passwordUpdateFailed"),
        );
      } finally {
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("login.failed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) {
      setErrorMessage(t("login.emailPasswordRequired"));
      return;
    }

    setIsLoading(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const result = await registerWithPassword(email, password);
      setStatusMessage(
        result.needsEmailConfirmation
          ? t("login.confirmationSent")
          : t("login.registerSuccess"),
      );

      if (result.user && !result.needsEmailConfirmation) {
        onAuthenticated?.(result.user);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("login.registerFailed"),
      );
    } finally {
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("login.resetFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 背景装飾 */}
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <form style={styles.card} data-card onSubmit={handleLogin}>
        {/* ロゴ */}
        <div style={styles.logoWrapper}>
          <div style={styles.logoBox}>
            <img src="/app-icon.png" alt="" style={styles.logoImage} />
          </div>
        </div>

        {isPasswordReset ? (
          <p style={styles.resetDescription}>
            {t("login.passwordResetMode")}
          </p>
        ) : (
          <div style={styles.inputGroup}>
            <label style={styles.label}>{t("login.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={styles.input}
              autoComplete="email"
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "#333333";
                (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(51,51,51,0.12)";
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "#E5E7EB";
                (e.target as HTMLInputElement).style.boxShadow = "none";
              }}
            />
          </div>
        )}

        {/* パスワード入力 */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>
            {isPasswordReset ? t("login.newPassword") : t("login.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={styles.input}
            autoComplete={isPasswordReset ? "new-password" : "current-password"}
            onFocus={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#333333";
              (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(51,51,51,0.12)";
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#E5E7EB";
              (e.target as HTMLInputElement).style.boxShadow = "none";
            }}
          />
          {!isPasswordReset ? (
            <button
              type="button"
              style={styles.forgotLink}
              onClick={handlePasswordReset}
              disabled={isLoading}
            >
              {t("login.forgotPassword")}
            </button>
          ) : null}
        </div>

        {statusMessage ? (
          <p style={styles.statusMessage} role="status">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p style={styles.errorMessage} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {/* ログインボタン */}
        <button
          type="submit"
          disabled={
            isLoading || !password || (!isPasswordReset && !email)
          }
          style={{
            ...styles.primaryButton,
            opacity: isLoading || !password || (!isPasswordReset && !email)
              ? 0.6
              : 1,
            cursor: isLoading || !password || (!isPasswordReset && !email)
              ? "not-allowed"
              : "pointer",
          }}
          onMouseEnter={(e) => {
            if (!isLoading && password && (isPasswordReset || email))
              (e.currentTarget as HTMLButtonElement).style.background = "#1F2933";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#333333";
          }}
        >
          {isLoading
            ? t("login.loading")
            : isPasswordReset
              ? t("login.updatePassword")
              : t("login.submit")}
        </button>

        {!isPasswordReset ? (
          <>
            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>{t("login.or")}</span>
              <span style={styles.dividerLine} />
            </div>

            <button
              type="button"
              onClick={handleRegister}
              style={styles.secondaryButton}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#F6F7F8";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#333333";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#D8DDE3";
              }}
            >
              {t("login.register")}
            </button>

            <button
              type="button"
              onClick={handleGoogleLogin}
              style={styles.googleButton}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#F6F7F8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#fff";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 10 }}>
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

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        input::placeholder { color: #9AA1AA; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        div[data-card] {
          animation: fadeUp 0.5s ease forwards;
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#F7F8F9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    position: "relative",
    overflow: "hidden",
  },
  bgCircle1: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    top: -120,
    right: -100,
    pointerEvents: "none",
  },
  bgCircle2: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    bottom: -80,
    left: -80,
    pointerEvents: "none",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#FFFFFF",
    borderRadius: 20,
    padding: "44px 40px 40px",
    boxShadow: "0 18px 48px rgba(31,41,51,0.10)",
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    position: "relative",
    zIndex: 1,
    animation: "fadeUp 0.5s ease forwards",
  },
  logoWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 36,
    gap: 10,
  },
  logoBox: {
    width: 64,
    height: 64,
    background: "#F6F7F8",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 12px rgba(31,41,51,0.08)",
    border: "1px solid #E5E7EB",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 10,
    border: "1.5px solid #E5E7EB",
    padding: "0 16px",
    fontSize: 15,
    color: "#333333",
    background: "#FFFFFF",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    fontFamily: "inherit",
  },
  forgotLink: {
    fontSize: 12,
    color: "#4B5563",
    alignSelf: "flex-end",
    appearance: "none",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textDecoration: "none",
    marginTop: 2,
    padding: 0,
    letterSpacing: "0.02em",
    fontFamily: "inherit",
  },
  statusMessage: {
    margin: "-2px 0 14px",
    padding: "10px 12px",
    borderRadius: 10,
    background: "#F0F7F2",
    color: "#375A42",
    fontSize: 12,
    lineHeight: 1.6,
  },
  errorMessage: {
    margin: "-2px 0 14px",
    padding: "10px 12px",
    borderRadius: 10,
    background: "#FDF1F1",
    color: "#8A3A3A",
    fontSize: 12,
    lineHeight: 1.6,
  },
  resetDescription: {
    margin: "0 0 18px",
    padding: "12px 14px",
    borderRadius: 10,
    background: "#F6F7F8",
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 1.6,
  },
  primaryButton: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    border: "none",
    background: "#333333",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    letterSpacing: "0.03em",
    transition: "background 0.2s, opacity 0.2s",
    marginTop: 6,
    marginBottom: 20,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#E5E7EB",
  },
  dividerText: {
    fontSize: 12,
    color: "#8B949E",
    letterSpacing: "0.05em",
  },
  secondaryButton: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    border: "1.5px solid #D8DDE3",
    background: "transparent",
    color: "#333333",
    fontSize: 15,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "background 0.2s, border-color 0.2s",
    marginBottom: 12,
  },
  googleButton: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    border: "1.5px solid #E5E7EB",
    background: "#fff",
    color: "#333333",
    fontSize: 15,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
};
