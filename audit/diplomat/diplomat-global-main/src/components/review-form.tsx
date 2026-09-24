"use client";

import { useState, useRef } from "react";
import { Star, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { submitReview } from "@/lib/reviews.server";
import { validateName } from "@/lib/name-validation";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";

interface ReviewFormProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function ReviewForm({ productId, productName, onClose, onSuccess }: ReviewFormProps) {
  const submit = useServerFn(submitReview);
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (errors: Record<string, string>) => {
    const first = Object.keys(errors)[0];
    if (first && formRef.current) {
      const el = formRef.current.querySelector(`[name="${first}"]`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLElement).focus(); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors: Record<string, string> = {};
    if (rating === 0) clientErrors.rating = "Please select a rating.";
    const nameError = validateName(name);
    if (nameError) clientErrors.name = nameError;
    if (body.length < 10) clientErrors.body = "Review must be at least 10 characters.";
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError("");
      focusFirstError(clientErrors);
      return;
    }
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    try {
      const result = await submit({
        data: {
          product_id: productId,
          customer_name: name,
          customer_email: email,
          rating,
          title: title || undefined,
          body,
        },
      });
      if (result.ok) {
        onSuccess(result.message);
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      const errors = getFieldErrorMap(err);
      setFieldErrors(errors);
      setError(getFormErrorMessage(err));
      focusFirstError(errors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        // Only close if clicking the backdrop itself, not during re-renders
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-canvas p-6 shadow-xl ring-1 ring-border max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold">Write a Review</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface transition"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-1">Reviewing: {productName}</p>
        <p className="text-xs text-muted-foreground/70 mb-5">
          Reviews from verified purchases are approved instantly. Others go through moderation.
        </p>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium mb-2">Rating *</label>
            <div className="flex gap-1" role="radiogroup" aria-invalid={!!fieldErrors.rating} aria-describedby={fieldErrors.rating ? "err-rating" : undefined}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="p-1 min-h-[44px] min-w-[44px] grid place-items-center"
                >
                  <Star
                    className={`size-7 transition-colors ${
                      star <= (hoveredStar || rating)
                        ? "fill-brand text-brand"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
            {fieldErrors.rating && <p id="err-rating" className="mt-1 text-xs text-red-500" role="alert">{fieldErrors.rating}</p>}
          </div>

          {/* Name + Email */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Name *
              <input
                type="text"
                name="name"
                required
                value={name}
                onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "err-name" : undefined}
                className={`min-h-10 rounded-xl border bg-surface px-3 text-sm outline-none ${fieldErrors.name ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
                placeholder="Your name"
              />
              {fieldErrors.name && <span id="err-name" className="text-xs text-red-500" role="alert">{fieldErrors.name}</span>}
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Email *
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "err-email" : undefined}
                className={`min-h-10 rounded-xl border bg-surface px-3 text-sm outline-none ${fieldErrors.email ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
                placeholder="you@example.com"
              />
              {fieldErrors.email && <span id="err-email" className="text-xs text-red-500" role="alert">{fieldErrors.email}</span>}
            </label>
          </div>

          {/* Title */}
          <label className="grid gap-1.5 text-sm font-medium">
            Review title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              placeholder="Summarize your experience"
            />
          </label>

          {/* Body */}
          <label className="grid gap-1.5 text-sm font-medium">
            Your review *
            <textarea
              required
              name="body"
              rows={4}
              minLength={10}
              maxLength={2000}
              value={body}
              onChange={(e) => { setBody(e.target.value); clearFieldError("body"); }}
              aria-invalid={!!fieldErrors.body}
              aria-describedby={fieldErrors.body ? "err-body" : undefined}
              className={`rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none resize-none ${fieldErrors.body ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
              placeholder="Tell others about your experience with this product..."
            />
            {fieldErrors.body && <span id="err-body" className="text-xs text-red-500" role="alert">{fieldErrors.body}</span>}
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-11 rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit Review"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold hover:bg-surface transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
