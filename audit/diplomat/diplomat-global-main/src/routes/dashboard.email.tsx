import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Send,
  History,
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Upload,
  Users,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import {
  adminGetServiceStatus,
  adminSendEmail,
  adminListEmailHistory,
  adminListRecipients,
  adminImportContacts,
  adminSendMarketingEmail,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/email")({
  head: () => ({
    meta: [
      { title: "Email — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EmailPage,
});

type Tab = "compose" | "marketing" | "recipients" | "import" | "history";

function EmailPage() {
  const [status, setStatus] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<Tab>("compose");
  const [sending, setSending] = useState(false);

  // Compose state
  const [form, setForm] = useState({ to: "", subject: "", body: "" });

  // Marketing state
  const [marketingForm, setMarketingForm] = useState({ subject: "", body: "" });
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectAll, setSelectAll] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // Recipients list
  const [allRecipients, setAllRecipients] = useState<any[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);

  /** Check if a recipient is eligible for marketing (not opted-out/suppressed) */
  const isEligible = (r: any) => r.marketing_consent !== false && !r.suppressed;

  // Import state
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchStatus = useServerFn(adminGetServiceStatus);
  const sendEmail = useServerFn(adminSendEmail);
  const fetchHistory = useServerFn(adminListEmailHistory);
  const fetchRecipients = useServerFn(adminListRecipients);
  const importContacts = useServerFn(adminImportContacts);
  const sendMarketing = useServerFn(adminSendMarketingEmail);

  useEffect(() => {
    fetchStatus().then((res) => {
      if (res.status) setStatus(res.status);
    });
    loadHistory();
    loadRecipients();
  }, []);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch]);
  useEffect(() => {
    loadHistory();
  }, [historyPage, historySearch]);
  useEffect(() => {
    setRecipientPage(1);
  }, [recipientSearch]);
  useEffect(() => {
    loadRecipients();
  }, [recipientPage, recipientSearch]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const res = await fetchHistory({
      data: { search: historySearch, page: historyPage, pageSize: 10 },
    });
    setHistory(res.logs || []);
    setHistoryTotal(res.total || 0);
    setLoadingHistory(false);
  };

  const loadRecipients = async () => {
    const res = await fetchRecipients({
      data: { search: recipientSearch, page: recipientPage, pageSize: 10 },
    });
    setAllRecipients(res.recipients || []);
    setRecipientTotal(res.total || 0);
    // Select all opted-in by default
    const opted = (res.recipients || [])
      .filter((r: any) => r.marketing_consent)
      .map((r: any) => r.email);
    setSelectedEmails(new Set(opted));
  };

  const handleSend = async () => {
    if (!form.to || !form.subject || !form.body) {
      toast.error("All fields are required");
      return;
    }
    setSending(true);
    const res = await sendEmail({ data: form });
    if (res.ok) {
      toast.success("Email sent successfully");
      setForm({ to: "", subject: "", body: "" });
      loadHistory();
    } else toast.error(res.message || "Email failed to send");
    setSending(false);
  };

  const handleBulkSend = async () => {
    if (!marketingForm.subject || !marketingForm.body) {
      toast.error("Subject and body are required");
      return;
    }
    const selected = allRecipients.filter((r) => selectedEmails.has(r.email));
    if (selected.length === 0) {
      toast.error("No recipients selected");
      return;
    }
    setSending(true);
    const res = await sendMarketing({
      data: {
        recipients: selected.map((r) => ({ email: r.email, first_name: r.first_name })),
        subject: marketingForm.subject,
        body: marketingForm.body,
      },
    });
    if (res.ok) {
      toast.success(res.message);
      setMarketingForm({ subject: "", body: "" });
      loadHistory();
    } else toast.error(res.message);
    setSending(false);
  };

  const toggleRecipient = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  const MAX_ROWS = 5000;

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellStyles: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Formula cells: xlsx parser returns computed values (not formulas) by default.
      // Macros/scripts are NOT executed — xlsx is a pure data parser.
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: false });
      if (rows.length > MAX_ROWS) {
        toast.error(`File has ${rows.length} rows. Maximum is ${MAX_ROWS}. Please split the file.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setImportPreview(rows as any[]);
      setImportResults(null);
      setActiveTab("import");
    } catch (err: any) {
      toast.error("Failed to parse file: " + (err.message || "Unknown error"));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;
    const res = await importContacts({ data: { rows: importPreview } });
    setImportResults(res);
    if (res.ok) {
      toast.success(
        `Imported ${res.imported} contacts${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}`,
      );
      setImportPreview(null);
      loadRecipients();
    } else {
      toast.error(res.message);
    }
  };

  const selectedCount = allRecipients.filter((r) => selectedEmails.has(r.email)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Resend for transactional emails. Brevo for marketing campaigns.
        </p>
      </div>

      {/* Provider Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Resend</p>
                  <p className="text-xs text-gray-500">Transactional (receipts, orders)</p>
                </div>
              </div>
              <Badge
                className={
                  status.resend
                    ? status.resend_domain_verified
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }
              >
                {status.resend ? (
                  status.resend_domain_verified ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" /> Ready
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" /> Domain unverified
                    </>
                  )
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" /> Not configured
                  </>
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Send className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Brevo</p>
                  <p className="text-xs text-gray-500">Marketing campaigns</p>
                </div>
              </div>
              <Badge
                className={
                  status.brevo?.configured && status.brevo?.operational
                    ? "bg-green-100 text-green-800"
                    : status.brevo?.configured
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                }
              >
                {status.brevo?.configured && status.brevo?.operational ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" /> Ready
                  </>
                ) : status.brevo?.configured ? (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" /> Sender not verified
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" /> Not configured
                  </>
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 pb-0 overflow-x-auto">
        {(
          [
            ["compose", "Compose", Mail],
            ["marketing", "Marketing", Send],
            ["recipients", "Recipients", Users],
            ["import", "Import", FileSpreadsheet],
            ["history", `History (${historyTotal})`, History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as Tab)}
            className={`px-3 py-2 text-sm font-medium transition border-b-2 whitespace-nowrap ${activeTab === key ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Icon className="h-4 w-4 inline mr-1" /> {label}
          </button>
        ))}
      </div>

      {/* COMPOSE TAB */}
      {activeTab === "compose" && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Compose Email
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                To *
                <input
                  type="email"
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  placeholder="customer@example.com"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Subject *
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Subject line"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Body *
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  placeholder="Email content..."
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSend}
                disabled={sending}
                className="bg-[#0891b2] text-white hover:bg-[#0e7490] border-none font-medium disabled:opacity-50"
              >
                <Send className="h-4 w-4 mr-1" /> {sending ? "Sending..." : "Send Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MARKETING TAB */}
      {activeTab === "marketing" && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Marketing Campaign
              </h2>
              <span className="text-sm text-gray-500">
                {selectedCount} recipient{selectedCount !== 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4 text-sm text-blue-700 dark:text-blue-300">
              Uses <strong>Brevo</strong> for delivery. Personalize with{" "}
              <code>{"{{first_name}}"}</code> and <code>{"{{full_name}}"}</code>. Default recipient
              = all opted-in contacts.
            </div>
            <div className="grid grid-cols-1 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Subject *
                <input
                  type="text"
                  value={marketingForm.subject}
                  onChange={(e) => setMarketingForm({ ...marketingForm, subject: e.target.value })}
                  placeholder="Campaign subject line"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Body *
                <textarea
                  value={marketingForm.body}
                  onChange={(e) => setMarketingForm({ ...marketingForm, body: e.target.value })}
                  rows={10}
                  placeholder="Hi {{first_name}},\n\nWe have exciting news..."
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleBulkSend}
                disabled={sending || selectedCount === 0}
                className="bg-[#0891b2] text-white hover:bg-[#0e7490] border-none font-medium disabled:opacity-50"
              >
                <Send className="h-4 w-4 mr-1" />{" "}
                {sending ? "Sending..." : `Send to ${selectedCount}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RECIPIENTS TAB */}
      {activeTab === "recipients" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <span className="text-sm text-gray-500">{recipientTotal} contacts</span>
          </div>
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={
                            selectAll &&
                            allRecipients.every(
                              (r) => !isEligible(r) || selectedEmails.has(r.email),
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Only select eligible (not opted-out) recipients
                              setSelectedEmails(
                                new Set(
                                  allRecipients.filter((r) => isEligible(r)).map((r) => r.email),
                                ),
                              );
                              setSelectAll(true);
                            } else {
                              setSelectedEmails(new Set());
                              setSelectAll(false);
                            }
                          }}
                          className="accent-brand"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                        Phone
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Source
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Consent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {allRecipients.map((r: any) => {
                      const eligible = isEligible(r);
                      return (
                        <tr
                          key={r.email}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition ${!eligible ? "opacity-50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedEmails.has(r.email)}
                              disabled={!eligible}
                              onChange={() => toggleRecipient(r.email)}
                              className="accent-brand"
                              title={!eligible ? "This recipient has opted out of marketing" : ""}
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">
                            {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.email}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                            {r.phone || "—"}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px]">
                              {r.source}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {eligible ? (
                              <Badge className="bg-green-100 text-green-800 text-[10px]">
                                <Check className="h-3 w-3 mr-1" /> Opted in
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">
                                Unsubscribed
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {allRecipients.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No contacts yet</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Pagination
            page={recipientPage}
            totalItems={recipientTotal}
            pageSize={10}
            onPageChange={setRecipientPage}
          />
        </div>
      )}

      {/* IMPORT TAB */}
      {activeTab === "import" && (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileImport}
            className="hidden"
          />
          <Card className="bg-white dark:bg-[#1a1a1e]">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Import Contacts
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Upload a .csv or .xlsx file with columns: First Name, Last Name, Email, Phone,
                State, LGA, City, Address, Marketing Consent
              </p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="mb-4"
              >
                <Upload className="h-4 w-4 mr-2" /> Choose File
              </Button>

              {importPreview && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Preview ({importPreview.length} rows)
                    </h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setImportPreview(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={confirmImport}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Confirm Import
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                        <tr>
                          {Object.keys(importPreview[0] || {})
                            .slice(0, 8)
                            .map((key) => (
                              <th
                                key={key}
                                className="px-3 py-2 text-left font-medium text-gray-500"
                              >
                                {key}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {importPreview.slice(0, 20).map((row: any, i: number) => (
                          <tr key={i}>
                            {Object.values(row)
                              .slice(0, 8)
                              .map((val: any, j: number) => (
                                <td key={j} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                  {String(val || "—")}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.length > 20 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Showing 20 of {importPreview.length} rows
                    </p>
                  )}
                </div>
              )}

              {importResults && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      Imported {importResults.imported} contacts
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-green-700 dark:text-green-400">
                      <span>Total rows: {importResults.totalRows}</span>
                      <span>Valid: {importResults.validRows}</span>
                      <span>Invalid/skipped: {importResults.invalidRows}</span>
                      {importResults.duplicatesInFile > 0 && (
                        <span>Duplicates in file: {importResults.duplicatesInFile}</span>
                      )}
                      {importResults.existingCustomers > 0 && (
                        <span>Updated existing: {importResults.existingCustomers}</span>
                      )}
                    </div>
                  </div>
                  {importResults.errors?.length > 0 && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Errors ({importResults.errors.length})
                      </p>
                      <ul className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-1 max-h-48 overflow-y-auto">
                        {importResults.errors.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by recipient or subject..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Recipient
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Subject
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                        Provider
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {history.map((log: any) => (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition"
                      >
                        <td className="px-4 py-3 text-gray-900 dark:text-white text-sm">
                          {log.recipient}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                          {log.subject || "—"}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Badge variant="outline" className="text-[10px]">
                            {log.provider}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge
                            className={
                              log.status === "sent" || log.status === "delivered"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                          {new Date(log.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && !loadingHistory && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                          <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium">No email history</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Pagination
            page={historyPage}
            totalItems={historyTotal}
            pageSize={10}
            onPageChange={setHistoryPage}
          />
        </>
      )}
    </div>
  );
}
