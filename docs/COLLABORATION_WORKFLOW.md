# ChatGPT / Codex / Lovable Collaboration Workflow

Project: winerpapp / 源晶ERP

GitHub repo: https://github.com/St1524-crypto/winerpapp

Production URL: https://winerp.app

Lovable project: https://lovable.dev/projects/8759c219-ed53-49ec-b52a-60a002da48ec

Production Supabase project ref: wvhvjdqbrftjggwwetwf

Staging Supabase project ref: phqnldqejtaisjsecesv

Main branch: main

## Ground Rules

- Do not display secrets.
- Do not put service role keys or server secrets in the frontend bundle.
- Do not force push.
- Do not directly operate on the production database.
- Verify on staging before production.
- Do not stage `.env` or `.env.staging`.
- If `src/routeTree.gen.ts` changes after build and it is not part of the task, restore it before commit.
- If there is a conflict or uncertainty, stop and report before continuing.

## Roles

ChatGPT:
- Discuss requirements.
- Analyze risks.
- Suggest decisions.
- Draft SOPs, GitHub issues, and PR descriptions.

Codex:
- Read the repo.
- Diagnose current behavior.
- Implement approved changes.
- Run build and secret scan.
- Commit, push, and verify staging or production when requested.

Lovable:
- Manage environment variables and secrets.
- Deploy staging.
- Publish production.
- Confirm deployment id and commit sha.

## Operating Flow

1. Engineering setup
2. Requirement intake / issue creation
3. Codex diagnosis
4. ChatGPT discussion and decision
5. Codex implementation / commit
6. Push GitHub
7. Lovable staging deploy
8. Staging verification
9. Production approval
10. Lovable production publish
11. Production verification
12. Post-launch monitoring / next iteration

## Codex Diagnosis Prompt

```text
請先做診斷，不修改程式碼，不建立 commit。

目標：
【填寫需求或問題】

請回報：
A. 現況
B. 缺口
C. 風險
D. 最小安全方案
E. 需要修改檔案
F. 是否需要 migration
G. 建議 commit 拆分
H. 給 ChatGPT 的討論摘要
```

## ChatGPT Decision Prompt

```text
請根據 Codex 診斷結果進行討論。

請回報：
A. 建議方案
B. 風險
C. 需要避免的事
D. 實作優先順序
E. 可交給 Codex 執行的明確指令
```

## Codex Implementation Prompt

```text
ChatGPT 已確認，請 Codex 開始實作。

決策如下：
【貼上決策】

commit message：
feat/fix/refactor: xxx

限制：
1. 不修改無關檔案
2. 不修改 production 設定
3. 不顯示 secret
4. 不把 secret 放進前端 bundle
5. 不 stage .env / .env.staging
6. 不 force push
7. build 後若 src/routeTree.gen.ts 自動變更，請 restore，不納入 commit
8. 若有 conflict 或不確定，先停下回報

驗證：
1. npm run build 成功
2. dist/client secret scan 無命中
3. git diff 只包含本階段相關檔案

完成後：
A. 修改檔案清單
B. build 結果
C. secret scan 結果
D. 是否修改 DB / RPC / 核心流程
E. commit hash
F. 給 ChatGPT / Lovable 的下一步摘要
```

## Lovable Deploy Prompt

```text
請在 Lovable 執行 staging deploy。

目標 commit：
【填寫 commit sha】

要求：
1. 不顯示 secret
2. 確認 server runtime env 已設定
3. 確認 staging 使用 staging Supabase project
4. 回報 deployment id
5. 回報線上 commit sha
```

## Production Approval Checklist

- Staging URL 可開啟。
- Staging commit sha 正確。
- 目標功能通過 staging 驗證。
- 權限驗證通過。
- Cron/API auth 驗證通過。
- DB schema/migration 已確認。
- No secret in frontend bundle.
- GitHub main 已包含目標 commit。
- 已取得 production publish approval。

