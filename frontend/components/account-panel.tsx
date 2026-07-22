import { useState } from "react";
import type { FormEvent } from "react";
import { loginAccount, registerAccount } from "../lib/api";
import type { AuthSession, AuthUser } from "../lib/types";

type AccountMode = "login" | "register";

export function AccountPanel({
  user,
  onAuthenticated,
  onLogout,
}: {
  user: AuthUser | null;
  onAuthenticated: (session: AuthSession) => void;
  onLogout: () => void;
}) {
  const [mode, setMode] = useState<AccountMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function toggleAccount(nextMode: AccountMode) {
    setNotice("");
    setMode(nextMode);
    setOpen((current) => (current && mode === nextMode ? false : true));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");

    try {
      const session =
        mode === "register"
          ? await registerAccount(email.trim(), password)
          : await loginAccount(email.trim(), password);
      setPassword("");
      setOpen(false);
      setNotice(session.movedTrips > 0 ? `已绑定 ${session.movedTrips} 条游客行程` : "账号已同步");
      onAuthenticated(session);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账号操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <section className="accountPanel signedIn compactAccount" aria-label="账号">
        <div>
          <span>当前账号</span>
          <strong>{user.email}</strong>
        </div>
        <button onClick={onLogout} type="button">
          退出
        </button>
      </section>
    );
  }

  return (
    <section className={`accountPanel compactAccount ${open ? "open" : ""}`} aria-label="账号">
      <div className="accountActions">
        <button
          aria-expanded={open && mode === "login"}
          className="accountTrigger loginAction"
          onClick={() => toggleAccount("login")}
          type="button"
        >
          登录
        </button>
        <button
          aria-expanded={open && mode === "register"}
          className="accountTrigger registerAction"
          onClick={() => toggleAccount("register")}
          type="button"
        >
          注册
        </button>
      </div>
      {open && (
        <div className="accountDropdown">
          <div className="authModeSwitch" role="group" aria-label="账号模式">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
              登录
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
              注册
            </button>
          </div>
          <form className="accountForm" onSubmit={handleSubmit}>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱"
              required
              type="email"
              value={email}
            />
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码"
              required
              type="password"
              value={password}
            />
            <button disabled={busy} type="submit">
              {busy ? "处理中" : mode === "register" ? "注册" : "登录"}
            </button>
          </form>
        </div>
      )}
      {notice && <span className="accountNotice">{notice}</span>}
    </section>
  );
}
