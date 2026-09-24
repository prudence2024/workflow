import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

// ── Blog Posts ──
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  image: string | null;
  youtube_url: string | null;
  read_time: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getBlogPosts(options?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("blog_posts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);
  if (options?.search)
    query = query.or(`title.ilike.%${options.search}%,category.ilike.%${options.search}%`);
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch blog posts: ${error.message}`);
  return { posts: (data || []) as BlogPost[], total: count || 0 };
}

export async function getBlogPostById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("blog_posts").select("*").eq("id", id).single();
  if (error) throw new Error(`Blog post not found: ${error.message}`);
  return data as BlogPost;
}

export async function createBlogPost(input: Partial<BlogPost>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("blog_posts").insert(input).select().single();
  if (error) throw new Error(`Failed to create blog post: ${error.message}`);
  return data as BlogPost;
}

export async function updateBlogPost(id: string, input: Partial<BlogPost>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("blog_posts").update(input).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update blog post: ${error.message}`);
  return data as BlogPost;
}

export async function deleteBlogPost(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete blog post: ${error.message}`);
}

// ── Hero Slides ──
export interface HeroSlide {
  id: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  price_context: string | null;
  category: string | null;
  cta_text: string;
  cta_link: string;
  image: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getHeroSlides() {
  const db = createDatabaseClient();
  const { data, error } = await db.from("hero_slides").select("*").order("sort_order");
  if (error) throw new Error(`Failed to fetch hero slides: ${error.message}`);
  return data as HeroSlide[];
}

export async function createHeroSlide(input: Partial<HeroSlide>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("hero_slides").insert(input).select().single();
  if (error) throw new Error(`Failed to create hero slide: ${error.message}`);
  return data as HeroSlide;
}

export async function updateHeroSlide(id: string, input: Partial<HeroSlide>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("hero_slides").update(input).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update hero slide: ${error.message}`);
  return data as HeroSlide;
}

export async function deleteHeroSlide(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("hero_slides").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete hero slide: ${error.message}`);
}

// ── Testimonials ──
export interface Testimonial {
  id: string;
  name: string;
  role: string | null;
  message: string;
  rating: number | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getTestimonials() {
  const db = createDatabaseClient();
  const { data, error } = await db.from("testimonials").select("*").order("sort_order");
  if (error) throw new Error(`Failed to fetch testimonials: ${error.message}`);
  return data as Testimonial[];
}

export async function createTestimonial(input: Partial<Testimonial>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("testimonials").insert(input).select().single();
  if (error) throw new Error(`Failed to create testimonial: ${error.message}`);
  return data as Testimonial;
}

export async function updateTestimonial(id: string, input: Partial<Testimonial>) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("testimonials")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update testimonial: ${error.message}`);
  return data as Testimonial;
}

export async function deleteTestimonial(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("testimonials").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete testimonial: ${error.message}`);
}

// ── Messages ──
export interface Message {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function getMessages(options?: {
  unread_only?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.unread_only) query = query.eq("is_read", false);
  if (options?.search)
    query = query.or(
      `name.ilike.%${options.search}%,email.ilike.%${options.search}%,subject.ilike.%${options.search}%`,
    );
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return { messages: (data || []) as Message[], total: count || 0 };
}

export async function markMessageRead(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("messages").update({ is_read: true }).eq("id", id);
  if (error) throw new Error(`Failed to mark message: ${error.message}`);
}

export async function deleteMessage(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("messages").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete message: ${error.message}`);
}

export async function getUnreadMessageCount() {
  const db = createDatabaseClient();
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  return count || 0;
}

// ── Newsletter Subscribers ──
export interface NewsletterSubscriber {
  id: string;
  email: string;
  is_active: boolean;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

export async function getNewsletterSubscribers(options?: {
  active_only?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("newsletter_subscribers")
    .select("*", { count: "exact" })
    .order("subscribed_at", { ascending: false });
  if (options?.active_only) query = query.eq("is_active", true);
  if (options?.search) query = query.ilike("email", `%${options.search}%`);
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch subscribers: ${error.message}`);
  return { subscribers: (data || []) as NewsletterSubscriber[], total: count || 0 };
}

export async function getActiveSubscriberCount() {
  const db = createDatabaseClient();
  const { count } = await db
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  return count || 0;
}

// ── Social Links ──
export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  link_type: string;
  updated_at: string;
}

export async function getSocialLinks() {
  const db = createDatabaseClient();
  const { data, error } = await db.from("social_links").select("*").order("sort_order");
  if (error) throw new Error(`Failed to fetch social links: ${error.message}`);
  return data as SocialLink[];
}

export async function createSocialLink(input: Partial<SocialLink>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("social_links").insert(input).select().single();
  if (error) throw new Error(`Failed to create social link: ${error.message}`);
  return data as SocialLink;
}

export async function updateSocialLink(id: string, input: Partial<SocialLink>) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("social_links")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update social link: ${error.message}`);
  return data as SocialLink;
}

export async function deleteSocialLink(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("social_links").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete social link: ${error.message}`);
}

// ── Site Settings ──
export async function getSiteSettings() {
  const db = createDatabaseClient();
  const { data, error } = await db.from("site_settings").select("*");
  if (error) throw new Error(`Failed to fetch settings: ${error.message}`);
  const settings: Record<string, string> = {};
  (data || []).forEach((s: any) => {
    settings[s.key] = s.value;
  });
  return settings;
}

export async function updateSiteSetting(key: string, value: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("site_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`Failed to update setting: ${error.message}`);
}

export async function updateSiteSettings(settings: Record<string, string>) {
  const db = createDatabaseClient();
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
  const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Failed to update settings: ${error.message}`);
}

// ── Reviews ──
export interface Review {
  id: string;
  product_id: string;
  customer_id: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  verified_purchase: boolean;
  created_at: string;
  updated_at: string;
}

export async function getReviews(options?: {
  status?: string;
  product_id?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("reviews")
    .select("*, products(name, slug)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);
  if (options?.product_id) query = query.eq("product_id", options.product_id);
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  return { reviews: (data || []) as any[], total: count || 0 };
}

export async function updateReviewStatus(id: string, status: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("reviews")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update review: ${error.message}`);
  return data as Review;
}
