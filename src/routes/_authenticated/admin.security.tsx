import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Shield, ShieldCheck, ShieldOff, KeyRound, Smartphone, RefreshCw,
  Monitor, MapPin, LogOut, History, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import {
  getTwoFactorStatus,
  beginTwoFactorEnrollment,
  confirmTwoFactorEnrollment,
  disableTwoFactor,
  regenerateBackupCodes,
  listMySessions,
  revokeSession,
  listMyLoginAttempts,
} from "@/lib/security.functions";
import { bulkResetMemberPasswords } from "@/lib/admin-bulk-password.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/security")({
  component: SecurityCenterPage,
});

function SecurityCenterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          安全中心
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          兩步驟驗證、登入裝置管理與登入紀錄稽核
        </p>
      </div>

      <Tabs defaultValue="2fa" className="w-full">
        <TabsList>
          <TabsTrigger value="2fa">2FA 雙重驗證</TabsTrigger>
          <TabsTrigger value="sessions">登入裝置</TabsTrigger>
          <TabsTrigger value="history">登入紀錄</TabsTrigger>
          <TabsTrigger value="bulk">批次密碼</TabsTrigger>
        </TabsList>
        <TabsContent value="2fa" className="mt-6">
          <TwoFactorPanel />
        </TabsContent>
        <TabsContent value="sessions" className="mt-6">
          <SessionsPanel />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <LoginHistoryPanel />
        </TabsContent>
        <TabsContent value="bulk" className="mt-6">
          <BulkPasswordPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== 2FA Panel ==============
