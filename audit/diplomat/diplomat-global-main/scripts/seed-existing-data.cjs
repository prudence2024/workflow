#!/usr/bin/env node
/**
 * Idempotent seed script — imports all existing static website data into the database.
 * Safe to run multiple times (uses upsert/conflict handling).
 * 
 * Usage: node scripts/seed-existing-data.js
 * Requires: VITE_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('Missing env vars'); process.exit(1); }
const db = createClient(url, key);

async function seedCategories() {
  console.log('📦 Seeding categories...');
  const categories = [
    { slug: 'computing', name: 'Computing', sort_order: 0, icon: 'cpu' },
    { slug: 'monitor', name: 'Monitor', sort_order: 1, icon: 'monitor' },
    { slug: 'gaming-monitor', name: 'Gaming Monitor', sort_order: 2, icon: 'gamepad-2' },
    { slug: 'camera', name: 'Camera', sort_order: 3, icon: 'camera' },
    { slug: 'printers-scanner', name: 'Printers & Scanner', sort_order: 4, icon: 'printer' },
  ];
  for (const cat of categories) {
    const { error } = await db.from('categories').upsert(cat, { onConflict: 'slug' });
    if (error) console.error(`  ⚠ Category ${cat.name}: ${error.message}`);
    else console.log(`  ✅ ${cat.name}`);
  }
}

async function seedProducts(categories) {
  console.log('📦 Seeding products...');
  const products = [
    {
      slug: 'ultraview-27-portable-4k', sku: 'DG-MON-UV27', name: 'UltraView 27" Portable 4K Display',
      tagline: 'Professional colour accuracy, anywhere', category_slug: 'monitor',
      price: 485000, in_stock: true, featured: true, is_new: true, condition: 'new',
    },
    {
      slug: 'lumina-4k-camcorder', sku: 'DG-CAM-LM4K', name: 'Lumina 4K Professional Camcorder',
      tagline: 'Cinematic 60fps, dual-mic capture', category_slug: 'camera',
      price: 820000, in_stock: true, featured: true, condition: 'new',
    },
    {
      slug: 'syncnode-10-port-hub', sku: 'DG-CMP-SN10', name: 'SyncNode 10-Port Hub Pro',
      tagline: '4K HDMI · 100W PD · Gigabit', category_slug: 'computing',
      price: 65500, compare_at_price: 78000, in_stock: true, condition: 'new',
    },
    {
      slug: 'titan-flow-micro-atx', sku: 'DG-CMP-TFATX', name: 'Titan Flow Micro-ATX Case',
      tagline: 'Tempered glass · ARGB sync', category_slug: 'computing',
      price: 142000, in_stock: true, condition: 'new',
    },
    {
      slug: 'apex-34-ultrawide', sku: 'DG-MON-A34U', name: 'Apex 34" Ultrawide Curved Monitor',
      tagline: '165Hz · 1ms · HDR400', category_slug: 'gaming-monitor',
      price: 1150000, in_stock: true, featured: true, condition: 'new',
    },
    {
      slug: 'officejet-pro-s1', sku: 'DG-PRT-OJP1', name: 'OfficeJet Pro S1 All-in-One',
      tagline: 'Print · Scan · Wireless', category_slug: 'printers-scanner',
      price: 312000, in_stock: false, condition: 'new',
    },
    {
      slug: 'phantom-g24-gaming', sku: 'DG-MON-PG24', name: 'Phantom G24 Gaming Monitor',
      tagline: '240Hz IPS · 0.5ms response', category_slug: 'gaming-monitor',
      price: 185000, in_stock: true, is_new: true, condition: 'new',
    },
    {
      slug: 'zenith-pro-portable', sku: 'DG-MON-ZP15', name: 'Zenith Pro Portable Monitor',
      tagline: '15.6" FHD · USB-C powered', category_slug: 'monitor',
      price: 125000, in_stock: true, condition: 'new',
    },
  ];

  const catMap = {};
  categories.forEach(c => { catMap[c.slug] = c.id; });

  for (const p of products) {
    const row = {
      slug: p.slug, sku: p.sku, name: p.name, tagline: p.tagline,
      price: p.price, compare_at_price: p.compare_at_price || null,
      category_id: catMap[p.category_slug] || null,
      in_stock: p.in_stock, featured: p.featured || false,
      is_new: p.is_new || false, condition: p.condition || 'new',
      status: 'active', description: `${p.tagline}. A dependable solution selected by Diplomat Global for Nigerian homes, creators and businesses.`,
      specifications: JSON.stringify([
        { label: 'Category', value: p.category_slug },
        { label: 'Availability', value: p.in_stock ? 'In stock' : 'Sold out' },
        { label: 'Warranty', value: '12 months' },
        { label: 'Delivery', value: 'Nationwide' },
      ]),
    };
    const { data, error } = await db.from('products').upsert(row, { onConflict: 'slug' }).select('id').single();
    if (error) console.error(`  ⚠ Product ${p.name}: ${error.message}`);
    else {
      console.log(`  ✅ ${p.name}`);
      // Create inventory record if missing
      await db.from('inventory').upsert(
        { product_id: data.id, quantity: p.in_stock ? 20 : 0, reserved: 0, low_stock_threshold: 3 },
        { onConflict: 'product_id' }
      );
    }
  }
}

async function seedHeroSlides() {
  console.log('📦 Seeding hero slides...');
  const slides = [
    {
      eyebrow: 'NEW ARRIVAL', title: 'Precision viewing.\nUnlimited power.',
      body: 'Pro-grade colour accuracy for your mobile workstation, engineered for creatives who do not compromise.',
      price_context: 'From ₦485,000', category: 'Monitor', cta_text: 'Shop now', cta_link: '/products/ultraview-27-portable-4k',
      sort_order: 0, active: true,
    },
    {
      eyebrow: 'FEATURED', title: 'Cinematic 4K.\nEvery detail captured.',
      body: 'Professional-grade camcorder with dual-mic capture and 60fps cinematic recording.',
      price_context: 'From ₦820,000', category: 'Camera', cta_text: 'Explore', cta_link: '/products/lumina-4k-camcorder',
      sort_order: 1, active: true,
    },
    {
      eyebrow: 'GAMING', title: 'See everything.\nDominate everything.',
      body: '34-inch ultrawide with 165Hz refresh rate, 1ms response time, and HDR400 certification.',
      price_context: 'From ₦1,150,000', category: 'Gaming Monitor', cta_text: 'Shop now', cta_link: '/products/apex-34-ultrawide',
      sort_order: 2, active: true,
    },
  ];
  for (const slide of slides) {
    const { error } = await db.from('hero_slides').upsert(slide, { onConflict: 'id' });
    if (error) console.error(`  ⚠ Hero slide: ${error.message}`);
    else console.log(`  ✅ ${slide.title.split('\n')[0]}`);
  }
}

async function seedTestimonials() {
  console.log('📦 Seeding testimonials...');
  const testimonials = [
    { name: 'Adebayo O.', role: 'Creative professional', message: 'The UltraView display changed my workflow completely. Colour accuracy is exactly what I needed for design work.', rating: 5, sort_order: 0 },
    { name: 'Chioma N.', role: 'Business owner', message: 'Fast delivery and excellent customer support. My office setup with Diplomat Global products has been fantastic.', rating: 5, sort_order: 1 },
    { name: 'Emeka A.', role: 'Remote engineer', message: 'The SyncNode hub is a lifesaver for my remote setup. Everything connects seamlessly and the build quality is premium.', rating: 5, sort_order: 2 },
    { name: 'Fatima K.', role: 'Returning customer', message: 'Third order from Diplomat Global. Consistent quality and nationwide delivery. Highly recommended for tech purchases.', rating: 4, sort_order: 3 },
  ];
  for (const t of testimonials) {
    const { error } = await db.from('testimonials').upsert(t, { onConflict: 'id' });
    if (error) console.error(`  ⚠ Testimonial ${t.name}: ${error.message}`);
    else console.log(`  ✅ ${t.name}`);
  }
}

async function seedBlogPosts() {
  console.log('📦 Seeding blog posts...');
  const posts = [
    {
      slug: 'nigerian-tech-market-2026', title: 'The Nigerian Tech Market in 2026',
      excerpt: 'How Nigerian consumers are driving demand for premium electronics and what it means for the market.',
      category: 'Industry', read_time: '5 min read', status: 'published',
      published_at: '2026-01-15T00:00:00Z',
      content: JSON.stringify([
        { type: 'paragraph', text: 'The Nigerian electronics market continues to grow rapidly in 2026, driven by increasing digital literacy and a young, tech-savvy population.' },
        { type: 'paragraph', text: 'Premium displays, gaming monitors, and professional cameras are seeing unprecedented demand, with consumers increasingly willing to invest in quality technology.' },
        { type: 'paragraph', text: 'At Diplomat Global Tech-Solutions, we have seen a 40% increase in premium product orders compared to last year, confirming this trend.' },
      ]),
    },
    {
      slug: 'choosing-right-monitor', title: 'How to Choose the Right Monitor for Your Setup',
      excerpt: 'A comprehensive guide to selecting monitors based on your specific use case.',
      category: 'Guides', read_time: '8 min read', status: 'published',
      published_at: '2026-02-20T00:00:00Z',
      content: JSON.stringify([
        { type: 'paragraph', text: 'Choosing the right monitor depends on your primary use case — whether it is creative work, gaming, or general productivity.' },
        { type: 'paragraph', text: 'For creative professionals, colour accuracy (sRGB, DCI-P3 coverage) and resolution are paramount. The UltraView 27" 4K excels in this area.' },
        { type: 'paragraph', text: 'For gamers, refresh rate and response time matter most. The Apex 34" Ultrawide with 165Hz and 1ms response is ideal.' },
      ]),
    },
    {
      slug: 'setting-up-home-office', title: 'Setting Up the Perfect Home Office in Nigeria',
      excerpt: 'Tips and product recommendations for creating an efficient home workspace.',
      category: 'Lifestyle', read_time: '6 min read', status: 'published',
      published_at: '2026-03-10T00:00:00Z',
      content: JSON.stringify([
        { type: 'paragraph', text: 'Working from home has become the norm for many Nigerian professionals. A well-designed workspace can dramatically improve productivity.' },
        { type: 'paragraph', text: 'Start with the essentials: a reliable monitor, a good keyboard and mouse, and proper lighting. The right accessories make all the difference.' },
        { type: 'paragraph', text: 'Invest in quality tech from trusted suppliers like Diplomat Global to ensure reliability and local support when you need it.' },
      ]),
    },
  ];
  for (const post of posts) {
    const { error } = await db.from('blog_posts').upsert(post, { onConflict: 'slug' });
    if (error) console.error(`  ⚠ Blog: ${post.title}: ${error.message}`);
    else console.log(`  ✅ ${post.title}`);
  }
}

async function seedSocialLinks() {
  console.log('📦 Seeding social links...');
  const links = [
    { platform: 'Facebook', url: 'https://facebook.com/diplomatglobal', icon: 'facebook', sort_order: 0, is_active: true, link_type: 'social' },
    { platform: 'Instagram', url: 'https://instagram.com/diplomatglobal', icon: 'instagram', sort_order: 1, is_active: true, link_type: 'social' },
    { platform: 'X', url: 'https://x.com/diplomatglobal', icon: 'twitter', sort_order: 2, is_active: true, link_type: 'social' },
    { platform: 'TikTok', url: 'https://tiktok.com/@diplomatglobal', icon: 'music', sort_order: 3, is_active: true, link_type: 'social' },
    { platform: 'YouTube', url: 'https://youtube.com/@diplomatglobal', icon: 'youtube', sort_order: 4, is_active: true, link_type: 'social' },
    { platform: 'WhatsApp', url: 'https://wa.me/2348035751338', icon: 'message-circle', sort_order: 5, is_active: true, link_type: 'contact' },
  ];
  for (const link of links) {
    const { error } = await db.from('social_links').upsert(link, { onConflict: 'platform' });
    if (error) console.error(`  ⚠ Social ${link.platform}: ${error.message}`);
    else console.log(`  ✅ ${link.platform}`);
  }
}

async function seedSiteSettings() {
  console.log('📦 Seeding site settings...');
  const settings = {
    company_name: 'Diplomat Global Tech-Solutions',
    support_email: 'support@diplomatglobal.com',
    phone: '+2348035751338',
    whatsapp_url: 'https://wa.me/2348035751338',
    location: 'Lagos, Nigeria',
    bn_number: 'BN 12345678',
    tagline: 'Premium Electronics & Tech in Nigeria',
    announcement_text: 'Free Lagos delivery on orders over ₦250,000',
  };
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
  const { error } = await db.from('site_settings').upsert(rows, { onConflict: 'key' });
  if (error) console.error(`  ⚠ Settings: ${error.message}`);
  else console.log('  ✅ All settings saved');
}

async function main() {
  console.log('🌱 Starting seed...\n');

  // 1. Categories
  await seedCategories();
  const { data: cats } = await db.from('categories').select('id, slug');
  console.log('');

  // 2. Products
  await seedProducts(cats || []);
  console.log('');

  // 3. Hero Slides
  await seedHeroSlides();
  console.log('');

  // 4. Testimonials
  await seedTestimonials();
  console.log('');

  // 5. Blog Posts
  await seedBlogPosts();
  console.log('');

  // 6. Social Links
  await seedSocialLinks();
  console.log('');

  // 7. Site Settings
  await seedSiteSettings();
  console.log('');

  console.log('🎉 Seed complete!');
}

main().catch(console.error);
