import {
  App,
  FuzzySuggestModal,
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath
} from "obsidian";

const VIEW_TYPE = "qingjian-home-view";

type Priority = "urgent" | "later";
type Repeat = "none" | "daily" | "weekly";

interface HomeTask {
  id: string;
  text: string;
  priority: Priority;
  completed: boolean;
  createdAt: number;
}

interface VaultTask {
  id: string;
  text: string;
  priority: Priority;
  completed: boolean;
  path: string;
  lineNumber: number;
  rawLine: string;
}

interface Moment {
  id: string;
  text: string;
  createdAt: number;
  targetPath: string;
}

interface HomeReminder {
  id: string;
  text: string;
  dueAt: number;
  repeat: Repeat;
  completed: boolean;
  lastNotifiedAt?: number;
}

interface HomeSettings {
  openOnStartup: boolean;
  defaultArchivePath: string;
  dailyNotesFolder: string;
  taskInboxPath: string;
}

interface HomeData {
  schemaVersion: number;
  tasks: HomeTask[];
  moments: Moment[];
  reminders: HomeReminder[];
  settings: HomeSettings;
}

const DEFAULT_DATA: HomeData = {
  schemaVersion: 1,
  tasks: [],
  moments: [],
  reminders: [],
  settings: {
    openOnStartup: true,
    defaultArchivePath: "每日瞬间.md",
    dailyNotesFolder: "日记",
    taskInboxPath: "待办收集.md"
  }
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

class NotePicker extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("选择归档笔记…");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

class QingjianHomeView extends ItemView {
  plugin: QingjianHomePlugin;
  private taskFilter: "all" | Priority = "all";

  constructor(leaf: WorkspaceLeaf, plugin: QingjianHomePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "清简首页";
  }

  getIcon(): string {
    return "home";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
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
    modules.forEach((module) => module.render());
  }

  private renderHeader(root: HTMLElement): void {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
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
    const todayButton = header.createEl("button", { text: "打开今日日记", cls: "qj-primary" });
    todayButton.addEventListener("click", () => void this.plugin.openDailyNote(now));
  }

  private card(parent: HTMLElement, title: string, subtitle?: string): HTMLElement {
    const card = parent.createDiv({ cls: "qj-card" });
    const heading = card.createDiv({ cls: "qj-card-heading" });
    const text = heading.createDiv();
    text.createEl("h2", { text: title });
    if (subtitle) text.createEl("span", { text: subtitle });
    return card;
  }

  private renderTasks(parent: HTMLElement): void {
    const activeCount = this.plugin.vaultTasks.filter((task) => !task.completed).length;
    const card = this.card(parent, "待办清单", `${activeCount} 项未完成`);
    const form = card.createDiv({ cls: "qj-entry-row" });
    const priorityButton = form.createEl("button", { text: "急", cls: "qj-priority qj-urgent" });
    priorityButton.dataset.priority = "urgent";
    priorityButton.setAttr("aria-label", "点击切换急缓");
    priorityButton.addEventListener("click", () => {
      const next = priorityButton.dataset.priority === "urgent" ? "later" : "urgent";
      priorityButton.dataset.priority = next;
      priorityButton.setText(next === "urgent" ? "急" : "缓");
      priorityButton.toggleClass("qj-urgent", next === "urgent");
      priorityButton.toggleClass("qj-later", next === "later");
    });
    const input = form.createEl("input", { type: "text", placeholder: "添加一项待办…" });
    const add = form.createEl("button", { text: "添加", cls: "qj-primary" });
    const submit = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) return;
      await this.plugin.addTask(text, priorityButton.dataset.priority === "later" ? "later" : "urgent");
    };
    add.addEventListener("click", () => void submit());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void submit();
    });

    const filters = card.createDiv({ cls: "qj-filters" });
    ([{ key: "all", label: "全部" }, { key: "urgent", label: "急" }, { key: "later", label: "缓" }] as const).forEach(({ key, label }) => {
      const button = filters.createEl("button", { text: label });
      button.toggleClass("is-active", this.taskFilter === key);
      button.addEventListener("click", () => {
        this.taskFilter = key;
        this.render();
      });
    });

    const list = card.createDiv({ cls: "qj-list" });
    const tasks = this.plugin.vaultTasks.filter((task) => this.taskFilter === "all" || task.priority === this.taskFilter);
    if (!tasks.length) this.emptyState(list, "这里很清爽，暂时没有待办");
    tasks.forEach((task) => {
      const row = list.createDiv({ cls: `qj-list-item${task.completed ? " is-complete" : ""}` });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = task.completed;
      checkbox.addEventListener("change", async () => {
        await this.plugin.updateTask(task, { completed: checkbox.checked });
      });
      const priority = row.createEl("button", {
        text: task.priority === "urgent" ? "急" : "缓",
        cls: `qj-priority ${task.priority === "urgent" ? "qj-urgent" : "qj-later"}`
      });
      priority.addEventListener("click", async () => {
        await this.plugin.updateTask(task, { priority: task.priority === "urgent" ? "later" : "urgent" });
      });
      const body = row.createDiv({ cls: "qj-task-body" });
      const taskText = body.createEl("button", { text: task.text, cls: "qj-item-text qj-task-link" });
      taskText.setAttr("title", `打开来源：${task.path}`);
      taskText.addEventListener("click", () => void this.plugin.openTaskSource(task));
      body.createDiv({ text: task.path, cls: "qj-muted qj-task-path" });
      const remove = row.createEl("button", { text: "×", cls: "qj-icon-button" });
      remove.setAttr("aria-label", "删除待办");
      remove.addEventListener("click", async () => {
        await this.plugin.deleteTask(task);
      });
    });
  }

  private renderMoments(parent: HTMLElement): void {
    const card = this.card(parent, "每日瞬间", "先记下，再归档");
    const textarea = card.createEl("textarea", { placeholder: "此刻在想什么？", cls: "qj-moment-input" });
    const controls = card.createDiv({ cls: "qj-entry-row" });
    const pathInput = controls.createEl("input", {
      type: "text",
      placeholder: "归档笔记路径",
      value: this.plugin.data.settings.defaultArchivePath
    });
    const choose = controls.createEl("button", { text: "选择" });
    choose.addEventListener("click", () => {
      new NotePicker(this.app, (file) => { pathInput.value = file.path; }).open();
    });
    const save = controls.createEl("button", { text: "记下", cls: "qj-primary" });
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
    if (!this.plugin.data.moments.length) this.emptyState(list, "今天还没有记录瞬间");
    this.plugin.data.moments.forEach((moment) => {
      const item = list.createDiv({ cls: "qj-moment" });
      const meta = item.createDiv({ cls: "qj-moment-meta" });
      meta.createSpan({ text: displayTime(moment.createdAt) });
      meta.createSpan({ text: `→ ${moment.targetPath}` });
      item.createDiv({ text: moment.text, cls: "qj-moment-text" });
      const actions = item.createDiv({ cls: "qj-inline-actions" });
      const archive = actions.createEl("button", { text: "归档" });
      archive.addEventListener("click", () => void this.plugin.archiveMoment(moment));
      const remove = actions.createEl("button", { text: "删除" });
      remove.addEventListener("click", async () => {
        this.plugin.data.moments = this.plugin.data.moments.filter((entry) => entry.id !== moment.id);
        await this.plugin.persist();
      });
    });
  }

  private renderReminders(parent: HTMLElement): void {
    const pending = this.plugin.data.reminders.filter((reminder) => !reminder.completed);
    const card = this.card(parent, "定时提醒", `${pending.length} 项`);
    const textInput = card.createEl("input", { type: "text", placeholder: "提醒内容…" });
    const timeRow = card.createDiv({ cls: "qj-entry-row qj-reminder-form" });
    const timeInput = timeRow.createEl("input", { type: "datetime-local" });
    timeInput.value = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const repeat = timeRow.createEl("select");
    repeat.createEl("option", { text: "不重复", value: "none" });
    repeat.createEl("option", { text: "每天", value: "daily" });
    repeat.createEl("option", { text: "每周", value: "weekly" });
    const add = timeRow.createEl("button", { text: "添加", cls: "qj-primary" });
    add.addEventListener("click", async () => {
      const text = textInput.value.trim();
      const dueAt = new Date(timeInput.value).getTime();
      if (!text || Number.isNaN(dueAt)) {
        new Notice("请填写提醒内容和时间");
        return;
      }
      this.plugin.data.reminders.push({ id: uid(), text, dueAt, repeat: repeat.value as Repeat, completed: false });
      await this.plugin.persist();
    });

    const list = card.createDiv({ cls: "qj-list" });
    if (!pending.length) this.emptyState(list, "暂无提醒");
    pending.sort((a, b) => a.dueAt - b.dueAt).forEach((reminder) => {
      const item = list.createDiv({ cls: `qj-reminder${reminder.dueAt <= Date.now() ? " is-due" : ""}` });
      item.createDiv({ text: reminder.text, cls: "qj-item-text" });
      item.createDiv({ text: `${displayTime(reminder.dueAt)}${reminder.repeat === "daily" ? " · 每天" : reminder.repeat === "weekly" ? " · 每周" : ""}`, cls: "qj-muted" });
      const actions = item.createDiv({ cls: "qj-inline-actions" });
      const done = actions.createEl("button", { text: "完成" });
      done.addEventListener("click", async () => {
        reminder.completed = true;
        await this.plugin.persist();
      });
      const snooze = actions.createEl("button", { text: "稍后 10 分钟" });
      snooze.addEventListener("click", async () => {
        reminder.dueAt = Date.now() + 600_000;
        reminder.lastNotifiedAt = undefined;
        await this.plugin.persist();
      });
    });
  }

  private renderQuickActions(parent: HTMLElement): void {
    const card = this.card(parent, "快捷入口");
    const actions = card.createDiv({ cls: "qj-quick-grid" });
    const items = [
      { label: "新建笔记", action: () => void this.plugin.createQuickNote() },
      { label: "今日日记", action: () => void this.plugin.openDailyNote(new Date()) },
      { label: "搜索", action: () => this.executeCommand("global-search:open") },
      { label: "命令面板", action: () => this.executeCommand("command-palette:open") }
    ];
    items.forEach(({ label, action }) => {
      const button = actions.createEl("button", { text: label });
      button.addEventListener("click", action);
    });
  }

  private renderCalendar(parent: HTMLElement): void {
    const now = new Date();
    const card = this.card(parent, `${now.getFullYear()}年${now.getMonth() + 1}月`);
    const calendar = card.createDiv({ cls: "qj-calendar" });
    ["一", "二", "三", "四", "五", "六", "日"].forEach((day) => calendar.createSpan({ text: day, cls: "qj-weekday" }));
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

  private renderRecent(parent: HTMLElement): void {
    const card = this.card(parent, "最近笔记");
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 5);
    const list = card.createDiv({ cls: "qj-recent" });
    if (!files.length) this.emptyState(list, "暂无笔记");
    files.forEach((file) => {
      const button = list.createEl("button");
      button.createSpan({ text: file.basename });
      button.createSpan({ text: displayTime(file.stat.mtime), cls: "qj-muted" });
      button.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
    });
  }

  private emptyState(parent: HTMLElement, message: string): void {
    parent.createDiv({ text: message, cls: "qj-empty" });
  }

  private executeCommand(id: string): void {
    const app = this.app as App & { commands: { executeCommandById: (commandId: string) => boolean } };
    app.commands.executeCommandById(id);
  }
}

