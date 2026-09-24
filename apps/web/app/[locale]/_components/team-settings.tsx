"use client";

import { useCallback, useEffect, useState } from "react";
import { MarkosApiError, type AccountSettings, type TeamRole, type WorkspaceChoice, type WorkspaceTeam } from "@markos/api-client";
import type { Locale } from "@markos/shared-types";
import { Copy, RefreshCw, Users } from "lucide-react";
import { refreshBrowserSession, switchBrowserWorkspace, useMarkosClient, useMarkosSession } from "./browser-session";

const inputClass = "min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] disabled:opacity-50";
const buttonClass = "sunlit-secondary min-h-11 rounded-xl px-4 py-2 font-semibold disabled:opacity-50";
const roles: TeamRole[] = ["VIEWER", "EDITOR", "WORKSPACE_ADMIN"];
const names = { VIEWER: ["Viewer", "مشاهد"], EDITOR: ["Editor", "محرّر"], WORKSPACE_ADMIN: ["Administrator", "مدير"], OWNER: ["Owner", "مالك"] } as const;
function message(error: unknown, ar: boolean) {
  if (error instanceof MarkosApiError) {
    if (error.code === "TEAM_INVITATION_INVALID")
      return ar
        ? "الدعوة غير صالحة لهذا البريد أو انتهت صلاحيتها. اطلب رمزًا جديدًا من المالك."
        : "The invitation is expired, used, revoked or issued to another email. Ask the owner for a new code.";
    if (error.code?.startsWith("MFA_"))
      return ar ? "أعدّ تطبيق المصادقة من قسم الأمان وأدخل رمزًا جديدًا." : "Set up your authenticator in Security and enter a fresh code.";
    if (error.status === 403)
      return ar ? "ليست لديك صلاحية لهذا الإجراء. اطلب من مالك مساحة العمل." : "Your role does not allow this action. Ask the workspace owner.";
    if (error.status === 409) return ar ? "تغيّرت البيانات. أعد تحميل التفاصيل قبل المحاولة مجددًا." : "These details changed. Reload before trying again.";
  }
  return ar ? "تعذّر إكمال الطلب. تحقّق من اتصالك وحاول مجددًا." : "Could not complete the request. Check your connection and try again.";
}
export function AccountDetailsEditor({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale);
  const ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [data, setData] = useState<AccountSettings | null>(null),
    [name, setName] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [language, setLanguage] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    const next = await api.accountSettings();
    setData(next);
    setName(next.user.fullName);
    setWorkspace(next.workspace.name);
    setLanguage(next.user.locale);
  }, [api]);
  useEffect(() => {
    void load().catch((e: unknown) => setError(message(e, ar)));
  }, [load, ar]);
  async function save(kind: "account" | "workspace") {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (kind === "account") await api.updateAccount({ fullName: name.trim(), locale: language, expectedUpdatedAt: data.user.updatedAt });
      else await api.updateWorkspaceSettings({ name: workspace.trim(), expectedUpdatedAt: data.workspace.updatedAt });
      await refreshBrowserSession();
      await load();
      setSaved(true);
    } catch (e) {
      setError(message(e, ar));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5">
      {data ? (
        <>
          <label className="grid gap-2">
            {t("Full name", "الاسم الكامل")}
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={busy} autoComplete="name" />
          </label>
          <label className="grid gap-2">
            {t("Account language", "لغة الحساب")}
            <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value === "ar" ? "ar" : "en")} disabled={busy}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <button
            className={buttonClass}
            type="button"
            disabled={busy || name.trim().length < 2 || (name.trim() === data.user.fullName && language === data.user.locale)}
            onClick={() => void save("account")}
          >
            {t("Save account details", "حفظ بيانات الحساب")}
          </button>
          {data.workspace.ownerUserId === data.user.id ? (
            <>
              <label className="grid gap-2">
                {t("Workspace name", "اسم مساحة العمل")}
                <input className={inputClass} value={workspace} onChange={(e) => setWorkspace(e.target.value)} maxLength={120} disabled={busy} />
              </label>
              <button
                className={buttonClass}
                type="button"
                disabled={busy || workspace.trim().length < 2 || workspace.trim() === data.workspace.name}
                onClick={() => void save("workspace")}
              >
                {t("Save workspace name", "حفظ اسم مساحة العمل")}
              </button>
            </>
          ) : null}
        </>
      ) : !error ? (
        <p role="status">{t("Loading details…", "جارٍ تحميل البيانات…")}</p>
      ) : null}
      {saved ? <p role="status">{t("Details saved.", "تم حفظ البيانات.")}</p> : null}
      {error ? (
        <>
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
          <button
            className={buttonClass}
            type="button"
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e: unknown) => setError(message(e, ar)))
            }
          >
            {t("Reload details", "إعادة تحميل البيانات")}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function TeamSettings({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession();
  const ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [team, setTeam] = useState<WorkspaceTeam | null>(null),
    [workspaces, setWorkspaces] = useState<WorkspaceChoice[] | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<TeamRole>("EDITOR"),
    [code, setCode] = useState(""),
    [totp, setTotp] = useState("");
  const [invitation, setInvitation] = useState<{ email: string; code: string } | null>(null);
  const canManage = session?.roles.some((r) => r === "OWNER" || r === "WORKSPACE_ADMIN");
  const isOwner = team?.ownerUserId === session?.user.id;
  const roleName = (role: string) => (role in names ? names[role as keyof typeof names][ar ? 1 : 0] : role);
  const load = useCallback(async () => {
    const [nextWorkspaces, nextTeam] = await Promise.all([api.workspaces(), canManage ? api.team() : Promise.resolve(null)]);
    setWorkspaces(nextWorkspaces);
    setTeam(nextTeam);
  }, [api, canManage]);
  useEffect(() => {
    void load().catch((e: unknown) => setError(message(e, ar)));
  }, [load, ar]);
  async function run(task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await load();
    } catch (e) {
      setError(message(e, ar));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article id="team" className="sunlit-panel grid min-w-0 scroll-mt-28 gap-6 rounded-[1.75rem] p-5 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <h2 className="flex items-center gap-3 text-xl font-semibold">
        <Users size={22} />
        {t("Workspaces and team", "مساحات العمل والفريق")}
      </h2>
      {error ? (
        <p role="alert" className="rounded-xl bg-[var(--surface)] p-3 text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="grid gap-3">
        <h3 className="font-semibold">{t("Your workspaces", "مساحات عملك")}</h3>
        {!workspaces && !error ? <p role="status">{t("Loading…", "جارٍ التحميل…")}</p> : null}
        {workspaces?.map((workspace) => (
          <button
            className={`${buttonClass} text-start`}
            type="button"
            key={workspace.id}
            disabled={busy || workspace.id === session?.workspace.id}
            onClick={() => void run(() => switchBrowserWorkspace(workspace.id, locale, totp))}
          >
            {workspace.name}
            {workspace.id === session?.workspace.id ? t(" · Current", " · الحالية") : ""}
          </button>
        ))}
        {(workspaces?.length ?? 0) > 1 ? (
          <label className="grid gap-2">
            {t("Authenticator code (if enabled)", "رمز المصادقة (إذا كان مفعّلًا)")}
            <input
              className={inputClass}
              inputMode="numeric"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
        ) : null}
        <button className={`${buttonClass} inline-flex items-center justify-center gap-2`} type="button" disabled={busy} onClick={() => void run(load)}>
          <RefreshCw size={16} />
          {t("Refresh", "تحديث")}
        </button>
      </div>
      <form
        className="grid gap-3 border-t border-[var(--border)] pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const accepted = await api.acceptTeamInvitation(code.trim());
            setCode("");
            setNotice(t(`Joined ${accepted.name}. Choose it above to open it.`, `انضممت إلى ${accepted.name}. اخترها أعلاه لفتحها.`));
          });
        }}
      >
        <h3 className="font-semibold">{t("Join an existing workspace", "الانضمام إلى مساحة عمل موجودة")}</h3>
        <p className="text-sm text-[var(--muted)]">
          {t("Use the code sent by your workspace owner and the email address they invited.", "استخدم رمز الدعوة من مالك مساحة العمل والبريد الذي تمت دعوته.")}
        </p>
        <label className="grid gap-2">
          {t("Invitation code", "رمز الدعوة")}
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" maxLength={64} autoComplete="off" />
        </label>
        <button className={buttonClass} disabled={busy || !/^[a-f0-9]{64}$/.test(code.trim())} type="submit">
          {t("Accept invitation", "قبول الدعوة")}
        </button>
      </form>
      {team ? (
        <>
          <form
            className="grid gap-3 border-t border-[var(--border)] pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await api.inviteTeam({ email: email.trim().toLowerCase(), role });
                setInvitation(result);
                setEmail("");
              });
            }}
          >
            <h3 className="font-semibold">{t("Invite a teammate", "دعوة زميل")}</h3>
            <label className="grid gap-2">
              {t("Email", "البريد الإلكتروني")}
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="off" />
            </label>
            <label className="grid gap-2">
              {t("Role", "الدور")}
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                {roles
                  .filter((r) => isOwner || r !== "WORKSPACE_ADMIN")
                  .map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-sm text-[var(--muted)]">
              {t(
                "Editors create content; viewers can read. Administrators also manage settings and team access.",
                "ينشئ المحرّرون المحتوى ويطّلع المشاهدون عليه. يدير المديرون أيضًا الإعدادات وصلاحيات الفريق."
              )}
            </p>
            <button type="submit" className={buttonClass} disabled={busy}>
              {t("Create invitation", "إنشاء دعوة")}
            </button>
          </form>
          {invitation ? (
            <div className="grid min-w-0 gap-3 rounded-xl border border-[var(--border)] p-4">
              <p>{t(`Share this code with ${invitation.email}. Valid for 7 days.`, `شارك هذا الرمز مع ${invitation.email}. صالح لمدة ٧ أيام.`)}</p>
              <code className="break-all text-sm" dir="ltr">
                {invitation.code}
              </code>
              <button
                type="button"
                className={`${buttonClass} inline-flex items-center justify-center gap-2`}
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(invitation.code);
                    setNotice(t("Invitation code copied.", "تم نسخ رمز الدعوة."));
                  })
                }
              >
                <Copy size={16} />
                {t("Copy code", "نسخ الرمز")}
              </button>
              <button type="button" className={buttonClass} onClick={() => setInvitation(null)}>
                {t("Done", "تم")}
              </button>
            </div>
          ) : null}
          <div className="grid gap-3">
            <h3 className="font-semibold">{t("Members", "الأعضاء")}</h3>
            {team.members.map((member) => (
              <div key={member.id} className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{member.fullName}</p>
                  <p className="break-all text-sm text-[var(--muted)]">{member.email}</p>
                  <p className="text-sm">{roleName(member.role)}</p>
                </div>
                {member.userId !== team.ownerUserId &&
                member.userId !== session?.user.id &&
                roles.includes(member.role as TeamRole) &&
                (isOwner || member.role !== "WORKSPACE_ADMIN") ? (
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label={t(`Role for ${member.fullName}`, `دور ${member.fullName}`)}
                      className={`${inputClass} sm:!w-auto`}
                      value={member.role}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as TeamRole;
                        if (window.confirm(t(`Change ${member.fullName}'s role to ${roleName(next)}?`, `تغيير دور ${member.fullName} إلى ${roleName(next)}؟`)))
                          void run(() => api.changeTeamRole(member.id, next));
                      }}
                    >
                      {roles
                        .filter((r) => isOwner || r !== "WORKSPACE_ADMIN")
                        .map((r) => (
                          <option key={r} value={r}>
                            {roleName(r)}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t(`Remove ${member.fullName} from this workspace?`, `إزالة ${member.fullName} من مساحة العمل؟`)))
                          void run(() => api.removeTeamMember(member.id));
                      }}
                    >
                      {t("Remove member", "إزالة العضو")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {team.invitations.length ? (
            <div className="grid gap-3">
              <h3 className="font-semibold">{t("Pending invitations", "الدعوات المعلّقة")}</h3>
              {team.invitations.map((invite) => (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4" key={invite.id}>
                  <div className="min-w-0">
                    <p className="break-all">{invite.email}</p>
                    <p className="text-sm">
                      {roleName(invite.role)} · {t("Expires", "تنتهي")}: {new Date(invite.expiresAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || (!isOwner && invite.role === "WORKSPACE_ADMIN")}
                    onClick={() => {
                      if (window.confirm(t("Revoke this invitation?", "إلغاء هذه الدعوة؟"))) void run(() => api.revokeTeamInvitation(invite.id));
                    }}
                  >
                    {t("Revoke", "إلغاء الدعوة")}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : canManage ? null : (
        <p>{t("Your workspace owner manages team access.", "يدير مالك مساحة العمل صلاحيات الفريق.")}</p>
      )}
    </article>
  );
}
