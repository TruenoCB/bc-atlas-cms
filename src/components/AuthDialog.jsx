import { useEffect, useState } from "react";
import { ArrowRight, SignIn, UserPlus, X } from "@phosphor-icons/react";
import { login, register } from "../lib/api.js";
import { PrimarySpecularButton } from "./SpecularButton.jsx";

export function AuthDialog({ open, onClose, onAuthenticated, reason = "" }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("login");
      setForm({ displayName: "", email: "", password: "" });
      return;
    }
    setStatus("idle");
    setError("");
  }, [open]);

  useEffect(() => {
    if (open) setError("");
  }, [mode, open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const action = mode === "register" ? register : login;
      const user = await action(form);
      setStatus("saved");
      await onAuthenticated(user);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Member access is temporarily unavailable.");
      setStatus("idle");
    }
  };

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const registering = mode === "register";

  return (
    <div className="dialog-backdrop compact-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="signin-dialog" role="dialog" aria-modal="true" aria-labelledby="signin-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <button className="icon-button signin-close" type="button" aria-label="Close member access" onClick={onClose}><X size={17} /></button>
        <div className="eyebrow">MEMBER ACCESS</div>
        <h2 id="signin-title">{registering ? "Create an account." : "Continue reading."}</h2>
        <p>{reason || (registering
          ? "Create one account for member-only essays, field notes, and knowledge pages."
          : "Member-only publishing uses a private, HTTP-only session.")}</p>
        {registering ? (
          <label><span>Display name</span><input required autoComplete="name" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder="How readers will know you" /></label>
        ) : null}
        <label><span>Email</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" /></label>
        <label><span>Password</span><input required type="password" minLength="12" autoComplete={registering ? "new-password" : "current-password"} value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="At least 12 characters" /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <PrimarySpecularButton type="submit" disabled={status === "saving"}>
          {registering ? <UserPlus size={16} /> : <SignIn size={16} />}
          {status === "saving" ? "Please wait…" : registering ? "Create account" : "Sign in"}
        </PrimarySpecularButton>
        <button className="text-action auth-switch" type="button" onClick={() => setMode(registering ? "login" : "register")}>
          {registering ? "Already a member? Sign in" : "New here? Create an account"}<ArrowRight size={13} />
        </button>
      </form>
    </div>
  );
}