class QingjianSettingTab extends PluginSettingTab {
  plugin: QingjianHomePlugin;

  constructor(app: App, plugin: QingjianHomePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "清简首页设置" });

    new Setting(containerEl)
      .setName("启动时打开首页")
      .setDesc("Obsidian 启动并完成布局后打开清简首页。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.data.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.data.settings.openOnStartup = value;
          await this.plugin.persist();
        }));

    new Setting(containerEl)
      .setName("新待办收集笔记")
      .setDesc("首页新建的待办会写入这里；其他笔记中的待办也会自动汇总。")
      .addText((text) => text
        .setValue(this.plugin.data.settings.taskInboxPath)
        .onChange(async (value) => {
          this.plugin.data.settings.taskInboxPath = value.trim() || "待办收集.md";
          await this.plugin.persist();
        }));

    new Setting(containerEl)
      .setName("默认瞬间归档笔记")
      .setDesc("例如：每日瞬间.md 或 记录/每日瞬间.md")
      .addText((text) => text
        .setValue(this.plugin.data.settings.defaultArchivePath)
        .onChange(async (value) => {
          this.plugin.data.settings.defaultArchivePath = value.trim() || "每日瞬间.md";
          await this.plugin.persist();
        }));

    new Setting(containerEl)
      .setName("日记文件夹")
      .setDesc("日记文件名固定为 YYYY-MM-DD.md；留空则保存在库根目录。")
      .addText((text) => text
        .setValue(this.plugin.data.settings.dailyNotesFolder)
        .onChange(async (value) => {
          this.plugin.data.settings.dailyNotesFolder = value.trim();
          await this.plugin.persist();
        }));
  }
}

