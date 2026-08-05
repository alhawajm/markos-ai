"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Banknote,
  Bot,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Gauge,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type {
  AdminBahrainLaunchReadiness,
  AdminBillingOperations,
  AdminGatewayReadiness,
  AdminModelConfiguration,
  AuditLogRecord,
  BillingPlanCatalogItem,
  Locale,
  PlanCode,
  PromptTemplateRecord
} from "@markos/shared-types";
import { SurfaceState } from "./surface-state";
import { useMarkosClient, useMarkosSession } from "./browser-session";

const planCodes: PlanCode[] = ["STARTER", "GROWTH", "PREMIUM", "ENTERPRISE"];
const modelSettingKeys = ["LLM_PRIMARY_MODEL", "LLM_LONGFORM_MODEL", "IMAGE_MODEL_PRIMARY", "IMAGE_MODEL_FALLBACK"] as const;
type ModelSettingKey = (typeof modelSettingKeys)[number];
type AdminView = "overview" | "plans" | "billing" | "gateways" | "prompts" | "models" | "audit" | "security";
type AuditState = "loading" | "error" | "success" | "limit";

const adminViews: Array<{ icon: ComponentType<{ size?: number }>; key: string; value: AdminView }> = [
  { icon: Gauge, key: "overview", value: "overview" },
  { icon: SlidersHorizontal, key: "plans", value: "plans" },
  { icon: CreditCard, key: "billing", value: "billing" },
  { icon: Banknote, key: "gateways", value: "gateways" },
  { icon: Bot, key: "prompts", value: "prompts" },
  { icon: Settings2, key: "models", value: "models" },
  { icon: FileText, key: "audit", value: "audit" },
  { icon: LockKeyhole, key: "security", value: "security" }
];

const previewPlans: BillingPlanCatalogItem[] = [
  { active: true, code: "STARTER", currency: "BHD", id: "starter", limits: { aiGenerations: 100, scheduledPosts: 30 }, name: "Starter", priceMinor: 19000 },
  { active: true, code: "GROWTH", currency: "BHD", id: "growth", limits: { aiGenerations: 500, scheduledPosts: 120 }, name: "Growth", priceMinor: 49000 },
  { active: true, code: "PREMIUM", currency: "BHD", id: "premium", limits: { aiGenerations: 1500, scheduledPosts: 400 }, name: "Premium", priceMinor: 99000 },
  { active: true, code: "ENTERPRISE", currency: "BHD", id: "enterprise", limits: { aiGenerations: 5000, scheduledPosts: 1200 }, name: "Enterprise", priceMinor: 249000 }
];

const previewGateways: AdminGatewayReadiness[] = [
  { callbackConfigured: true, code: "CREDIMAX", credentialKeys: ["MERCHANT_ID", "SECRET"], dryRun: false, ready: true, reasons: [] },
  { callbackConfigured: true, code: "BENEFIT", credentialKeys: ["BENEFIT_KEY"], dryRun: true, ready: false, reasons: ["CERTIFICATION_PENDING"] },
  { callbackConfigured: true, code: "STRIPE", credentialKeys: ["STRIPE_SECRET"], dryRun: false, ready: true, reasons: [] }
];

const previewOperations: AdminBillingOperations = {
  invoices: [
    { currency: "BHD", grossMinor: 53900, id: "inv-preview-1", netMinor: 49000, status: "PAID", vatMinor: 4900, vatPricingMode: "EXCLUSIVE", vatRateBps: 1000, workspaceId: "Zain Arabia" },
    { currency: "BHD", grossMinor: 20900, id: "inv-preview-2", netMinor: 19000, status: "DRAFT", vatMinor: 1900, vatPricingMode: "EXCLUSIVE", vatRateBps: 1000, workspaceId: "Pearl Cafe" }
  ],
  payments: [
    { amountMinor: 53900, currency: "BHD", gateway: "CREDIMAX", id: "pay-preview-1", status: "CAPTURED", workspaceId: "Zain Arabia" }
  ],
  subscriptions: [
    { cancelAtPeriodEnd: false, currentPeriodEnd: "2026-07-14T00:00:00.000Z", currentPeriodStart: "2026-06-14T00:00:00.000Z", gateway: "CREDIMAX", id: "sub-preview-1", planCode: "GROWTH", status: "ACTIVE" }
  ]
};

