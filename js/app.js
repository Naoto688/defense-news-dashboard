"use strict";

function createPublishedAt(daysAgo, hours, minutes) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

const fallbackNews = [
  {
    id: "land-training",
    title: "【模擬】陸上部隊の災害対応訓練、自治体との連携手順を確認",
    source: "防衛政策ウォッチ（架空）",
    publishedAt: createPublishedAt(0, 9, 30),
    category: "陸上防衛",
    summary: "模擬記事です。地域の防災訓練を題材に、情報共有や避難支援の手順を確認する想定を紹介します。",
    url: "#",
    isSample: true
  },
  {
    id: "maritime-safety",
    title: "【模擬】海上安全の机上演習、関係機関の連絡体制を検討",
    source: "海洋安全レポート（架空）",
    publishedAt: createPublishedAt(0, 8, 15),
    category: "海上防衛",
    summary: "模擬記事です。海上の安全確保をテーマにした机上演習の想定と、機関間の連携課題をまとめています。",
    url: "#",
    isSample: true
  },
  {
    id: "air-monitoring",
    title: "【模擬】航空分野の監視技術、運用支援の実証計画を公表",
    source: "航空技術ニュース（架空）",
    publishedAt: createPublishedAt(0, 7, 50),
    category: "航空防衛",
    summary: "模擬記事です。安全性や整備性を重視した監視技術の実証計画について、概要を紹介します。",
    url: "#",
    isSample: true
  },
  {
    id: "space-cyber",
    title: "【模擬】宇宙・サイバー分野の人材育成で官民連携を検討",
    source: "デジタル安全保障通信（架空）",
    publishedAt: createPublishedAt(1, 16, 45),
    category: "宇宙・サイバー",
    summary: "模擬記事です。専門人材の育成や基礎的な情報共有のあり方をテーマにした検討会を想定しています。",
    url: "#",
    isSample: true
  },
  {
    id: "international-technology",
    title: "【模擬】多国間会合で新興技術の責任ある利用を意見交換",
    source: "国際情勢レビュー（架空）",
    publishedAt: createPublishedAt(1, 14, 10),
    category: "国際情勢・技術",
    summary: "模擬記事です。新興技術の透明性や国際協力に関する一般的な議論を取り上げます。",
    url: "#",
    isSample: true
  },
  {
    id: "land-maintenance",
    title: "【模擬】装備品の維持整備、長期運用を見据えた課題を整理",
    source: "安全保障産業ノート（架空）",
    publishedAt: createPublishedAt(2, 11, 20),
    category: "陸上防衛",
    summary: "模擬記事です。部品供給や整備人材の確保など、装備品を長期運用する際の一般的な論点を紹介します。",
    url: "#",
    isSample: true
  }
];

let newsItems = [...fallbackNews];

const rssFeeds = [
  { label: "防衛省・自衛隊", query: "防衛省 OR 自衛隊" },
  { label: "防衛装備・防衛産業", query: "防衛装備 OR 防衛産業" },
  { label: "安全保障・宇宙・サイバー", query: "安全保障 OR 宇宙 サイバー 防衛" }
].map((feed) => {
  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", feed.query);
  rssUrl.searchParams.set("hl", "ja");
  rssUrl.searchParams.set("gl", "JP");
  rssUrl.searchParams.set("ceid", "JP:ja");
  return { ...feed, rssUrl: rssUrl.toString() };
});

const rss2jsonEndpoint = "https://api.rss2json.com/v1/api.json";
const rssRequestTimeoutMs = 15000;

// stateには、画面の絞り込み条件と記事ごとのクリップ状態をまとめて保存します。
const state = {
  activeCategory: "すべて",
  keyword: "",
  clipsOnly: false,
  clippedIds: new Set(["maritime-safety", "space-cyber"])
};

const elements = {
  newsList: document.getElementById("news-list"),
  totalCount: document.getElementById("total-count"),
  todayCount: document.getElementById("today-count"),
  clipCount: document.getElementById("clip-count"),
  categoryNav: document.querySelector('nav[aria-label="ニュースカテゴリー"]'),
  searchInput: document.getElementById("keyword-search"),
  clipsOnlyInput: document.getElementById("important-only"),
  refreshButton: document.querySelector("body > header button")
};

if (Object.values(elements).some((element) => element === null)) {
  throw new Error("ダッシュボードの必要なHTML要素が見つかりません。");
}

const categoryButtons = elements.categoryNav.querySelectorAll("button");
const statusMessage = document.createElement("p");
statusMessage.setAttribute("role", "status");
statusMessage.setAttribute("aria-live", "polite");
elements.refreshButton.insertAdjacentElement("afterend", statusMessage);

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