export default class QingjianHomePlugin extends Plugin {
  data: HomeData = structuredClone(DEFAULT_DATA);
  vaultTasks: VaultTask[] = [];
  private reminderTimer?: number;
  private taskScanTimer?: number;

  async onload(): Promise<void> {
    const saved = (await this.loadData()) as Partial<HomeData> | null;
    this.data = {
      schemaVersion: saved?.schemaVersion ?? DEFAULT_DATA.schemaVersion,
      tasks: saved?.tasks ?? [],
      moments: saved?.moments ?? [],
      reminders: saved?.reminders ?? [],
      settings: { ...DEFAULT_DATA.settings, ...(saved?.settings ?? {}) }
    };

    this.registerView(VIEW_TYPE, (leaf) => new QingjianHomeView(leaf, this));
    this.addRibbonIcon("home", "打开清简首页", () => void this.openHome());
    this.addCommand({ id: "open-home", name: "打开清简首页", callback: () => void this.openHome() });
    this.addSettingTab(new QingjianSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("create", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("modify", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("delete", () => this.queueTaskScan()));
    this.registerEvent(this.app.vault.on("rename", () => this.queueTaskScan()));

    this.app.workspace.onLayoutReady(() => {
      void this.initializeHome();
    });
    this.reminderTimer = window.setInterval(() => void this.checkReminders(), 30_000);
    this.registerInterval(this.reminderTimer);
  }

  async openHome(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async persist(): Promise<void> {
    await this.saveData(this.data);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof QingjianHomeView) view.render();
    });
  }

