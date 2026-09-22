var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => QingjianHomePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE = "qingjian-home-view";
var DEFAULT_DATA = {
  schemaVersion: 1,
  tasks: [],
  moments: [],
  reminders: [],
  rssFeeds: [],
  rssArticles: [],
  dismissedRssLinks: [],
  settings: {
    openOnStartup: true,
    defaultArchivePath: "\u6BCF\u65E5\u77AC\u95F4.md",
    dailyNotesFolder: "\u65E5\u8BB0",
    taskInboxPath: "\u5F85\u529E\u6536\u96C6.md",
    completedTasksPath: "10_\u5DF2\u5B8C\u6210\u5F85\u529E/\u5DF2\u5B8C\u6210\u5F85\u529E.md",
    qualityContentFolder: "11_\u4F18\u8D28\u5185\u5BB9\u6536\u96C6",
    rssFavoritesFolder: "12_RSS\u6536\u85CF",
    rssFeedsPath: "13_RSS\u8BA2\u9605/\u8BA2\u9605\u5217\u8868.md"
  }
};
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function displayTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}
function toDateTimeLocal(date) {
  const offset = date.getTimezoneOffset() * 6e4;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
var NotePicker = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("\u9009\u62E9\u5F52\u6863\u7B14\u8BB0\u2026");
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter((file) => file.path && (file instanceof import_obsidian.TFolder || file instanceof import_obsidian.TFile && file.extension === "md")).sort((a, b) => {
      if (a instanceof import_obsidian.TFolder && b instanceof import_obsidian.TFile) return -1;
      if (a instanceof import_obsidian.TFile && b instanceof import_obsidian.TFolder) return 1;
      return a.path.localeCompare(b.path, "zh-CN");
    });
  }
  getItemText(file) {
    return `${file instanceof import_obsidian.TFolder ? "\u6587\u4EF6\u5939" : "\u7B14\u8BB0"} \xB7 ${file.path}`;
  }
  onChooseItem(file) {
    this.onChoose(file);
  }
};
var RssReaderModal = class extends import_obsidian.Modal {
  constructor(app, plugin, article) {
    super(app);
    this.plugin = plugin;
    this.article = article;
  }
  onOpen() {
    this.modalEl.addClass("qj-rss-reader-modal");
    this.titleEl.setText(this.article.title);
    const meta = this.contentEl.createDiv({ cls: "qj-muted qj-rss-reader-meta" });
    meta.setText(`${this.article.feedTitle} \xB7 ${displayTime(this.article.publishedAt)}`);
    const actions = this.contentEl.createDiv({ cls: "qj-inline-actions qj-rss-reader-actions" });
    const original = actions.createEl("button", { text: "\u6253\u5F00\u539F\u6587" });
    original.addEventListener("click", () => window.open(this.article.link, "_blank", "noopener,noreferrer"));
    const save = actions.createEl("button", { text: this.article.saved ? "\u5DF2\u6536\u85CF" : "\u6536\u85CF", cls: "qj-primary" });
    save.disabled = this.article.saved;
    save.addEventListener("click", async () => {
      await this.plugin.saveRssArticle(this.article);
      save.setText("\u5DF2\u6536\u85CF");
      save.disabled = true;
    });
    const reader = this.contentEl.createDiv({ cls: "qj-rss-reader-content" });
    reader.createDiv({ text: "\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u5185\u5BB9\u2026", cls: "qj-empty" });
    void this.loadContent(reader);
  }
  async loadContent(container) {
    const content = await this.plugin.getRssArticleContent(this.article);
    container.empty();
    await import_obsidian.MarkdownRenderer.render(this.app, content, container, "", this.plugin);
  }
};
var RssFeedModal = class extends import_obsidian.Modal {
  constructor(app, plugin, feed) {
    super(app);
    this.plugin = plugin;
    this.feed = feed;
  }
  onOpen() {
    this.modalEl.addClass("qj-rss-feed-modal");
    this.titleEl.setText(this.feed.title);
    if (this.plugin.data.rssArticles.some((article) => article.feedId === this.feed.id)) {
      this.renderArticles();
    } else {
      this.contentEl.createDiv({ text: "\u6B63\u5728\u4ECE\u6E90\u7AD9\u8BFB\u53D6\u6587\u7AE0\u2026", cls: "qj-empty" });
      void this.plugin.refreshRssFeed(this.feed.id, false).then(() => this.renderArticles());
    }
  }
  renderArticles() {
    this.contentEl.empty();
    const toolbar = this.contentEl.createDiv({ cls: "qj-rss-feed-modal-toolbar" });
    toolbar.createDiv({ text: this.feed.url, cls: "qj-muted qj-rss-feed-url" });
    const refresh = toolbar.createEl("button", { text: "\u5237\u65B0" });
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.setText("\u5237\u65B0\u4E2D\u2026");
      await this.plugin.refreshRssFeed(this.feed.id);
      this.renderArticles();
    });
    const list = this.contentEl.createDiv({ cls: "qj-rss-feed-articles" });
    const articles = this.plugin.data.rssArticles.filter((article) => article.feedId === this.feed.id).sort((a, b) => b.publishedAt - a.publishedAt);
    if (!articles.length) list.createDiv({ text: "\u8FD9\u4E2A\u8BA2\u9605\u6E90\u6682\u65F6\u6CA1\u6709\u6587\u7AE0", cls: "qj-empty" });
    articles.forEach((article) => {
      const row = list.createDiv({ cls: `qj-rss-feed-article${article.read ? " is-read" : ""}` });
      const button = row.createEl("button", { cls: "qj-rss-feed-article-open" });
      button.createSpan({ text: article.title, cls: "qj-rss-feed-article-title" });
      button.createSpan({ text: displayTime(article.publishedAt), cls: "qj-muted" });
      button.addEventListener("click", () => void this.plugin.openRssArticle(article));
      const remove = row.createEl("button", { text: "\xD7", cls: "qj-rss-feed-article-remove" });
      remove.setAttr("aria-label", `\u5220\u9664 ${article.title}`);
      remove.addEventListener("click", async () => {
        await this.plugin.dismissRssArticle(article);
        this.renderArticles();
      });
    });
  }
};
var QingjianHomeView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.taskFilter = "all";
    this.showCompletedTasks = false;
    this.drafts = /* @__PURE__ */ new Map();
    this.rssSelectionSignature = "";
    this.rssSelectionIds = [];
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "\u6E05\u7B80\u9996\u9875";
  }
  getIcon() {
    return "home";
  }
  async onOpen() {
    this.render();
  }
  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("qingjian-home");
    this.renderHeader(root);
    this.renderRss(root);
    const grid = root.createDiv({ cls: "qj-grid" });
    const main = grid.createDiv({ cls: "qj-column qj-column-main" });
    const side = grid.createDiv({ cls: "qj-column qj-column-side" });
    const modules = [
      { column: main, render: () => this.renderTasks(main) },
      { column: main, render: () => this.renderMoments(main) },
      { column: side, render: () => this.renderReminders(side) },
      { column: side, render: () => this.renderQuickActions(side) },
      { column: side, render: () => this.renderQualityContent(side) },
      { column: side, render: () => this.renderRecent(side) }
    ];
    modules.forEach((module2) => module2.render());
  }
  renderHeader(root) {
    const now = /* @__PURE__ */ new Date();
    const hour = now.getHours();
    const greeting = hour < 6 ? "\u591C\u6DF1\u4E86" : hour < 12 ? "\u65E9\u4E0A\u597D" : hour < 18 ? "\u4E0B\u5348\u597D" : "\u665A\u4E0A\u597D";
    const header = root.createDiv({ cls: "qj-header" });
    const title = header.createDiv();
    title.createEl("h1", { text: greeting });
    title.createEl("p", {
      text: new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
      }).format(now)
    });
    const todayButton = header.createEl("button", { text: "\u6253\u5F00\u4ECA\u65E5\u65E5\u8BB0", cls: "qj-primary" });
    todayButton.addEventListener("click", () => void this.plugin.openDailyNote(now));
  }
  card(parent, title, subtitle) {
    const card = parent.createDiv({ cls: "qj-card" });
    const heading = card.createDiv({ cls: "qj-card-heading" });
    const text = heading.createDiv();
    text.createEl("h2", { text: title });
    if (subtitle) text.createEl("span", { text: subtitle });
    return card;
  }
  renderRss(parent) {
    const unreadCount = this.plugin.data.rssArticles.filter((article) => !article.read).length;
    const card = this.card(parent, "RSS \u9605\u8BFB", `${unreadCount} \u7BC7\u672A\u8BFB`);
    card.addClass("qj-rss-card");
    const addRow = card.createDiv({ cls: "qj-entry-row qj-rss-add" });
    const feedInput = addRow.createEl("input", { type: "url", placeholder: "\u7C98\u8D34 RSS / Atom \u8BA2\u9605\u5730\u5740\u2026" });
    this.bindDraft(feedInput, "rss-feed-url");
    const addButton = addRow.createEl("button", { text: "\u8BA2\u9605", cls: "qj-primary" });
    addButton.addEventListener("click", async () => {
      const url = feedInput.value.trim();
      if (!url) return;
      addButton.disabled = true;
      addButton.setText("\u8BFB\u53D6\u4E2D\u2026");
      try {
        await this.plugin.addRssFeed(url);
        this.clearDraft("rss-feed-url");
      } finally {
        addButton.disabled = false;
        addButton.setText("\u8BA2\u9605");
      }
    });
    const toolbar = card.createDiv({ cls: "qj-rss-toolbar" });
    const feeds = toolbar.createDiv({ cls: "qj-rss-feeds" });
    if (!this.plugin.data.rssFeeds.length) feeds.createSpan({ text: "\u5C1A\u672A\u6DFB\u52A0\u8BA2\u9605\u6E90", cls: "qj-muted" });
    this.plugin.data.rssFeeds.forEach((feed) => {
      const chip = feeds.createDiv({ cls: "qj-rss-feed-chip" });
      const open = chip.createEl("button", { text: feed.title, cls: "qj-rss-feed-open" });
      open.setAttr("title", `\u67E5\u770B ${feed.title} \u7684\u5168\u90E8\u6587\u7AE0`);
      open.addEventListener("click", () => this.plugin.openRssFeed(feed));
      const remove = chip.createEl("button", { text: "\xD7", cls: "qj-rss-feed-remove" });
      remove.setAttr("aria-label", `\u5220\u9664\u8BA2\u9605 ${feed.title}`);
      remove.addEventListener("click", () => void this.plugin.removeRssFeed(feed.id));
    });
    const refresh = toolbar.createEl("button", { text: "\u5237\u65B0\u5168\u90E8" });
    refresh.disabled = !this.plugin.data.rssFeeds.length;
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.setText("\u5237\u65B0\u4E2D\u2026");
      await this.plugin.refreshAllRssFeeds();
    });
    const list = card.createDiv({ cls: "qj-rss-list" });
    const articles = this.selectRssHomeArticles();
    if (!articles.length) this.emptyState(list, "\u8BA2\u9605\u540E\uFF0C\u6700\u65B0\u6587\u7AE0\u4F1A\u663E\u793A\u5728\u8FD9\u91CC");
    articles.forEach((article) => {
      const row = list.createDiv({ cls: `qj-rss-item${article.read ? " is-read" : ""}` });
      const body = row.createDiv({ cls: "qj-rss-body" });
      const title = body.createEl("button", { text: article.title, cls: "qj-rss-title" });
      title.addEventListener("click", () => void this.plugin.openRssArticle(article));
      body.createDiv({
        text: `${article.feedTitle} \xB7 ${displayTime(article.publishedAt)}`,
        cls: "qj-muted qj-rss-meta"
      });
      if (article.summary) body.createDiv({ text: article.summary, cls: "qj-rss-summary" });
      const actions = row.createDiv({ cls: "qj-inline-actions qj-rss-actions" });
      const read = actions.createEl("button", { text: article.read ? "\u6807\u4E3A\u672A\u8BFB" : "\u6807\u4E3A\u5DF2\u8BFB" });
      read.addEventListener("click", () => void this.plugin.toggleRssRead(article));
      const save = actions.createEl("button", { text: article.saved ? "\u5DF2\u6536\u85CF" : "\u6536\u85CF" });
      save.disabled = article.saved;
      save.addEventListener("click", () => void this.plugin.saveRssArticle(article));
    });
  }
  selectRssHomeArticles() {
    const groups = this.plugin.data.rssFeeds.map((feed) => ({
      feed,
      articles: this.plugin.data.rssArticles.filter((article) => article.feedId === feed.id).sort((a, b) => b.publishedAt - a.publishedAt)
    })).filter((group) => group.articles.length);
    const signature = groups.map((group) => {
      var _a, _b;
      return `${group.feed.id}:${(_b = (_a = group.articles[0]) == null ? void 0 : _a.id) != null ? _b : ""}`;
    }).join("|");
    if (signature === this.rssSelectionSignature) {
      const cached = this.rssSelectionIds.map((id) => this.plugin.data.rssArticles.find((article) => article.id === id)).filter((article) => Boolean(article));
      if (cached.length) return cached;
    }
    let selected = [];
    if (groups.length === 1) {
      selected = groups[0].articles.slice(0, 3);
    } else if (groups.length === 2) {
      selected = [groups[0].articles[0], groups[1].articles[0]];
      const remaining = groups.flatMap((group) => group.articles.slice(1));
      if (remaining.length) selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
    } else if (groups.length === 3) {
      selected = groups.map((group) => group.articles[0]);
    } else if (groups.length > 3) {
      const shuffled = [...groups].sort(() => Math.random() - 0.5);
      selected = shuffled.slice(0, 3).map((group) => group.articles[0]);
    }
    if (selected.length < 3) {
      const remaining = groups.flatMap((group) => group.articles).filter((article) => !selected.some((entry) => entry.id === article.id)).sort((a, b) => b.publishedAt - a.publishedAt);
      selected.push(...remaining.slice(0, 3 - selected.length));
    }
    this.rssSelectionSignature = signature;
    this.rssSelectionIds = selected.slice(0, 3).map((article) => article.id);
    return selected.slice(0, 3);
  }
  bindDraft(element, key, fallback = "") {
    var _a;
    element.value = (_a = this.drafts.get(key)) != null ? _a : fallback;
    const remember = () => {
      this.drafts.set(key, element.value);
    };
    element.addEventListener("input", remember);
    element.addEventListener("change", remember);
  }
  clearDraft(...keys) {
    keys.forEach((key) => this.drafts.delete(key));
  }
  renderTasks(parent) {
    const activeCount = this.plugin.vaultTasks.filter((task) => !task.completed).length;
    const card = this.card(parent, "\u5F85\u529E\u6E05\u5355", `${activeCount} \u9879\u672A\u5B8C\u6210`);
    const form = card.createDiv({ cls: "qj-entry-row" });
    const priorityButton = form.createEl("button", { text: "\u6025", cls: "qj-priority qj-urgent" });
    const taskPriority = this.drafts.get("task-priority") === "later" ? "later" : "urgent";
    priorityButton.dataset.priority = taskPriority;
    priorityButton.setText(taskPriority === "urgent" ? "\u6025" : "\u7F13");
    priorityButton.toggleClass("qj-urgent", taskPriority === "urgent");
    priorityButton.toggleClass("qj-later", taskPriority === "later");
    priorityButton.setAttr("aria-label", "\u70B9\u51FB\u5207\u6362\u6025\u7F13");
    priorityButton.addEventListener("click", () => {
      const next = priorityButton.dataset.priority === "urgent" ? "later" : "urgent";
      priorityButton.dataset.priority = next;
      priorityButton.setText(next === "urgent" ? "\u6025" : "\u7F13");
      priorityButton.toggleClass("qj-urgent", next === "urgent");
      priorityButton.toggleClass("qj-later", next === "later");
      this.drafts.set("task-priority", next);
    });
    const input = form.createEl("input", { type: "text", placeholder: "\u6DFB\u52A0\u4E00\u9879\u5F85\u529E\u2026" });
    this.bindDraft(input, "task-text");
    const add = form.createEl("button", { text: "\u6DFB\u52A0", cls: "qj-primary" });
    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
      this.clearDraft("task-text");
      await this.plugin.addTask(text, priorityButton.dataset.priority === "later" ? "later" : "urgent");
    };
    add.addEventListener("click", () => void submit());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void submit();
    });
    const filters = card.createDiv({ cls: "qj-filters" });
    [{ key: "all", label: "\u5168\u90E8" }, { key: "urgent", label: "\u6025" }, { key: "later", label: "\u7F13" }].forEach(({ key, label }) => {
      const button = filters.createEl("button", { text: label });
      button.toggleClass("is-active", this.taskFilter === key);
      button.addEventListener("click", () => {
        this.taskFilter = key;
        this.render();
      });
    });
    const list = card.createDiv({ cls: "qj-list" });
    const completedButton = filters.createEl("button", {
      text: this.showCompletedTasks ? "\u6536\u8D77\u5DF2\u5B8C\u6210" : `\u67E5\u770B\u5DF2\u5B8C\u6210\uFF08${this.plugin.completedTasks.length}\uFF09`
    });
    completedButton.addEventListener("click", () => {
      this.showCompletedTasks = !this.showCompletedTasks;
      this.render();
    });
    const tasks = this.plugin.vaultTasks.filter((task) => this.taskFilter === "all" || task.priority === this.taskFilter);
    if (!tasks.length) this.emptyState(list, "\u8FD9\u91CC\u5F88\u6E05\u723D\uFF0C\u6682\u65F6\u6CA1\u6709\u5F85\u529E");
    tasks.forEach((task) => {
      const row = list.createDiv({ cls: `qj-list-item${task.completed ? " is-complete" : ""}` });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = task.completed;
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) await this.plugin.completeTask(task);
      });
      const priority = row.createEl("button", {
        text: task.priority === "urgent" ? "\u6025" : "\u7F13",
        cls: `qj-priority ${task.priority === "urgent" ? "qj-urgent" : "qj-later"}`
      });
      priority.addEventListener("click", async () => {
        await this.plugin.updateTask(task, { priority: task.priority === "urgent" ? "later" : "urgent" });
      });
      const body = row.createDiv({ cls: "qj-task-body" });
      const taskText = body.createEl("button", { text: task.text, cls: "qj-item-text qj-task-link" });
      taskText.setAttr("title", `\u6253\u5F00\u6765\u6E90\uFF1A${task.path}`);
      taskText.addEventListener("click", () => void this.plugin.openTaskSource(task));
      body.createDiv({ text: `\u521B\u5EFA ${task.createdDate}`, cls: "qj-muted qj-task-date" });
      const remove = row.createEl("button", { text: "\xD7", cls: "qj-icon-button" });
      remove.setAttr("aria-label", "\u5220\u9664\u5F85\u529E");
      remove.addEventListener("click", async () => {
        await this.plugin.deleteTask(task);
      });
    });
    if (this.showCompletedTasks) {
      const completedList = card.createDiv({ cls: "qj-completed-list" });
      if (!this.plugin.completedTasks.length) this.emptyState(completedList, "\u8FD8\u6CA1\u6709\u5DF2\u5B8C\u6210\u5F85\u529E");
      this.plugin.completedTasks.forEach((task) => {
        const row = completedList.createDiv({ cls: "qj-list-item is-complete qj-completed-item" });
        row.createSpan({ text: "\u2713", cls: "qj-completed-check" });
        const body = row.createDiv({ cls: "qj-task-body" });
        body.createDiv({ text: task.text, cls: "qj-item-text" });
        body.createDiv({ text: `\u521B\u5EFA ${task.createdDate}\u3000\u5B8C\u6210 ${task.completedDate}`, cls: "qj-muted qj-task-date" });
      });
    }
  }
  renderMoments(parent) {
    const card = this.card(parent, "\u6BCF\u65E5\u77AC\u95F4", "\u5148\u8BB0\u4E0B\uFF0C\u518D\u5F52\u6863");
    const titleInput = card.createEl("input", {
      type: "text",
      placeholder: "\u6807\u9898\u6216\u5173\u952E\u8BCD\uFF08\u7528\u4E8E\u4FDD\u5B58\u548C\u67E5\u627E\uFF09",
      cls: "qj-moment-title"
    });
    const textarea = card.createEl("textarea", { placeholder: "\u6B64\u523B\u5728\u60F3\u4EC0\u4E48\uFF1F", cls: "qj-moment-input" });
    this.bindDraft(titleInput, "moment-title");
    this.bindDraft(textarea, "moment-text");
    const imageRow = card.createDiv({ cls: "qj-moment-image-row" });
    const imageInput = imageRow.createEl("input", { type: "file", cls: "qj-moment-image-input" });
    imageInput.accept = "image/*";
    imageInput.multiple = true;
    const addImage = imageRow.createEl("button", { text: "\u6DFB\u52A0\u56FE\u7247" });
    imageRow.createSpan({ text: "\u81EA\u52A8\u538B\u7F29\u540E\u4FDD\u5B58", cls: "qj-muted" });
    addImage.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", async () => {
      var _a;
      const files = Array.from((_a = imageInput.files) != null ? _a : []);
      if (!files.length) return;
      addImage.disabled = true;
      try {
        const links = await this.plugin.saveMomentImages(files);
        textarea.value = `${textarea.value.trimEnd()}${textarea.value.trim() ? "\n\n" : ""}${links.join("\n")}`;
        this.drafts.set("moment-text", textarea.value);
        new import_obsidian.Notice(`\u5DF2\u6DFB\u52A0 ${links.length} \u5F20\u56FE\u7247`);
      } catch (error) {
        console.error("\u6E05\u7B80\u9996\u9875\u4FDD\u5B58\u56FE\u7247\u5931\u8D25", error);
        new import_obsidian.Notice("\u56FE\u7247\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      } finally {
        imageInput.value = "";
        addImage.disabled = false;
      }
    });
    const controls = card.createDiv({ cls: "qj-entry-row" });
    const pathInput = controls.createEl("input", {
      type: "text",
      placeholder: "\u5F52\u6863\u7B14\u8BB0\u8DEF\u5F84",
      value: this.plugin.data.settings.defaultArchivePath
    });
    this.bindDraft(pathInput, "moment-path", this.plugin.data.settings.defaultArchivePath);
    const choose = controls.createEl("button", { text: "\u9009\u62E9" });
    choose.addEventListener("click", () => {
      new NotePicker(this.app, (file) => {
        pathInput.value = file.path;
        this.drafts.set("moment-path", pathInput.value);
      }).open();
    });
    const save = controls.createEl("button", { text: "\u8BB0\u4E0B", cls: "qj-primary" });
    save.addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.plugin.data.moments.unshift({
        id: uid(),
        title: titleInput.value.trim(),
        text,
        createdAt: Date.now(),
        targetPath: pathInput.value.trim() || this.plugin.data.settings.defaultArchivePath
      });
      this.clearDraft("moment-title", "moment-text", "moment-path");
      await this.plugin.persist();
    });
    const list = card.createDiv({ cls: "qj-list" });
    if (!this.plugin.data.moments.length) this.emptyState(list, "\u4ECA\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55\u77AC\u95F4");
    this.plugin.data.moments.forEach((moment) => {
      const item = list.createDiv({ cls: "qj-moment" });
      const meta = item.createDiv({ cls: "qj-moment-meta" });
      meta.createSpan({ text: displayTime(moment.createdAt) });
      meta.createSpan({ text: `\u2192 ${moment.targetPath}` });
      if (moment.title) item.createDiv({ text: moment.title, cls: "qj-moment-title-text" });
      item.createDiv({ text: moment.text, cls: "qj-moment-text" });
      const actions = item.createDiv({ cls: "qj-inline-actions" });
      const archive = actions.createEl("button", { text: "\u5F52\u6863" });
      archive.addEventListener("click", () => void this.plugin.archiveMoment(moment));
      const remove = actions.createEl("button", { text: "\u5220\u9664" });
      remove.addEventListener("click", async () => {
        this.plugin.data.moments = this.plugin.data.moments.filter((entry) => entry.id !== moment.id);
        await this.plugin.persist();
      });
    });
  }
  renderReminders(parent) {
    const pending = this.plugin.data.reminders.filter((reminder) => !reminder.completed);
    const card = this.card(parent, "\u5B9A\u65F6\u63D0\u9192", `${pending.length} \u9879`);
    const textInput = card.createEl("input", { type: "text", placeholder: "\u63D0\u9192\u5185\u5BB9\u2026" });
    this.bindDraft(textInput, "reminder-text");
    const timeRow = card.createDiv({ cls: "qj-entry-row qj-reminder-form" });
    const timeInput = timeRow.createEl("input", { type: "datetime-local" });
    timeInput.value = toDateTimeLocal(new Date(Date.now() + 36e5));
    this.bindDraft(timeInput, "reminder-time", timeInput.value);
    const repeat = timeRow.createEl("select");
    repeat.createEl("option", { text: "\u4E0D\u91CD\u590D", value: "none" });
    repeat.createEl("option", { text: "\u6BCF\u5929", value: "daily" });
    repeat.createEl("option", { text: "\u6BCF\u5468", value: "weekly" });
    this.bindDraft(repeat, "reminder-repeat", "none");
    const add = timeRow.createEl("button", { text: "\u6DFB\u52A0", cls: "qj-primary" });
    add.addEventListener("click", async () => {
      const text = textInput.value.trim();
      const dueAt = new Date(timeInput.value).getTime();
      if (!text || Number.isNaN(dueAt)) {
        new import_obsidian.Notice("\u8BF7\u586B\u5199\u63D0\u9192\u5185\u5BB9\u548C\u65F6\u95F4");
        return;
      }
      this.plugin.data.reminders.push({ id: uid(), text, dueAt, repeat: repeat.value, completed: false });
      this.clearDraft("reminder-text", "reminder-time", "reminder-repeat");
      await this.plugin.persist();
    });
    const list = card.createDiv({ cls: "qj-list" });
    if (!pending.length) this.emptyState(list, "\u6682\u65E0\u63D0\u9192");
    pending.sort((a, b) => a.dueAt - b.dueAt).forEach((reminder) => {
      const item = list.createDiv({ cls: `qj-reminder${reminder.dueAt <= Date.now() ? " is-due" : ""}` });
      item.createDiv({ text: reminder.text, cls: "qj-item-text" });
      item.createDiv({ text: `${displayTime(reminder.dueAt)}${reminder.repeat === "daily" ? " \xB7 \u6BCF\u5929" : reminder.repeat === "weekly" ? " \xB7 \u6BCF\u5468" : ""}`, cls: "qj-muted" });
      const actions = item.createDiv({ cls: "qj-inline-actions" });
      const done = actions.createEl("button", { text: "\u5B8C\u6210" });
      done.addEventListener("click", async () => {
        reminder.completed = true;
        await this.plugin.persist();
      });
      const snooze = actions.createEl("button", { text: "\u7A0D\u540E 10 \u5206\u949F" });
      snooze.addEventListener("click", async () => {
        reminder.dueAt = Date.now() + 6e5;
        reminder.lastNotifiedAt = void 0;
        await this.plugin.persist();
      });
    });
  }
  renderQuickActions(parent) {
    const card = this.card(parent, "\u5FEB\u6377\u5165\u53E3");
    const actions = card.createDiv({ cls: "qj-quick-grid" });
    const items = [
      { label: "\u65B0\u5EFA\u7B14\u8BB0", action: () => void this.plugin.createQuickNote() },
      { label: "\u4ECA\u65E5\u65E5\u8BB0", action: () => void this.plugin.openDailyNote(/* @__PURE__ */ new Date()) },
      { label: "\u641C\u7D22", action: () => this.executeCommand("global-search:open") },
      { label: "\u547D\u4EE4\u9762\u677F", action: () => this.executeCommand("command-palette:open") }
    ];
    items.forEach(({ label, action }) => {
      const button = actions.createEl("button", { text: label });
      button.addEventListener("click", action);
    });
  }
  renderQualityContent(parent) {
    const card = this.card(parent, "\u4F18\u8D28\u5185\u5BB9\u6536\u96C6", "\u94FE\u63A5\u63D0\u53D6\uFF0C\u6216\u76F4\u63A5\u7C98\u8D34");
    const linkRow = card.createDiv({ cls: "qj-entry-row" });
    const linkInput = linkRow.createEl("input", { type: "url", placeholder: "\u7C98\u8D34\u6587\u7AE0\u94FE\u63A5\u2026" });
    const extract = linkRow.createEl("button", { text: "\u63D0\u53D6", cls: "qj-primary" });
    const titleInput = card.createEl("input", { type: "text", placeholder: "\u5185\u5BB9\u6807\u9898\u2026", cls: "qj-quality-title" });
    const contentInput = card.createEl("textarea", {
      placeholder: "\u63D0\u53D6\u7ED3\u679C\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\uFF1B\u6CA1\u6709\u94FE\u63A5\u65F6\u53EF\u76F4\u63A5\u7C98\u8D34\u5185\u5BB9\u2026",
      cls: "qj-quality-input"
    });
    this.bindDraft(linkInput, "quality-url");
    this.bindDraft(titleInput, "quality-title");
    this.bindDraft(contentInput, "quality-content");
    const status = card.createDiv({ cls: "qj-muted qj-quality-status" });
    extract.addEventListener("click", async () => {
      const url = linkInput.value.trim();
      if (!url) {
        new import_obsidian.Notice("\u8BF7\u5148\u8F93\u5165\u94FE\u63A5");
        return;
      }
      extract.disabled = true;
      extract.setText("\u63D0\u53D6\u4E2D\u2026");
      status.setText("\u6B63\u5728\u8BFB\u53D6\u7F51\u9875\u5185\u5BB9");
      try {
        const result = await this.plugin.extractQualityContent(url);
        titleInput.value = result.title;
        contentInput.value = result.content;
        this.drafts.set("quality-title", titleInput.value);
        this.drafts.set("quality-content", contentInput.value);
        status.setText("\u63D0\u53D6\u5B8C\u6210\uFF0C\u53EF\u7EE7\u7EED\u7F16\u8F91\u540E\u4FDD\u5B58");
      } catch (error) {
        console.error("\u6E05\u7B80\u9996\u9875\u63D0\u53D6\u5185\u5BB9\u5931\u8D25", error);
        status.setText("\u63D0\u53D6\u5931\u8D25\uFF0C\u53EF\u76F4\u63A5\u5728\u6587\u672C\u6846\u7C98\u8D34\u5185\u5BB9");
        new import_obsidian.Notice("\u7F51\u9875\u63D0\u53D6\u5931\u8D25\uFF0C\u53EF\u80FD\u9700\u8981\u767B\u5F55\u6216\u5C5E\u4E8E\u52A8\u6001\u9875\u9762");
      } finally {
        extract.disabled = false;
        extract.setText("\u63D0\u53D6");
      }
    });
    const actions = card.createDiv({ cls: "qj-inline-actions" });
    const save = actions.createEl("button", { text: "\u4FDD\u5B58\u4E3A\u7B14\u8BB0", cls: "qj-primary" });
    save.addEventListener("click", async () => {
      const content = contentInput.value.trim();
      if (!content) {
        new import_obsidian.Notice("\u8BF7\u5148\u63D0\u53D6\u6216\u7C98\u8D34\u5185\u5BB9");
        return;
      }
      await this.plugin.saveQualityContent(titleInput.value.trim(), content);
    });
  }
  renderRecent(parent) {
    const card = this.card(parent, "\u6700\u8FD1\u7B14\u8BB0");
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 5);
    const list = card.createDiv({ cls: "qj-recent" });
    if (!files.length) this.emptyState(list, "\u6682\u65E0\u7B14\u8BB0");
    files.forEach((file) => {
      const button = list.createEl("button");
      button.createSpan({ text: file.basename });
      button.createSpan({ text: displayTime(file.stat.mtime), cls: "qj-muted" });
      button.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
    });
  }
  emptyState(parent, message) {
    parent.createDiv({ text: message, cls: "qj-empty" });
  }
  executeCommand(id) {
    const app = this.app;
    app.commands.executeCommandById(id);
  }
};
var QingjianSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u6E05\u7B80\u9996\u9875\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u542F\u52A8\u65F6\u6253\u5F00\u9996\u9875").setDesc("Obsidian \u542F\u52A8\u5E76\u5B8C\u6210\u5E03\u5C40\u540E\u6253\u5F00\u6E05\u7B80\u9996\u9875\u3002").addToggle((toggle) => toggle.setValue(this.plugin.data.settings.openOnStartup).onChange(async (value) => {
      this.plugin.data.settings.openOnStartup = value;
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("\u65B0\u5F85\u529E\u6536\u96C6\u7B14\u8BB0").setDesc("\u9996\u9875\u65B0\u5EFA\u7684\u5F85\u529E\u4F1A\u5199\u5165\u8FD9\u91CC\uFF1B\u5176\u4ED6\u7B14\u8BB0\u4E2D\u7684\u5F85\u529E\u4E5F\u4F1A\u81EA\u52A8\u6C47\u603B\u3002").addText((text) => text.setValue(this.plugin.data.settings.taskInboxPath).onChange(async (value) => {
      this.plugin.data.settings.taskInboxPath = value.trim() || "\u5F85\u529E\u6536\u96C6.md";
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("\u5DF2\u5B8C\u6210\u5F85\u529E\u7B14\u8BB0").setDesc("\u5B8C\u6210\u7684\u5F85\u529E\u4F1A\u4ECE\u539F\u7B14\u8BB0\u79FB\u51FA\uFF0C\u5E76\u5F52\u6863\u5230\u8FD9\u91CC\u3002").addText((text) => text.setValue(this.plugin.data.settings.completedTasksPath).onChange(async (value) => {
      this.plugin.data.settings.completedTasksPath = value.trim() || "10_\u5DF2\u5B8C\u6210\u5F85\u529E/\u5DF2\u5B8C\u6210\u5F85\u529E.md";
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u77AC\u95F4\u5F52\u6863\u7B14\u8BB0").setDesc("\u4F8B\u5982\uFF1A\u6BCF\u65E5\u77AC\u95F4.md \u6216 \u8BB0\u5F55/\u6BCF\u65E5\u77AC\u95F4.md").addText((text) => text.setValue(this.plugin.data.settings.defaultArchivePath).onChange(async (value) => {
      this.plugin.data.settings.defaultArchivePath = value.trim() || "\u6BCF\u65E5\u77AC\u95F4.md";
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("\u4F18\u8D28\u5185\u5BB9\u6587\u4EF6\u5939").setDesc("\u63D0\u53D6\u6216\u7C98\u8D34\u7684\u4F18\u8D28\u5185\u5BB9\u4F1A\u4FDD\u5B58\u5230\u8FD9\u91CC\u3002").addText((text) => text.setValue(this.plugin.data.settings.qualityContentFolder).onChange(async (value) => {
      this.plugin.data.settings.qualityContentFolder = value.trim() || "11_\u4F18\u8D28\u5185\u5BB9\u6536\u96C6";
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("RSS \u6536\u85CF\u6587\u4EF6\u5939").setDesc("\u9996\u9875\u6536\u85CF\u7684 RSS \u6587\u7AE0\u4F1A\u4FDD\u5B58\u5230\u8FD9\u91CC\u3002").addText((text) => text.setValue(this.plugin.data.settings.rssFavoritesFolder).onChange(async (value) => {
      this.plugin.data.settings.rssFavoritesFolder = value.trim() || "12_RSS\u6536\u85CF";
      await this.plugin.ensureRssFavoritesFolder();
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("RSS \u8BA2\u9605\u540C\u6B65\u6587\u4EF6").setDesc("\u8BA2\u9605\u5730\u5740\u4FDD\u5B58\u5728 Markdown \u6587\u4EF6\u4E2D\uFF0C\u7528\u4E8E Windows \u548C iOS \u540C\u6B65\u3002").addText((text) => text.setValue(this.plugin.data.settings.rssFeedsPath).onChange(async (value) => {
      this.plugin.data.settings.rssFeedsPath = value.trim() || "13_RSS\u8BA2\u9605/\u8BA2\u9605\u5217\u8868.md";
      await this.plugin.writeRssFeedsFile();
      await this.plugin.persist();
    }));
    new import_obsidian.Setting(containerEl).setName("\u65E5\u8BB0\u6587\u4EF6\u5939").setDesc("\u65E5\u8BB0\u6587\u4EF6\u540D\u56FA\u5B9A\u4E3A YYYY-MM-DD.md\uFF1B\u7559\u7A7A\u5219\u4FDD\u5B58\u5728\u5E93\u6839\u76EE\u5F55\u3002").addText((text) => text.setValue(this.plugin.data.settings.dailyNotesFolder).onChange(async (value) => {
      this.plugin.data.settings.dailyNotesFolder = value.trim();
      await this.plugin.persist();
    }));
  }
};
var QingjianHomePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.data = structuredClone(DEFAULT_DATA);
    this.vaultTasks = [];
    this.completedTasks = [];
    this.rssSyncInFlight = false;
    this.writingRssFeeds = false;
  }
  async onload() {
    var _a, _b, _c, _d, _e, _f, _g;
    const saved = await this.loadData();
    this.data = {
      schemaVersion: (_a = saved == null ? void 0 : saved.schemaVersion) != null ? _a : DEFAULT_DATA.schemaVersion,
      tasks: (_b = saved == null ? void 0 : saved.tasks) != null ? _b : [],
      moments: (_c = saved == null ? void 0 : saved.moments) != null ? _c : [],
      reminders: (_d = saved == null ? void 0 : saved.reminders) != null ? _d : [],
      rssFeeds: (_e = saved == null ? void 0 : saved.rssFeeds) != null ? _e : [],
      rssArticles: [],
      dismissedRssLinks: (_f = saved == null ? void 0 : saved.dismissedRssLinks) != null ? _f : [],
      settings: { ...DEFAULT_DATA.settings, ...(_g = saved == null ? void 0 : saved.settings) != null ? _g : {} }
    };
    this.registerView(VIEW_TYPE, (leaf) => new QingjianHomeView(leaf, this));
    this.addRibbonIcon("home", "\u6253\u5F00\u6E05\u7B80\u9996\u9875", () => void this.openHome());
    this.addCommand({ id: "open-home", name: "\u6253\u5F00\u6E05\u7B80\u9996\u9875", callback: () => void this.openHome() });
    this.addSettingTab(new QingjianSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("create", (file) => {
      this.queueTaskScan();
      this.queueRssFeedSync(file);
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      this.queueTaskScan();
      this.queueRssFeedSync(file);
    }));
    this.registerEvent(this.app.vault.on("delete", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("rename", (file) => {
      this.queueTaskScan();
      this.queueRssFeedSync(file);
    }));
    this.app.workspace.onLayoutReady(() => {
      void this.initializeHome();
    });
    this.reminderTimer = window.setInterval(() => void this.checkReminders(), 3e4);
    this.registerInterval(this.reminderTimer);
    this.rssConfigTimer = window.setInterval(() => void this.pollRssFeedsFromVault(), 5e3);
    this.registerInterval(this.rssConfigTimer);
  }
  async openHome() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
  async persist() {
    await this.saveData({ ...this.data, rssArticles: [] });
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof QingjianHomeView) view.render();
    });
  }
  async addRssFeed(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    } catch (e) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u6709\u6548\u7684 RSS \u5730\u5740");
      return;
    }
    if (this.data.rssFeeds.some((feed) => feed.url === url.toString())) {
      new import_obsidian.Notice("\u8FD9\u4E2A\u8BA2\u9605\u6E90\u5DF2\u7ECF\u6DFB\u52A0");
      return;
    }
    try {
      const parsed = await this.fetchRssFeed(url.toString());
      const feed = { id: uid(), title: parsed.title || url.hostname, url: url.toString(), lastUpdatedAt: Date.now() };
      this.data.rssFeeds.unshift(feed);
      this.mergeRssArticles(feed, parsed.articles);
      await this.writeRssFeedsFile();
      await this.persist();
      new import_obsidian.Notice(`\u5DF2\u8BA2\u9605 ${feed.title}`);
    } catch (error) {
      console.error("\u6E05\u7B80\u9996\u9875\u8BFB\u53D6 RSS \u5931\u8D25", error);
      new import_obsidian.Notice("\u65E0\u6CD5\u8BFB\u53D6\u8BE5\u8BA2\u9605\u6E90\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740");
    }
  }
  async removeRssFeed(feedId) {
    this.data.rssFeeds = this.data.rssFeeds.filter((feed) => feed.id !== feedId);
    this.data.rssArticles = this.data.rssArticles.filter((article) => article.feedId !== feedId);
    await this.writeRssFeedsFile();
    await this.persist();
  }
  openRssFeed(feed) {
    new RssFeedModal(this.app, this, feed).open();
  }
  async refreshRssFeed(feedId, notify = true) {
    const feed = this.data.rssFeeds.find((entry) => entry.id === feedId);
    if (!feed) return;
    try {
      const parsed = await this.fetchRssFeed(feed.url);
      feed.title = parsed.title || feed.title;
      feed.lastUpdatedAt = Date.now();
      this.mergeRssArticles(feed, parsed.articles);
      await this.writeRssFeedsFile();
      await this.persist();
      if (notify) new import_obsidian.Notice(`\u5DF2\u5237\u65B0 ${feed.title}`);
    } catch (error) {
      console.error(`\u6E05\u7B80\u9996\u9875\u5237\u65B0 RSS \u5931\u8D25\uFF1A${feed.url}`, error);
      if (notify) new import_obsidian.Notice("\u5237\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    }
  }
  async refreshAllRssFeeds(notify = true) {
    let success = 0;
    for (const feed of this.data.rssFeeds) {
      try {
        const parsed = await this.fetchRssFeed(feed.url);
        feed.title = parsed.title || feed.title;
        feed.lastUpdatedAt = Date.now();
        this.mergeRssArticles(feed, parsed.articles);
        success += 1;
      } catch (error) {
        console.error(`\u6E05\u7B80\u9996\u9875\u5237\u65B0 RSS \u5931\u8D25\uFF1A${feed.url}`, error);
      }
    }
    await this.persist();
    if (notify) new import_obsidian.Notice(success === this.data.rssFeeds.length ? "RSS \u5DF2\u5237\u65B0" : `\u5DF2\u5237\u65B0 ${success}/${this.data.rssFeeds.length} \u4E2A\u8BA2\u9605\u6E90`);
  }
  async toggleRssRead(article) {
    article.read = !article.read;
    await this.persist();
  }
  async dismissRssArticle(article) {
    if (!this.data.dismissedRssLinks.includes(article.link)) this.data.dismissedRssLinks.push(article.link);
    this.data.rssArticles = this.data.rssArticles.filter((entry) => entry.id !== article.id);
    await this.persist();
  }
  async openRssArticle(article) {
    article.read = true;
    new RssReaderModal(this.app, this, article).open();
    this.refreshViews();
  }
  async getRssArticleContent(article) {
    var _a;
    if ((_a = article.content) == null ? void 0 : _a.trim()) return article.content;
    try {
      const extracted = await this.extractQualityContent(article.link);
      article.content = extracted.content;
      return article.content;
    } catch (error) {
      console.warn("\u6E05\u7B80\u9996\u9875\u65E0\u6CD5\u8BFB\u53D6 RSS \u5B8C\u6574\u6B63\u6587\uFF0C\u6539\u7528\u8BA2\u9605\u5185\u5BB9", error);
      return `> \u5B8C\u6574\u6B63\u6587\u6682\u65F6\u65E0\u6CD5\u63D0\u53D6\uFF0C\u53EF\u70B9\u51FB\u201C\u6253\u5F00\u539F\u6587\u201D\u9605\u8BFB\u3002

${article.summary || "\u8BE5\u8BA2\u9605\u6E90\u6CA1\u6709\u63D0\u4F9B\u6587\u7AE0\u6458\u8981\u3002"}`;
    }
  }
  async saveRssArticle(article) {
    if (article.saved) return;
    const content = await this.getRssArticleContent(article);
    const folder = (0, import_obsidian.normalizePath)(this.data.settings.rssFavoritesFolder.trim() || "12_RSS\u6536\u85CF");
    const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, "-").trim() || "RSS\u6587\u7AE0";
    let path = this.asMarkdownPath(`${folder}/${dateKey(new Date(article.publishedAt))}-${safeTitle}`);
    if (this.app.vault.getAbstractFileByPath(path)) path = this.asMarkdownPath(`${folder}/${dateKey(/* @__PURE__ */ new Date())}-${safeTitle}-${Date.now()}`);
    const file = await this.getOrCreateFile(path, `# ${article.title}

${content}
`);
    article.saved = true;
    article.read = true;
    await this.persist();
    new import_obsidian.Notice(`\u5DF2\u6536\u85CF\u5230 ${path}`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async ensureRssFavoritesFolder() {
    const folder = (0, import_obsidian.normalizePath)(this.data.settings.rssFavoritesFolder.trim() || "12_RSS\u6536\u85CF");
    let current = "";
    for (const part of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async writeRssFeedsFile() {
    const path = this.asMarkdownPath(this.data.settings.rssFeedsPath || "13_RSS\u8BA2\u9605/\u8BA2\u9605\u5217\u8868.md");
    const lines = [
      "# RSS\u8BA2\u9605",
      "",
      "> \u6B64\u6587\u4EF6\u7531\u6E05\u7B80\u9996\u9875\u7BA1\u7406\uFF0C\u7528\u4E8E\u5728 Windows \u4E0E iOS \u4E4B\u95F4\u540C\u6B65\u8BA2\u9605\u5730\u5740\u3002",
      "",
      ...this.data.rssFeeds.map((feed) => {
        const label = feed.title.replace(/[\[\]]/g, "").trim() || feed.url;
        const metadata = encodeURIComponent(JSON.stringify({ id: feed.id, title: feed.title, url: feed.url }));
        return `- [${label}](${feed.url}) <!-- qj-rss-feed:${metadata} -->`;
      }),
      ""
    ];
    const content = lines.join("\n");
    this.writingRssFeeds = true;
    try {
      const file = await this.getOrCreateFile(path, content);
      if (await this.app.vault.read(file) !== content) await this.app.vault.modify(file, content);
    } finally {
      this.writingRssFeeds = false;
    }
  }
  async syncRssFeedsFromVault(refreshAfter = true) {
    if (this.writingRssFeeds) return;
    const path = this.asMarkdownPath(this.data.settings.rssFeedsPath || "13_RSS\u8BA2\u9605/\u8BA2\u9605\u5217\u8868.md");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) {
      if (this.data.rssFeeds.length) await this.writeRssFeedsFile();
      return;
    }
    const content = await this.app.vault.read(file);
    const parsed = [];
    for (const match of content.matchAll(/<!--\s*qj-rss-feed:([^\s]+)\s*-->/g)) {
      try {
        const value = JSON.parse(decodeURIComponent(match[1]));
        if (!value.id || !value.url || !value.title) continue;
        const url = new URL(value.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        parsed.push({ id: value.id, title: value.title, url: url.toString() });
      } catch (e) {
      }
    }
    const before = JSON.stringify(this.data.rssFeeds.map(({ id, title, url }) => ({ id, title, url })));
    const after = JSON.stringify(parsed);
    if (before === after) return;
    this.data.rssFeeds = parsed;
    const feedIds = new Set(parsed.map((feed) => feed.id));
    this.data.rssArticles = this.data.rssArticles.filter((article) => feedIds.has(article.feedId));
    await this.saveData(this.data);
    if (refreshAfter && parsed.length) await this.refreshAllRssFeeds(false);
    else this.refreshViews();
  }
  queueRssFeedSync(file) {
    if (this.writingRssFeeds) return;
    const path = this.asMarkdownPath(this.data.settings.rssFeedsPath || "13_RSS\u8BA2\u9605/\u8BA2\u9605\u5217\u8868.md");
    if (file.path !== path) return;
    if (this.rssSyncTimer !== void 0) window.clearTimeout(this.rssSyncTimer);
    this.rssSyncTimer = window.setTimeout(() => void this.pollRssFeedsFromVault(), 400);
  }
  async pollRssFeedsFromVault() {
    if (this.rssSyncInFlight) return;
    this.rssSyncInFlight = true;
    try {
      await this.syncRssFeedsFromVault();
    } finally {
      this.rssSyncInFlight = false;
    }
  }
  async fetchRssFeed(url) {
    var _a, _b;
    const source = await this.requestSource(url, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*");
    const document2 = new DOMParser().parseFromString(source, "application/xml");
    if (document2.querySelector("parsererror")) throw new Error("invalid feed xml");
    const channel = document2.querySelector("channel");
    const feedTitle = (((_a = channel == null ? void 0 : channel.querySelector("title")) == null ? void 0 : _a.textContent) || ((_b = document2.querySelector("feed > title")) == null ? void 0 : _b.textContent) || "").trim();
    const nodes = Array.from(document2.querySelectorAll("item, entry"));
    const articles = nodes.map((node) => {
      var _a2, _b2, _c, _d, _e, _f, _g;
      const title = (((_a2 = node.querySelector("title")) == null ? void 0 : _a2.textContent) || "\u672A\u547D\u540D\u6587\u7AE0").trim();
      const atomLink = Array.from(node.querySelectorAll("link")).find((link2) => !link2.getAttribute("rel") || link2.getAttribute("rel") === "alternate");
      const rawLink = ((atomLink == null ? void 0 : atomLink.getAttribute("href")) || ((_b2 = node.querySelector("link")) == null ? void 0 : _b2.textContent) || ((_c = node.querySelector("guid")) == null ? void 0 : _c.textContent) || "").trim();
      let link = "";
      try {
        link = new URL(rawLink, url).toString();
      } catch (e) {
        link = "";
      }
      const dateText = ((_e = (_d = node.querySelector("pubDate, published, updated, date")) == null ? void 0 : _d.textContent) == null ? void 0 : _e.trim()) || "";
      const parsedDate = Date.parse(dateText);
      const rawSummary = ((_f = node.getElementsByTagName("content:encoded")[0]) == null ? void 0 : _f.textContent) || ((_g = node.querySelector("content, description, summary")) == null ? void 0 : _g.textContent) || "";
      const html = new DOMParser().parseFromString(rawSummary, "text/html");
      const summary = (html.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
      return { title, link, publishedAt: Number.isNaN(parsedDate) ? Date.now() : parsedDate, summary };
    }).filter((article) => article.link);
    if (!nodes.length) throw new Error("feed has no articles");
    return { title: feedTitle, articles };
  }
  mergeRssArticles(feed, incoming) {
    incoming.forEach((entry) => {
      if (this.data.dismissedRssLinks.includes(entry.link)) return;
      const existing = this.data.rssArticles.find((article) => article.link === entry.link);
      if (existing) {
        existing.title = entry.title;
        existing.summary = entry.summary;
        existing.feedTitle = feed.title;
        if (entry.publishedAt) existing.publishedAt = entry.publishedAt;
        return;
      }
      this.data.rssArticles.push({
        ...entry,
        id: uid(),
        feedId: feed.id,
        feedTitle: feed.title,
        read: false,
        saved: false
      });
    });
    this.data.rssArticles = this.data.rssArticles.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 120);
  }
  async requestSource(url, accept) {
    const attempts = [
      {
        Accept: accept,
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
      },
      { Accept: accept },
      {}
    ];
    let lastError;
    for (const headers of attempts) {
      try {
        const response = await (0, import_obsidian.requestUrl)({ url, method: "GET", headers });
        if (response.status >= 400 || !response.text.trim()) throw new Error(`HTTP ${response.status}`);
        return response.text;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("\u65E0\u6CD5\u8BBF\u95EE\u6E90\u7AD9");
  }
  async addTask(text, priority) {
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# \u5F85\u529E\u6536\u96C6\n");
    const createdDate = dateKey(/* @__PURE__ */ new Date());
    await this.app.vault.append(file, `
- [ ] ${text.replace(/\n/g, " ")}\uFF08\u521B\u5EFA\uFF1A${createdDate}\uFF09 <!-- qj:${priority} created:${createdDate} -->`);
    await this.scanVaultTasks();
  }
  async updateTask(task, changes) {
    await this.changeTaskLine(task, (line) => {
      let next = line;
      if (changes.priority) {
        next = next.replace(/\s*<!--\s*qj:(?:urgent|later)(?:\s+created:\d{4}-\d{2}-\d{2})?\s*-->\s*$/, "");
        next += ` <!-- qj:${changes.priority} created:${task.createdDate} -->`;
      }
      return next;
    });
  }
  async completeTask(task) {
    const completedDate = dateKey(/* @__PURE__ */ new Date());
    const path = this.asMarkdownPath(this.data.settings.completedTasksPath);
    const file = await this.getOrCreateFile(path, "# \u5DF2\u5B8C\u6210\u5F85\u529E\n");
    await this.app.vault.append(
      file,
      `
- [x] ${task.text.replace(/\n/g, " ")}\uFF08\u521B\u5EFA\uFF1A${task.createdDate}\uFF1B\u5B8C\u6210\uFF1A${completedDate}\uFF09`
    );
    await this.changeTaskLine(task, () => null);
    new import_obsidian.Notice(`\u5DF2\u5F52\u6863\u5230 ${path}`);
  }
  async deleteTask(task) {
    await this.changeTaskLine(task, () => null);
  }
  async openTaskSource(task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof import_obsidian.TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: task.lineNumber } });
  }
  async archiveMoment(moment) {
    var _a;
    const created = new Date(moment.createdAt);
    const date = dateKey(created);
    const time = created.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const title = ((_a = moment.title) == null ? void 0 : _a.trim()) || "\u77AC\u95F4";
    const target = (0, import_obsidian.normalizePath)((moment.targetPath || this.data.settings.defaultArchivePath).trim());
    let path;
    if (target.toLowerCase().endsWith(".md")) {
      path = this.asMarkdownPath(target);
      const file = await this.getOrCreateFile(path, "# \u6BCF\u65E5\u77AC\u95F4\n");
      await this.app.vault.append(file, `
## ${date} ${time} \xB7 ${title}

${moment.text.trim()}
`);
    } else {
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "\u77AC\u95F4";
      path = this.asMarkdownPath(`${target}/${date}-${safeTitle}`);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof import_obsidian.TFile) {
        await this.app.vault.append(existing, `

---

\u521B\u5EFA\u65F6\u95F4\uFF1A${date} ${time}

${moment.text.trim()}
`);
      } else {
        await this.getOrCreateFile(path, `# ${title}

\u521B\u5EFA\u65F6\u95F4\uFF1A${date} ${time}

${moment.text.trim()}
`);
      }
    }
    this.data.moments = this.data.moments.filter((entry) => entry.id !== moment.id);
    await this.persist();
    new import_obsidian.Notice(`\u5DF2\u5F52\u6863\u5230 ${path}`);
  }
  async saveMomentImages(files) {
    const now = /* @__PURE__ */ new Date();
    const folder = (0, import_obsidian.normalizePath)(`_assets/\u6BCF\u65E5\u77AC\u95F4/${dateKey(now)}`);
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
    const links = [];
    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[\\/:*?"<>|]/g, "-").trim() || `\u56FE\u7247-${index + 1}`;
      const dot = safeName.lastIndexOf(".");
      const base = dot > 0 ? safeName.slice(0, dot) : safeName;
      const originalExtension = dot > 0 ? safeName.slice(dot) : ".jpg";
      const compressed = await this.compressMomentImage(file, originalExtension);
      const stamp = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      let path = (0, import_obsidian.normalizePath)(`${folder}/${stamp}-${base}${compressed.extension}`);
      let suffix = 2;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = (0, import_obsidian.normalizePath)(`${folder}/${stamp}-${base}-${suffix}${compressed.extension}`);
        suffix += 1;
      }
      await this.app.vault.createBinary(path, compressed.data);
      links.push(`![[${path}]]`);
    }
    return links;
  }
  async compressMomentImage(file, originalExtension) {
    const original = await file.arrayBuffer();
    if (!file.type.startsWith("image/")) return { data: original, extension: originalExtension };
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("\u65E0\u6CD5\u8BFB\u53D6\u56FE\u7247"));
        element.src = objectUrl;
      });
      const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return { data: original, extension: originalExtension };
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const targetSize = file.size * 0.4;
      let best = null;
      for (const quality of [0.92, 0.88, 0.84, 0.8, 0.76, 0.72]) {
        const candidate = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!candidate || candidate.size >= file.size) continue;
        if (!best || Math.abs(candidate.size - targetSize) < Math.abs(best.size - targetSize)) best = candidate;
      }
      if (!best) return { data: original, extension: originalExtension };
      return { data: await best.arrayBuffer(), extension: ".jpg" };
    } catch (e) {
      return { data: original, extension: originalExtension };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  async extractQualityContent(rawUrl) {
    var _a, _b;
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("\u4E0D\u652F\u6301\u7684\u94FE\u63A5\u534F\u8BAE");
    const source = await this.requestSource(url.toString(), "text/html, application/xhtml+xml, */*");
    const document2 = new DOMParser().parseFromString(source, "text/html");
    document2.querySelectorAll("script, style, noscript, nav, footer, header, form, button, svg, iframe").forEach((element) => element.remove());
    document2.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      try {
        link.setAttribute("href", new URL(href, url).toString());
      } catch (e) {
        link.removeAttribute("href");
      }
    });
    const article = document2.querySelector("article, main, [role='main'], .post-content, .entry-content, .article-content") || document2.body;
    if (!article) throw new Error("\u7F51\u9875\u6CA1\u6709\u53EF\u63D0\u53D6\u5185\u5BB9");
    const extractedImages = [];
    article.querySelectorAll("img").forEach((image, index) => {
      var _a2, _b2, _c, _d;
      const srcset = image.getAttribute("data-srcset") || image.getAttribute("srcset") || ((_b2 = (_a2 = image.closest("picture")) == null ? void 0 : _a2.querySelector("source[data-srcset], source[srcset]")) == null ? void 0 : _b2.getAttribute("data-srcset")) || ((_d = (_c = image.closest("picture")) == null ? void 0 : _c.querySelector("source[srcset]")) == null ? void 0 : _d.getAttribute("srcset"));
      const srcsetSource = srcset == null ? void 0 : srcset.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean).pop();
      const source2 = image.getAttribute("data-original") || image.getAttribute("data-lazy-src") || image.getAttribute("data-src") || srcsetSource || image.getAttribute("src");
      if (!source2 || /^(data|blob):/i.test(source2)) {
        image.remove();
        return;
      }
      try {
        const absoluteSource = new URL(source2, url).toString();
        const alt = (image.getAttribute("alt") || image.getAttribute("title") || "\u56FE\u7247").replace(/[\\[\]]/g, "").trim() || "\u56FE\u7247";
        const token = `QJEXTRACTEDIMAGE${index}TOKEN`;
        extractedImages.push({ token, markdown: `![${alt}](<${absoluteSource}>)` });
        image.replaceWith(document2.createTextNode(`

${token}

`));
      } catch (e) {
        image.remove();
      }
    });
    const title = ((_b = (_a = document2.querySelector("meta[property='og:title']")) == null ? void 0 : _a.getAttribute("content")) == null ? void 0 : _b.trim()) || document2.title.trim() || "\u672A\u547D\u540D\u5185\u5BB9";
    let markdown = (0, import_obsidian.htmlToMarkdown)(article);
    extractedImages.forEach(({ token, markdown: imageMarkdown }) => {
      markdown = markdown.split(token).join(imageMarkdown);
    });
    markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
    if (!markdown) throw new Error("\u7F51\u9875\u6B63\u6587\u4E3A\u7A7A");
    return {
      title,
      content: `> \u6765\u6E90\uFF1A[${url.hostname}](${url.toString()})

${markdown}`
    };
  }
  async saveQualityContent(rawTitle, content) {
    const now = /* @__PURE__ */ new Date();
    const title = rawTitle || `\u4F18\u8D28\u5185\u5BB9-${dateKey(now)}`;
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim() || `\u4F18\u8D28\u5185\u5BB9-${dateKey(now)}`;
    const folder = (0, import_obsidian.normalizePath)(this.data.settings.qualityContentFolder.trim() || "11_\u4F18\u8D28\u5185\u5BB9\u6536\u96C6");
    let path = this.asMarkdownPath(`${folder}/${safeTitle}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      path = this.asMarkdownPath(`${folder}/${safeTitle}-${time}`);
    }
    const file = await this.getOrCreateFile(path, `# ${title}

${content}
`);
    new import_obsidian.Notice(`\u5DF2\u4FDD\u5B58\u5230 ${path}`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async openDailyNote(date) {
    const folder = this.data.settings.dailyNotesFolder.trim();
    const path = this.asMarkdownPath(folder ? `${folder}/${dateKey(date)}` : dateKey(date));
    const file = await this.getOrCreateFile(path, `# ${dateKey(date)}

`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async createQuickNote() {
    const now = /* @__PURE__ */ new Date();
    const stamp = `${dateKey(now)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const file = await this.getOrCreateFile(`\u672A\u547D\u540D-${stamp}.md`, "");
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async checkReminders() {
    const now = Date.now();
    let changed = false;
    for (const reminder of this.data.reminders) {
      if (reminder.completed || reminder.dueAt > now) continue;
      if (reminder.lastNotifiedAt && (reminder.repeat === "none" || now - reminder.lastNotifiedAt < 6e4)) continue;
      new import_obsidian.Notice(`\u63D0\u9192\uFF1A${reminder.text}`, 1e4);
      reminder.lastNotifiedAt = now;
      changed = true;
      if (reminder.repeat !== "none") {
        const step = reminder.repeat === "daily" ? 864e5 : 6048e5;
        while (reminder.dueAt <= now) reminder.dueAt += step;
        reminder.lastNotifiedAt = void 0;
      }
    }
    if (changed) await this.persist();
  }
  async initializeHome() {
    await this.ensureRssFavoritesFolder();
    await this.syncRssFeedsFromVault(false);
    if (this.data.rssFeeds.length) await this.refreshAllRssFeeds(false);
    await this.migrateLegacyTasks();
    await this.scanVaultTasks();
    if (this.data.settings.openOnStartup) await this.openHome();
    await this.checkReminders();
  }
  queueTaskScan() {
    if (this.taskScanTimer !== void 0) window.clearTimeout(this.taskScanTimer);
    this.taskScanTimer = window.setTimeout(() => void this.scanVaultTasks(), 500);
  }
  async scanVaultTasks() {
    const found = [];
    const completed = [];
    const completedPath = this.asMarkdownPath(this.data.settings.completedTasksPath);
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      if (file.path === completedPath) {
        content.split("\n").forEach((rawLine) => {
          const match = rawLine.match(/^\s*[-*+]\s+\[[xX]\]\s+(.+?)（创建：(\d{4}-\d{2}-\d{2})；完成：(\d{4}-\d{2}-\d{2})）\s*$/);
          if (match) completed.push({ text: match[1].trim(), createdDate: match[2], completedDate: match[3] });
        });
        continue;
      }
      let insideCodeFence = false;
      content.split("\n").forEach((rawLine, lineNumber) => {
        if (/^\s*(```|~~~)/.test(rawLine)) {
          insideCodeFence = !insideCodeFence;
          return;
        }
        if (insideCodeFence) return;
        const match = rawLine.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
        if (!match) return;
        if (match[1].toLowerCase() === "x") return;
        const metadata = rawLine.match(/<!--\s*qj:(urgent|later)(?:\s+created:(\d{4}-\d{2}-\d{2}))?\s*-->/);
        const priority = (metadata == null ? void 0 : metadata[1]) === "urgent" ? "urgent" : "later";
        const withoutMetadata = match[2].replace(/\s*<!--\s*qj:(?:urgent|later)(?:\s+created:\d{4}-\d{2}-\d{2})?\s*-->\s*$/, "").trim();
        const visibleDate = withoutMetadata.match(/（创建：(\d{4}-\d{2}-\d{2})）\s*$/);
        const createdDate = (metadata == null ? void 0 : metadata[2]) || (visibleDate == null ? void 0 : visibleDate[1]) || dateKey(new Date(file.stat.ctime));
        const text = withoutMetadata.replace(/\s*（创建：\d{4}-\d{2}-\d{2}）\s*$/, "").trim();
        found.push({
          id: `${file.path}:${lineNumber}`,
          text,
          priority,
          completed: false,
          path: file.path,
          lineNumber,
          rawLine,
          createdDate
        });
      });
    }
    this.vaultTasks = found.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return a.path.localeCompare(b.path, "zh-CN");
    });
    this.completedTasks = completed.sort((a, b) => b.completedDate.localeCompare(a.completedDate));
    this.refreshViews();
  }
  async migrateLegacyTasks() {
    if (!this.data.tasks.length) return;
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# \u5F85\u529E\u6536\u96C6\n");
    const lines = this.data.tasks.map((task) => {
      const createdDate = dateKey(new Date(task.createdAt));
      return `- [${task.completed ? "x" : " "}] ${task.text.replace(/\n/g, " ")}\uFF08\u521B\u5EFA\uFF1A${createdDate}\uFF09 <!-- qj:${task.priority} created:${createdDate} -->`;
    });
    await this.app.vault.append(file, `
${lines.join("\n")}
`);
    this.data.tasks = [];
    await this.saveData(this.data);
  }
  async changeTaskLine(task, transform) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("\u627E\u4E0D\u5230\u5F85\u529E\u7684\u6765\u6E90\u7B14\u8BB0");
      return;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    let index = task.lineNumber;
    if (lines[index] !== task.rawLine) index = lines.indexOf(task.rawLine);
    if (index < 0) {
      new import_obsidian.Notice("\u6765\u6E90\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      await this.scanVaultTasks();
      return;
    }
    const next = transform(lines[index]);
    if (next === null) lines.splice(index, 1);
    else lines[index] = next;
    await this.app.vault.modify(file, lines.join("\n"));
    await this.scanVaultTasks();
  }
  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof QingjianHomeView) view.render();
    });
  }
  asMarkdownPath(path) {
    const trimmed = path.trim().replace(/^\/+/, "");
    return (0, import_obsidian.normalizePath)(trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`);
  }
  async getOrCreateFile(path, initialContent) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) return existing;
    const parts = path.split("/");
    if (parts.length > 1) {
      let current = "";
      for (const folder of parts.slice(0, -1)) {
        current = current ? `${current}/${folder}` : folder;
        if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
      }
    }
    return this.app.vault.create(path, initialContent);
  }
};