function createParagraph(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

function createNewsCard(item) {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  title.textContent = item.title;
  card.append(title);

  card.append(createParagraph(`情報ソース：${item.source}`));

  const publishedParagraph = document.createElement("p");
  if (item.publishedAt instanceof Date && !Number.isNaN(item.publishedAt.getTime())) {
    const published = document.createElement("time");
    published.dateTime = item.publishedAt.toISOString();
    published.textContent = dateFormatter.format(item.publishedAt);
    publishedParagraph.append(published);
  } else {
    publishedParagraph.textContent = "公開日時不明";
  }
  card.append(publishedParagraph);

  const category = document.createElement("span");
  category.textContent = item.category;
  const categoryParagraph = document.createElement("p");
  categoryParagraph.append(category);
  card.append(categoryParagraph);

  card.append(createParagraph(item.summary));

  const isClipped = state.clippedIds.has(item.id);
  const clipButton = document.createElement("button");
  clipButton.type = "button";
  clipButton.dataset.articleId = item.id;
  clipButton.setAttribute("aria-pressed", String(isClipped));
  clipButton.setAttribute(
    "aria-label",
    isClipped ? "重要クリップを解除" : "この記事を重要クリップに登録"
  );
  clipButton.textContent = isClipped ? "★ クリップ済み" : "☆ 重要クリップ";
  card.append(clipButton);

  const sourceLink = document.createElement("a");
  sourceLink.href = item.url;
  sourceLink.setAttribute(
    "aria-label",
    item.isSample ? "元記事リンク（模擬データ）" : "元記事を開く"
  );
  sourceLink.textContent = item.isSample ? "元記事を開く（模擬）" : "元記事を開く";
  if (!item.isSample && item.url !== "#") {
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
  }
  card.append(sourceLink);

  return card;
}

function stripHtml(value) {
  const parsedHtml = new DOMParser().parseFromString(String(value || ""), "text/html");
  parsedHtml.querySelectorAll("script, style").forEach((element) => element.remove());
  return (parsedHtml.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function classifyNews(title, summary) {
  const text = `${title} ${summary}`;

  if (/(空自|航空自衛隊|航空防衛|戦闘機|\bF[- ]?35\b)/i.test(text)) {
    return "航空防衛";
  }
  if (/(海自|海上自衛隊|海上防衛|護衛艦|潜水艦)/i.test(text)) {
    return "海上防衛";
  }
  if (/(陸自|陸上自衛隊|陸上防衛|戦車|ミサイル)/i.test(text)) {
    return "陸上防衛";
  }
  if (/(宇宙|サイバー|\bAI\b|人工知能|無人機|ドローン)/i.test(text)) {
    return "宇宙・サイバー";
  }
  return "国際情勢・技術";
}

function getSafeArticleUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "#";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "#";
    }
    url.hash = "";
    return url.href;
  } catch (error) {
    console.warn("RSS記事のリンクを読み取れませんでした。", error);
    return "#";
  }
}

function normalizeRssItem(rawItem, feed) {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const title = stripHtml(rawItem.title);
  if (!title) {
    return null;
  }

  const summary = stripHtml(rawItem.description || rawItem.content || "");
  const url = getSafeArticleUrl(rawItem.link);
  const parsedDate = new Date(rawItem.pubDate || rawItem.date || "");
  const publishedAt = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  const idSource = url !== "#" ? url : String(rawItem.guid || title);

  return {
    id: `rss:${idSource}`,
    title,
    source: stripHtml(rawItem.author || "") || feed.label,
    publishedAt,
    category: classifyNews(title, summary),
    summary: summary || "この記事には要約がありません。",
    url,
    isSample: false
  };
}

function getDuplicateKeys(item) {
  const normalizedTitle = item.title
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ja");
  const keys = [`title:${normalizedTitle}`];

  if (item.url !== "#") {
    keys.push(`url:${item.url}`);
  }
  return keys;
}

function collectUniqueNews(feedResults) {
  const seenKeys = new Set();
  const articles = [];

  feedResults.forEach((result) => {
    result.items.forEach((rawItem) => {
      const article = normalizeRssItem(rawItem, result.feed);
      if (!article) {
        return;
      }

      const duplicateKeys = getDuplicateKeys(article);
      if (duplicateKeys.some((key) => seenKeys.has(key))) {
        return;
      }
      duplicateKeys.forEach((key) => seenKeys.add(key));
      articles.push(article);
    });
  });

  return articles.sort((left, right) => {
    const leftTime = left.publishedAt ? left.publishedAt.getTime() : 0;
    const rightTime = right.publishedAt ? right.publishedAt.getTime() : 0;
    return rightTime - leftTime;
  });
}

