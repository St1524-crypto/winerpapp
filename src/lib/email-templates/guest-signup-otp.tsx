import * as React from 'react'
import { Body, Container, Head, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  code?: string
}

const Email = ({ code }: Props) => (
  <Html lang="zh-TW" dir="ltr">
    <Head />
    <Preview>會員註冊驗證碼</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={label}>您的會員註冊驗證碼是：</Text>
        <Text style={codeStyle}>{code ?? '------'}</Text>
        <Text style={hint}>此驗證碼 10 分鐘內有效。若非本人操作請忽略本信。</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: '【源晶商城】會員註冊驗證碼',
  displayName: '會員註冊驗證碼',
  previewData: { code: '123456' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'sans-serif', lineHeight: '1.6' }
const container = { padding: '20px 25px' }
const label = { color: '#0f172a', fontSize: '15px' }
const codeStyle = {
  fontSize: '24px',
  fontWeight: 'bold',
  letterSpacing: '4px',
  color: '#0f172a',
}
const hint = { color: '#64748b', fontSize: '13px' }
