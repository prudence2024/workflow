"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

// ─── Legal Page Sections Editor ───

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export function LegalSectionsEditor({
  sections,
  onChange,
}: {
  sections: LegalSection[];
  onChange: (sections: LegalSection[]) => void;
}) {
  const addSection = () => {
    onChange([...sections, { title: "", paragraphs: [""] }]);
  };

  const removeSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: string, value: any) => {
    onChange(sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addParagraph = (sectionIndex: number) => {
    onChange(
      sections.map((s, i) =>
        i === sectionIndex ? { ...s, paragraphs: [...s.paragraphs, ""] } : s,
      ),
    );
  };

  const updateParagraph = (sectionIndex: number, paraIndex: number, value: string) => {
    onChange(
      sections.map((s, i) =>
        i === sectionIndex
          ? { ...s, paragraphs: s.paragraphs.map((p, j) => (j === paraIndex ? value : p)) }
          : s,
      ),
    );
  };

  const removeParagraph = (sectionIndex: number, paraIndex: number) => {
    onChange(
      sections.map((s, i) =>
        i === sectionIndex
          ? { ...s, paragraphs: s.paragraphs.filter((_, j) => j !== paraIndex) }
          : s,
      ),
    );
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <div
          key={si}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3 min-w-0"
        >
          {/* Section header: wraps on narrow screens instead of squeezing the
              title input; reorder/delete controls stay touch-sized (min 36px). */}
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSection(si, "title", e.target.value)}
              placeholder="Section title"
              className="flex-1 min-w-[10rem] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveSection(si, -1)}
                disabled={si === 0}
                aria-label={`Move section ${section.title || si + 1} up`}
                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 rounded"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                disabled={si === sections.length - 1}
                aria-label={`Move section ${section.title || si + 1} down`}
                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 rounded"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeSection(si)}
                aria-label={`Delete section ${section.title || si + 1}`}
                className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {section.paragraphs.map((para, pi) => (
            <div key={pi} className="flex flex-wrap gap-2">
              <textarea
                value={para}
                onChange={(e) => updateParagraph(si, pi, e.target.value)}
                placeholder="Paragraph content..."
                rows={2}
                className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
              />
              <button
                type="button"
                onClick={() => removeParagraph(si, pi)}
                aria-label={`Delete paragraph ${pi + 1}`}
                className="self-start p-2 text-gray-400 hover:text-red-400 rounded"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => addParagraph(si)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline min-h-9"
          >
            + Add paragraph
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="flex items-center gap-2 text-sm text-[#0891b2] hover:underline font-medium min-h-9"
      >
        <Plus className="h-4 w-4" /> Add section
      </button>
    </div>
  );
}

// ─── FAQ Page Editor ───

export function FaqPageEditor({
  items,
  onChange,
}: {
  items: { question: string; answer: string }[];
  onChange: (items: { question: string; answer: string }[]) => void;
}) {
  const addItem = () => onChange([...items, { question: "", answer: "" }]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: "question" | "answer", value: string) => {
    onChange(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    const list = [...items];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    onChange(list);
  };

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        FAQ Editor (questions appear in this order on /faq)
      </p>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Q{index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move question ${index + 1} up`}
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move question ${index + 1} down`}
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1}
                  className="rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => removeItem(index)}
                  className="rounded p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={item.question}
              onChange={(e) => updateItem(index, "question", e.target.value)}
              placeholder="Question"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <textarea
              value={item.answer}
              onChange={(e) => updateItem(index, "answer", e.target.value)}
              placeholder="Answer"
              rows={3}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-3 flex items-center gap-2 text-sm font-medium text-[#0891b2] hover:underline"
      >
        <Plus className="h-4 w-4" /> Add question
      </button>
    </div>
  );
}

// ─── About Page Editor ───

export interface AboutFaqItem {
  question: string;
  answer: string;
  enabled?: boolean;
}

export interface AboutPageData {
  heading?: string;
  description?: string;
  founder?: {
    name?: string;
    title?: string;
    photo?: string;
    bio?: string;
    story?: string;
    quote?: string;
  };
  faq?: AboutFaqItem[];
}

export function AboutPageEditor({
  data,
  onChange,
}: {
  data: AboutPageData;
  onChange: (data: AboutPageData) => void;
}) {
  const update = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updateFounder = (field: string, value: any) => {
    onChange({
      ...data,
      founder: { ...(data.founder || {}), [field]: value },
    });
  };

  // FAQ management
  const addFaq = () => {
    onChange({ ...data, faq: [...(data.faq || []), { question: "", answer: "", enabled: true }] });
  };
  const toggleFaq = (index: number) => {
    onChange({
      ...data,
      faq: (data.faq || []).map((item, i) =>
        i === index ? { ...item, enabled: item.enabled === false ? true : false } : item,
      ),
    });
  };
  const removeFaq = (index: number) => {
    onChange({ ...data, faq: (data.faq || []).filter((_, i) => i !== index) });
  };
  const updateFaq = (index: number, field: "question" | "answer", value: string) => {
    onChange({
      ...data,
      faq: (data.faq || []).map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    });
  };
  const moveFaq = (index: number, direction: -1 | 1) => {
    const list = [...(data.faq || [])];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    onChange({ ...data, faq: list });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Page Content</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Heading</label>
            <input
              type="text"
              value={data.heading || ""}
              onChange={(e) => update("heading", e.target.value)}
              placeholder="Technology you can buy with confidence."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Description
            </label>
            <textarea
              value={data.description || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="We help professionals, creators..."
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Founder Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
            <input
              type="text"
              value={data.founder?.name || ""}
              onChange={(e) => updateFounder("name", e.target.value)}
              placeholder="Founder name"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Title</label>
            <input
              type="text"
              value={data.founder?.title || ""}
              onChange={(e) => updateFounder("title", e.target.value)}
              placeholder="Founder & CEO"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Photo URL (Cloudinary)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={data.founder?.photo || ""}
                onChange={(e) => updateFounder("photo", e.target.value)}
                placeholder="https://res.cloudinary.com/.../founder.jpg"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {data.founder?.photo && (
                <img
                  src={data.founder.photo}
                  alt="Founder"
                  className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                />
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Biography (one paragraph per line)
            </label>
            <textarea
              value={data.founder?.bio || ""}
              onChange={(e) => updateFounder("bio", e.target.value)}
              placeholder="Paragraph 1...&#10;&#10;Paragraph 2..."
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Founder Story / Message
            </label>
            <textarea
              value={data.founder?.story || ""}
              onChange={(e) => updateFounder("story", e.target.value)}
              placeholder="The founder's personal story or message to customers..."
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Quote</label>
            <input
              type="text"
              value={data.founder?.quote || ""}
              onChange={(e) => updateFounder("quote", e.target.value)}
              placeholder="An optional inspirational quote..."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Frequently Asked Questions
        </h3>
        <div className="space-y-3">
          {(data.faq || []).map((item, fi) => (
            <div
              key={fi}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
                <button
                  type="button"
                  onClick={() => toggleFaq(fi)}
                  className={`shrink-0 p-1 rounded text-xs font-medium transition ${
                    item.enabled === false
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-400"
                      : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  }`}
                  title={item.enabled === false ? "Enable this FAQ" : "Disable this FAQ"}
                >
                  {item.enabled === false ? "OFF" : "ON"}
                </button>
                <input
                  type="text"
                  value={item.question}
                  onChange={(e) => updateFaq(fi, "question", e.target.value)}
                  placeholder="Question"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => moveFaq(fi, -1)}
                  disabled={fi === 0}
                  className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 rounded"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveFaq(fi, 1)}
                  disabled={fi === (data.faq || []).length - 1}
                  className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 rounded"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeFaq(fi)}
                  className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={item.answer}
                onChange={(e) => updateFaq(fi, "answer", e.target.value)}
                placeholder="Answer"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addFaq}
          className="mt-3 flex items-center gap-2 text-sm text-[#0891b2] hover:underline font-medium"
        >
          <Plus className="h-4 w-4" /> Add FAQ
        </button>
      </div>
    </div>
  );
}

// ─── Page type detection ───

export type PageType = "legal" | "about" | "faq" | "generic";

export function detectPageType(slug: string): PageType {
  const normalized = slug.toLowerCase().trim();
  if (["about", "about-us"].includes(normalized)) return "about";
  if (normalized === "faq" || normalized === "faqs") return "faq";
  if (
    [
      "terms-and-conditions",
      "terms",
      "privacy-policy",
      "privacy",
      "warranty",
      "warranty-and-returns",
    ].includes(normalized)
  )
    return "legal";
  return "generic";
}
