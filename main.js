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
  settings: {
    openOnStartup: true,
    defaultArchivePath: "\u6BCF\u65E5\u77AC\u95F4.md",
    dailyNotesFolder: "\u65E5\u8BB0",
    taskInboxPath: "\u5F85\u529E\u6536\u96C6.md"
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
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(file) {
    return file.path;
  }
  onChooseItem(file) {
    this.onChoose(file);
  }
};
var QingjianHomeView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.taskFilter = "all";
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
    const grid = root.createDiv({ cls: "qj-grid" });
    const main = grid.createDiv({ cls: "qj-column qj-column-main" });
    const side = grid.createDiv({ cls: "qj-column qj-column-side" });
    const modules = [
      { column: main, render: () => this.renderTasks(main) },
      { column: main, render: () => this.renderMoments(main) },
      { column: side, render: () => this.renderReminders(side) },
      { column: side, render: () => this.renderQuickActions(side) },
      { column: side, render: () => this.renderCalendar(side) },
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
  renderTasks(parent) {
    const activeCount = this.plugin.vaultTasks.filter((task) => !task.completed).length;
    const card = this.card(parent, "\u5F85\u529E\u6E05\u5355", `${activeCount} \u9879\u672A\u5B8C\u6210`);
    const form = card.createDiv({ cls: "qj-entry-row" });
    const priorityButton = form.createEl("button", { text: "\u6025", cls: "qj-priority qj-urgent" });
    priorityButton.dataset.priority = "urgent";
    priorityButton.setAttr("aria-label", "\u70B9\u51FB\u5207\u6362\u6025\u7F13");
    priorityButton.addEventListener("click", () => {
      const next = priorityButton.dataset.priority === "urgent" ? "later" : "urgent";
      priorityButton.dataset.priority = next;
      priorityButton.setText(next === "urgent" ? "\u6025" : "\u7F13");
      priorityButton.toggleClass("qj-urgent", next === "urgent");
      priorityButton.toggleClass("qj-later", next === "later");
    });
    const input = form.createEl("input", { type: "text", placeholder: "\u6DFB\u52A0\u4E00\u9879\u5F85\u529E\u2026" });
    const add = form.createEl("button", { text: "\u6DFB\u52A0", cls: "qj-primary" });
    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
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
    const tasks = this.plugin.vaultTasks.filter((task) => this.taskFilter === "all" || task.priority === this.taskFilter);
    if (!tasks.length) this.emptyState(list, "\u8FD9\u91CC\u5F88\u6E05\u723D\uFF0C\u6682\u65F6\u6CA1\u6709\u5F85\u529E");
    tasks.forEach((task) => {
      const row = list.createDiv({ cls: `qj-list-item${task.completed ? " is-complete" : ""}` });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = task.completed;
      checkbox.addEventListener("change", async () => {
        await this.plugin.updateTask(task, { completed: checkbox.checked });
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
      body.createDiv({ text: task.path, cls: "qj-muted qj-task-path" });
      const remove = row.createEl("button", { text: "\xD7", cls: "qj-icon-button" });
      remove.setAttr("aria-label", "\u5220\u9664\u5F85\u529E");
      remove.addEventListener("click", async () => {
        await this.plugin.deleteTask(task);
      });
    });
  }
  renderMoments(parent) {
    const card = this.card(parent, "\u6BCF\u65E5\u77AC\u95F4", "\u5148\u8BB0\u4E0B\uFF0C\u518D\u5F52\u6863");
    const textarea = card.createEl("textarea", { placeholder: "\u6B64\u523B\u5728\u60F3\u4EC0\u4E48\uFF1F", cls: "qj-moment-input" });
    const controls = card.createDiv({ cls: "qj-entry-row" });
    const pathInput = controls.createEl("input", {
      type: "text",
      placeholder: "\u5F52\u6863\u7B14\u8BB0\u8DEF\u5F84",
      value: this.plugin.data.settings.defaultArchivePath
    });
    const choose = controls.createEl("button", { text: "\u9009\u62E9" });
    choose.addEventListener("click", () => {
      new NotePicker(this.app, (file) => {
        pathInput.value = file.path;
      }).open();
    });
    const save = controls.createEl("button", { text: "\u8BB0\u4E0B", cls: "qj-primary" });
    save.addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.plugin.data.moments.unshift({
        id: uid(),
        text,
        createdAt: Date.now(),
        targetPath: pathInput.value.trim() || this.plugin.data.settings.defaultArchivePath
      });
      await this.plugin.persist();
    });
    const list = card.createDiv({ cls: "qj-list" });
    if (!this.plugin.data.moments.length) this.emptyState(list, "\u4ECA\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55\u77AC\u95F4");
    this.plugin.data.moments.forEach((moment) => {
      const item = list.createDiv({ cls: "qj-moment" });
      const meta = item.createDiv({ cls: "qj-moment-meta" });
      meta.createSpan({ text: displayTime(moment.createdAt) });
      meta.createSpan({ text: `\u2192 ${moment.targetPath}` });
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
    const timeRow = card.createDiv({ cls: "qj-entry-row qj-reminder-form" });
    const timeInput = timeRow.createEl("input", { type: "datetime-local" });
    timeInput.value = toDateTimeLocal(new Date(Date.now() + 36e5));
    const repeat = timeRow.createEl("select");
    repeat.createEl("option", { text: "\u4E0D\u91CD\u590D", value: "none" });
    repeat.createEl("option", { text: "\u6BCF\u5929", value: "daily" });
    repeat.createEl("option", { text: "\u6BCF\u5468", value: "weekly" });
    const add = timeRow.createEl("button", { text: "\u6DFB\u52A0", cls: "qj-primary" });
    add.addEventListener("click", async () => {
      const text = textInput.value.trim();
      const dueAt = new Date(timeInput.value).getTime();
      if (!text || Number.isNaN(dueAt)) {
        new import_obsidian.Notice("\u8BF7\u586B\u5199\u63D0\u9192\u5185\u5BB9\u548C\u65F6\u95F4");
        return;
      }
      this.plugin.data.reminders.push({ id: uid(), text, dueAt, repeat: repeat.value, completed: false });
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
  renderCalendar(parent) {
    const now = /* @__PURE__ */ new Date();
    const card = this.card(parent, `${now.getFullYear()}\u5E74${now.getMonth() + 1}\u6708`);
    const calendar = card.createDiv({ cls: "qj-calendar" });
    ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].forEach((day) => calendar.createSpan({ text: day, cls: "qj-weekday" }));
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    for (let index = 0; index < offset; index += 1) calendar.createSpan();
    const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= total; day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const button = calendar.createEl("button", { text: String(day) });
      button.toggleClass("is-today", day === now.getDate());
      button.addEventListener("click", () => void this.plugin.openDailyNote(date));
    }
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
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u77AC\u95F4\u5F52\u6863\u7B14\u8BB0").setDesc("\u4F8B\u5982\uFF1A\u6BCF\u65E5\u77AC\u95F4.md \u6216 \u8BB0\u5F55/\u6BCF\u65E5\u77AC\u95F4.md").addText((text) => text.setValue(this.plugin.data.settings.defaultArchivePath).onChange(async (value) => {
      this.plugin.data.settings.defaultArchivePath = value.trim() || "\u6BCF\u65E5\u77AC\u95F4.md";
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
  }
  async onload() {
    var _a, _b, _c, _d, _e;
    const saved = await this.loadData();
    this.data = {
      schemaVersion: (_a = saved == null ? void 0 : saved.schemaVersion) != null ? _a : DEFAULT_DATA.schemaVersion,
      tasks: (_b = saved == null ? void 0 : saved.tasks) != null ? _b : [],
      moments: (_c = saved == null ? void 0 : saved.moments) != null ? _c : [],
      reminders: (_d = saved == null ? void 0 : saved.reminders) != null ? _d : [],
      settings: { ...DEFAULT_DATA.settings, ...(_e = saved == null ? void 0 : saved.settings) != null ? _e : {} }
    };
    this.registerView(VIEW_TYPE, (leaf) => new QingjianHomeView(leaf, this));
    this.addRibbonIcon("home", "\u6253\u5F00\u6E05\u7B80\u9996\u9875", () => void this.openHome());
    this.addCommand({ id: "open-home", name: "\u6253\u5F00\u6E05\u7B80\u9996\u9875", callback: () => void this.openHome() });
    this.addSettingTab(new QingjianSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("create", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("modify", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("delete", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("rename", () => this.queueTaskScan()));
    this.app.workspace.onLayoutReady(() => {
      void this.initializeHome();
    });
    this.reminderTimer = window.setInterval(() => void this.checkReminders(), 3e4);
    this.registerInterval(this.reminderTimer);
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
    await this.saveData(this.data);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof QingjianHomeView) view.render();
    });
  }
  async addTask(text, priority) {
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# \u5F85\u529E\u6536\u96C6\n");
    await this.app.vault.append(file, `
- [ ] ${text.replace(/\n/g, " ")} <!-- qj:${priority} -->`);
    await this.scanVaultTasks();
  }
  async updateTask(task, changes) {
    await this.changeTaskLine(task, (line) => {
      let next = line;
      if (changes.completed !== void 0) next = next.replace(/\[[ xX]\]/, changes.completed ? "[x]" : "[ ]");
      if (changes.priority) {
        next = next.replace(/\s*<!--\s*qj:(?:urgent|later)\s*-->\s*$/, "");
        next += ` <!-- qj:${changes.priority} -->`;
      }
      return next;
    });
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
    const path = this.asMarkdownPath(moment.targetPath || this.data.settings.defaultArchivePath);
    const file = await this.getOrCreateFile(path, "# \u6BCF\u65E5\u77AC\u95F4\n");
    const line = `
- ${dateKey(new Date(moment.createdAt))} ${new Date(moment.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ${moment.text.replace(/\n/g, " ")}
`;
    await this.app.vault.append(file, line);
    this.data.moments = this.data.moments.filter((entry) => entry.id !== moment.id);
    await this.persist();
    new import_obsidian.Notice(`\u5DF2\u5F52\u6863\u5230 ${path}`);
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
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      let insideCodeFence = false;
      content.split("\n").forEach((rawLine, lineNumber) => {
        if (/^\s*(```|~~~)/.test(rawLine)) {
          insideCodeFence = !insideCodeFence;
          return;
        }
        if (insideCodeFence) return;
        const match = rawLine.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
        if (!match) return;
        const priority = /<!--\s*qj:urgent\s*-->/.test(rawLine) ? "urgent" : "later";
        const text = match[2].replace(/\s*<!--\s*qj:(?:urgent|later)\s*-->\s*$/, "").trim();
        found.push({
          id: `${file.path}:${lineNumber}`,
          text,
          priority,
          completed: match[1].toLowerCase() === "x",
          path: file.path,
          lineNumber,
          rawLine
        });
      });
    }
    this.vaultTasks = found.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return a.path.localeCompare(b.path, "zh-CN");
    });
    this.refreshViews();
  }
  async migrateLegacyTasks() {
    if (!this.data.tasks.length) return;
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# \u5F85\u529E\u6536\u96C6\n");
    const lines = this.data.tasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.text.replace(/\n/g, " ")} <!-- qj:${task.priority} -->`);
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