async function fetchRssFeed(feed) {
  const requestUrl = new URL(rss2jsonEndpoint);
  requestUrl.searchParams.set("rss_url", feed.rssUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), rssRequestTimeoutMs);
  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== "ok") {
      throw new Error(result.message || "RSS変換サービスがエラーを返しました。");
    }

    return Array.isArray(result.items) ? result.items : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshNews() {
  const originalButtonLabel = elements.refreshButton.textContent;
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "取得中...";
  elements.newsList.setAttribute("aria-busy", "true");
  statusMessage.textContent = "公開RSSフィードからニュースを取得しています。";

  try {
    // Promise.allで複数フィードを同時に取得し、1件の失敗で他の結果を失わないようにします。
    const feedResults = await Promise.all(
      rssFeeds.map(async (feed) => {
        try {
          return { feed, items: await fetchRssFeed(feed), error: null };
        } catch (error) {
          console.error(`${feed.label}のRSS取得に失敗しました。`, error);
          return { feed, items: [], error };
        }
      })
    );

    const failedFeeds = feedResults.filter((result) => result.error);
    const latestNews = collectUniqueNews(feedResults);

    if (latestNews.length > 0) {
      newsItems = latestNews;
      statusMessage.textContent = failedFeeds.length
        ? `一部のフィード（${failedFeeds.map((result) => result.feed.label).join("、")}）を取得できませんでした。取得できた記事を表示しています。`
        : "";
    } else {
      newsItems = [...fallbackNews];
      statusMessage.textContent = failedFeeds.length
        ? `ニュースを取得できませんでした。${failedFeeds.map((result) => result.feed.label).join("、")}の取得に失敗したため、サンプルニュースを表示しています。`
        : "RSSフィードに記事がなかったため、サンプルニュースを表示しています。";
    }

    renderDashboard();
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = originalButtonLabel;
    elements.newsList.removeAttribute("aria-busy");
  }
}

function getVisibleNews() {
  const keyword = state.keyword.trim().toLocaleLowerCase("ja");

  // filterは条件に合う記事だけを新しい配列に取り出します。
  return newsItems.filter((item) => {
    const matchesCategory =
      state.activeCategory === "すべて" || item.category === state.activeCategory;
    const searchableText = [
      item.title,
      item.source,
      item.category,
      item.summary
    ].join(" ").toLocaleLowerCase("ja");
    const matchesKeyword = searchableText.includes(keyword);
    const matchesClip = !state.clipsOnly || state.clippedIds.has(item.id);

    return matchesCategory && matchesKeyword && matchesClip;
  });
}

function renderNews() {
  elements.newsList
    .querySelectorAll(":scope > article, :scope > #empty-state")
    .forEach((child) => child.remove());

  const visibleNews = getVisibleNews();
  visibleNews.forEach((item) => {
    elements.newsList.append(createNewsCard(item));
  });

  if (visibleNews.length === 0) {
    const emptyMessage = createParagraph("条件に一致するニュースはありません。");
    emptyMessage.id = "empty-state";
    elements.newsList.append(emptyMessage);
  }
}

function updateSummary() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const todayCount = newsItems.filter(
    (item) => item.publishedAt >= startOfToday && item.publishedAt < startOfTomorrow
  ).length;

  elements.totalCount.textContent = String(newsItems.length);
  elements.todayCount.textContent = String(todayCount);
  elements.clipCount.textContent = String(
    newsItems.filter((item) => state.clippedIds.has(item.id)).length
  );
}

function renderDashboard() {
  updateSummary();
  renderNews();
}

// イベントリスナーは、操作が起きたときに状態を更新して画面を描き直します。
elements.categoryNav.addEventListener("click", (event) => {
  const selectedButton = event.target.closest("button");
  if (!selectedButton || !elements.categoryNav.contains(selectedButton)) {
    return;
  }

  state.activeCategory = selectedButton.textContent.trim();
  categoryButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button === selectedButton));
  });
  renderNews();
});

elements.searchInput.addEventListener("input", (event) => {
  state.keyword = event.target.value;
  renderNews();
});

elements.clipsOnlyInput.addEventListener("change", (event) => {
  state.clipsOnly = event.target.checked;
  renderNews();
});

elements.newsList.addEventListener("click", (event) => {
  const clipButton = event.target.closest("button[data-article-id]");
  if (!clipButton || !elements.newsList.contains(clipButton)) {
    return;
  }

  const articleId = clipButton.dataset.articleId;
  if (state.clippedIds.has(articleId)) {
    state.clippedIds.delete(articleId);
  } else {
    state.clippedIds.add(articleId);
  }

  renderDashboard();
});

elements.refreshButton.addEventListener("click", () => {
  void refreshNews();
});

renderDashboard();
void refreshNews();