import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Check, X, Trash2, MessageSquare } from "lucide-react";
import { getAllReviews, updateReviewStatus, deleteReview } from "@/lib/reviews.server";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/reviews")({
  validateSearch: z.object({ detail: z.string().uuid().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Reviews — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const { detail } = Route.useSearch();
  const loadVersion = useRef(0);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchReviews = useServerFn(getAllReviews);
  const updateStatus = useServerFn(updateReviewStatus);
  const deleteRev = useServerFn(deleteReview);

  const load = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetchReviews({ data: { status: statusFilter, review_id: detail } });
      if (version !== loadVersion.current) return;
      if (res.error) throw new Error("Reviews unavailable");
      setReviews(res.reviews || []);
      setTotal(res.total || 0);
    } catch {
      if (version !== loadVersion.current) return;
      setError("Unable to load reviews. Please retry.");
      setReviews([]);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const version = loadVersion.current;
    return () => {
      loadVersion.current = version + 1;
    };
  }, [statusFilter, detail]);

  const handleStatus = async (id: string, status: string) => {
    const res = await updateStatus({ data: { review_id: id, status: status as any } });
    if (res.ok) {
      toast.success(`Review ${status}`);
      load();
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    const res = await deleteRev({ data: { review_id: id } });
    if (res.ok) {
      toast.success("Review deleted");
      load();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviews</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} reviews</p>
      </div>

      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s ? "bg-gray-900 dark:bg-white dark:text-gray-900 text-white" : ""
            }
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {reviews.map((review: any) => (
          <Card
            key={review.id}
            className="bg-white dark:bg-[#1a1a1e] border-gray-200 dark:border-[#2a2a2e]"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {review.customers?.first_name} {review.customers?.last_name}
                    </span>
                    <span className="text-xs text-gray-500">{review.customers?.email}</span>
                    <Badge
                      className={
                        review.status === "approved"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : review.status === "rejected"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                      }
                    >
                      {review.status}
                    </Badge>
                  </div>
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`size-3 ${i < review.rating ? "fill-amber-500 text-amber-500" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                  {review.title && (
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {review.title}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{review.body}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Product: {review.products?.name || "Unknown"} ·{" "}
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {review.status !== "approved" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-green-600"
                      onClick={() => handleStatus(review.id, "approved")}
                      title="Approve"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  {review.status !== "rejected" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-yellow-600"
                      onClick={() => handleStatus(review.id, "rejected")}
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500"
                    onClick={() => handleDelete(review.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {reviews.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p role={error ? "alert" : "status"}>
              {error || (detail ? "Review unavailable" : "No reviews found")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
