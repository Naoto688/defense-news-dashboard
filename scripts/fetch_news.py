import datetime
import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


FEEDS = [
    {
        "label": "防衛省・自衛隊",
        "url": "https://news.google.com/rss/search?q="
        + urllib.parse.quote("防衛省 OR 自衛隊 when:7d")
        + "&hl=ja&gl=JP&ceid=JP:ja",
    },
    {
        "label": "防衛装備・防衛産業",
        "url": "https://news.google.com/rss/search?q="
        + urllib.parse.quote("防衛装備 OR 防衛産業 when:7d")
        + "&hl=ja&gl=JP&ceid=JP:ja",
    },
    {
        "label": "宇宙・サイバー防衛",
        "url": "https://news.google.com/rss/search?q="
        + urllib.parse.quote("宇宙 サイバー 防衛 when:7d")
        + "&hl=ja&gl=JP&ceid=JP:ja",
    },
    {"label": "Naval News", "url": "https://www.navalnews.com/feed/"},
    {
        "label": "Defense News",
        "url": "https://www.defensenews.com/arc/outboundfeeds/rss/category/naval/?outputType=xml",
    },
    {
        "label": "RAND Corporation",
        "url": "https://www.rand.org/topics/national-security.xml",
    },
]

MAX_ITEMS_PER_FEED = 30
MAX_TOTAL_ITEMS = 100
MAX_FEED_BYTES = 5 * 1024 * 1024
OUTPUT_PATH = os.path.join("data", "news.json")


def local_name(tag):
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element, names):
    for child in element.iter():
        if child is element or local_name(child.tag) not in names:
            continue
        text = "".join(child.itertext()).strip()
        if text:
            return text
    return ""


def item_link(element):
    for child in element.iter():
        if local_name(child.tag) == "link":
            href = child.attrib.get("href", "").strip()
            if href:
                return href
            text = "".join(child.itertext()).strip()
            if text:
                return text
    return ""


def parse_date(value):
    value = value.strip()
    if not value:
        return None

    if value.endswith(" GMT") or value.endswith(" UTC"):
        value = value[:-4] + " +0000"
    iso_value = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.datetime.fromisoformat(iso_value)
    except ValueError:
        parsed = None

    if parsed is None:
        for date_format in (
            "%a, %d %b %Y %H:%M:%S %z",
            "%a, %d %b %Y %H:%M %z",
            "%d %b %Y %H:%M:%S %z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                parsed = datetime.datetime.strptime(value, date_format)
                break
            except ValueError:
                continue

    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.isoformat()


def classify_news(title, summary):
    text = (title + " " + summary).casefold()
    if any(word in text for word in ("航空", "空自", "fighter", "air force", "f-35")):
        return "航空防衛"
    if any(
        word in text
        for word in ("海自", "海上", "naval", "navy", "艦", "submarine", "maritime")
    ):
        return "海上防衛"
    if any(
        word in text
        for word in ("陸自", "陸上", "army", "ground force", "tank", "戦車", "ミサイル")
    ):
        return "陸上防衛"
    if any(
        word in text
        for word in ("宇宙", "サイバー", "space", "cyber", "satellite", "人工知能", "drone", "無人機")
    ):
        return "宇宙・サイバー"
    return "国際情勢・技術"


def parse_feed(xml_data, feed):
    root = ET.fromstring(xml_data)
    entries = [
        element
        for element in root.iter()
        if local_name(element.tag) in ("item", "entry")
    ]
    articles = []
    for entry in entries[:MAX_ITEMS_PER_FEED]:
        title = child_text(entry, {"title"})
        link = item_link(entry)
        if not title or not link:
            continue

        summary = child_text(entry, {"description", "summary", "encoded", "content"})
        published = child_text(
            entry, {"pubdate", "published", "updated", "date", "issued"}
        )
        source = child_text(entry, {"source", "author"}) or feed["label"]
        published_at = parse_date(published)
        article_url = link.split("#", 1)[0]
        articles.append(
            {
                "id": article_url,
                "articleUrl": article_url,
                "title": title,
                "source": source,
                "publishedAt": published_at,
                "category": classify_news(title, summary),
                "summary": summary or "この記事には要約がありません。",
                "url": article_url,
                "isSample": False,
            }
        )
    return articles


def fetch_feed(feed):
    request = urllib.request.Request(
        feed["url"],
        headers={"User-Agent": "DefenseNewsDashboard/1.0 (+GitHub Actions)"},
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        xml_data = response.read(MAX_FEED_BYTES + 1)
    if len(xml_data) > MAX_FEED_BYTES:
        raise ValueError("RSSフィードがサイズ上限を超えました。")
    return parse_feed(xml_data, feed)


def article_sort_key(article):
    try:
        return datetime.datetime.fromisoformat(article["publishedAt"]).timestamp()
    except (TypeError, ValueError):
        return float("-inf")


def collect_news():
    collected_articles = []
    seen_titles = set()
    seen_urls = set()
    successful_feeds = 0

    for feed in FEEDS:
        try:
            feed_articles = fetch_feed(feed)
        except (OSError, ET.ParseError, ValueError) as error:
            print("{}の取得に失敗しました: {}".format(feed["label"], error))
            continue

        successful_feeds += 1
        print("{}から{}件取得しました。".format(feed["label"], len(feed_articles)))
        for article in feed_articles:
            title_key = "title:" + " ".join(article["title"].casefold().split())
            article_url = article["articleUrl"]
            if title_key in seen_titles or article_url in seen_urls:
                continue
            seen_titles.add(title_key)
            seen_urls.add(article_url)
            collected_articles.append(article)

    if successful_feeds == 0:
        raise RuntimeError("すべてのRSSフィード取得に失敗しました。既存データは維持します。")

    collected_articles.sort(key=article_sort_key, reverse=True)
    return collected_articles[:MAX_TOTAL_ITEMS]


def main():
    articles = collect_news()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    temporary_path = OUTPUT_PATH + ".tmp"
    with open(temporary_path, "w", encoding="utf-8", newline="\n") as output_file:
        json.dump(articles, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    os.replace(temporary_path, OUTPUT_PATH)
    print("{}件を{}に保存しました。".format(len(articles), OUTPUT_PATH))


if __name__ == "__main__":
    main()
