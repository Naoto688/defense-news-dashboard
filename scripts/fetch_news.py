import datetime
import html.parser
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


def google_feed(label, query, category, language="en"):
    locale = {
        "ja": {"hl": "ja", "gl": "JP", "ceid": "JP:ja"},
        "en": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
    }[language]
    query_parameters = urllib.parse.urlencode({"q": query, **locale})
    return {
        "label": label,
        "url": "https://news.google.com/rss/search?" + query_parameters,
        "category": category,
        "language": language,
    }


FEEDS = [
    google_feed("防衛省・自衛隊", "防衛省 OR 自衛隊 when:7d", "国際情勢", "ja"),
    google_feed("防衛装備・防衛産業", "防衛装備 OR 防衛産業 when:7d", "技術", "ja"),
    google_feed("宇宙・サイバー防衛", "宇宙 サイバー 防衛 when:7d", "宇宙", "ja"),
    google_feed(
        "Deepwater Robotics",
        '"Deepwater Robotics" when:30d',
        "UUV/AUV",
    ),
    google_feed(
        "Mission Technologies / HII",
        'site:hii.com OR "HII Mission Technologies" when:14d',
        "技術",
    ),
    google_feed(
        "Mine Warfare Association",
        '"Mine Warfare Association" OR site:minewarfare.org when:30d',
        "機雷",
    ),
    google_feed(
        "ClassNK 日本海事協会",
        'site:classnk.or.jp OR "日本海事協会" when:14d',
        "海上防衛",
        "ja",
    ),
    {
        "label": "U.S. Naval Institute",
        "url": "https://news.usni.org/feed",
        "category": "海上防衛",
        "language": "en",
    },
    google_feed(
        "海事プレス KAIJI PRESS",
        "site:kaijipress.com when:7d",
        "海上防衛",
        "ja",
    ),
    google_feed(
        "Sakana AI",
        'site:sakana.ai OR "Sakana AI" when:14d',
        "技術",
        "ja",
    ),
    google_feed(
        "Ocean Infinity",
        'site:oceaninfinity.com OR "Ocean Infinity" when:30d',
        "USV/ASV",
    ),
    google_feed(
        "KONGSBERG",
        'site:kongsberg.com OR "Kongsberg" defence when:14d',
        "UUV/AUV",
    ),
    google_feed(
        "Shield AI",
        'site:shield.ai OR "Shield AI" when:14d',
        "技術",
    ),
    google_feed(
        "Teledyne Marine",
        'site:teledynemarine.com OR "Teledyne Marine" when:30d',
        "UUV/AUV",
    ),
    google_feed(
        "Exail Defense & Security",
        'site:exail.com OR "Exail" defense when:30d',
        "機雷",
    ),
    google_feed(
        "Airbus Defence and Space",
        "site:airbus.com defence when:14d",
        "航空防衛",
    ),
    google_feed(
        "Anduril Industries",
        'site:anduril.com OR "Anduril" when:14d',
        "技術",
    ),
    {
        "label": "UK Ministry of Defence",
        "url": "https://www.gov.uk/government/organisations/ministry-of-defence.atom",
        "category": "国際情勢",
        "language": "en",
    },
    google_feed(
        "Oceanic Constellations",
        '"Oceanic Constellations" when:60d',
        "宇宙",
    ),
    google_feed(
        "Thales Defence",
        "site:thalesgroup.com defence when:14d",
        "機雷",
    ),
    google_feed(
        "CSIS Japan Chair",
        'site:csis.org "Japan Chair" when:30d',
        "国際情勢",
    ),
    google_feed(
        "U.S. Strategic Command",
        'site:stratcom.mil OR "U.S. Strategic Command" when:14d',
        "宇宙",
    ),
    google_feed(
        "BAE Systems",
        "site:baesystems.com when:14d",
        "海上防衛",
    ),
    google_feed(
        "Navy Leaders",
        'site:navyleaders.com OR "Navy Leaders" when:30d',
        "海上防衛",
    ),
    {"label": "Naval News", "url": "https://www.navalnews.com/feed/", "category": "海上防衛", "language": "en"},
    google_feed(
        "Maritime Robotics AS",
        'site:maritimerobotics.com OR "Maritime Robotics" when:30d',
        "USV/ASV",
    ),
    google_feed(
        "H. HENRIKSEN",
        'site:hhenriksen.com OR "H. Henriksen" marine when:60d',
        "USV/ASV",
    ),
]

