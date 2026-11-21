import csv
import datetime
import json
import os
import urllib.request


PAGE_SIZE = 1000
JST = datetime.timezone(datetime.timedelta(hours=9))
CSV_FIELDS = [
    "メモ記入",
    "タイトル",
    "カテゴリー",
    "ソース",
    "公開日時",
    "URL",
    "要約",
    "分析・考察メモ",
]


def fetch_clips():
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise SystemExit("SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください。")

    endpoint = (
        f"{supabase_url}/rest/v1/clipped_news"
        "?select=*&order=created_at.desc"
    )
    clips = []
    offset = 0

    while True:
        request = urllib.request.Request(
            endpoint,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Accept": "application/json",
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + PAGE_SIZE - 1}",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            page = json.loads(response.read().decode("utf-8"))
            content_range = response.headers.get("Content-Range", "")

        if not isinstance(page, list):
            raise ValueError("Supabase APIの応答が配列ではありません。")
        if not page:
            break

        clips.extend(page)
        total_rows = content_range.rpartition("/")[2]
        if total_rows.isdigit():
            if offset + len(page) >= int(total_rows):
                break
        elif len(page) < PAGE_SIZE:
            break
        offset += len(page)

    return clips


def get_memo(clip):
    note = str(clip.get("note") or "").strip()
    if note:
        return note
    return str(clip.get("memo") or "").strip()


def get_value(clip, key):
    value = clip.get(key)
    return "" if value is None else str(value)


def format_published_at(value):
    if not value:
        return "日時不明"
    try:
        parsed = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(JST).strftime("%Y-%m-%d %H:%M JST")
    except ValueError:
        return " ".join(str(value).split())


def sort_clips(clips):
    return sorted(
        clips,
        key=lambda clip: (
            bool(get_memo(clip)),
            get_value(clip, "created_at"),
        ),
        reverse=True,
    )


def markdown_escape(value):
    special_characters = "\\`*_{}[]()#+-.!|<>"
    escaped_lines = []
    for line in str(value or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        escaped_lines.append(
            "".join(
                f"\\{character}" if character in special_characters else character
                for character in line
            )
        )
    return "\n".join(escaped_lines)


def single_line(value):
    return " ".join(str(value or "").split())


def markdown_code(value):
    text = single_line(value).replace("`", "\\`")
    return f"`{text}`"


def csv_safe(value):
    text = str(value or "")
    if text.lstrip(" \t\r").startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def write_markdown(path, clips, created_at):
    clips_with_memos = [clip for clip in clips if get_memo(clip)]
    lines = [
        "# 週次重要クリップレポート",
        "",
        f"- 作成日: {created_at.strftime('%Y-%m-%d')}",
        f"- 総クリップ数: {len(clips)}件",
        f"- メモ記入済み: {len(clips_with_memos)}件",
        "",
        "## 分析・考察メモ付き記事",
        "",
    ]

    if not clips_with_memos:
        lines.append("メモ記入済みの記事はありません。")

    for index, clip in enumerate(clips_with_memos, start=1):
        title = single_line(clip.get("title")) or "タイトル不明"
        category = single_line(clip.get("category")) or "カテゴリー不明"
        source = single_line(clip.get("source")) or "ソース不明"
        published_at = format_published_at(clip.get("published_at"))
        url = markdown_code(clip.get("article_url") or "URL不明")
        summary = markdown_escape(clip.get("summary") or "要約はありません。")
        memo_lines = markdown_escape(get_memo(clip)).split("\n")

        lines.extend(
            [
                f"### {index}. {markdown_escape(title)}",
                "",
                f"- カテゴリー: {markdown_escape(category)}",
                f"- ソース: {markdown_escape(source)}",
                f"- 公開日時: {published_at}",
                f"- URL: {url}",
                "",
                "#### 要約",
                "",
                summary,
                "",
                "> 【分析・考察メモ】",
            ]
        )
        lines.extend(f"> {line}" for line in memo_lines)
        lines.append("")

    with open(path, "w", encoding="utf-8", newline="") as report:
        report.write("\n".join(lines).rstrip() + "\n")


def write_csv(path, clips):
    with open(path, "w", encoding="utf-8-sig", newline="") as report:
        writer = csv.DictWriter(report, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for clip in clips:
            writer.writerow(
                {
                    "メモ記入": "あり" if get_memo(clip) else "なし",
                    "タイトル": csv_safe(clip.get("title")),
                    "カテゴリー": csv_safe(clip.get("category")),
                    "ソース": csv_safe(clip.get("source")),
                    "公開日時": csv_safe(format_published_at(clip.get("published_at"))),
                    "URL": csv_safe(clip.get("article_url")),
                    "要約": csv_safe(clip.get("summary")),
                    "分析・考察メモ": csv_safe(get_memo(clip)),
                }
            )


def main():
    clips = sort_clips(fetch_clips())
    created_at = datetime.datetime.now(JST)
    report_date = created_at.strftime("%Y%m%d")
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
    os.makedirs(reports_dir, exist_ok=True)

    markdown_path = os.path.join(
        reports_dir, f"weekly_clips_report_{report_date}.md"
    )
    csv_path = os.path.join(reports_dir, f"weekly_clips_report_{report_date}.csv")

    write_markdown(markdown_path, clips, created_at)
    write_csv(csv_path, clips)

    memo_count = sum(1 for clip in clips if get_memo(clip))
    print(
        f"週次レポートを生成しました: 全{len(clips)}件、"
        f"メモ付き{memo_count}件。"
    )


if __name__ == "__main__":
    main()
