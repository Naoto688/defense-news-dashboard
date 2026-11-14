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
    articleUrl: "sample://fallback/land-training",
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
    articleUrl: "sample://fallback/maritime-safety",
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
    articleUrl: "sample://fallback/air-monitoring",
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
    articleUrl: "sample://fallback/space-cyber",
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
    articleUrl: "sample://fallback/international-technology",
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
    articleUrl: "sample://fallback/land-maintenance",
    isSample: true
  }
];

let rssNewsItems = [...fallbackNews];
let savedClips = new Map();
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
const supabaseProjectUrl = new URL(
  "https://hzemnjhbsiffwkoiffdc.supabase.co/rest/v1/"
).origin;
const supabasePublishableKey =
  "sb_publishable_PIRYNiiBdm2TGM5Z1sf-HA_7P21E12B";
const supabaseClient =
  window.supabase && typeof window.supabase.createClient === "function"
    ? window.supabase.createClient(supabaseProjectUrl, supabasePublishableKey)
    : null;

// stateには、画面の絞り込み条件と記事ごとのクリップ状態をまとめて保存します。
const state = {
  activeCategory: "すべて",
  keyword: "",
  clipsOnly: false,
  clippedIds: new Set()
};

const elements = {
  loginScreen: document.getElementById("login-screen"),
  dashboardShell: document.getElementById("dashboard-shell"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginSubmit: document.getElementById("login-submit"),
  loginError: document.getElementById("login-error"),
  newsList: document.getElementById("news-list"),
  totalCount: document.getElementById("total-count"),
  todayCount: document.getElementById("today-count"),
  clipCount: document.getElementById("clip-count"),
  dashboardStatus: document.getElementById("dashboard-status"),
  categoryNav: document.querySelector('nav[aria-label="ニュースカテゴリー"]'),
  searchInput: document.getElementById("keyword-search"),
  clipsOnlyInput: document.getElementById("important-only"),
  refreshButton: document.getElementById("refresh-button"),
  logoutButton: document.getElementById("logout-button")
};

if (Object.values(elements).some((element) => element === null)) {
  throw new Error("ダッシュボードの必要なHTML要素が見つかりません。");
}

const categoryButtons = elements.categoryNav.querySelectorAll("button");
const statusMessage = elements.dashboardStatus;

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

let activeUserId = null;
let loadedUserId = null;
let authEventVersion = 0;
let initialAuthEventSeen = false;

function showLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginError.hidden = !message;
}

function setAuthView(isAuthenticated) {
  elements.loginScreen.hidden = isAuthenticated;
  elements.loginScreen.style.display = isAuthenticated ? "none" : "grid";
  elements.dashboardShell.hidden = !isAuthenticated;
  elements.dashboardShell.style.display = isAuthenticated ? "block" : "none";
}

function getSignInErrorMessage(error) {
  const message = String(error.message || "").toLowerCase();
  if (message.includes("email not confirmed")) {
    return "メールアドレスの確認が完了していません。管理者にお問い合わせください。";
  }
  if (message.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  return "ログインできませんでした。入力内容と通信状態を確認して、もう一度お試しください。";
}

function applyAuthSession(session) {
  const userId = session && session.user ? session.user.id : null;
  if (!userId) {
    const wasAuthenticated = activeUserId !== null;
    activeUserId = null;
    loadedUserId = null;
    setAuthView(false);

    if (wasAuthenticated) {
      savedClips = new Map();
      state.clippedIds.clear();
      newsItems = [...rssNewsItems];
      renderDashboard();
    }
    return;
  }

  const userChanged = activeUserId !== userId;
  activeUserId = userId;
  setAuthView(true);
  showLoginError("");

  if (userChanged || loadedUserId !== userId) {
    if (userChanged) {
      savedClips = new Map();
      state.clippedIds.clear();
      newsItems = [...rssNewsItems];
    }
    loadedUserId = userId;
    renderDashboard();
    void refreshNews();
  }
}

function initializeAuth() {
  if (!supabaseClient) {
    const error = new Error("Supabase Authを初期化できませんでした。");
    console.error("Supabase Authの初期化に失敗しました。", error);
    showLoginError("認証サービスを読み込めません。ページを再読み込みしてください。");
    return;
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") {
      initialAuthEventSeen = true;
    }
    const eventVersion = ++authEventVersion;
    window.setTimeout(() => {
      if (eventVersion === authEventVersion) {
        applyAuthSession(session);
      }
    }, 0);
  });

  supabaseClient.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error("Supabaseのセッション確認に失敗しました。", error);
        if (activeUserId === null) {
          showLoginError("ログイン状態を確認できませんでした。ページを再読み込みしてください。");
        }
        return;
      }

      if (initialAuthEventSeen) {
        return;
      }

      const eventVersion = ++authEventVersion;
      window.setTimeout(() => {
        if (eventVersion === authEventVersion) {
          applyAuthSession(data.session);
        }
      }, 0);
    })
    .catch((error) => {
      console.error("Supabaseのセッション確認中にエラーが発生しました。", error);
      if (activeUserId === null) {
        showLoginError("ログイン状態を確認できませんでした。通信状態を確認してください。");
      }
    });
}