MAX_ITEMS_PER_FEED = 10
MAX_TOTAL_ITEMS = 180
MAX_FEED_BYTES = 5 * 1024 * 1024
OUTPUT_PATH = os.path.join("data", "news.json")
TRANSLATION_ENDPOINT = "https://translate.googleapis.com/translate_a/single"
TRANSLATION_INTERVAL_SECONDS = 0.2
MAX_TRANSLATION_SUMMARY_LENGTH = 1200
MAX_TRANSLATED_SUMMARY_LENGTH = 200
_last_translation_request = 0.0
_translation_cache = {}


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


class PlainTextExtractor(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean_text(value):
    extractor = PlainTextExtractor()
    extractor.feed(value or "")
    extractor.close()
    return " ".join(" ".join(extractor.parts).split())


def item_link(element):
    links = []
    for child in element.iter():
        if local_name(child.tag) == "link":
            links.append(child)

    for link in links:
        if link.attrib.get("rel", "alternate") == "alternate":
            href = link.attrib.get("href", "").strip()
            if href:
                return href

    for child in links:
        if child.attrib.get("href", "").strip():
            return child.attrib["href"].strip()
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


def classify_news(title, summary, default_category="国際情勢"):
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
    return default_category


def detect_language(title, fallback_language):
    if re.search(r"[\u3040-\u30ff\u3400-\u9fff]", title):
        return "ja"
    if re.search(r"[A-Za-z]{2,}", title):
        return "en"
    return fallback_language


def translate_text(text):
    global _last_translation_request
    if text in _translation_cache:
        return _translation_cache[text]

    elapsed = time.monotonic() - _last_translation_request
    if _last_translation_request and elapsed < TRANSLATION_INTERVAL_SECONDS:
        time.sleep(TRANSLATION_INTERVAL_SECONDS - elapsed)

    parameters = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": "en",
            "tl": "ja",
            "dt": "t",
            "q": text,
        }
    )
    request = urllib.request.Request(
        TRANSLATION_ENDPOINT + "?" + parameters,
        headers={"User-Agent": "DefenseNewsDashboard/1.0"},
    )
    _last_translation_request = time.monotonic()
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read().decode("utf-8"))

    translated = "".join(
        segment[0]
        for segment in result[0]
        if isinstance(segment, list) and segment and isinstance(segment[0], str)
    ).strip()
    if not translated:
        raise ValueError("翻訳APIから空の翻訳結果が返されました。")
    _translation_cache[text] = translated
    return translated


def translate_or_original(text, source, field_name):
    try:
        return translate_text(text)
    except (OSError, ValueError, IndexError, KeyError, TypeError) as error:
        print(
            "{}の{}翻訳に失敗しました。原文を使用します: {}".format(
                source, field_name, error
            )
        )
        return text


def parse_feed(xml_data, feed):
    root = ET.fromstring(xml_data)
    entries = [
        element
        for element in root.iter()
        if local_name(element.tag) in ("item", "entry")
    ]
    articles = []
    for entry in entries[:MAX_ITEMS_PER_FEED]:
        title = clean_text(child_text(entry, {"title"}))
        link = item_link(entry)
        if not title or not link:
            continue

        summary = clean_text(
            child_text(entry, {"description", "summary", "encoded", "content"})
        )
        published = child_text(
            entry, {"pubdate", "published", "updated", "date", "issued"}
        )
        published_at = parse_date(published)
        article_url = link.split("#", 1)[0]
        language = detect_language(title, feed["language"])
        articles.append(
            {
                "id": article_url,
                "articleUrl": article_url,
                "title": title,
                "title_ja": title,
                "source": feed["label"],
                "language": language,
                "publishedAt": published_at,
                "category": classify_news(title, summary, feed["category"]),
                "summary": summary or "この記事には要約がありません。",
                "summary_ja": summary or "この記事には要約がありません。",
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
    articles = collected_articles[:MAX_TOTAL_ITEMS]
    for article in articles:
        if article["language"] != "en":
            continue

        article["title_ja"] = translate_or_original(
            article["title"], article["source"], "タイトル"
        )
        if article["summary"] == "この記事には要約がありません。":
            article["summary_ja"] = article["summary"]
        else:
            summary_to_translate = article["summary"][:MAX_TRANSLATION_SUMMARY_LENGTH]
            translated_summary = translate_or_original(
                summary_to_translate, article["source"], "要約"
            )
            article["summary_ja"] = translated_summary[:MAX_TRANSLATED_SUMMARY_LENGTH]
    return articles


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
