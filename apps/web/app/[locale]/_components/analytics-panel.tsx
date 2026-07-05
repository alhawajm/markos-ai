"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Download,
  Eye,
  Facebook,
  FileText,
  Heart,
  Instagram,
  Mail,
  MessageSquareText,
  RefreshCcw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Twitter,
  Users,
  Zap
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import type {
  AnalyticsChatResult,
  AnalyticsDigestResult,
  AnalyticsLearningResult,
  AnalyticsLiveReadiness,
  AnalyticsMetricTotals,
  AnalyticsSummary,
  AuthSession,
  InstagramMetricType,
  Locale
} from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = getBrowserApiBaseUrl();

type Tone = "blue" | "green" | "pink" | "slate" | "amber";

const toneColor: Record<Tone, string> = {
  amber: "#F59E0B",
  blue: "#1877F2",
  green: "#22C55E",
  pink: "#E94560",
  slate: "#374151"
};

const channelMeta: Array<{
  color: string;
  metricType: InstagramMetricType;
  name: string;
  platform: "facebook" | "instagram" | "twitter";
}> = [
  { color: "#E1306C", metricType: "REEL", name: "Instagram Reels", platform: "instagram" },
  { color: "#1877F2", metricType: "POST", name: "Facebook Posts", platform: "facebook" },
  { color: "#374151", metricType: "STORY", name: "X / Stories", platform: "twitter" }
];

