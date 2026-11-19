// Shared blog code for the /insights/ landing page and the
// /insights/category/<slug>/ pages: loading posts from the Google Sheet,
// category handling, and card markup.

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP089cptBQQqPgcBh3XxtpnHHTzn0J-oYIZWLal_3ZCkx6T23cdC94aLCc-kLMeNV3k4GgZ0yZBD5O/pub?gid=0&single=true&output=csv';

// Fixed display order for category sections.
const CATEGORY_ORDER = ['breez-in-the-news', 'breez-news', 'breez-insights'];

// How many posts each category shows on the /insights/ landing page. Anything
// beyond this is only listed on that category's own page.
const POSTS_PER_CATEGORY_PREVIEW = 6;

// Public URL slug for each category page: /insights/category/<slug>/
const CATEGORY_SLUGS = {
  'breez-in-the-news': 'press',
  'breez-news': 'news',
  'breez-insights': 'insights'
};

// Intro line shown under the heading on each category page.
const CATEGORY_DESCRIPTIONS = {
  'breez-in-the-news': 'Coverage of EVERYAISLE from across the grocery and retail press.',
  'breez-news': 'Announcements, partnerships, and company updates from EVERYAISLE.',
  'breez-insights': 'Perspectives on AI, independent grocery, and the future of retail.'
};

function getCategoryUrl(category) {
  return `/insights/category/${CATEGORY_SLUGS[category]}/`;
}

function getCategoryFromSlug(slug) {
  return Object.keys(CATEGORY_SLUGS).find(c => CATEGORY_SLUGS[c] === slug) || null;
}

// Legacy category values from before the News/Insights split.
// Anything in this map is auto-folded into the new structure so the page
// doesn't break if a sheet row hasn't been re-tagged yet.
// NOTE: legacy 'news' is intentionally NOT in this map — old "Company News"
// rows must be manually re-tagged to either 'breez-news' (press release)
// or 'breez-in-the-news' (editorial coverage) since we can't tell which
// is which programmatically. A console warning fires when one is detected.
const CATEGORY_ALIASES = {
  'tips': 'breez-insights',
  'product': 'breez-insights',
  'insights': 'breez-insights'
};

const VALID_CATEGORIES = new Set([
  'breez-news',
  'breez-in-the-news',
  'breez-insights'
]);

function normalizeCategory(post) {
  const original = post.category;
  if (CATEGORY_ALIASES[original]) {
    post.category = CATEGORY_ALIASES[original];
  } else if (original === 'news') {
    console.warn(
      `[blog] Post "${post.slug || post.title}" has legacy category "news" — ` +
      `re-tag in the sheet to either "breez-news" (press release) or ` +
      `"breez-in-the-news" (editorial). Defaulting to breez-in-the-news for now.`
    );
    post.category = 'breez-in-the-news';
  } else if (!VALID_CATEGORIES.has(original)) {
    console.warn(
      `[blog] Post "${post.slug || post.title}" has unrecognized category "${original}". ` +
      `Defaulting to breez-insights.`
    );
    post.category = 'breez-insights';
  }
}

// Robust truthy check for spreadsheet boolean cells.
// Handles "TRUE", "True", "true", "T", "YES", "Y", "1", checkbox exports, etc.
// Anything else (including "F", "FALSE", "", null, undefined) returns false.
function isTrue(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toUpperCase();
  return s === 'TRUE' || s === 'T' || s === 'YES' || s === 'Y' || s === '1';
}

// Parse CSV to JSON (handles multi-line content in quoted fields)
function parseCSV(csv) {
  const posts = [];
  let pos = 0;

  // Helper to read a field (handles quotes and multi-line content)
  function readField() {
    let field = '';
    let inQuotes = false;

    // Check if field starts with a quote
    if (csv[pos] === '"') {
      inQuotes = true;
      pos++;
    }

    while (pos < csv.length) {
      const char = csv[pos];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote ("")
          if (csv[pos + 1] === '"') {
            field += '"';
            pos += 2;
          } else {
            // End of quoted field
            pos++;
            inQuotes = false;
          }
        } else {
          field += char;
          pos++;
        }
      } else {
        if (char === ',' || char === '\n' || char === '\r') {
          break;
        }
        field += char;
        pos++;
      }
    }

    return field.trim();
  }

  // Helper to read a row
  function readRow() {
    const fields = [];
    while (pos < csv.length) {
      fields.push(readField());

      if (csv[pos] === ',') {
        pos++;
      } else if (csv[pos] === '\r') {
        pos++;
        if (csv[pos] === '\n') pos++;
        break;
      } else if (csv[pos] === '\n') {
        pos++;
        break;
      } else {
        break;
      }
    }
    return fields;
  }

  // Read header row
  const headers = readRow().map(h => {
    // Normalize column name: publishedDate -> publishDate
    return h === 'publishedDate' ? 'publishDate' : h;
  });

  // Read data rows
  while (pos < csv.length) {
    // Skip empty lines
    while (pos < csv.length && (csv[pos] === '\n' || csv[pos] === '\r')) {
      pos++;
    }
    if (pos >= csv.length) break;

    const values = readRow();
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const post = {};
    headers.forEach((header, index) => {
      post[header] = values[index] || '';
    });

    // Only include published posts
    if (isTrue(post.published)) {
      normalizeCategory(post);
      posts.push(post);
    }
  }

  // Sort by date (newest first). Use slug/title as a stable tiebreaker so
  // posts with identical publishDates always render in the same order
  // across reloads — otherwise the "first featured" can shift.
  posts.sort((a, b) => {
    const dateDiff = new Date(b.publishDate) - new Date(a.publishDate);
    if (dateDiff && !Number.isNaN(dateDiff)) return dateDiff;
    const aKey = (a.slug || a.title || '').toLowerCase();
    const bKey = (b.slug || b.title || '').toLowerCase();
    return aKey.localeCompare(bKey);
  });
  return posts;
}

