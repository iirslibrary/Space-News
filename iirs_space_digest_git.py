# -*- coding: utf-8 -*-
"""
IIRS Space Digest - PythonAnywhere Production Version
Daily automated space news for IIRS employees (LAST 24 HOURS ROLLING WINDOW)
COSMIC VOID THEME - 80% WIDTH + SINGLE SCROLL (NO TABS) + TITLE FILTER
"""

import feedparser
import re
from datetime import datetime, timedelta, timezone
import email.utils
import time
import os
from urllib.parse import urljoin

print("🚀 Starting IIRS Daily Space Digest - LAST 24 HOURS WINDOW...")

# 🛑 EXCLUSION KEYWORDS (Negative Filter)
# Any news title containing these words will be REMOVED even if it matches the positive keywords.
# Add words here like 'politics', 'budget', 'cricket', 'horoscope' etc.
EXCLUDED_KEYWORDS = r'(?i)(rape|murder|KYC|digilocker|arrest|crime|FIR|strikes|Rajya Sabha|Muslims|metro)'

# 🏔️ Regional Keywords (Uttarakhand/Dehradun focus)
# REMOVED "pollution" to prevent political news overlap
REGIONAL_KEYWORDS = r'(?i)(space|satellite|remote sensing|gis|iirs|rrsc|nrsc|earth observation|glacier|landslide|cloudburst|disaster|floods|avalanche|earthquake|seismic|hyperspectral|air quality index| AQI |snowfall)'

# 🇮🇳 National Keywords (ISRO focus)
NATIONAL_KEYWORDS = r'(?i)(isro|nrsc|nsil|chandrayaan| IIST |gaganyaan|pslv|glsv|lvm3|spadex|gsat|insat|resourcesat|cartosat|risat|launch|rocket|spacecraft|astronaut|shukrayaan|aditya|spaceport|sriharikota|indian space|vyommitra|eos|pslv-c62|axiom|nesac|nsss|sslv|nvs|hlvm3|om1)'

# 🌌 International Keywords
INTERNATIONAL_KEYWORDS = r'(?i)(nasa|esa|jaxa|cnsa|roscosmos|spacex|blue origin|artemis|starship|crew dragon|iss|international space station|hubble|james webb|mars rover|perseverance|insight|booster|orbital|launch|spacecraft|astronaut|spacewalk|satellite|mission|space agency)'

REGIONAL_FEEDS = [
    'https://www.amarujala.com/rss/uttarakhand.rss',
    'https://khabardevbhoomi.com/feed/',
    'https://devbhoomimedia.com/feed',
    'https://pioneeredge.in/feed',
    'https://www.livehindustan.com/uttarakhand/rss',
    'https://timesofindia.indiatimes.com/city/delhi/rssfeeds/1311474.cms',
    'https://indianexpress.com/section/cities/delhi/feed/',
    'https://www.hindustantimes.com/cities/delhi-news/rssfeed/',
]

from datetime import date, timedelta
yesterday = (date.today() - timedelta(days=1)).strftime('%Y-%m-%d')
google_isro = f'https://news.google.com/rss/search?q=ISRO+OR+NRSC+OR+IIRS+after:{yesterday}&hl=en-IN&gl=IN&-site:indianexpress.com&-site:thehindu.com&-site:timesofindia.indiatimes.com&-site:isro.gov.in&-site:economictimes.indiatimes.com'


NATIONAL_FEEDS = [
    # Direct RSS feeds (full content, reliable)
    'https://timesofindia.indiatimes.com/rssfeeds/1201659.cms',
    'https://indianexpress.com/section/science/feed/',
    'https://www.thehindu.com/sci-tech/science/rssfeed/',
    'https://www.thehindu.com/news/national/rssfeed/',
    'https://www.isro.gov.in/rssnews.xml',
    'https://government.economictimes.indiatimes.com/rss/digital-india',
    'https://government.economictimes.indiatimes.com/rss/policy',
    'https://government.economictimes.indiatimes.com/rss/governance',
    'https://government.economictimes.indiatimes.com/rss/smart-infra',
    'https://government.economictimes.indiatimes.com/rss/Defence',
    'https://government.economictimes.indiatimes.com/rss/economy',

    # Google News LAST: Catches ISRO misses, excludes above sites
    google_isro
]



