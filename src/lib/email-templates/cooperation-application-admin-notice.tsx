import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  applicationType?: string;
  typeLabel?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  city?: string;
  salesChannels?: string;
  note?: string;
  adminUrl?: string;
  submittedAt?: string;
}

const TYPE_LABELS: Record<string, string> = {
  dealer: "經銷商申請",
  reseller: "個人代銷申請",
  vip: "VIP 會員申請",
};

const Email = ({
  applicationType = "dealer",
  typeLabel,
  displayName = "未填寫",
  phone = "-",
  email = "-",
  lineId,
  city,
  salesChannels,
  note,
  adminUrl = "https://winerp.app/admin/cooperation-applications",
  submittedAt,
}: Props) => {
  const label = typeLabel ?? TYPE_LABELS[applicationType] ?? applicationType;
  return (
    <Html lang="zh-Hant" dir="ltr">
      <Head />
      <Preview>新的合作申請：{label} — {displayName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>新的合作申請</Heading>
          <Text style={badge}>{label}</Text>

          <Section style={card}>
            <Row label="姓名 / 公司" value={displayName} />
            <Row label="聯絡電話" value={phone} />
            <Row label="Email" value={email} />
            {lineId && <Row label="LINE ID" value={lineId} />}
            {city && <Row label="所在縣市" value={city} />}
            {salesChannels && <Row label="銷售平台 / 通路" value={salesChannels} />}
            {submittedAt && <Row label="送出時間" value={submittedAt} />}
          </Section>

          {note && (
            <Section style={noteBox}>
              <Text style={noteLabel}>備註</Text>
              <Text style={noteText}>{note}</Text>
            </Section>
          )}

          <Hr style={hr} />

          <Section style={{ textAlign: "center" as const, padding: "12px 0" }}>
            <Link href={adminUrl} style={button}>
              前往後台查看
            </Link>
          </Section>

          <Text style={footer}>
            此為系統自動發送的申請通知，請勿直接回覆。
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={row}>
      <Text style={rowLabel}>{label}</Text>
      <Text style={rowValue}>{value}</Text>
    </div>
  );
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const label =
      data.typeLabel ?? TYPE_LABELS[data.applicationType] ?? "合作申請";
    const name = data.displayName ?? "";
    return `【合作申請】${label}${name ? ` — ${name}` : ""}`;
  },
  displayName: "合作申請 – 管理員通知",
  previewData: {
    applicationType: "dealer",
    typeLabel: "經銷商申請",
    displayName: "示範公司股份有限公司",
    phone: "0912-345-678",
    email: "demo@example.com",
    lineId: "demo-line",
    city: "台北市",
    salesChannels: "Facebook、Instagram",
    note: "希望能了解代理條件與批發價格。",
    adminUrl: "https://winerp.app/admin/cooperation-applications",
    submittedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };
const container = { padding: "32px 24px", maxWidth: "560px", margin: "0 auto" };
const h1 = { fontSize: "22px", fontWeight: 700, color: "#0e1626", margin: "0 0 8px" };
const badge = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: "999px",
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: "13px",
  fontWeight: 600,
  margin: "0 0 20px",
};
const card = { background: "#f8fafc", borderRadius: "12px", padding: "16px 20px", border: "1px solid #e2e8f0" };
const row = { display: "flex" as const, justifyContent: "space-between" as const, gap: "12px", padding: "6px 0", borderBottom: "1px solid #e2e8f0" };
const rowLabel = { color: "#64748b", fontSize: "13px", margin: 0 };
const rowValue = { color: "#0e1626", fontSize: "14px", fontWeight: 600, margin: 0, textAlign: "right" as const };
const noteBox = { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "12px 16px", marginTop: "16px" };
const noteLabel = { color: "#9a3412", fontSize: "12px", fontWeight: 600, margin: "0 0 4px" };
const noteText = { color: "#7c2d12", fontSize: "14px", margin: 0, whiteSpace: "pre-wrap" as const };
const hr = { borderColor: "#e2e8f0", margin: "24px 0" };
const button = {
  display: "inline-block",
  background: "linear-gradient(90deg,#f59e0b,#ea580c)",
  color: "#ffffff",
  padding: "12px 28px",
  borderRadius: "999px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "14px",
};
const footer = { color: "#94a3b8", fontSize: "12px", textAlign: "center" as const, margin: "16px 0 0" };
