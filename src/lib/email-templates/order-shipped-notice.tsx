import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  customerName?: string
  orderNo?: string
  shippedAt?: string
  shippingCompany?: string
  trackingNo?: string
  pickupStore?: string
  shippingAddress?: string
}

const Email = ({
  customerName,
  orderNo,
  shippedAt,
  shippingCompany,
  trackingNo,
  pickupStore,
  shippingAddress,
}: Props) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>光禾館源晶已完成您的訂單{orderNo ? ` ${orderNo}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>光禾館源晶已完成您的訂單</Heading>
        <Text style={p}>{customerName ? `${customerName} 您好，` : '您好，'}</Text>
        <Text style={p}>
          您的訂單{orderNo ? `（訂單編號：${orderNo}）` : ''}已完成出貨，感謝您的支持。
        </Text>
        <Section style={box}>
          {shippedAt ? <Text style={row}>出貨時間：{shippedAt}</Text> : null}
          {shippingCompany ? <Text style={row}>配送方式：{shippingCompany}</Text> : null}
          {trackingNo ? <Text style={row}>物流單號：{trackingNo}</Text> : null}
          {pickupStore ? <Text style={row}>取件門市：{pickupStore}</Text> : null}
          {shippingAddress ? <Text style={row}>收件地址：{shippingAddress}</Text> : null}
        </Section>
        <Text style={p}>如有任何問題，歡迎直接回覆此信或聯繫客服。</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `光禾館源晶已完成您的訂單${data?.orderNo ? ` ${data.orderNo}` : ''}`,
  displayName: '訂單出貨完成通知',
  previewData: {
    customerName: '王小明',
    orderNo: 'SO-20260101-00001',
    shippedAt: '2026-01-01 14:00',
    shippingCompany: '黑貓宅急便',
    trackingNo: '123456789',
    shippingAddress: '台北市中正區某某路 1 號',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, "Noto Sans TC", sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', color: '#111827' }
const p = { fontSize: '14px', color: '#374151', lineHeight: '22px' }
const box = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '16px 0',
}
const row = { fontSize: '14px', color: '#111827', margin: '4px 0' }