INTERNATIONAL_FEEDS = [
    'https://www.esa.int/rss/rss-topnews.xml',
    'https://www.esa.int/rss/programmes.xml',
    'https://www.esa.int/rss/space_science.xml',
    'https://www.esa.int/rss/earth_observation.xml',
    'https://www.nasa.gov/rss/dyn/breaking_news.rss',
    'https://www.nasa.gov/rss/dyn/images_of_the_day.rss',
    'https://www.space.com/feeds/all',
    'https://spaceflightnow.com/feed/',
    'https://phys.org/rss-feed/space-news/',
    'https://www.thespacereview.com/rss.xml',
    'https://interestingengineering.com/feed',
]



#Sub functions for using the extraction of image##

BAD_IMAGE_HINTS = [
    "logo", "icon", "favicon", "sprite", "banner", "ads", "advert",
    "google-news", "gnews", "default", "placeholder", "avatar",
    "feedburner", "newsletter", "branding", "youtube", "facebook",
    "twitter", "instagram", "linkedin", "whatsapp", "telegram",
    "share", "social", "theme-assets"
]

BAD_IMAGE_EXTENSIONS = [".svg", ".ico"]

def is_valid_image_url(url):
    if not url or not url.startswith("http"):
        return False

    lower_url = url.lower()

    # Reject bad extensions
    if any(lower_url.endswith(ext) for ext in BAD_IMAGE_EXTENSIONS):
        return False

    # Reject known non-article asset hints
    if any(hint in lower_url for hint in BAD_IMAGE_HINTS):
        return False

    # Reject common static/theme asset paths unless they look like article uploads
    if "/wp-content/themes/" in lower_url:
        return False

    return True