function createParagraph(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

function reportDatabaseError(action, error) {
  console.error(`Supabase: ${action}に失敗しました。`, error);
  window.alert(
    `${action}に失敗しました。Supabaseの接続情報、通信状態、Row Level Security（RLS）ポリシーを確認してください。`
  );
}

function createMemoEditor(item) {
  const editor = document.createElement("div");
  editor.className = "analysis-memo";

  const memoId = `memo-${encodeURIComponent(item.articleUrl)}`;
  const label = document.createElement("label");
  label.htmlFor = memoId;
  label.textContent = "分析・考察メモ";

  const textarea = document.createElement("textarea");
  textarea.id = memoId;
  textarea.maxLength = 10000;
  textarea.placeholder = "この記事についての分析・考察を記録できます。";
  textarea.value = item.memo || "";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.dataset.saveMemoUrl = item.articleUrl;
  saveButton.textContent = "メモ保存";

  const status = document.createElement("p");
  status.className = "memo-status";
  status.setAttribute("aria-live", "polite");

  editor.append(label, textarea, saveButton, status);
  return editor;
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

  const isClipped = state.clippedIds.has(item.articleUrl);
  const clipButton = document.createElement("button");
  clipButton.type = "button";
  clipButton.dataset.articleUrl = item.articleUrl;
  clipButton.setAttribute("aria-pressed", String(isClipped));
  clipButton.setAttribute(
    "aria-label",
    isClipped ? "重要クリップを解除" : "この記事を重要クリップに登録"
  );
  clipButton.textContent = isClipped ? "★ クリップ済み" : "☆ 重要クリップ";
  card.append(clipButton);
  if (isClipped) {
    card.append(createMemoEditor(item));
  }

  const sourceLink = document.createElement("a");
  sourceLink.href = item.url || "#";
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

function normalizeSavedClip(row) {
  const articleUrl = String(row.article_url || "").trim();
  const parsedDate = new Date(row.published_at || "");

  return {
    id: articleUrl,
    articleUrl,
    title: String(row.title || "タイトル不明"),
    source: String(row.source || "情報ソース不明"),
    category: String(row.category || "国際情勢・技術"),
    publishedAt: Number.isNaN(parsedDate.getTime()) ? null : parsedDate,
    summary: String(row.summary || "要約はありません。"),
    memo: String(row.memo || ""),
    url: getSafeArticleUrl(articleUrl),
    isSample: articleUrl.startsWith("sample://"),
    databaseId: row.id
  };
}

async function loadSavedClips() {
  if (!supabaseClient) {
    throw new Error("Supabase JSライブラリを読み込めませんでした。");
  }

  const clips = new Map();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient
      .from("clipped_news")
      .select("id, article_url, title, source, category, published_at, summary, memo, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    (Array.isArray(data) ? data : []).forEach((row) => {
      const clip = normalizeSavedClip(row);
      if (clip.articleUrl) {
        clips.set(clip.articleUrl, clip);
      }
    });

    if (!data || data.length < pageSize) {
      break;
    }
  }
  return clips;
}