// Sanitize post.imageFocus into a safe object-position value.
// Accepts up to 2 space-separated tokens, each a keyword
// (top/bottom/left/right/center) or a number with %/px units.
// Anything else is rejected so we never inject arbitrary CSS.
function getFocusStyle(post) {
  const v = (post.imageFocus || '').trim();
  if (!v) return '';
  const tokens = v.split(/\s+/);
  if (tokens.length < 1 || tokens.length > 2) return '';
  const tokenOk = /^(top|bottom|left|right|center|-?\d+(\.\d+)?(%|px))$/i;
  if (!tokens.every(t => tokenOk.test(t))) return '';
  return ` style="object-position: ${v}"`;
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Get category display name (used for the badge on cards)
function getCategoryName(category) {
  const names = {
    'breez-news': 'EVERYAISLE News',
    'breez-in-the-news': 'EVERYAISLE in the Press',
    'breez-insights': 'EVERYAISLE Insights'
  };
  return names[category] || category;
}

// Create blog post card HTML
function createPostCard(post, isFeatured = false) {
  const cardClass = isFeatured ? 'blog-card blog-card-featured' : 'blog-card';
  const isExternal = isTrue(post.external);

  // A post is treated as a press release if it's tagged breez-news OR the
  // byline is empty / set to a "Press Release" placeholder. This means
  // Debbie can drive the PR treatment from the sheet by either tagging
  // the category or just clearing the author field — both work.
  const rawAuthor = (post.author || '').trim();
  const authorMissing = rawAuthor === '' || rawAuthor.toLowerCase() === 'press release';
  const isPressRelease = post.category === 'breez-news' || authorMissing;

  // Author name - linked if external profile exists
  const authorNameHtml = post.externalProfile
    ? `<a href="${post.externalProfile}" target="_blank" rel="noopener" class="author-name author-link" onclick="event.stopPropagation()">${post.author}</a>`
    : `<span class="author-name">${post.author}</span>`;

  // Press releases get an "EN" avatar circle and "EVERYAISLE News" label
  // in place of the byline. Everything else renders the normal author block.
  const authorBlockHtml = isPressRelease
    ? `
          <div class="blog-card-author">
            <div class="author-avatar-placeholder author-avatar-placeholder--press-release">EN</div>
            <div class="author-info">
              <span class="author-name">EVERYAISLE News</span>
            </div>
          </div>`
    : `
          <div class="blog-card-author">
            ${post.authorImage ? `<img src="${post.authorImage}" alt="${post.author}" class="author-avatar">` : `<div class="author-avatar-placeholder">${post.author.charAt(0)}</div>`}
            <div class="author-info">
              ${authorNameHtml}
              ${post.authorRole ? `<span class="author-role">${post.authorRole}</span>` : ''}
            </div>
          </div>`;

  return `
    <article class="${cardClass}" onclick="window.location.href='/insights/post/${post.slug}/'" style="cursor: pointer;">
      <div class="blog-card-link">
        <div class="blog-card-image">
          <img src="${post.featuredImage}" alt="${post.title}" loading="lazy"${getFocusStyle(post)}>
        </div>
        <div class="blog-card-content">
          <time class="blog-card-date">${formatDate(post.publishDate)}</time>
          <h3 class="blog-card-title">${post.title}</h3>
          <p class="blog-card-excerpt">${post.excerpt}</p>
          ${authorBlockHtml}
        </div>
      </div>
    </article>
  `;
}

// Fetch and parse every published post, newest first.
async function fetchPosts() {
  const response = await fetch(GOOGLE_SHEET_CSV_URL);
  if (!response.ok) throw new Error('Failed to fetch');
  return parseCSV(await response.text());
}

// Fade the cards in one after another.
function animateCards() {
  setTimeout(() => {
    document.querySelectorAll('.blog-card').forEach((card, index) => {
      setTimeout(() => {
        card.classList.add('visible');
      }, index * 100);
    });
  }, 100);
}