def extract_image_from_raw_html(url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en-US,en;q=0.9"
        }
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        html = response.text

        patterns = [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<img[^>]+data-lazy-src=["\']([^"\']+)["\']',
            r'<img[^>]+data-src=["\']([^"\']+)["\']',
            r'<img[^>]+data-srcset=["\']([^"\']+)["\']',
            r'<img[^>]+src=["\']([^"\']+)["\']'
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html, flags=re.I)
            for match in matches:
                img = match.strip().split()[0]

                if img.startswith("//"):
                    img = "https:" + img
                elif img.startswith("/"):
                    from urllib.parse import urljoin
                    img = urljoin(url, img)

                if is_valid_image_url(img):
                    return img
    except:
        pass

    return None

def extract_image_from_jsonld_or_scripts(url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en-US,en;q=0.9"
        }
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        html = response.text

        patterns = [
            r'"image"\s*:\s*"([^"]+)"',
            r'"thumbnailUrl"\s*:\s*"([^"]+)"',
            r'"contentUrl"\s*:\s*"([^"]+)"',
            r'"url"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp))"'
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html, flags=re.I)
            for img in matches:
                img = img.replace("\\/", "/")
                if img.startswith("//"):
                    img = "https:" + img
                elif img.startswith("/"):
                    from urllib.parse import urljoin
                    img = urljoin(url, img)

                if is_valid_image_url(img):
                    return img
    except:
        pass

    return None

  


##end

#For Fetching news images from enws article source##

def resolve_google_news_url(url):
    if not url or "news.google.com" not in url:
        return url

    try:
        decoded = gnewsdecoder(url)
        if isinstance(decoded, dict) and decoded.get("status"):
            decoded_url = decoded.get("decoded_url")
            if decoded_url and decoded_url.startswith("http"):
                return decoded_url
    except:
        pass

    return url

def extract_image_with_newspaper(url):
    if not url or not url.startswith("http"):
        return None

    try:
        article = Article(url)
        article.download()
        article.parse()

        if article.top_image and article.top_image.startswith("http"):
            return article.top_image

        if article.images:
            for img in article.images:
                if isinstance(img, str) and img.startswith("http"):
                    return img
    except:
        pass

    return None

def extract_first_image_url(entry, article_url=None):
    try:
        for item in entry.get("media_content", []):
            url = item.get("url")
            if url and url.startswith("http"):
                return url
    except:
        pass

    try:
        for item in entry.get("media_thumbnail", []):
            url = item.get("url")
            if url and url.startswith("http"):
                return url
    except:
        pass

    try:
        for link in entry.get("links", []):
            href = link.get("href", "")
            link_type = link.get("type", "")
            rel = link.get("rel", "")
            if href and href.startswith("http") and (rel == "enclosure" or str(link_type).startswith("image/")):
                return href
    except:
        pass

    if article_url:
        image = extract_image_with_newspaper(article_url)
        if image:
            return image

        image = extract_image_from_raw_html(article_url)
        if image:
            return image

        image = extract_image_from_jsonld_or_scripts(article_url)
        if image:
            return image

    return None



##end 


def sanitize_html_content(text):
    if not text:
        return ''
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text[:380] + '...' if len(text) > 380 else text.strip()

def is_within_last_24_hours(entry):
    """
    Checks if the news entry was published within the last 24 hours
    relative to the current system time (UTC).
    """
    now = datetime.now(timezone.utc)
    cutoff_time = now - timedelta(hours=24)

    # 1. Try standard 'published_parsed' (struct_time)
    # Most reliable method for feedparser
    pub_struct = entry.get('published_parsed') or entry.get('updated_parsed') or entry.get('created_parsed')

    if pub_struct:
        try:
            # Convert struct_time to aware datetime (UTC)
            pub_time = datetime(*pub_struct[:6], tzinfo=timezone.utc)
            return pub_time >= cutoff_time
        except:
            pass # Continue to fallback if conversion fails

    # 2. Fallback: Parse string dates if struct is missing
    date_str = entry.get('published') or entry.get('updated') or entry.get('created')
    if date_str:
        try:
            # Parse RFC 822 date (standard for RSS)
            parsed_tuple = email.utils.parsedate_tz(date_str)
            if parsed_tuple:
                ts = email.utils.mktime_tz(parsed_tuple)
                pub_time = datetime.fromtimestamp(ts, timezone.utc)
                return pub_time >= cutoff_time
        except:
            pass

    # If no valid date is found, we assume it's NOT new to avoid spamming old news
    return False


def fetch_news_from_feeds(feeds, max_articles=6):
    news = []
    for url in feeds:
        try:
            feed = feedparser.parse(url)
            print(f"📱 {feed.feed.get('title', 'Unknown')} - checking...")

            for entry in feed.entries[:15]:
                if is_within_last_24_hours(entry):
                    title_lower = entry.title.lower()

                    raw_summary = entry.get('summary', '') or entry.get('description', '')
                    summary_lower = raw_summary.lower()
                    full_text_check = title_lower + " " + summary_lower

                    if url in REGIONAL_FEEDS:
                        keyword_pattern = REGIONAL_KEYWORDS
                    elif url in NATIONAL_FEEDS:
                        keyword_pattern = NATIONAL_KEYWORDS
                    else:
                        keyword_pattern = INTERNATIONAL_KEYWORDS

                    if not re.search(keyword_pattern, title_lower):
                        continue

                    if re.search(EXCLUDED_KEYWORDS, full_text_check):
                        print(f"🗑️ REMOVED (Excluded content): {entry.title[:40]}...")
                        continue

                    original_link = entry.link
                    final_link = original_link

                    if original_link and "news.google.com" in original_link:
                        final_link = resolve_google_news_url(original_link)

                    image_url = extract_first_image_url(entry, final_link)
                    summary = sanitize_html_content(raw_summary)
                    title = re.sub(r'<[^>]+>', '', entry.title)

                    news.append({
                        'title': title,
                        'link': final_link,
                        'source': feed.feed.get('title', 'Space News'),
                        'summary': summary,
                        'image': image_url
                    })

                    print(f"✅ NEW (24h): {title[:60]}...")
                    print(f"🔗 Original link: {original_link}")
                    print(f"🔗 Final link: {final_link}")
                    print(f"🖼️ Image found: {image_url}")

                    if len(news) >= max_articles:
                        break

            if len(news) >= max_articles:
                break

        except Exception as e:
            print(f"⚠️ Skip {url}: {e}")

    return news




# No fallback needed with rolling window, but we keep structure clean
print("🏔️ Fetching REGIONAL...")
regional_news = fetch_news_from_feeds(REGIONAL_FEEDS, max_articles=5)

print("🇮🇳 Fetching NATIONAL...")
national_news = fetch_news_from_feeds(NATIONAL_FEEDS, max_articles=6)

print("🌌 Fetching INTERNATIONAL...")
international_news = fetch_news_from_feeds(INTERNATIONAL_FEEDS, max_articles=8)

# Combine ALL news into single list with labels
all_news = []
for news_list, category in [
    (regional_news, "🏔️ Regional Updates"),
    (national_news, "🇮🇳 National Updates"),
    (international_news, "🌌 International Updates")
]:
    for item in news_list:
         item['category'] = category
         all_news.append(item)

# Ensure at least one placeholder if completely empty
if not all_news:
    all_news.append({'title': 'No space news in last 24h', 'link': '#', 'source': 'IIRS Digest', 'summary': 'Check back tomorrow!', 'image': None, 'category': 'System'})

def make_articles_html(news_list):
    html = ""
    for i, item in enumerate(news_list, 1):
        image_html = ''
        if item.get("image"):
            image_html = (
                f'<img src="{item["image"]}" alt="Space news image" '
                f'class="card-image" loading="lazy" '
                f'onerror="this.style.display=\'none\'">'
            )
        html += f'''
            <div class="news-card">
                <div class="card-content">
                    {image_html}
                    <!-- Category label removed -->
                    <div class="card-title">
                        <a href="{item["link"]}" target="_blank">{i}. {item["title"]}</a>
                    </div>
                    <div class="card-source">{item["source"]}</div>
                    <div class="card-summary">{item["summary"]}</div>
                    <a href="{item["link"]}" target="_blank" class="read-more">Read Full Article →</a>
                </div>
            </div>
        '''
    return html

all_articles_html = make_articles_html(all_news)

# Create explicit IST timezone (+5:30)
ist_offset = timezone(timedelta(hours=5, minutes=30))
timestamp = datetime.now(ist_offset).strftime("%d-%m-%Y | %H:%M IST")


html_body = f"""<!DOCTYPE html>
<html data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {{
    --bg-primary: #0a0a0a;
    --bg-secondary: rgba(10, 10, 10, 0.9);
    --card-bg: rgba(255,255,255,0.05);
    --card-summary: rgba(255,255,255,0.02);
    --text-primary: #c0c0c0;
    --text-secondary: #a0a0a0;
    --text-light: #d0d0d0;
    --text-white: #ffffff;
    --border-light: rgba(255,255,255,0.08);
    --border-card: rgba(255,255,255,0.1);
    --shadow-dark: rgba(0,0,0,0.8);
    --cyan-accent: #00ffff;
}}
[data-theme="light"] {{
    --bg-primary: #f8fafc !important;
    --bg-secondary: rgba(255, 255, 255, 0.98) !important;
    --card-bg: rgba(255,255,255,0.95) !important;
    --card-summary: rgba(248, 250, 252, 0.8) !important;
    --text-primary: #1e293b !important;
    --text-secondary: #475569 !important;
    --text-light: #334155 !important;
    --text-white: #0f172a !important;
    --border-light: rgba(0,0,0,0.06) !important;
    --border-card: rgba(0,0,0,0.08) !important;
    --shadow-dark: rgba(0,0,0,0.1) !important;
    --cyan-accent: #00b8d4 !important;
}}

* {{ box-sizing: border-box !important; }}
html {{ background: var(--bg-primary) !important; min-height: 100vh !important; }}
body {{
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
    margin: 0 !important;
    padding: 20px !important;
    background: var(--bg-primary) !important;
    color: var(--text-primary) !important;
    min-height: 100vh !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
}}

/* Space Background Animation */
body::before {{
    content: '' !important;
    position: fixed !important;
    top: 0; left: 0; width: 100%; height: 100%;
    background-image:
        radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), transparent),
        radial-gradient(1px 1px at 160px 30px, rgba(255,255,255,0.25), transparent);
    background-size: 300px 300px !important;
    animation: voidDrift 60s linear infinite !important;
    pointer-events: none !important;
    z-index: -1 !important;
    opacity: 0.5 !important;
}}
@keyframes voidDrift {{ from {{ background-position: 0 0; }} to {{ background-position: 0 600px; }} }}

.theme-toggle {{
    position: fixed !important; top: 20px !important; right: 20px !important;
    width: 45px !important; height: 45px !important;
    border-radius: 50% !important; border: none !important;
    background: rgba(255,255,255,0.1) !important;
    color: #fff !important; font-size: 20px !important;
    cursor: pointer !important; backdrop-filter: blur(10px) !important;
    z-index: 1000 !important;
}}

.scroll-container {{
    width: 80% !important;
    max-width: none !important;
    min-width: 600px !important;
    background: var(--bg-secondary) !important;
    backdrop-filter: blur(30px) !important;
    border: 1px solid var(--border-light) !important;
    border-radius: 24px !important;
    padding: 40px !important;
    box-shadow: 0 35px 70px var(--shadow-dark) !important;
    margin-top: 20px !important;
}}

h2 {{
    color: var(--text-white) !important;
    text-align: center !important;
    border-bottom: 2px solid var(--border-light) !important;
    padding-bottom: 20px !important;
    margin-bottom: 30px !important;
    font-weight: 700 !important;
    letter-spacing: 1px !important;
}}

.news-card {{ margin-bottom: 40px !important; }}
.card-content {{
    background: var(--card-bg) !important;
    border: 1px solid var(--border-card) !important;
    border-radius: 20px !important;
    padding: 30px !important;
    box-shadow: 0 10px 30px var(--shadow-dark) !important;
    transition: transform 0.3s ease !important;
}}
.card-content:hover {{ transform: translateY(-5px) !important; border-color: var(--cyan-accent) !important; }}

.card-image {{
    width: 100% !important; height: 350px !important;
    object-fit: cover !important;
    border-radius: 12px !important; margin-bottom: 20px !important;
    border: 1px solid var(--border-card) !important;
}}

.card-title a {{
    color: var(--text-white) !important; text-decoration: none !important;
    font-size: 24px !important;
    font-weight: 600 !important; display: block !important;
    margin-bottom: 10px !important;
}}
.card-title a:hover {{ text-decoration: underline !important; color: var(--cyan-accent) !important; }}

.card-source {{
    display: inline-block !important; padding: 5px 12px !important;
    background: rgba(255,255,255,0.05) !important; border-radius: 15px !important;
    font-size: 13px !important; color: var(--text-secondary) !important;
    margin-bottom: 15px !important; border: 1px solid var(--border-light) !important;
}}

.card-summary {{
    color: var(--text-light) !important; line-height: 1.7 !important;
    font-size: 16px !important;
    margin-bottom: 20px !important;
}}

.read-more {{
    display: inline-block !important; padding: 10px 20px !important;
    background: transparent !important; border: 1px solid var(--cyan-accent) !important;
    color: var(--cyan-accent) !important; text-decoration: none !important;
    border-radius: 25px !important; font-weight: 600 !important; font-size: 14px !important;
    transition: all 0.3s ease !important;
}}
.read-more:hover {{ background: var(--cyan-accent) !important; color: #000 !important; }}

.footer {{
    text-align: center !important; margin-top: 40px !important;
    color: var(--text-secondary) !important; font-size: 13px !important;
    padding-bottom: 20px !important;
}}

@media (max-width: 1000px) {{
    .scroll-container {{ width: 90% !important; min-width: 0 !important; }}
}}
@media (max-width: 768px) {{
    .scroll-container {{ width: 95% !important; padding: 20px !important; }}
    .card-content {{ padding: 20px !important; }}
    h2 {{ font-size: 22px !important; }}
    .card-image {{ height: 200px !important; }}
}}
</style>
</head>
<body>
<button class="theme-toggle" id="themeToggle" title="Toggle Theme">☀️</button>

<div class="scroll-container">
    <h2>🌌 IIRS Daily Space Digest</h2>
    <p style="text-align:center; color:var(--text-secondary); margin-top:-20px; margin-bottom:40px;">
        {timestamp} | {len(all_news)} Updates Found
    </p>

    {all_articles_html}

    <div class="footer">
        IIRS Library | Indian Institute of Remote Sensing | Dehradun<br>
        <small>Automated Digest System</small>
    </div>
</div>

<script>
    const btn = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Check local storage
    if (localStorage.getItem('theme') === 'light') {{
        html.setAttribute('data-theme', 'light');
        btn.textContent = '🌙';
    }}

    btn.addEventListener('click', () => {{
        if (html.getAttribute('data-theme') === 'light') {{
            html.removeAttribute('data-theme');
            btn.textContent = '☀️';
            localStorage.setItem('theme', 'dark');
        }} else {{
            html.setAttribute('data-theme', 'light');
            btn.textContent = '🌙';
            localStorage.setItem('theme', 'light');
        }}
    }});
</script>
</body>
</html>
"""

filename = f'IIRS_SpaceNews_Daily_{datetime.now().strftime("%Y%m%d")}.html'
with open(filename, 'w', encoding='utf-8') as f:
    f.write(html_body)

print(f"✅ SAVED: {filename} with {len(all_news)} items")
print("📱 80% responsive width + SINGLE PAGE + 24H WINDOW OK.")