function TwoFactorPanel() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => getTwoFactorStatus(),
  });

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");

  async function startEnroll() {
    setCode("");
    setBackupCodes(null);
    try {
      const res = await beginTwoFactorEnrollment();
      setSecret(res.secret);
      const url = await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 220 });
      setQrDataUrl(url);
      setEnrollOpen(true);
    } catch (err: any) {
      toast.error(err.message ?? "註冊失敗");
    }
  }

  const confirmMut = useMutation({
    mutationFn: () => confirmTwoFactorEnrollment({ data: { code } }),
    onSuccess: (res) => {
      setBackupCodes(res.backupCodes);
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("2FA 已啟用");
    },
    onError: (e: any) => toast.error(e.message ?? "驗證失敗"),
  });

  const disableMut = useMutation({
    mutationFn: () => disableTwoFactor({ data: { code: disableCode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("2FA 已停用");
      setDisableOpen(false);
      setDisableCode("");
    },
    onError: (e: any) => toast.error(e.message ?? "停用失敗"),
  });

  const regenMut = useMutation({
    mutationFn: () => regenerateBackupCodes(),
    onSuccess: (res) => {
      setBackupCodes(res.backupCodes);
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("已重新產生備援碼");
    },
    onError: (e: any) => toast.error(e.message ?? "失敗"),
  });

  if (isLoading) return <div className="text-muted-foreground">載入中...</div>;

  const enabled = !!status?.enabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            TOTP 雙重驗證
          </span>
          {enabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              <ShieldCheck className="h-3 w-3 mr-1" /> 已啟用
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <ShieldOff className="h-3 w-3 mr-1" /> 未啟用
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          支援 Google Authenticator / Microsoft Authenticator / 1Password 等 TOTP 驗證器 App
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">註冊時間</div>
              <div>{status?.enrolledAt ? new Date(status.enrolledAt).toLocaleString() : "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">最後使用</div>
              <div>{status?.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">剩餘備援碼</div>
              <div className="font-mono">{status?.backupCodesRemaining ?? 0} 組</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {!enabled ? (
            <Button onClick={startEnroll} className="bg-gradient-primary">
              <Shield className="h-4 w-4 mr-2" /> 啟用 2FA
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                <RefreshCw className="h-4 w-4 mr-2" /> 重新產生備援碼
              </Button>
              <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                <ShieldOff className="h-4 w-4 mr-2" /> 停用 2FA
              </Button>
            </>
          )}
        </div>
      </CardContent>

      {/* Enroll Dialog */}
      <Dialog open={enrollOpen} onOpenChange={(o) => { setEnrollOpen(o); if (!o) { setBackupCodes(null); setQrDataUrl(null); setSecret(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{backupCodes ? "請妥善保存備援碼" : "註冊驗證器"}</DialogTitle>
            <DialogDescription>
              {backupCodes
                ? "這 10 組備援碼僅顯示一次。每組僅可使用一次，請列印或存放於密碼管理器。"
                : "使用驗證器 App 掃描 QR Code，或手動輸入密鑰。"}
            </DialogDescription>
          </DialogHeader>

          {!backupCodes && qrDataUrl && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="2FA QR" className="rounded-lg ring-1 ring-border bg-white p-2" />
              </div>
              {secret && (
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">手動輸入密鑰</div>
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">{secret}</code>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="enroll-code">驗證器顯示的 6 位數驗證碼</Label>
                <Input
                  id="enroll-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
            </div>
          )}

          {backupCodes && (
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((c) => (
                <div key={c} className="px-3 py-2 rounded-md bg-muted text-center tracking-wider">{c}</div>
              ))}
            </div>
          )}

          <DialogFooter>
            {!backupCodes ? (
              <>
                <Button variant="ghost" onClick={() => setEnrollOpen(false)}>取消</Button>
                <Button
                  onClick={() => confirmMut.mutate()}
                  disabled={code.length !== 6 || confirmMut.isPending}
                  className="bg-gradient-primary"
                >
                  {confirmMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  驗證並啟用
                </Button>
              </>
            ) : (
              <Button onClick={() => { setEnrollOpen(false); setBackupCodes(null); }}>我已保存</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>停用 2FA</DialogTitle>
            <DialogDescription>請輸入驗證器或備援碼以確認身份。</DialogDescription>
          </DialogHeader>
          <Input
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="123456 或 XXXXX-XXXXX"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => disableMut.mutate()}
              disabled={disableCode.length < 6 || disableMut.isPending}
            >
              {disableMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              確認停用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============== Sessions Panel ==============
function SessionsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-sessions"],
    queryFn: () => listMySessions(),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeSession({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-sessions"] });
      toast.success("已登出該裝置");
    },
    onError: (e: any) => toast.error(e.message ?? "失敗"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" /> 登入裝置 ({data?.length ?? 0})
        </CardTitle>
        <CardDescription>顯示您帳號最近登入的裝置與 IP，可遠端登出可疑裝置。</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground">載入中...</div>
        ) : !data?.length ? (
          <div className="text-muted-foreground text-sm py-8 text-center">尚無裝置紀錄</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>裝置 / User-Agent</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>最後活動</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s: any) => {
                const revoked = !!s.revoked_at;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[300px]">
                      <div className="text-sm truncate" title={s.user_agent ?? ""}>
                        {s.device_label ?? shortUA(s.user_agent)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{s.ip_address ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.mfa_verified_at ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">已驗證</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">未驗證</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{new Date(s.last_active_at).toLocaleString()}</TableCell>
                    <TableCell>
                      {revoked
                        ? <Badge variant="destructive">已登出</Badge>
                        : <Badge className="bg-primary/15 text-primary border-primary/30">使用中</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revoked || revokeMut.isPending}
                        onClick={() => revokeMut.mutate(s.id)}
                      >
                        <LogOut className="h-3 w-3 mr-1" /> 登出
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function shortUA(ua: string | null) {
  if (!ua) return "未知裝置";
  if (/iPhone|iPad/.test(ua)) return "iOS 裝置";
  if (/Android/.test(ua)) return "Android 裝置";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 40);
}

// ============== Login History Panel ==============
function LoginHistoryPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-login-history"],
    queryFn: () => listMyLoginAttempts(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" /> 登入紀錄（最近 50 筆）
        </CardTitle>
        <CardDescription>包含成功與失敗的登入嘗試，便於發現可疑活動。</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground">載入中...</div>
        ) : !data?.length ? (
          <div className="text-muted-foreground text-sm py-8 text-center">尚無紀錄</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>結果</TableHead>
                <TableHead>失敗原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{a.email}</TableCell>
                  <TableCell className="font-mono text-xs">{a.ip_address ?? "-"}</TableCell>
                  <TableCell>
                    {a.success ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> 成功
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" /> 失敗
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.failure_reason ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============== Bulk Password Panel ==============
function BulkPasswordPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ id: string; message: string }>;
  } | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await bulkResetMemberPasswords();
      setResult(res as any);
      toast.success(`完成：更新 ${res.updated} / 總 ${res.total}，失敗 ${res.failed}`);
    } catch (e: any) {
      toast.error(e?.message ?? "執行失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          批次重設一般會員密碼
        </CardTitle>
        <CardDescription>
          將所有 <b>role = member</b> 且有 <b>marketing_slug</b> 的會員密碼重設為 <code>st</code> + 行銷網址代稱。
          沒有 marketing_slug 的會員會被跳過。此動作不可復原。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={running}>
              {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              開始批次重設
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認執行批次密碼重設？</AlertDialogTitle>
              <AlertDialogDescription>
                即將把所有一般會員 (role=member) 的密碼改為 <code>st</code> + 該會員的 marketing_slug。
                預估會更新數千筆，請確認已通知會員後再執行。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={run}>確認執行</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {result && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
            <div>總目標筆數：<b>{result.total}</b></div>
            <div>成功更新：<b className="text-green-600">{result.updated}</b></div>
            <div>跳過（無 slug）：<b>{result.skipped}</b></div>
            <div>失敗：<b className={result.failed ? "text-red-600" : ""}>{result.failed}</b></div>
            {result.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  顯示前 {result.errors.length} 筆錯誤
                </summary>
                <ul className="mt-2 text-xs space-y-1 max-h-60 overflow-auto">
                  {result.errors.map((e, i) => (
                    <li key={i} className="font-mono">
                      {e.id.slice(0, 8)}…: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