async function upsertSavedClip(item) {
  if (!supabaseClient) {
    throw new Error("Supabase JSライブラリを読み込めませんでした。");
  }

  const clip = {
    article_url: item.articleUrl,
    title: item.title,
    source: item.source,
    category: item.category,
    published_at: item.publishedAt ? item.publishedAt.toISOString() : "",
    summary: item.summary,
    memo: item.memo || ""
  };
  const { data, error } = await supabaseClient
    .from("clipped_news")
    .upsert(clip, { onConflict: "article_url" })
    .select("id, article_url, title, source, category, published_at, summary, memo, created_at")
    .single();

  if (error) {
    throw error;
  }
  return normalizeSavedClip(data);
}

async function deleteSavedClip(articleUrl) {
  if (!supabaseClient) {
    throw new Error("Supabase JSライブラリを読み込めませんでした。");
  }

  const { data, error } = await supabaseClient
    .from("clipped_news")
    .delete()
    .eq("article_url", articleUrl)
    .select("article_url");

  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error("削除対象がありません。RLSポリシーを確認してください。");
  }
}

async function updateSavedMemo(articleUrl, memo) {
  if (!supabaseClient) {
    throw new Error("Supabase JSライブラリを読み込めませんでした。");
  }

  const { data, error } = await supabaseClient
    .from("clipped_news")
    .update({ memo })
    .eq("article_url", articleUrl)
    .select("article_url")
    .single();

  if (error) {
    throw error;
  }
  return data;
}

function mergeNewsWithSavedClips() {
  const merged = new Map();
  savedClips.forEach((clip, articleUrl) => {
    merged.set(articleUrl, clip);
  });

  rssNewsItems.forEach((article) => {
    const savedClip = savedClips.get(article.articleUrl);
    merged.set(
      article.articleUrl,
      savedClip
        ? { ...savedClip, ...article, memo: savedClip.memo, databaseId: savedClip.databaseId }
        : article
    );
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = left.publishedAt ? left.publishedAt.getTime() : 0;
    const rightTime = right.publishedAt ? right.publishedAt.getTime() : 0;
    return rightTime - leftTime;
  });
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
  const articleUrl =
    url !== "#" ? url : `rss://item/${encodeURIComponent(idSource)}`;

  return {
    id: articleUrl,
    articleUrl,
    title,
    source: stripHtml(rawItem.author || "") || feed.label,
    publishedAt,
    category: classifyNews(title, summary),
    summary: summary || "この記事には要約がありません。",
    memo: "",
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

  keys.push(`url:${item.articleUrl}`);
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
  if (!activeUserId) {
    return;
  }

  const originalButtonLabel = elements.refreshButton.textContent;
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "取得中...";
  elements.newsList.setAttribute("aria-busy", "true");
  statusMessage.textContent = "公開RSSフィードからニュースを取得しています。";

  try {
    // Promise.allで複数フィードを同時に取得し、1件の失敗で他の結果を失わないようにします。
    const [feedResults, savedClipsResult] = await Promise.all([
      Promise.all(
        rssFeeds.map(async (feed) => {
          try {
            return { feed, items: await fetchRssFeed(feed), error: null };
          } catch (error) {
            console.error(`${feed.label}のRSS取得に失敗しました。`, error);
            return { feed, items: [], error };
          }
        })
      ),
      loadSavedClips().then(
        (clips) => ({ clips, error: null }),
        (error) => ({ clips: null, error })
      )
    ]);

    if (savedClipsResult.error) {
      reportDatabaseError("保存済みクリップの読み込み", savedClipsResult.error);
    } else {
      savedClips = savedClipsResult.clips;
      state.clippedIds = new Set(savedClips.keys());
    }

    const failedFeeds = feedResults.filter((result) => result.error);
    const latestNews = collectUniqueNews(feedResults);

    if (latestNews.length > 0) {
      rssNewsItems = latestNews;
      statusMessage.textContent = failedFeeds.length
        ? `一部のフィード（${failedFeeds.map((result) => result.feed.label).join("、")}）を取得できませんでした。取得できた記事を表示しています。`
        : "";
    } else {
      rssNewsItems = [...fallbackNews];
      statusMessage.textContent = failedFeeds.length
        ? `ニュースを取得できませんでした。${failedFeeds.map((result) => result.feed.label).join("、")}の取得に失敗したため、サンプルニュースを表示しています。`
        : "RSSフィードに記事がなかったため、サンプルニュースを表示しています。";
    }

    newsItems = mergeNewsWithSavedClips();
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
    const matchesClip = !state.clipsOnly || state.clippedIds.has(item.articleUrl);

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
    newsItems.filter((item) => state.clippedIds.has(item.articleUrl)).length
  );
}

function renderDashboard() {
  updateSummary();
  renderNews();
}

async function toggleSavedClip(item, button) {
  const isClipped = state.clippedIds.has(item.articleUrl);
  button.disabled = true;
  button.textContent = isClipped ? "解除中..." : "保存中...";

  try {
    if (isClipped) {
      await deleteSavedClip(item.articleUrl);
      savedClips.delete(item.articleUrl);
      state.clippedIds.delete(item.articleUrl);
    } else {
      const savedClip = await upsertSavedClip(item);
      savedClips.set(item.articleUrl, savedClip);
      state.clippedIds.add(item.articleUrl);
    }

    newsItems = mergeNewsWithSavedClips();
    renderDashboard();
  } catch (error) {
    reportDatabaseError(isClipped ? "クリップの解除" : "クリップの保存", error);
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = isClipped ? "★ クリップ済み" : "☆ 重要クリップ";
    }
  }
}

