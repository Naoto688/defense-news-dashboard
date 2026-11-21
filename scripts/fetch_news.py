import datetime
import json
import os
import re
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

    def contains_keyword(keywords):
        for keyword in keywords:
            normalized = keyword.casefold()
            if normalized.isascii():
                pattern = r"(?<![a-z0-9]){}(?![a-z0-9])".format(
                    re.escape(normalized)
                )
                if re.search(pattern, text):
                    return True
            elif normalized in text:
                return True
        return False

    priority_categories = (
        (
            "機雷",
            (
                "mine",
                "mcm",
                "mine countermeasures",
                "mine warfare",
                "機雷",
                "掃海",
                "機雷戦",
                "対機雷",
                "mine disposal",
            ),
        ),
        (
            "USV/ASV",
            (
                "usv",
                "asv",
                "unmanned surface",
                "autonomous surface",
                "水上無人",
                "無人水上",
                "水上ドローン",
            ),
        ),
        (
            "UUV/AUV",
            (
                "uuv",
                "auv",
                "unmanned underwater",
                "autonomous underwater",
                "水中無人",
                "無人潜水",
                "水中ドローン",
                "remus",
                "seafox",
            ),
        ),
        ("宇宙", ("宇宙", "衛星", "軌道", "space", "satellite", "orbit")),
        (
            "サイバー",
            ("サイバー", "電磁波", "電子戦", "cyber", "electronic warfare"),
        ),
        (
            "陸上防衛",
            ("陸自", "陸上自衛隊", "戦車", "装甲車", "army", "tank", "ground force"),
        ),
        (
            "海上防衛",
            (
                "海自",
                "海上自衛隊",
                "護衛艦",
                "潜水艦",
                "艦艇",
                "navy",
                "naval",
                "submarine",
                "frigate",
                "destroyer",
                "warship",
            ),
        ),
        (
            "航空防衛",
            (
                "空自",
                "航空自衛隊",
                "戦闘機",
                "航空機",
                "air force",
                "fighter",
                "aircraft",
                "f-35",
            ),
        ),
        (
            "技術",
            (
                "技術",
                "研究開発",
                "装備庁",
                "ai",
                "量子",
                "極超音速",
                "technology",
                "r&d",
                "hypersonic",
                "quantum",
                "darpa",
            ),
        ),
    )
    for category, keywords in priority_categories:
        if contains_keyword(keywords):
            return category
    return "国際情勢"


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
