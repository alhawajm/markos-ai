import React, { useState } from "react";
import { Alert, Share } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { TeamRole, WorkspaceTeam } from "@markos/api-client";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Field, Loading, Notice, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";
import { errorMessage } from "../src/errors";
import { sessionController } from "../src/auth/transport";
import { JoinWorkspace } from "../src/join-workspace";

const roleNames = { WORKSPACE_ADMIN: ["Administrator", "مدير"], EDITOR: ["Editor", "محرّر"], VIEWER: ["Viewer", "مشاهد"], OWNER: ["Owner", "مالك"] } as const;
export default function TeamScreen() {
  const { scope } = useAccount();
  return <Team key={scope} />;
}
function Team() {
  const { api, scope, session, queryClient } = useAccount();
  const { t } = useAppearance();
  const canManage = session.roles.some((r) => r === "OWNER" || r === "WORKSPACE_ADMIN");
  const workspaces = useQuery({ queryKey: [scope, "workspaces"], queryFn: () => api.workspaces() });
  const team = useQuery({ queryKey: [scope, "team"], queryFn: () => api.team(), enabled: canManage });
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<TeamRole>("EDITOR"),
    [code, setCode] = useState("");
  const [invitation, setInvitation] = useState<{ email: string; code: string } | null>(null);
  const isOwner = team.data?.ownerUserId === session.user.id;
  const action = useMutation({
    mutationFn: async (task: () => Promise<unknown>) => {
      await task();
      await queryClient.invalidateQueries({ queryKey: [scope, "team"] });
    }
  });
  const enter = useMutation({ mutationFn: (workspaceId: string) => sessionController.switchWorkspace({ workspaceId, ...(code ? { totpCode: code } : {}) }) });
  function confirm(message: string, task: () => Promise<unknown>) {
    Alert.alert(t("Update team access", "تحديث صلاحيات الفريق"), message, [
      { text: t("Cancel", "إلغاء"), style: "cancel" },
      { text: t("Confirm", "تأكيد"), style: "destructive", onPress: () => action.mutate(task) }
    ]);
  }
  return (
    <Screen>
      <Txt variant="title">{t("Workspaces and team", "مساحات العمل والفريق")}</Txt>
      {workspaces.isPending ? (
        <Loading />
      ) : workspaces.isError ? (
        <QueryFailure error={workspaces.error} retry={() => void workspaces.refetch()} />
      ) : (
        <Card>
          <Txt variant="heading">{t("Your workspaces", "مساحات عملك")}</Txt>
          {workspaces.data.map((workspace) => (
            <Button
              key={workspace.id}
              secondary={workspace.id !== session.workspace.id}
              label={workspace.name + (workspace.id === session.workspace.id ? t(" · Current", " · الحالية") : "")}
              busy={enter.isPending && enter.variables === workspace.id}
              disabled={enter.isPending || workspace.id === session.workspace.id}
              onPress={() => enter.mutate(workspace.id)}
            />
          ))}
          {workspaces.data.length > 1 ? (
            <Field
              label={t("Authenticator code (if enabled)", "رمز المصادقة (إذا كان مفعّلًا)")}
              value={code}
              onChangeText={setCode}
              maxLength={6}
              keyboardType="number-pad"
            />
          ) : null}
          {enter.isError ? <Notice error>{errorMessage(enter.error, t)}</Notice> : null}
        </Card>
      )}
      <JoinWorkspace />
      {canManage ? (
        <>
          {team.isPending ? (
            <Loading />
          ) : team.isError ? (
            <QueryFailure error={team.error} retry={() => void team.refetch()} />
          ) : (
            <>
              <Card>
                <Txt variant="heading">{t("Invite a teammate", "دعوة زميل")}</Txt>
                <Field
                  label={t("Email", "البريد الإلكتروني")}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  editable={!action.isPending}
                />
                <Roles value={role} onChange={setRole} allowAdmin={isOwner} disabled={action.isPending} />
                <Txt muted>
                  {t(
                    "Editors create content. Viewers can read. Administrators also manage settings and team access.",
                    "ينشئ المحرّرون المحتوى، ويطّلع المشاهدون عليه. يدير المديرون أيضًا الإعدادات وصلاحيات الفريق."
                  )}
                </Txt>
                <Button
                  label={t("Create invitation", "إنشاء دعوة")}
                  busy={action.isPending}
                  disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                  onPress={() =>
                    action.mutate(async () => {
                      const result = await api.inviteTeam({ email: email.trim().toLowerCase(), role });
                      setInvitation(result);
                      setEmail("");
                    })
                  }
                />
                {invitation ? (
                  <Card tone="tint">
                    <Txt>
                      {t(
                        `Share this code with ${invitation.email}. It expires in 7 days.`,
                        `شارك هذا الرمز مع ${invitation.email}. تنتهي صلاحيته خلال ٧ أيام.`
                      )}
                    </Txt>
                    <Txt selectable variant="meta" style={{ writingDirection: "ltr" }}>
                      {invitation.code}
                    </Txt>
                    <Button
                      secondary
                      label={t("Share invitation", "مشاركة الدعوة")}
                      onPress={() =>
                        action.mutate(() =>
                          Share.share({
                            message: t(
                              `Join ${session.workspace.name} on MARKOS. Sign in with ${invitation.email}, then open Settings → Workspaces and team → Join an existing workspace. Invitation code: ${invitation.code}`,
                              `انضم إلى ${session.workspace.name} في ماركوس. سجّل الدخول باستخدام ${invitation.email} ثم افتح الإعدادات ← مساحات العمل والفريق ← الانضمام إلى مساحة عمل موجودة. رمز الدعوة: ${invitation.code}`
                            )
                          })
                        )
                      }
                    />
                    <Button secondary label={t("Done", "تم")} onPress={() => setInvitation(null)} />
                  </Card>
                ) : null}
              </Card>
              <Txt variant="heading">{t("Members", "الأعضاء")}</Txt>
              {team.data.members.map((member) => (
                <Member
                  key={`${member.id}:${member.role}`}
                  member={member}
                  allowAdmin={isOwner}
                  protectedMember={
                    member.userId === session.user.id ||
                    member.userId === team.data.ownerUserId ||
                    !(member.role in roleNames) ||
                    member.role === "OWNER" ||
                    (!isOwner && member.role === "WORKSPACE_ADMIN")
                  }
                  busy={action.isPending}
                  change={(next) =>
                    confirm(t(`Change access for ${member.fullName}?`, `تغيير صلاحيات ${member.fullName}؟`), () =>
                      next ? api.changeTeamRole(member.id, next) : api.removeTeamMember(member.id)
                    )
                  }
                />
              ))}
              {team.data.invitations.length ? <Txt variant="heading">{t("Pending invitations", "الدعوات المعلّقة")}</Txt> : null}
              {team.data.invitations.map((invite) => (
                <Card key={invite.id}>
                  <Txt>{invite.email}</Txt>
                  <Txt muted>{t(roleNames[invite.role][0], roleNames[invite.role][1])}</Txt>
                  <Button
                    secondary
                    disabled={action.isPending || (!isOwner && invite.role === "WORKSPACE_ADMIN")}
                    label={t("Revoke invitation", "إلغاء الدعوة")}
                    onPress={() =>
                      confirm(t(`Revoke the invitation for ${invite.email}?`, `إلغاء دعوة ${invite.email}؟`), () => api.revokeTeamInvitation(invite.id))
                    }
                  />
                </Card>
              ))}
            </>
          )}
          {action.isError ? <Notice error>{errorMessage(action.error, t)}</Notice> : null}
        </>
      ) : (
        <Txt muted>{t("Your workspace owner manages team access.", "يدير مالك مساحة العمل صلاحيات الفريق.")}</Txt>
      )}
    </Screen>
  );
}
function Roles({ value, onChange, allowAdmin, disabled }: { value: TeamRole; onChange: (role: TeamRole) => void; allowAdmin: boolean; disabled: boolean }) {
  const { t } = useAppearance();
  return (
    <>
      {(["VIEWER", "EDITOR", ...(allowAdmin ? ["WORKSPACE_ADMIN"] : [])] as TeamRole[]).map((role) => (
        <Button key={role} secondary={value !== role} label={t(roleNames[role][0], roleNames[role][1])} disabled={disabled} onPress={() => onChange(role)} />
      ))}
    </>
  );
}
function Member({
  member,
  allowAdmin,
  protectedMember,
  busy,
  change
}: {
  member: WorkspaceTeam["members"][number];
  allowAdmin: boolean;
  protectedMember: boolean;
  busy: boolean;
  change: (role: TeamRole | null) => void;
}) {
  const { t } = useAppearance();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<TeamRole>(member.role === "WORKSPACE_ADMIN" ? member.role : member.role === "EDITOR" ? "EDITOR" : "VIEWER");
  return (
    <Card>
      <Txt variant="label">{member.fullName}</Txt>
      <Txt muted>{member.email}</Txt>
      <Txt>
        {member.role in roleNames ? t(roleNames[member.role as keyof typeof roleNames][0], roleNames[member.role as keyof typeof roleNames][1]) : member.role}
      </Txt>
      {!protectedMember ? (
        editing ? (
          <>
            <Roles value={role} onChange={setRole} allowAdmin={allowAdmin} disabled={busy} />
            <Button disabled={busy || role === member.role} label={t("Save role", "حفظ الدور")} onPress={() => change(role)} />
            <Button secondary disabled={busy} label={t("Remove member", "إزالة العضو")} onPress={() => change(null)} />
            <Button secondary label={t("Close", "إغلاق")} onPress={() => setEditing(false)} />
          </>
        ) : (
          <Button secondary label={t("Manage access", "إدارة الصلاحيات")} onPress={() => setEditing(true)} />
        )
      ) : null}
    </Card>
  );
}
