import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Search,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Filter,
  RefreshCw,
  Edit,
} from "lucide-react";
import {
  adminListExpenses,
  adminCreateExpense,
  adminUpdateExpense,
  adminDeleteExpense,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
  category: z.string().optional().default("all"),
});

export const Route = createFileRoute("/dashboard/expenses")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Expenses — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    search: search.search,
    category: search.category,
  }),
  loader: async ({ deps }) => {
    try {
      const { adminListExpenses } = await import("@/lib/admin/server-fns");
      const res = await adminListExpenses({
        data: {
          page: deps.page,
          pageSize: 15,
          category: deps.category === "all" ? undefined : deps.category,
        },
      });
      return {
        expenses: (res.expenses ?? []) as ExpenseRow[],
        total: res.total ?? 0,
        error: res.error,
      };
    } catch {
      return { expenses: [], total: 0, error: null };
    }
  },
  component: ExpensesPage,
});

const CATEGORIES = [
  "rent",
  "salaries",
  "marketing",
  "logistics",
  "utilities",
  "software",
  "miscellaneous",
];

interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number | string;
  description: string;
  vendor?: string | null;
}

const categoryColors: Record<string, string> = {
  rent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  salaries: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  marketing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  logistics: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  utilities: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  software: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  miscellaneous: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

function ExpensesPage() {
  const { expenses, total, error } = Route.useLoaderData();
  const { page, search: searchTerm, category } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  // Form state lives inside the modal components (see below) so keystrokes in
  // expense fields never re-render the route/table — Owner INP finding fix.
  const [showCreate, setShowCreate] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteExpense = useServerFn(adminDeleteExpense);

  const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0 });

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteExpense({ data: { expense_id: id } });
      if (res?.ok) {
        toast.success("Expense deleted");
        setDeleteId(null);
        navigate({ search: { page } });
        void router.invalidate();
      } else {
        toast.error(res?.message || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete expense");
    }
  };

  const pushParams = useCallback(
    (overrides: { page?: number; search?: string; category?: string }) => {
      const next: { page?: number; search?: string; category?: string } = {
        page: overrides.page ?? page,
        search: overrides.search !== undefined ? overrides.search : searchTerm,
        category: overrides.category !== undefined ? overrides.category : category,
      };
      if ((next.page ?? 1) <= 1) delete next.page;
      if (!next.search) delete next.search;
      if (next.category === "all") delete next.category;
      navigate({ search: next });
    },
    [page, searchTerm, category, navigate],
  );

  const totalPages = Math.max(1, Math.ceil(total / 15));

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Receipt className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {error.includes("Missing permission") ? "Access Denied" : "Expenses unavailable"}
            </h2>
            <p className="text-sm text-gray-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {total} expense{total !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search expenses..."
            defaultValue={searchTerm}
            onChange={(e) => pushParams({ search: e.target.value, page: 1 })}
            className="pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(e) => pushParams({ category: e.target.value, page: 1 })}
          className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Expense List */}
      {expenses.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Receipt className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              No expenses found
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {searchTerm || category !== "all"
                ? "Try adjusting your filters."
                : "Start tracking your business expenses."}
            </p>
            {!searchTerm && category === "all" && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Expense
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {expenses.map((exp: ExpenseRow) => (
              <Card key={exp.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {exp.description}
                      </p>
                      {exp.vendor && <p className="text-xs text-gray-500 truncate">{exp.vendor}</p>}
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white ml-3">
                      {formatNaira(Number(exp.amount))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={categoryColors[exp.category] || categoryColors.miscellaneous}
                      >
                        {exp.category}
                      </Badge>
                      <span className="text-xs text-gray-400">{exp.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditExpense(exp)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(exp.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Vendor
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {expenses.map((exp: ExpenseRow) => (
                    <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {exp.date}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white max-w-xs truncate">
                        {exp.description}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={categoryColors[exp.category] || categoryColors.miscellaneous}
                        >
                          {exp.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                        {exp.vendor || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-right text-gray-900 dark:text-white whitespace-nowrap">
                        {formatNaira(Number(exp.amount))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditExpense(exp)}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(exp.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalItems={total}
              pageSize={15}
              onPageChange={(p) => pushParams({ page: p })}
            />
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateExpenseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => navigate({ search: {} })}
        />
      )}

      {/* Edit Modal */}
      {editExpense && (
        <EditExpenseModal
          expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSaved={() => navigate({ search: { page } })}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Expense
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteId)}
                className="flex-1"
              >
                Delete
              </Button>
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * Expense form modals own their form state internally: typing in an expense
 * field re-renders only the modal subtree, never the route/table/page shell.
 * (Authenticated INP profiling measured ~192–264ms per keystroke when this
 * state lived in ExpensesPage; modal-local state removes that cost.)
 */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface ExpenseFormFieldsProps {
  form: { date: string; category: string; amount: string; description: string; vendor: string };
  onChange: (
    patch: Partial<{
      date: string;
      category: string;
      amount: string;
      description: string;
      vendor: string;
    }>,
  ) => void;
}

function ExpenseFormFields({ form, onChange }: ExpenseFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date
          </label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ date: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            value={form.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Amount (₦)
        </label>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <Input
          placeholder="What was this expense for?"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Vendor / Payee (optional)
        </label>
        <Input
          placeholder="e.g. landlord, supplier"
          value={form.vendor}
          onChange={(e) => onChange({ vendor: e.target.value })}
        />
      </div>
    </>
  );
}

function CreateExpenseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const createExpense = useServerFn(adminCreateExpense);
  const router = useRouter();
  const [form, setForm] = useState({
    date: todayISO(),
    category: CATEGORIES[0],
    amount: "",
    description: "",
    vendor: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.date || !form.description.trim() || !Number.isFinite(amount) || amount < 0) {
      toast.error("Please provide a valid date, amount and description.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await createExpense({
        data: {
          date: form.date,
          category: form.category,
          amount,
          description: form.description.trim(),
          vendor: form.vendor.trim() || undefined,
        },
      });
      if (res?.ok) {
        toast.success("Expense added");
        onCreated();
        void router.invalidate();
      } else {
        toast.error(res?.message || "Failed to add expense");
      }
    } catch {
      toast.error("Failed to add expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ExpenseFormFields form={form} onChange={(p) => setForm({ ...form, ...p })} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Saving..." : "Add Expense"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditExpenseModal({
  expense,
  onClose,
  onSaved,
}: {
  expense: ExpenseRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateExpense = useServerFn(adminUpdateExpense);
  const router = useRouter();
  const [form, setForm] = useState({
    date: String(expense.date ?? todayISO()),
    category: String(expense.category ?? CATEGORIES[0]),
    amount: String(expense.amount ?? ""),
    description: String(expense.description ?? ""),
    vendor: String(expense.vendor ?? ""),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.date || !form.description.trim() || !Number.isFinite(amount) || amount < 0) {
      toast.error("Please provide a valid date, amount and description.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await updateExpense({
        data: {
          expense_id: expense.id,
          date: form.date,
          category: form.category,
          amount,
          description: form.description.trim(),
          vendor: form.vendor.trim() || undefined,
        },
      });
      if (res?.ok) {
        toast.success("Expense updated");
        onSaved();
        void router.invalidate();
      } else {
        toast.error(res?.message || "Failed to update expense");
      }
    } catch {
      toast.error("Failed to update expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ExpenseFormFields form={form} onChange={(p) => setForm({ ...form, ...p })} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