const previewModelConfig: AdminModelConfiguration = {
  editable: true,
  models: [
    { key: "LLM_PRIMARY_MODEL", source: "database", value: "gpt-5-mini" },
    { key: "LLM_LONGFORM_MODEL", source: "environment", value: "configured-longform-model" },
    { key: "IMAGE_MODEL_PRIMARY", source: "environment", value: "gpt-image-2" },
    { key: "IMAGE_MODEL_FALLBACK", source: "environment", value: "gpt-image-2-mini" }
  ],
  source: "database"
};

const previewPrompts: PromptTemplateRecord[] = [
  {
    active: true,
    agent: "CONTENT",
    body: "Generate Bahrain-localized Instagram content grounded in the Vault.",
    createdAt: "2026-06-14T10:00:00.000Z",
    id: "prompt-preview-1",
    trafficPct: 100,
    updatedAt: "2026-06-14T10:00:00.000Z",
    version: "content.v1",
    workspaceId: "preview"
  },
  {
    active: true,
    agent: "STRATEGIST",
    body: "Create 30/60/90 recommendations with measurable actions.",
    createdAt: "2026-06-14T10:00:00.000Z",
    id: "prompt-preview-2",
    trafficPct: 50,
    updatedAt: "2026-06-14T10:00:00.000Z",
    version: "strategy.v1",
    workspaceId: "preview"
  }
];

const previewReadiness: AdminBahrainLaunchReadiness = {
  gatewayReady: false,
  gateways: previewGateways,
  liveReady: false,
  planCatalogReady: true,
  plans: [
    {
      checkoutReady: true,
      code: "STARTER",
      currency: "BHD",
      grossMinor: 20900,
      limitsReady: true,
      netMinor: 19000,
      planActive: true,
      priceMinor: 19000,
      reasons: [],
      vatMinor: 1900,
      vatRateBps: 1000
    },
    {
      checkoutReady: false,
      code: "GROWTH",
      currency: "BHD",
      grossMinor: 53900,
      limitsReady: true,
      netMinor: 49000,
      planActive: true,
      priceMinor: 49000,
      reasons: ["BENEFIT_CERTIFICATION_PENDING"],
      vatMinor: 4900,
      vatRateBps: 1000
    }
  ],
  reasons: ["BENEFIT_CERTIFICATION_PENDING"],
  requiredGateways: ["CREDIMAX", "BENEFIT"]
};