async function saveAnalysisMemo(button) {
  const articleUrl = button.dataset.saveMemoUrl;
  const article = newsItems.find((item) => item.articleUrl === articleUrl);
  const editor = button.closest(".analysis-memo");
  const textarea = editor.querySelector("textarea");
  const status = editor.querySelector(".memo-status");
  const memo = textarea.value;
  const savedClip = savedClips.get(articleUrl);

  if (!savedClip || !article) {
    reportDatabaseError(
      "分析・考察メモの保存",
      new Error("保存対象のクリップが見つかりません。")
    );
    return;
  }

  button.disabled = true;
  button.textContent = "保存中...";
  status.textContent = "";

  try {
    await updateSavedMemo(articleUrl, memo);
    savedClip.memo = memo;
    article.memo = memo;
    status.textContent = "メモを保存しました。";
    button.textContent = "保存しました";
  } catch (error) {
    reportDatabaseError("分析・考察メモの保存", error);
    status.textContent = "保存できませんでした。入力内容を確認して再度お試しください。";
    button.textContent = "メモ保存";
  } finally {
    button.disabled = false;
  }
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

elements.newsList.addEventListener("click", async (event) => {
  const memoButton = event.target.closest("button[data-save-memo-url]");
  if (memoButton && elements.newsList.contains(memoButton)) {
    await saveAnalysisMemo(memoButton);
    return;
  }

  const clipButton = event.target.closest("button[data-article-url]");
  if (!clipButton || !elements.newsList.contains(clipButton)) {
    return;
  }

  const item = newsItems.find(
    (article) => article.articleUrl === clipButton.dataset.articleUrl
  );
  if (item) {
    await toggleSavedClip(item, clipButton);
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showLoginError("");

  if (!supabaseClient) {
    showLoginError("認証サービスを利用できません。ページを再読み込みしてください。");
    return;
  }

  elements.loginSubmit.disabled = true;
  elements.loginSubmit.textContent = "ログイン中...";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: elements.loginEmail.value.trim(),
      password: elements.loginPassword.value
    });

    if (error) {
      console.error("Supabase Authのログインに失敗しました。", error);
      showLoginError(getSignInErrorMessage(error));
      return;
    }

    if (!data.session) {
      showLoginError("ログインセッションを取得できませんでした。もう一度お試しください。");
      return;
    }

    elements.loginPassword.value = "";
    applyAuthSession(data.session);
  } catch (error) {
    console.error("Supabase Authへのログイン要求に失敗しました。", error);
    showLoginError(getSignInErrorMessage(error));
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmit.textContent = "ログイン";
  }
});

elements.logoutButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    reportDatabaseError("ログアウト", new Error("Supabase Authを利用できません。"));
    return;
  }

  elements.logoutButton.disabled = true;
  elements.logoutButton.textContent = "ログアウト中...";
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      reportDatabaseError("ログアウト", error);
      return;
    }
    applyAuthSession(null);
  } catch (error) {
    reportDatabaseError("ログアウト", error);
  } finally {
    elements.logoutButton.disabled = false;
    elements.logoutButton.textContent = "ログアウト";
  }
});

elements.refreshButton.addEventListener("click", () => {
  if (activeUserId) {
    void refreshNews();
  }
});

initializeAuth();