export function AnalyticsPanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary>(() => demoSummary(30));
  const [readiness, setReadiness] = useState<AnalyticsLiveReadiness | null>(null);
  const [days, setDays] = useState(30);
  const [digest, setDigest] = useState<AnalyticsDigestResult | null>(null);
  const [learning, setLearning] = useState<AnalyticsLearningResult | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatResult, setChatResult] = useState<AnalyticsChatResult | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const client = useMemo(
    () =>
      new MarkosApiClient(
        session
          ? {
              accessToken: session.tokens.accessToken,
              baseUrl: apiBaseUrl,
              workspaceId: session.workspace.id
            }
          : {
              baseUrl: apiBaseUrl
            }
      ),
    [session]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);

    if (!stored) {
      return;
    }

    try {
      setSession(JSON.parse(stored) as AuthSession);
    } catch {
      window.localStorage.removeItem(sessionKey);
    }
  }, []);

  useEffect(() => {
    setSummary((current) => (session ? current : demoSummary(days)));
  }, [days, session]);

  useEffect(() => {
    if (session) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("learning") === "saved") {
      setLearning(previewAnalyticsLearning(demoSummary(days)));
    }
  }, [days, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, session]);

  async function loadAnalytics() {
    if (!session) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const [nextSummary, nextReadiness] = await Promise.all([
        client.analytics({ days }),
        client.analyticsLiveReadiness().catch(() => null)
      ]);

      setSummary(nextSummary);
      setReadiness(nextReadiness);
    } catch (error) {
      setSummary(demoSummary(days));
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function syncAnalytics() {
    if (!session) {
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const result = await client.syncAnalytics({ days });
      setLearning(result.learning ?? null);
      await loadAnalytics();
      setMessage(`${text(locale, "syncComplete")}: ${result.records.length}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function generateDigest() {
    if (!session) {
      setDigest(null);
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      setDigest(await client.analyticsDigest({ days, locale }));
      setMessage(text(locale, "digestReady"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function askAnalyticsQuestion() {
    if (!session || chatQuestion.trim().length < 3) {
      setMessage(session ? text(locale, "questionTooShort") : text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      setChatResult(await client.analyticsChat({ days, locale, question: chatQuestion.trim() }));
      setMessage(text(locale, "answerReady"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveLearning() {
    if (!session) {
      setLearning(previewAnalyticsLearning(summary));
      setMessage(text(locale, "learningPreviewSaved"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const result = await client.writeAnalyticsLearning({ days });
      setLearning(result);
      setMessage(`${text(locale, "learningSaved")}: ${result.key}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function downloadMonthlyPdf() {
    if (!session) {
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const month = selectedMonth(summary);
      const bytes = await client.exportMonthlyAnalyticsPdf({ locale, month });
      const url = window.URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = `markos-analytics-${month}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      setMessage(text(locale, "pdfReady"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function emailMonthlyPdf() {
    if (!session) {
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const result = await client.sendMonthlyAnalyticsEmail({ locale, month: selectedMonth(summary) });
      setMessage(result.delivered ? text(locale, "emailSent") : result.skippedReason ?? text(locale, "emailSkipped"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "requestFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  const totals = summary.totals;
  const pulse = performancePulse(summary);
  const noLiveConnection = Boolean(session && readiness && !readiness.ready);
  const emptyLiveData = Boolean(session && summary.records.length === 0 && !isLoading);
  const insight = analyticsInsight(locale, summary);

  return (
    <section className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_58%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.24)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">
                <Activity size={14} />
                {session ? text(locale, "liveWorkspace") : text(locale, "previewWorkspace")}
              </span>
            </div>
            <p className="mt-2 text-sm font-normal text-white/55">
              {session?.workspace.name ?? "Zain Arabia"} - {formatDateRange(locale, summary.from, summary.to)}
            </p>
            <div className="mt-5 flex flex-wrap gap-4">
              <HeroStat color="#22C55E" label={text(locale, "reach")} value={formatCompact(locale, totals.reach)} />
              <HeroStat color="#F59E0B" label={text(locale, "engagement")} value={formatCompact(locale, totals.engagement)} />
              <HeroStat color="#E94560" label={text(locale, "topPosts")} value={summary.topContent.length.toString()} />
              <HeroStat color="#6366F1" label={text(locale, "engRate")} value={formatPercent(pulse.engagementRate)} />
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <ScoreRing score={pulse.brandScore} />
            <p className="mt-2 text-xs text-white/55">{text(locale, "brandHealth")}</p>
            <p className="text-xs font-extrabold text-emerald-400">{text(locale, "excellent")}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[#E8ECF2] bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,.04)] xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={text(locale, "range")}
            className="h-10 rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm font-bold text-navy outline-none focus:border-accent"
            onChange={(event) => setDays(Number(event.target.value))}
            value={days}
          >
            <option value={7}>{text(locale, "sevenDays")}</option>
            <option value={30}>{text(locale, "thirtyDays")}</option>
            <option value={90}>{text(locale, "ninetyDays")}</option>
          </select>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm font-bold text-muted hover:text-navy disabled:opacity-50" disabled={isBusy || isLoading} onClick={loadAnalytics} type="button">
            <RefreshCcw size={15} />
            {text(locale, "refresh")}
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-midnavy px-4 text-sm font-bold text-white disabled:opacity-50" disabled={isBusy} onClick={syncAnalytics} type="button">
            <Zap size={15} />
            {text(locale, "sync")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-3 text-sm font-extrabold text-accent disabled:opacity-50" disabled={isBusy} onClick={saveLearning} type="button">
            <Brain size={15} />
            {text(locale, "saveLearning")}
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 text-sm font-extrabold text-white shadow-[0_3px_12px_rgba(233,69,96,.3)] disabled:opacity-50" disabled={isBusy} onClick={generateDigest} type="button">
            <FileText size={15} />
            {text(locale, "generateDigest")}
          </button>
        </div>
      </section>

      {noLiveConnection ? <StateBanner tone="amber" title={text(locale, "connectionNeeded")} body={readiness?.reasons.join(" / ") ?? text(locale, "connectionNeededBody")} /> : null}
      {emptyLiveData ? <StateBanner tone="blue" title={text(locale, "emptyTitle")} body={text(locale, "emptyBody")} /> : null}
      {message ? <StateBanner tone={message.includes("failed") || message.includes("Request") ? "pink" : "green"} title={text(locale, "status")} body={message} /> : null}
      {learning ? <StateBanner tone="green" title={text(locale, "learningEvidence")} body={`${text(locale, "savedToVault")}: ${learning.key}`} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard color="#6366F1" icon={Eye} label={text(locale, "totalReach")} sub={text(locale, "vsLastPeriod")} trend={formatSignedPercent(pulse.reachChangePct)} up={pulse.reachChangePct >= 0} value={formatCompact(locale, totals.reach)} />
        <KpiCard color="#E94560" icon={Heart} label={text(locale, "engagements")} sub={text(locale, "likesCommentsShares")} trend={formatSignedPercent(pulse.engagementChangePct)} up={pulse.engagementChangePct >= 0} value={formatNumber(locale, totals.engagement)} />
        <KpiCard color="#22C55E" icon={Users} label={text(locale, "followers")} sub={text(locale, "acrossChannels")} trend={`+${formatNumber(locale, Math.max(0, Math.round(totals.followers * 0.014)))}`} up value={formatNumber(locale, totals.followers)} />
        <KpiCard color="#F59E0B" icon={BarChart3} label={text(locale, "impressions")} sub={text(locale, "paidOrganic")} trend={formatSignedPercent(pulse.impressionChangePct)} up={pulse.impressionChangePct >= 0} value={formatCompact(locale, totals.impressions)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "reachTrend")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "organicPaid")}</p>
            </div>
            <div className="flex items-center gap-5 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-midnavy" />{text(locale, "organic")}</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{text(locale, "paid")}</span>
            </div>
          </div>
          {isLoading ? <LoadingBlock label={text(locale, "loading")} /> : <ReachChart daily={summary.daily} />}
        </article>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <h3 className="text-[15px] font-bold text-navy">{text(locale, "channelPerformance")}</h3>
          <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "engagementByPlatform")}</p>
          <div className="mt-7 grid gap-5">
            {channelMeta.map((channel) => (
              <ChannelRow channel={channel} key={channel.metricType} summary={summary} />
            ))}
          </div>
          <div className="mt-7 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-muted">{text(locale, "avgEngRate")}</span>
            <span className="font-display text-xl font-extrabold tracking-normal text-navy">{formatPercent(pulse.engagementRate)}</span>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-navy">{text(locale, "aiInsight")}</h3>
                <p className="text-sm text-muted">{session ? text(locale, "groundedLive") : text(locale, "previewMode")}</p>
              </div>
            </div>
            <button aria-label={text(locale, "refresh")} className="rounded-xl p-2 text-muted hover:bg-canvas" disabled={isBusy} onClick={generateDigest} type="button">
              <RefreshCcw size={17} />
            </button>
          </div>
          <div className="mt-5 min-h-[220px] rounded-xl border border-accent/15 bg-[linear-gradient(135deg,rgba(233,69,96,.04),rgba(99,102,241,.04))] p-5">
            <p className="text-[13px] leading-7 text-slate-700">{digest ? formatConsultantOutput(digest.run.output) : insight}</p>
          </div>
          <div className={learning ? "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3" : "mt-4 rounded-xl border border-accent/15 bg-accent/5 p-3"}>
            <div className="flex items-center gap-2">
              {learning ? <CheckCircle2 className="text-emerald-600" size={15} /> : <Brain className="text-accent" size={15} />}
              <p className={learning ? "text-xs font-extrabold text-emerald-700" : "text-xs font-extrabold text-accent"}>{text(locale, "learningLoopTitle")}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              {learning ? `${text(locale, "savedToVault")}: ${learning.key}` : text(locale, "learningLoopReady")}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <a className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 py-3 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(233,69,96,.28)]" href={`/${locale}/content`}>
              <Zap size={15} />
              {text(locale, "applyNow")}
            </a>
            <button className="rounded-xl border border-border bg-canvas px-4 py-3 text-sm font-bold text-muted" onClick={saveLearning} type="button">
              {text(locale, "save")}
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "topContent")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "rankedByEngagement")}</p>
            </div>
            <a className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-extrabold text-accent" href={`/${locale}/schedule`}>
              {text(locale, "viewQueue")}
              <ArrowRight size={15} />
            </a>
          </div>
          <div className="mt-5 grid gap-3">
            {summary.topContent.length > 0 ? (
              summary.topContent.slice(0, 5).map((item, index) => <TopContentRow item={item} key={item.contentItemId} locale={locale} rank={index + 1} />)
            ) : (
              <EmptyCard body={text(locale, "emptyBody")} title={text(locale, "emptyTitle")} />
            )}
          </div>
        </article>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E,#0F3460)] p-5 text-white shadow-[0_4px_20px_rgba(15,52,96,.2)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="relative grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-accent">
              <MessageSquareText size={15} />
              {text(locale, "askTitle")}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-accent"
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void askAnalyticsQuestion();
                  }
                }}
                placeholder={text(locale, "questionPlaceholder")}
                value={chatQuestion}
              />
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-extrabold text-white disabled:opacity-50" disabled={isBusy || chatQuestion.trim().length < 3} onClick={askAnalyticsQuestion} type="button">
                <Send size={15} />
                {text(locale, "ask")}
              </button>
            </div>
            {chatResult ? <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">{formatConsultantOutput(chatResult.run.output)}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={isBusy} onClick={downloadMonthlyPdf} type="button">
              <Download size={15} className="text-accent" />
              {text(locale, "downloadPdf")}
            </button>
            <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={isBusy} onClick={emailMonthlyPdf} type="button">
              <Mail size={15} className="text-accent" />
              {text(locale, "emailPdf")}
            </button>
          </div>
        </div>
      </section>

      {learning ? (
        <section className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} />
            <h3 className="text-[15px] font-bold text-navy">{text(locale, "learningEvidence")}</h3>
          </div>
          <p className="mt-2 text-sm text-muted">
            {learning.key} - {text(locale, "records")}: {learning.recordCount} / {text(locale, "topContent")}: {learning.topContentCount}
          </p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {learning.observations.map((observation) => (
              <p className="rounded-xl border border-[#E8ECF2] bg-canvas p-3 text-sm leading-6 text-muted" key={observation}>
                {observation}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function HeroStat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full shadow-[0_0_7px_currentColor]" style={{ backgroundColor: color, color }} />
      <span className="text-[13px] text-white/50">{label}:</span>
      <span className="text-[13px] font-bold text-white">{value}</span>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 38;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="-rotate-90" height="96" width="96">
        <circle cx="48" cy="48" fill="none" r="38" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
        <circle cx="48" cy="48" fill="none" r="38" stroke="#22C55E" strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" strokeWidth="8" />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-[22px] font-extrabold leading-none tracking-normal">{score}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Score</p>
      </div>
    </div>
  );
}

function KpiCard({
  color,
  icon: Icon,
  label,
  sub,
  trend,
  up,
  value
}: {
  color: string;
  icon: typeof Eye;
  label: string;
  sub: string;
  trend: string;
  up: boolean;
  value: string;
}) {
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#E8ECF2] bg-card shadow-[0_2px_8px_rgba(0,0,0,.05)] transition hover:-translate-y-0.5">
      <div className="h-1" style={{ background: `linear-gradient(90deg,${color},${color}88)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[.02em] text-[#6B7280]">{label}</p>
            <p className="mt-8 font-display text-[30px] font-extrabold leading-none tracking-normal text-navy">{value}</p>
            <p className="mt-1 text-[11px] text-[#9CA3AF]">{sub}</p>
          </div>
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>
            <Icon size={16} strokeWidth={1.5} />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className={up ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600" : "inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600"}>
            <TrendIcon size={11} />
            {trend}
          </span>
          <Sparkline color={color} />
        </div>
      </div>
    </article>
  );
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" height="42" viewBox="0 0 82 42" width="82">
      <polyline fill="none" points="0,30 13,25 26,27 39,20 52,14 65,12 78,8" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function ReachChart({ daily }: { daily: AnalyticsSummary["daily"] }) {
  const points = daily.slice(-7);
  const maxReach = Math.max(...points.map((point) => point.totals.reach), 1);
  const maxPaid = Math.max(...points.map((point) => point.totals.impressions - point.totals.reach), 1);
  const organicPoints = points.map((point, index) => `${index * 118 + 8},${210 - (point.totals.reach / maxReach) * 160}`).join(" ");
  const paidPoints = points.map((point, index) => `${index * 118 + 8},${210 - ((point.totals.impressions - point.totals.reach) / maxPaid) * 120}`).join(" ");

  return (
    <div className="mt-6 overflow-hidden">
      <svg aria-label="Reach trend" className="h-[200px] w-full" preserveAspectRatio="none" viewBox="0 0 740 220">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} stroke="#EEF2F7" strokeDasharray="5 7" x1="0" x2="740" y1={40 + line * 55} y2={40 + line * 55} />
        ))}
        <polyline fill="none" points={organicPoints} stroke="#0F3460" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <polyline fill="none" points={paidPoints} stroke="#E94560" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      </svg>
      <div className="grid grid-cols-7 px-1 text-center text-[11px] font-semibold text-[#9CA3AF]">
        {points.map((point) => (
          <span key={point.dataDate}>{new Date(point.dataDate).toLocaleDateString("en-US", { weekday: "short" })}</span>
        ))}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  summary
}: {
  channel: (typeof channelMeta)[number];
  summary: AnalyticsSummary;
}) {
  const bucket = summary.byMetricType.find((item) => item.metricType === channel.metricType);
  const totals = bucket?.totals ?? emptyTotals();
  const engagementRate = totals.reach === 0 ? 0 : totals.engagement / totals.reach;
  const width = `${Math.min(96, Math.max(12, Math.round(engagementRate * 1000)))}%`;

  return (
    <div className="flex items-center gap-4">
      <MiniRing color={channel.color} platform={channel.platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-bold text-navy">{channel.name}</p>
          <p className="font-extrabold" style={{ color: channel.color }}>{formatPercent(engagementRate)}</p>
        </div>
        <p className="mt-1 text-sm text-muted">{formatCompact("en", totals.followers)} followers - {formatCompact("en", totals.reach)} reach</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ backgroundColor: channel.color, width }} />
        </div>
      </div>
    </div>
  );
}

function MiniRing({ color, platform }: { color: string; platform: "facebook" | "instagram" | "twitter" }) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg className="-rotate-90" height="56" width="56">
        <circle cx="28" cy="28" fill="none" r="21" stroke="#F1F5F9" strokeWidth="6" />
        <circle cx="28" cy="28" fill="none" r="21" stroke={color} strokeDasharray="96 132" strokeLinecap="round" strokeWidth="6" />
      </svg>
      {platform === "facebook" ? <Facebook className="absolute" color={color} size={16} /> : null}
      {platform === "instagram" ? <Instagram className="absolute" color={color} size={16} /> : null}
      {platform === "twitter" ? <Twitter className="absolute" color={color} size={16} /> : null}
    </div>
  );
}