export function AdminPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [plans, setPlans] = useState<BillingPlanCatalogItem[]>(previewPlans);
  const [billingOperations, setBillingOperations] = useState<AdminBillingOperations>(previewOperations);
  const [gateways, setGateways] = useState<AdminGatewayReadiness[]>(previewGateways);
  const [modelConfig, setModelConfig] = useState<AdminModelConfiguration>(previewModelConfig);
  const [prompts, setPrompts] = useState<PromptTemplateRecord[]>(previewPrompts);
  const [launchReadiness, setLaunchReadiness] = useState<AdminBahrainLaunchReadiness>(previewReadiness);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode>("STARTER");
  const [limitKey, setLimitKey] = useState("aiGenerations");
  const [limitValue, setLimitValue] = useState("100");
  const [promptAgent, setPromptAgent] = useState("CONTENT");
  const [promptVersion, setPromptVersion] = useState("");
  const [promptTrafficPct, setPromptTrafficPct] = useState("100");
  const [promptBody, setPromptBody] = useState("");
  const [modelSettingKey, setModelSettingKey] = useState<ModelSettingKey>("LLM_PRIMARY_MODEL");
  const [modelSettingValue, setModelSettingValue] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [auditState, setAuditState] = useState<AuditState | null>(null);

  const client = useMarkosClient(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state");

    if (isAuditState(requestedState)) {
      setAuditState(requestedState);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshAdmin(client, setPlans, setBillingOperations, setGateways, setModelConfig, setPrompts, setLaunchReadiness, setAuditLogs, setMessage);
  }, [client, session]);

  async function refreshAll() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setAuditState("loading");
    setMessage("");

    try {
      const loaded = await refreshAdmin(client, setPlans, setBillingOperations, setGateways, setModelConfig, setPrompts, setLaunchReadiness, setAuditLogs, setMessage);
      setAuditState(loaded ? "success" : "error");
      if (loaded) {
        setMessage(copy(locale, "refreshed"));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function savePlanLimit() {
    const parsedLimit = Number(limitValue);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0 || limitKey.trim().length === 0) {
      setMessage(copy(locale, "invalidLimit"));
      return;
    }

    if (!session) {
      setPlans((current) =>
        current.map((plan) => (plan.code === selectedPlanCode ? { ...plan, limits: { ...plan.limits, [limitKey.trim()]: parsedLimit } } : plan))
      );
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const updated = await client.updateAdminPlanLimits(selectedPlanCode, { limits: { [limitKey.trim()]: parsedLimit } });
      setPlans((current) => current.map((plan) => (plan.code === updated.code ? updated : plan)));
      setAuditLogs(await client.auditLogs({ limit: 20 }));
      setMessage(copy(locale, "planSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function createPrompt() {
    if (promptVersion.trim().length < 3 || promptBody.trim().length < 10) {
      setMessage(copy(locale, "invalidPrompt"));
      return;
    }

    const trafficPct = Number(promptTrafficPct);
    if (!Number.isInteger(trafficPct) || trafficPct < 0 || trafficPct > 100) {
      setMessage(copy(locale, "invalidTraffic"));
      return;
    }

    if (!session) {
      setPrompts((current) => [
        {
          active: true,
          agent: promptAgent,
          body: promptBody.trim(),
          createdAt: new Date().toISOString(),
          id: `preview-${Date.now()}`,
          trafficPct,
          updatedAt: new Date().toISOString(),
          version: promptVersion.trim(),
          workspaceId: "preview"
        },
        ...current
      ]);
      setPromptVersion("");
      setPromptBody("");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const created = await client.createPromptTemplate({
        active: true,
        agent: promptAgent,
        body: promptBody.trim(),
        trafficPct,
        version: promptVersion.trim()
      });
      setPrompts((current) => [created, ...current]);
      setPromptVersion("");
      setPromptBody("");
      setMessage(copy(locale, "promptSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveModelSetting() {
    if (modelSettingValue.trim().length === 0) {
      setMessage(copy(locale, "invalidModel"));
      return;
    }

    if (!session) {
      setModelConfig((current) => ({
        ...current,
        models: current.models.map((model) =>
          model.key === modelSettingKey ? { ...model, source: "database", value: modelSettingValue.trim() } : model
        )
      }));
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      setModelConfig(await client.updateAdminModelSetting(modelSettingKey, { value: modelSettingValue.trim() }));
      setMessage(copy(locale, "modelSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function downloadInvoice(invoiceId: string) {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const bytes = await client.exportBillingInvoicePdf(invoiceId);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `markos-vat-invoice-${invoiceId.slice(0, 8)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(copy(locale, "invoiceReady"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) ?? plans[0];
  const activePrompts = prompts.filter((prompt) => prompt.active);

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-[20px] bg-[linear-gradient(135deg,#14182b_0%,#102f54_55%,#24203f_100%)] p-5 text-white shadow-card xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff4b6e]">
              <ShieldCheck size={13} />
              {copy(locale, "eyebrow")}
            </div>
            <h1 className="mt-4 font-display text-[28px] font-bold leading-tight">{copy(locale, "title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{copy(locale, "subtitle")}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-white/5 p-3 text-center">
            <HeroMetric label={copy(locale, "plans")} value={String(plans.length)} />
            <HeroMetric label={copy(locale, "gateways")} value={`${gateways.filter((gateway) => gateway.ready).length}/${gateways.length}`} />
            <HeroMetric label={copy(locale, "ready")} value={launchReadiness.liveReady ? copy(locale, "yes") : copy(locale, "no")} />
          </div>
        </div>
      </div>

      {isBusy || auditState ? (
        <div className="xl:col-span-2">
          <SurfaceState
            action={
              auditState === "limit" ? (
                <button className="inline-flex h-10 items-center rounded-button bg-accent px-4 text-sm font-bold text-white" onClick={() => setActiveView("plans")} type="button">
                  {copy(locale, "plans")}
                </button>
              ) : (
                <button className="inline-flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-sm font-bold text-navy disabled:opacity-60" disabled={isBusy || !session} onClick={refreshAll} type="button">
                  <RefreshCcw size={15} />
                  {copy(locale, "refresh")}
                </button>
              )
            }
            body={auditStateText(locale, isBusy ? "loading" : auditState).body}
            title={auditStateText(locale, isBusy ? "loading" : auditState).title}
            tone={auditState === "error" ? "error" : auditState === "success" ? "success" : auditState === "limit" ? "limit" : "loading"}
          />
        </div>
      ) : null}

      <aside className="rounded-[20px] border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">{copy(locale, "console")}</p>
            <h2 className="mt-1 text-lg font-bold text-navy">{session?.workspace.name ?? "MARKOS Ops"}</h2>
          </div>
          <button
            aria-label={copy(locale, "refresh")}
            className="rounded-button border border-border bg-canvas p-2 text-muted hover:text-navy disabled:opacity-50"
            disabled={isBusy}
            onClick={refreshAll}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <nav className="mt-5 grid gap-1" aria-label={copy(locale, "adminScreens")}>
          {adminViews.map((view) => {
            const Icon = view.icon;
            const isActive = view.value === activeView;
            return (
              <button
                className={
                  isActive
                    ? "flex items-center gap-2 rounded-button border border-accent bg-accent/10 px-3 py-2 text-start text-sm font-bold text-accent"
                    : "flex items-center gap-2 rounded-button px-3 py-2 text-start text-sm font-semibold text-muted hover:bg-navy/5 hover:text-navy"
                }
                key={view.value}
                onClick={() => setActiveView(view.value)}
                type="button"
              >
                <Icon size={16} />
                {copy(locale, view.key)}
              </button>
            );
          })}
        </nav>

        <div className="mt-5 rounded-[18px] border border-border bg-canvas p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{copy(locale, "rbac")}</p>
          <p className="mt-2 text-sm font-bold text-navy">{session ? session.roles.join(", ") : "Preview · PRODUCT_ADMIN"}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{copy(locale, "rbacBody")}</p>
        </div>
      </aside>

      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard icon={SlidersHorizontal} label={copy(locale, "plans")} value={String(plans.length)} />
          <MetricCard icon={CreditCard} label={copy(locale, "subscriptions")} value={String(billingOperations.subscriptions.length)} />
          <MetricCard icon={Bot} label={copy(locale, "activePrompts")} value={String(activePrompts.length)} />
          <MetricCard icon={FileText} label={copy(locale, "auditEvents")} value={String(auditLogs.length)} />
        </div>

        {activeView === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card title={copy(locale, "launchReadiness")} icon={Gauge}>
              <div className="grid gap-3">
                {launchReadiness.plans.map((plan) => (
                  <div className="flex items-center justify-between rounded-[18px] border border-border bg-canvas px-4 py-3" key={plan.code}>
                    <div>
                      <p className="text-sm font-bold text-navy">{plan.code}</p>
                      <p className="text-xs text-muted">{plan.reasons.length === 0 ? copy(locale, "ready") : plan.reasons.join(", ")}</p>
                    </div>
                    <StatusPill ok={plan.planActive && plan.limitsReady && plan.checkoutReady} locale={locale} />
                  </div>
                ))}
              </div>
            </Card>
            <Card title={copy(locale, "gatewayReadiness")} icon={Banknote}>
              <MiniList
                rows={gateways.map((gateway) => ({
                  label: gateway.code,
                  meta: gateway.ready ? copy(locale, "ready") : gateway.reasons.join(", ") || copy(locale, "dryRun"),
                  ok: gateway.ready
                }))}
              />
            </Card>
          </div>
        ) : null}

        {activeView === "plans" ? (
          <Card title={copy(locale, "planLimits")} icon={SlidersHorizontal}>
            <div className="grid gap-3 lg:grid-cols-[180px_1fr_160px_auto]">
              <select className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setSelectedPlanCode(event.target.value as PlanCode)} value={selectedPlanCode}>
                {planCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setLimitKey(event.target.value)} value={limitKey} />
              <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" inputMode="numeric" onChange={(event) => setLimitValue(event.target.value)} value={limitValue} />
              <button className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isBusy} onClick={savePlanLimit} type="button">
                <Save size={16} />
                {copy(locale, "save")}
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <article className="rounded-[18px] border border-border bg-canvas p-4" key={plan.code}>
                  <p className="text-sm font-bold text-navy">{plan.name}</p>
                  <p className="mt-1 font-display text-2xl font-bold text-navy">{formatBhd(plan.priceMinor)}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">{JSON.stringify(plan.limits)}</p>
                </article>
              ))}
            </div>
            <pre className="mt-4 max-h-44 overflow-auto rounded-[18px] border border-border bg-canvas p-4 text-xs leading-5 text-muted">
              {JSON.stringify(selectedPlan?.limits ?? {}, null, 2)}
            </pre>
          </Card>
        ) : null}

        {activeView === "billing" ? (
          <Card title={copy(locale, "billingOps")} icon={CreditCard}>
            <DenseTable
              columns={[copy(locale, "workspace"), copy(locale, "plan"), copy(locale, "status"), copy(locale, "periodEnd")]}
              rows={billingOperations.subscriptions.map((subscription) => [
                subscription.id,
                subscription.planCode,
                subscription.status,
                new Date(subscription.currentPeriodEnd).toLocaleDateString(locale)
              ])}
            />
            <div className="mt-4 grid gap-3">
              {billingOperations.invoices.map((invoice) => (
                <div className="grid gap-3 rounded-[18px] border border-border bg-canvas p-4 md:grid-cols-[1fr_auto]" key={invoice.id}>
                  <div className="grid gap-2 text-sm md:grid-cols-5">
                    <span className="truncate text-muted">{invoice.workspaceId}</span>
                    <span className="font-bold text-navy">{invoice.status}</span>
                    <span>{formatBhd(invoice.netMinor)}</span>
                    <span>{formatBhd(invoice.vatMinor)}</span>
                    <span>{formatBhd(invoice.grossMinor)}</span>
                  </div>
                  <button className="inline-flex items-center justify-center gap-2 rounded-button border border-border bg-white px-3 py-2 text-sm font-bold text-navy disabled:opacity-60" disabled={isBusy} onClick={() => downloadInvoice(invoice.id)} type="button">
                    <Download size={16} />
                    {copy(locale, "invoicePdf")}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {activeView === "gateways" ? (
          <div className="grid gap-4 md:grid-cols-3">
            {gateways.map((gateway) => (
              <Card title={gateway.code} icon={Banknote} key={gateway.code}>
                <div className="grid gap-2 text-sm">
                  <StatusPill ok={gateway.ready} locale={locale} />
                  <Row label={copy(locale, "callback")} value={gateway.callbackConfigured ? copy(locale, "ready") : copy(locale, "missing")} />
                  <Row label={copy(locale, "dryRun")} value={gateway.dryRun ? copy(locale, "yes") : copy(locale, "no")} />
                  <p className="text-xs leading-5 text-muted">{gateway.reasons.length === 0 ? copy(locale, "gatewayReady") : gateway.reasons.join(", ")}</p>
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {activeView === "prompts" ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card title={copy(locale, "promptVersions")} icon={Bot}>
              <div className="grid gap-3">
                {prompts.map((prompt) => (
                  <article className="rounded-[18px] border border-border bg-canvas p-4" key={prompt.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-navy">{prompt.agent}</p>
                      <span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-bold text-accent">{prompt.trafficPct}%</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{prompt.version}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{prompt.body}</p>
                  </article>
                ))}
              </div>
            </Card>
            <Card title={copy(locale, "newPrompt")} icon={KeyRound}>
              <div className="grid gap-3">
                <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setPromptAgent(event.target.value)} placeholder="CONTENT" value={promptAgent} />
                <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setPromptVersion(event.target.value)} placeholder="content.v2" value={promptVersion} />
                <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" inputMode="numeric" onChange={(event) => setPromptTrafficPct(event.target.value)} placeholder="100" value={promptTrafficPct} />
                <textarea className="min-h-36 rounded-[18px] border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setPromptBody(event.target.value)} placeholder={copy(locale, "promptBody")} value={promptBody} />
                <button className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isBusy} onClick={createPrompt} type="button">
                  <KeyRound size={16} />
                  {copy(locale, "createPrompt")}
                </button>
              </div>
            </Card>
          </div>
        ) : null}

        {activeView === "models" || activeView === "security" ? (
          <Card title={activeView === "security" ? copy(locale, "security") : copy(locale, "modelConfig")} icon={activeView === "security" ? LockKeyhole : Settings2}>
            <div className="grid gap-3">
              {modelConfig.models.map((model) => (
                <div className="grid gap-1 rounded-[18px] border border-border bg-canvas px-4 py-3 text-sm md:grid-cols-[200px_1fr_120px]" key={model.key}>
                  <span className="font-bold text-navy">{model.key}</span>
                  <span className="text-muted">{model.value ?? copy(locale, "unset")}</span>
                  <span className="text-muted">{model.source}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[260px_1fr_auto]">
              <select className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setModelSettingKey(event.target.value as ModelSettingKey)} value={modelSettingKey}>
                {modelSettingKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <input className="rounded-button border border-border bg-canvas px-3 py-2 text-sm" onChange={(event) => setModelSettingValue(event.target.value)} placeholder={copy(locale, "modelValue")} value={modelSettingValue} />
              <button className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={isBusy} onClick={saveModelSetting} type="button">
                <Save size={16} />
                {copy(locale, "saveModel")}
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">{copy(locale, "securityBody")}</p>
          </Card>
        ) : null}

        {activeView === "audit" ? (
          <Card title={copy(locale, "auditTrail")} icon={ClipboardList}>
            {auditLogs.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-border bg-canvas p-6 text-sm text-muted">{copy(locale, "emptyAudit")}</div>
            ) : (
              <DenseTable
                columns={[copy(locale, "action"), copy(locale, "target"), copy(locale, "time")]}
                rows={auditLogs.map((log) => [formatAction(log.action), log.targetType, new Date(log.createdAt).toLocaleString(locale)])}
              />
            )}
          </Card>
        ) : null}

        {message ? <SurfaceState body={message} title={copy(locale, auditState === "error" ? "attention" : "status")} tone={auditState === "error" ? "error" : "info"} /> : <p className="min-h-5" />}
      </div>
    </section>
  );
}

function Card({ children, icon: Icon, title }: { children: ReactNode; icon: ComponentType<{ size?: number }>; title: string }) {
  return (
    <article className="rounded-[20px] border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#FEEAF0] text-accent">
          <Icon size={20} />
        </div>
        <h2 className="text-lg font-bold text-navy">{title}</h2>
      </div>
      {children}
    </article>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">{label}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <article className="rounded-[20px] border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
          <p className="mt-3 font-display text-3xl font-bold text-navy">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent/10 text-accent">
          <Icon size={18} />
        </div>
      </div>
    </article>
  );
}

function StatusPill({ locale, ok }: { locale: Locale; ok: boolean }) {
  return (
    <span className={ok ? "inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600" : "inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-600"}>
      <CheckCircle2 size={13} />
      {ok ? copy(locale, "ready") : copy(locale, "blocked")}
    </span>
  );
}

function MiniList({ rows }: { rows: Array<{ label: string; meta: string; ok: boolean }> }) {
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div className="flex items-center justify-between gap-3 rounded-[16px] border border-border bg-canvas px-3 py-2" key={row.label}>
          <span className="text-sm font-bold text-navy">{row.label}</span>
          <span className={row.ok ? "text-xs font-bold text-emerald-600" : "text-xs font-bold text-amber-600"}>{row.meta}</span>
        </div>
      ))}
    </div>
  );
}

function DenseTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <div className="rounded-[18px] border border-dashed border-border bg-canvas p-6 text-sm text-muted">No rows.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-[18px] border border-border">
      <div className="min-w-[680px]">
        <div className="grid gap-3 border-b border-border bg-canvas px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        {rows.map((row) => (
          <div className="grid gap-3 border-b border-border px-4 py-3 text-sm text-navy last:border-b-0" key={row.join(":")} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {row.map((cell, index) => (
              <span className={index === 0 ? "truncate font-bold" : "truncate text-muted"} key={`${cell}-${index}`}>
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-bold text-navy">{value}</span>
    </div>
  );
}

async function refreshAdmin(
  client: MarkosApiClient,
  setPlans: (plans: BillingPlanCatalogItem[]) => void,
  setBillingOperations: (operations: AdminBillingOperations) => void,
  setGateways: (gateways: AdminGatewayReadiness[]) => void,
  setModelConfig: (modelConfig: AdminModelConfiguration) => void,
  setPrompts: (prompts: PromptTemplateRecord[]) => void,
  setLaunchReadiness: (readiness: AdminBahrainLaunchReadiness) => void,
  setAuditLogs: (auditLogs: AuditLogRecord[]) => void,
  setMessage: (message: string) => void
): Promise<boolean> {
  try {
    const [plans, operations, gateways, modelConfig, prompts, readiness, auditLogs] = await Promise.all([
      client.adminPlans(),
      client.adminBillingOperations(),
      client.adminGatewayReadiness(),
      client.adminModelConfiguration(),
      client.promptTemplates(),
      client.adminBahrainLaunchReadiness(),
      client.auditLogs({ limit: 20 })
    ]);
    setPlans(plans);
    setBillingOperations(operations);
    setGateways(gateways);
    setModelConfig(modelConfig);
    setPrompts(prompts);
    setLaunchReadiness(readiness);
    setAuditLogs(auditLogs);
    return true;
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Admin data could not be loaded.");
    return false;
  }
}

function formatBhd(amountMinor: number): string {
  return `BHD ${(amountMinor / 1000).toFixed(3)}`;
}

function formatAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isAuditState(value: string | null): value is AuditState {
  return value === "loading" || value === "error" || value === "success" || value === "limit";
}

function auditStateText(locale: Locale, state: AuditState | null): { body: string; title: string } {
  const resolved = state ?? "success";
  const dictionary: Record<Locale, Record<AuditState, { body: string; title: string }>> = {
    ar: {
      error: {
        body: "تعذر تحميل وحدة الإدارة. تغييرات الخطط والفوترة والنماذج والقوالب تبقى متوقفة حتى تعود البيانات.",
        title: "تعذر تحديث الإدارة"
      },
      limit: {
        body: "تم الوصول إلى حد تشغيلي في الخطة أو البوابة. راجع حدود الخطط قبل إطلاق تغييرات إضافية.",
        title: "حد تشغيلي"
      },
      loading: {
        body: "يتم تحميل الخطط، الفوترة، البوابات، القوالب، إعدادات النماذج، وسجل التدقيق.",
        title: "جار تحديث الإدارة"
      },
      success: {
        body: "وحدة الإدارة جاهزة. كل تغيير حساس يمر عبر الصلاحيات ويترك أثرا في سجل التدقيق.",
        title: "الإدارة جاهزة"
      }
    },
    en: {
      error: {
        body: "Admin data could not be loaded. Plan, billing, model, and prompt changes stay blocked until data returns.",
        title: "Admin refresh failed"
      },
      limit: {
        body: "An operational plan or gateway limit is active. Review plan limits before launching additional changes.",
        title: "Operational limit"
      },
      loading: {
        body: "Loading plans, billing operations, gateways, prompts, model settings, and audit events.",
        title: "Refreshing admin"
      },
      success: {
        body: "Admin is ready. Sensitive changes remain permissioned and leave an audit trail.",
        title: "Admin ready"
      }
    }
  };

  return dictionary[locale][resolved];
}

function copy(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      action: "الإجراء",
      activePrompts: "القوالب",
      adminScreens: "شاشات الإدارة",
      attention: "تنبيه",
      audit: "التدقيق",
      auditEvents: "الأحداث",
      auditTrail: "سجل التدقيق",
      billing: "الفوترة",
      billingOps: "عمليات الفوترة",
      blocked: "معطل",
      callback: "Callback",
      console: "وحدة التحكم",
      createPrompt: "إنشاء قالب",
      dryRun: "Dry run",
      emptyAudit: "لا توجد أحداث تدقيق بعد.",
      eyebrow: "MARKOS Admin",
      failed: "تعذر تنفيذ العملية.",
      gatewayReady: "بيانات البوابة والـ callback جاهزة.",
      gatewayReadiness: "جاهزية بوابات الدفع",
      gateways: "البوابات",
      invalidLimit: "استخدم رقما صحيحا غير سالب ومفتاح حد.",
      invalidModel: "اسم النموذج مطلوب.",
      invalidPrompt: "إصدار القالب والنص مطلوبان.",
      invalidTraffic: "النسبة يجب أن تكون بين 0 و100.",
      invoicePdf: "PDF",
      invoiceReady: "تم تجهيز الفاتورة.",
      launchReadiness: "جاهزية إطلاق البحرين",
      missing: "ناقص",
      modelConfig: "إعدادات النماذج",
      modelSaved: "تم حفظ إعداد النموذج.",
      modelValue: "اسم النموذج",
      models: "النماذج",
      newPrompt: "قالب جديد",
      no: "لا",
      overview: "نظرة عامة",
      periodEnd: "نهاية الفترة",
      planLimits: "حدود الخطط",
      planSaved: "تم حفظ حد الخطة.",
      plans: "الخطط",
      previewOnly: "معاينة فقط. سجّل الدخول بصلاحية منتج لتنفيذ التغيير.",
      promptBody: "نص القالب",
      promptSaved: "تم حفظ القالب.",
      promptVersions: "إصدارات القوالب",
      prompts: "القوالب",
      rbac: "الصلاحيات",
      rbacBody: "تغييرات الخطط والنماذج والقوالب تبقى خلف صلاحيات admin وتكتب في سجل التدقيق.",
      ready: "جاهز",
      refresh: "تحديث",
      refreshed: "تم تحديث بيانات الإدارة.",
      save: "حفظ",
      saveModel: "حفظ النموذج",
      security: "الأمان",
      securityBody: "تحديثات النماذج والخطط والقوالب إجراءات حساسة وتبقى محمية بالصلاحيات والتدقيق.",
      status: "الحالة",
      subscriptions: "الاشتراكات",
      subtitle: "عمليات المنتج والفوترة والنماذج والقوالب في شاشة كثيفة وقابلة للتدقيق.",
      target: "الهدف",
      time: "الوقت",
      title: "الإدارة",
      unset: "غير محدد",
      workspace: "مساحة العمل",
      yes: "نعم"
    },
    en: {
      action: "Action",
      activePrompts: "Prompts",
      adminScreens: "Admin screens",
      attention: "Attention",
      audit: "Audit",
      auditEvents: "Events",
      auditTrail: "Audit trail",
      billing: "Billing",
      billingOps: "Billing operations",
      blocked: "Blocked",
      callback: "Callback",
      console: "Console",
      createPrompt: "Create prompt",
      dryRun: "Dry run",
      emptyAudit: "No audit events yet.",
      eyebrow: "MARKOS Admin",
      failed: "Action failed.",
      gatewayReady: "Gateway credentials and callback are configured.",
      gatewayReadiness: "Gateway readiness",
      gateways: "Gateways",
      invalidLimit: "Use a non-negative integer limit and limit key.",
      invalidModel: "Model value is required.",
      invalidPrompt: "Prompt version and body are required.",
      invalidTraffic: "Traffic must be an integer from 0 to 100.",
      invoicePdf: "PDF",
      invoiceReady: "Invoice PDF ready.",
      launchReadiness: "Bahrain launch readiness",
      missing: "Missing",
      modelConfig: "Model configuration",
      modelSaved: "Model setting saved.",
      modelValue: "Model name",
      models: "Models",
      newPrompt: "New prompt",
      no: "No",
      overview: "Overview",
      periodEnd: "Period end",
      planLimits: "Plan limits",
      planSaved: "Plan limit saved.",
      plans: "Plans",
      previewOnly: "Preview mode. Sign in with a product admin role to persist this change.",
      promptBody: "Prompt body",
      promptSaved: "Prompt saved.",
      promptVersions: "Prompt versions",
      prompts: "Prompts",
      rbac: "RBAC",
      rbacBody: "Plan, model, and prompt changes stay behind admin permissions and write audit events.",
      ready: "Ready",
      refresh: "Refresh",
      refreshed: "Admin data refreshed.",
      save: "Save",
      saveModel: "Save model",
      security: "Security",
      securityBody: "Model, plan, and prompt updates are sensitive actions protected by RBAC and audit logs.",
      status: "Status",
      subscriptions: "Subscriptions",
      subtitle: "Product operations, billing, model configuration, and prompt controls in one dense auditable console.",
      target: "Target",
      time: "Time",
      title: "Admin",
      unset: "Unset",
      workspace: "Workspace",
      yes: "Yes"
    }
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