  async addTask(text: string, priority: Priority): Promise<void> {
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# 待办收集\n");
    await this.app.vault.append(file, `\n- [ ] ${text.replace(/\n/g, " ")} <!-- qj:${priority} -->`);
    await this.scanVaultTasks();
  }

  async updateTask(task: VaultTask, changes: { completed?: boolean; priority?: Priority }): Promise<void> {
    await this.changeTaskLine(task, (line) => {
      let next = line;
      if (changes.completed !== undefined) next = next.replace(/\[[ xX]\]/, changes.completed ? "[x]" : "[ ]");
      if (changes.priority) {
        next = next.replace(/\s*<!--\s*qj:(?:urgent|later)\s*-->\s*$/, "");
        next += ` <!-- qj:${changes.priority} -->`;
      }
      return next;
    });
  }

  async deleteTask(task: VaultTask): Promise<void> {
    await this.changeTaskLine(task, () => null);
  }

  async openTaskSource(task: VaultTask): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: task.lineNumber } });
  }

  async archiveMoment(moment: Moment): Promise<void> {
    const path = this.asMarkdownPath(moment.targetPath || this.data.settings.defaultArchivePath);
    const file = await this.getOrCreateFile(path, "# 每日瞬间\n");
    const line = `\n- ${dateKey(new Date(moment.createdAt))} ${new Date(moment.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ${moment.text.replace(/\n/g, " ")}\n`;
    await this.app.vault.append(file, line);
    this.data.moments = this.data.moments.filter((entry) => entry.id !== moment.id);
    await this.persist();
    new Notice(`已归档到 ${path}`);
  }

  async openDailyNote(date: Date): Promise<void> {
    const folder = this.data.settings.dailyNotesFolder.trim();
    const path = this.asMarkdownPath(folder ? `${folder}/${dateKey(date)}` : dateKey(date));
    const file = await this.getOrCreateFile(path, `# ${dateKey(date)}\n\n`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  async createQuickNote(): Promise<void> {
    const now = new Date();
    const stamp = `${dateKey(now)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const file = await this.getOrCreateFile(`未命名-${stamp}.md`, "");
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async checkReminders(): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const reminder of this.data.reminders) {
      if (reminder.completed || reminder.dueAt > now) continue;
      if (reminder.lastNotifiedAt && (reminder.repeat === "none" || now - reminder.lastNotifiedAt < 60_000)) continue;
      new Notice(`提醒：${reminder.text}`, 10_000);
      reminder.lastNotifiedAt = now;
      changed = true;
      if (reminder.repeat !== "none") {
        const step = reminder.repeat === "daily" ? 86_400_000 : 604_800_000;
        while (reminder.dueAt <= now) reminder.dueAt += step;
        reminder.lastNotifiedAt = undefined;
      }
    }
    if (changed) await this.persist();
  }

  private async initializeHome(): Promise<void> {
    await this.migrateLegacyTasks();
    await this.scanVaultTasks();
    if (this.data.settings.openOnStartup) await this.openHome();
    await this.checkReminders();
  }

  private queueTaskScan(): void {
    if (this.taskScanTimer !== undefined) window.clearTimeout(this.taskScanTimer);
    this.taskScanTimer = window.setTimeout(() => void this.scanVaultTasks(), 500);
  }

  private async scanVaultTasks(): Promise<void> {
    const found: VaultTask[] = [];
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
        const priority: Priority = /<!--\s*qj:urgent\s*-->/.test(rawLine) ? "urgent" : "later";
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

  private async migrateLegacyTasks(): Promise<void> {
    if (!this.data.tasks.length) return;
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# 待办收集\n");
    const lines = this.data.tasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.text.replace(/\n/g, " ")} <!-- qj:${task.priority} -->`);
    await this.app.vault.append(file, `\n${lines.join("\n")}\n`);
    this.data.tasks = [];
    await this.saveData(this.data);
  }

  private async changeTaskLine(task: VaultTask, transform: (line: string) => string | null): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice("找不到待办的来源笔记");
      return;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    let index = task.lineNumber;
    if (lines[index] !== task.rawLine) index = lines.indexOf(task.rawLine);
    if (index < 0) {
      new Notice("来源内容已变化，请稍后重试");
      await this.scanVaultTasks();
      return;
    }
    const next = transform(lines[index]);
    if (next === null) lines.splice(index, 1);
    else lines[index] = next;
    await this.app.vault.modify(file, lines.join("\n"));
    await this.scanVaultTasks();
  }

  private refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof QingjianHomeView) view.render();
    });
  }

  private asMarkdownPath(path: string): string {
    const trimmed = path.trim().replace(/^\/+/, "");
    return normalizePath(trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`);
  }

  private async getOrCreateFile(path: string, initialContent: string): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
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
}