function TopContentRow({
  item,
  locale,
  rank
}: {
  item: AnalyticsSummary["topContent"][number];
  locale: Locale;
  rank: number;
}) {
  const platform = item.contentType === "REEL" || item.contentType === "CAROUSEL" ? "instagram" : item.contentType === "POST" ? "facebook" : "twitter";
  const color = platform === "instagram" ? "#E1306C" : platform === "facebook" ? "#1877F2" : "#374151";

  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-xl border border-slate-100 transition hover:shadow-md">
      <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: color }} />
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}12`, color }}>
        {platform === "instagram" ? <Instagram size={20} /> : null}
        {platform === "facebook" ? <Facebook size={20} /> : null}
        {platform === "twitter" ? <Twitter size={20} /> : null}
      </div>
      <div className="min-w-0 flex-1 py-3">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-bold text-navy">{item.caption ?? text(locale, "untitled")}</p>
          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-extrabold text-accent">#{rank}</span>
        </div>
        <p className="mt-1 text-[11px] text-[#9CA3AF]">
          {item.contentType} - {formatNumber(locale, item.metrics.views)} views - {formatNumber(locale, item.metrics.reach)} reach
        </p>
      </div>
      <div className="hidden pe-4 text-right sm:block">
        <p className="font-extrabold text-emerald-600">{formatPercent(item.metrics.reach === 0 ? 0 : item.engagement / item.metrics.reach)}</p>
        <p className="text-xs text-muted">eng.</p>
      </div>
    </div>
  );
}

function StateBanner({ body, title, tone }: { body: string; title: string; tone: Tone }) {
  const color = toneColor[tone];

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,.04)]" style={{ borderColor: `${color}33` }}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <p className="text-sm font-extrabold text-navy">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-canvas p-5 text-center">
      <p className="text-sm font-bold text-navy">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="mt-6 grid h-[236px] place-items-center rounded-xl border border-dashed border-[#CBD5E1] bg-canvas text-sm font-bold text-muted">
      {label}
    </div>
  );
}

function demoSummary(days: number): AnalyticsSummary {
  const now = new Date("2026-06-14T12:00:00.000Z");
  const daily = Array.from({ length: Math.min(days, 30) }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (Math.min(days, 30) - index - 1));
    const reach = 11800 + index * 860 + Math.round(Math.sin(index / 2) * 4200);
    const engagement = Math.round(reach * (0.042 + (index % 5) * 0.002));

    return {
      dataDate: date.toISOString(),
      totals: {
        comments: Math.round(engagement * 0.08),
        engagement,
        followers: 38492 + index * 18,
        impressions: Math.round(reach * 1.34),
        likes: Math.round(engagement * 0.72),
        reach,
        saves: Math.round(engagement * 0.06),
        shares: Math.round(engagement * 0.14),
        views: Math.round(reach * 0.92)
      }
    };
  });
  const totals = daily.reduce((acc, row) => addTotals(acc, row.totals), emptyTotals());
  const from = daily[0]?.dataDate ?? now.toISOString();
  const to = daily.at(-1)?.dataDate ?? now.toISOString();
  const topContent: AnalyticsSummary["topContent"] = [
    {
      caption: "Ramadan Connectivity Deal",
      contentItemId: "demo-analytics-1",
      contentType: "REEL",
      dataDate: "2026-06-10T18:00:00.000Z",
      engagement: 1210,
      metrics: { comments: 84, engagement: 1210, followers: 24100, impressions: 28000, likes: 918, reach: 23800, saves: 72, shares: 136, views: 22100 }
    },
    {
      caption: "Student Plan Launch",
      contentItemId: "demo-analytics-2",
      contentType: "CAROUSEL",
      dataDate: "2026-06-12T19:30:00.000Z",
      engagement: 1088,
      metrics: { comments: 65, engagement: 1088, followers: 24100, impressions: 25400, likes: 793, reach: 21200, saves: 91, shares: 139, views: 18300 }
    },
    {
      caption: "5G Coverage Map Update",
      contentItemId: "demo-analytics-3",
      contentType: "POST",
      dataDate: "2026-06-11T09:00:00.000Z",
      engagement: 412,
      metrics: { comments: 34, engagement: 412, followers: 11200, impressions: 12600, likes: 297, reach: 10400, saves: 21, shares: 60, views: 9200 }
    }
  ];
  const byMetricType = [
    { metricType: "REEL" as const, totals: { comments: 312, engagement: 3620, followers: 24100, impressions: 84000, likes: 2650, reach: 75400, saves: 224, shares: 434, views: 69200 } },
    { metricType: "POST" as const, totals: { comments: 126, engagement: 934, followers: 11200, impressions: 39800, likes: 631, reach: 30400, saves: 62, shares: 115, views: 27800 } },
    { metricType: "STORY" as const, totals: { comments: 38, engagement: 286, followers: 3200, impressions: 9600, likes: 179, reach: 7100, saves: 11, shares: 58, views: 6400 } },
    { metricType: "ACCOUNT" as const, totals },
    { metricType: "AUDIENCE" as const, totals: { ...totals, engagement: 0, impressions: 0, reach: 0, views: 0 } }
  ];

  return {
    byMetricType,
    daily,
    days,
    from,
    latestSyncedAt: to,
    records: byMetricType.map((bucket, index) => ({
      ...(index < 3 ? { contentItemId: `demo-analytics-${index + 1}` } : {}),
      createdAt: to,
      dataDate: to,
      id: `demo-record-${bucket.metricType}`,
      metricType: bucket.metricType,
      metrics: { ...bucket.totals },
      syncedAt: to,
      updatedAt: to,
      workspaceId: "demo-workspace"
    })),
    to,
    topContent,
    totals
  };
}

function previewAnalyticsLearning(summary: AnalyticsSummary): AnalyticsLearningResult {
  const key = `analytics.performance.${summary.from.slice(0, 10)}.${summary.to.slice(0, 10)}`;
  const top = summary.topContent[0];
  const observations = [
    top
      ? `${top.caption ?? "Top content"} is the strongest recent content signal at ${formatPercent(top.metrics.reach === 0 ? 0 : top.engagement / top.metrics.reach)} engagement.`
      : "No top content was available for this window.",
    `Performance window captured ${summary.records.length} analytics records with reach ${summary.totals.reach}, impressions ${summary.totals.impressions}, and engagement ${summary.totals.engagement}.`
  ];

  return {
    entry: {
      createdAt: summary.to,
      id: "preview-analytics-learning",
      key,
      section: "OBJECTIVES",
      updatedAt: summary.to,
      value: {
        observations,
        source: "preview"
      },
      version: 1,
      workspaceId: "demo-workspace"
    },
    key,
    observations,
    recordCount: summary.records.length,
    topContentCount: summary.topContent.length,
    workspaceId: "demo-workspace"
  };
}

function emptyTotals(): AnalyticsMetricTotals {
  return {
    comments: 0,
    engagement: 0,
    followers: 0,
    impressions: 0,
    likes: 0,
    reach: 0,
    saves: 0,
    shares: 0,
    views: 0
  };
}

function addTotals(left: AnalyticsMetricTotals, right: AnalyticsMetricTotals): AnalyticsMetricTotals {
  return {
    comments: left.comments + right.comments,
    engagement: left.engagement + right.engagement,
    followers: Math.max(left.followers, right.followers),
    impressions: left.impressions + right.impressions,
    likes: left.likes + right.likes,
    reach: left.reach + right.reach,
    saves: left.saves + right.saves,
    shares: left.shares + right.shares,
    views: left.views + right.views
  };
}

function performancePulse(summary: AnalyticsSummary): {
  brandScore: number;
  engagementChangePct: number;
  engagementRate: number;
  impressionChangePct: number;
  reachChangePct: number;
} {
  const midpoint = Math.max(1, Math.floor(summary.daily.length / 2));
  const previous = summary.daily.slice(0, midpoint).reduce((acc, row) => addTotals(acc, row.totals), emptyTotals());
  const recent = summary.daily.slice(midpoint).reduce((acc, row) => addTotals(acc, row.totals), emptyTotals());
  const engagementRate = summary.totals.reach === 0 ? 0 : summary.totals.engagement / summary.totals.reach;

  return {
    brandScore: Math.min(99, Math.max(50, Math.round(72 + engagementRate * 320))),
    engagementChangePct: percentDelta(recent.engagement, previous.engagement),
    engagementRate,
    impressionChangePct: percentDelta(recent.impressions, previous.impressions),
    reachChangePct: percentDelta(recent.reach, previous.reach)
  };
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 1;
  }

  return (current - previous) / previous;
}

function analyticsInsight(locale: Locale, summary: AnalyticsSummary): string {
  const top = summary.topContent[0];
  const pulse = performancePulse(summary);

  if (!top) {
    return text(locale, "emptyBody");
  }

  return locale === "ar"
    ? `${top.caption ?? text(locale, "untitled")} يقود الأداء حاليا بمعدل تفاعل ${formatPercent(top.metrics.reach === 0 ? 0 : top.engagement / top.metrics.reach)}. حافظ على نافذة النشر بين 5:30 و7:00 مساء، ثم احفظ هذه النتيجة في الخزنة حتى تتحسن توصيات المحتوى القادمة.`
    : `${top.caption ?? text(locale, "untitled")} is leading recent performance at ${formatPercent(top.metrics.reach === 0 ? 0 : top.engagement / top.metrics.reach)} engagement. Keep the next publishing window between 5:30-7:00 PM, then save this learning to the Vault so future content improves.`;
}

function selectedMonth(summary: AnalyticsSummary): string {
  const date = new Date(summary.to);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatConsultantOutput(output: Record<string, unknown>): string {
  if (typeof output.summary === "string") {
    return output.summary;
  }

  return Object.entries(output)
    .map(([key, value]) => `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`)
    .join("\n");
}

function formatCompact(locale: Locale | "en", value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 1000) / 10;

  if (rounded === 0) {
    return "0%";
  }

  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatDateRange(locale: Locale, from: string, to: string): string {
  return `${new Date(from).toLocaleDateString(locale)} - ${new Date(to).toLocaleDateString(locale)}`;
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      acrossChannels: "عبر كل القنوات",
      aiInsight: "رؤية MARKOS",
      answerReady: "الإجابة جاهزة",
      applyNow: "طبق الآن",
      ask: "اسأل",
      askTitle: "اسأل عن الأداء",
      avgEngRate: "متوسط التفاعل",
      brandHealth: "صحة العلامة",
      channelPerformance: "أداء القنوات",
      connectionNeeded: "اتصال إنستغرام يحتاج انتباه",
      connectionNeededBody: "اربط حساب إنستغرام التجاري لتفعيل المزامنة الحية.",
      digestReady: "ملخص التحليلات جاهز",
      downloadPdf: "تحميل PDF",
      emailPdf: "إرسال بالبريد",
      emailSent: "تم إرسال التقرير",
      emailSkipped: "تم تخطي الإرسال",
      emptyBody: "لا توجد بيانات حية بعد. ابدأ بالمزامنة أو اربط القناة لعرض الأداء.",
      emptyTitle: "لا توجد بيانات متزامنة",
      engRate: "معدل التفاعل",
      engagement: "التفاعل",
      engagementByPlatform: "معدل التفاعل حسب القناة",
      engagements: "التفاعلات",
      excellent: "ممتاز",
      followers: "المتابعون",
      generateDigest: "توليد ملخص",
      groundedLive: "مبنية على بيانات حية",
      impressions: "الظهور",
      learningEvidence: "دليل التعلم في الخزنة",
      learningLoopReady: "هذه الرؤية جاهزة للحفظ كتعلم أداء حتى يستخدمها المحتوى والاستراتيجية القادمة.",
      learningLoopTitle: "حلقة التعلم إلى الخزنة",
      learningPreviewSaved: "تم حفظ تعلم معاينة في الخزنة.",
      learningSaved: "تم حفظ التعلم",
      likesCommentsShares: "إعجابات - تعليقات - مشاركات",
      liveWorkspace: "بيانات حية",
      loading: "تحميل التحليلات...",
      organic: "عضوي",
      organicPaid: "عضوي مقابل مدفوع - آخر فترة",
      paid: "مدفوع",
      paidOrganic: "مدفوع وعضوي",
      pdfReady: "ملف PDF جاهز",
      previewMode: "وضع المعاينة",
      previewOnly: "هذا إجراء معاينة حتى يتم تسجيل الدخول.",
      previewWorkspace: "معاينة",
      questionPlaceholder: "اسأل عن أفضل محتوى أو وقت نشر...",
      questionTooShort: "اكتب سؤالا أطول.",
      rankedByEngagement: "مرتبة حسب التفاعل",
      range: "الفترة",
      reach: "الوصول",
      reachTrend: "اتجاه الوصول الأسبوعي",
      records: "السجلات",
      refresh: "تحديث",
      requestFailed: "فشل الطلب",
      save: "حفظ",
      saveLearning: "حفظ في الخزنة",
      savedToVault: "تم الحفظ في الخزنة",
      sevenDays: "7 أيام",
      status: "الحالة",
      sync: "مزامنة",
      syncComplete: "اكتملت المزامنة",
      thirtyDays: "30 يوم",
      title: "Analytics",
      topContent: "أفضل محتوى",
      topPosts: "أفضل المنشورات",
      totalReach: "إجمالي الوصول",
      untitled: "محتوى بدون عنوان",
      viewQueue: "عرض الجدول",
      vsLastPeriod: "مقارنة بالفترة السابقة",
      ninetyDays: "90 يوم"
    },
    en: {
      acrossChannels: "across all channels",
      aiInsight: "AI Insight",
      answerReady: "Analytics answer ready",
      applyNow: "Apply Now",
      ask: "Ask",
      askTitle: "Ask MARKOS Analytics",
      avgEngRate: "Overall avg. eng. rate",
      brandHealth: "Brand Health",
      channelPerformance: "Channel Performance",
      connectionNeeded: "Instagram connection needs attention",
      connectionNeededBody: "Connect a business Instagram account to enable live sync.",
      digestReady: "Analytics digest ready",
      downloadPdf: "Download PDF",
      emailPdf: "Email PDF",
      emailSent: "Analytics report emailed",
      emailSkipped: "Email delivery skipped",
      emptyBody: "No live analytics have been synced yet. Sync or connect a channel to show performance.",
      emptyTitle: "No synced analytics yet",
      engRate: "Avg. eng. rate",
      engagement: "Engagement",
      engagementByPlatform: "Engagement rate by platform",
      engagements: "Engagements",
      excellent: "Excellent up",
      followers: "Followers",
      generateDigest: "Generate digest",
      groundedLive: "Grounded in live data",
      impressions: "Impressions",
      learningEvidence: "Vault learning evidence",
      learningLoopReady: "This insight is ready to be saved as a performance learning for the next content and strategy cycle.",
      learningLoopTitle: "Learning loop to Vault",
      learningPreviewSaved: "Preview learning saved to the Vault.",
      learningSaved: "Analytics learning saved",
      likesCommentsShares: "likes - comments - shares",
      liveWorkspace: "Live workspace",
      loading: "Loading analytics...",
      organic: "Organic",
      organicPaid: "Organic vs Paid - current range",
      paid: "Paid",
      paidOrganic: "paid and organic",
      pdfReady: "Analytics PDF ready",
      previewMode: "Preview mode",
      previewOnly: "This action is preview-only until you sign in.",
      previewWorkspace: "Preview workspace",
      questionPlaceholder: "Ask about best content or publishing windows...",
      questionTooShort: "Write a longer question.",
      rankedByEngagement: "Ranked by engagement",
      range: "Date range",
      reach: "Reach",
      reachTrend: "Weekly Reach Trend",
      records: "Records",
      refresh: "Refresh",
      requestFailed: "Request failed",
      save: "Save",
      saveLearning: "Save learning",
      savedToVault: "Saved to Vault",
      sevenDays: "7 days",
      status: "Status",
      sync: "Sync analytics",
      syncComplete: "Analytics sync complete",
      thirtyDays: "30 days",
      title: "Analytics",
      topContent: "Top Content",
      topPosts: "Top posts",
      totalReach: "Total Reach",
      untitled: "Untitled content",
      viewQueue: "View Queue",
      vsLastPeriod: "vs last period",
      ninetyDays: "90 days"
    }
  };

  return dictionary[locale][key] ?? key;
}
