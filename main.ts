import {
  App,
  FuzzySuggestModal,
  htmlToMarkdown,
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
  requestUrl
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
  createdDate: string;
}

interface CompletedTask {
  text: string;
  createdDate: string;
  completedDate: string;
}

interface Moment {
  id: string;
  title?: string;
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
  completedTasksPath: string;
  qualityContentFolder: string;
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
    taskInboxPath: "待办收集.md",
    completedTasksPath: "10_已完成待办/已完成待办.md",
    qualityContentFolder: "11_优质内容收集"
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

class NotePicker extends FuzzySuggestModal<TAbstractFile> {
  private onChoose: (file: TAbstractFile) => void;

  constructor(app: App, onChoose: (file: TAbstractFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("选择归档笔记…");
  }

  getItems(): TAbstractFile[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((file) => file.path && (file instanceof TFolder || (file instanceof TFile && file.extension === "md")))
      .sort((a, b) => {
        if (a instanceof TFolder && b instanceof TFile) return -1;
        if (a instanceof TFile && b instanceof TFolder) return 1;
        return a.path.localeCompare(b.path, "zh-CN");
      });
  }

  getItemText(file: TAbstractFile): string {
    return `${file instanceof TFolder ? "文件夹" : "笔记"} · ${file.path}`;
  }

  onChooseItem(file: TAbstractFile): void {
    this.onChoose(file);
  }
}

class QingjianHomeView extends ItemView {
  plugin: QingjianHomePlugin;
  private taskFilter: "all" | Priority = "all";
  private showCompletedTasks = false;

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
      { column: side, render: () => this.renderQualityContent(side) },
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
    const completedButton = filters.createEl("button", {
      text: this.showCompletedTasks ? "收起已完成" : `查看已完成（${this.plugin.completedTasks.length}）`
    });
    completedButton.addEventListener("click", () => {
      this.showCompletedTasks = !this.showCompletedTasks;
      this.render();
    });

    const tasks = this.plugin.vaultTasks.filter((task) => this.taskFilter === "all" || task.priority === this.taskFilter);
    if (!tasks.length) this.emptyState(list, "这里很清爽，暂时没有待办");
    tasks.forEach((task) => {
      const row = list.createDiv({ cls: `qj-list-item${task.completed ? " is-complete" : ""}` });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = task.completed;
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) await this.plugin.completeTask(task);
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
      body.createDiv({ text: `创建 ${task.createdDate}`, cls: "qj-muted qj-task-date" });
      const remove = row.createEl("button", { text: "×", cls: "qj-icon-button" });
      remove.setAttr("aria-label", "删除待办");
      remove.addEventListener("click", async () => {
        await this.plugin.deleteTask(task);
      });
    });

    if (this.showCompletedTasks) {
      const completedList = card.createDiv({ cls: "qj-completed-list" });
      if (!this.plugin.completedTasks.length) this.emptyState(completedList, "还没有已完成待办");
      this.plugin.completedTasks.forEach((task) => {
        const row = completedList.createDiv({ cls: "qj-list-item is-complete qj-completed-item" });
        row.createSpan({ text: "✓", cls: "qj-completed-check" });
        const body = row.createDiv({ cls: "qj-task-body" });
        body.createDiv({ text: task.text, cls: "qj-item-text" });
        body.createDiv({ text: `创建 ${task.createdDate}　完成 ${task.completedDate}`, cls: "qj-muted qj-task-date" });
      });
    }
  }

  private renderMoments(parent: HTMLElement): void {
    const card = this.card(parent, "每日瞬间", "先记下，再归档");
    const titleInput = card.createEl("input", {
      type: "text",
      placeholder: "标题或关键词（用于保存和查找）",
      cls: "qj-moment-title"
    });
    const textarea = card.createEl("textarea", { placeholder: "此刻在想什么？", cls: "qj-moment-input" });
    const imageRow = card.createDiv({ cls: "qj-moment-image-row" });
    const imageInput = imageRow.createEl("input", { type: "file", cls: "qj-moment-image-input" });
    imageInput.accept = "image/*";
    imageInput.multiple = true;
    const addImage = imageRow.createEl("button", { text: "添加图片" });
    imageRow.createSpan({ text: "自动压缩后保存", cls: "qj-muted" });
    addImage.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", async () => {
      const files = Array.from(imageInput.files ?? []);
      if (!files.length) return;
      addImage.disabled = true;
      try {
        const links = await this.plugin.saveMomentImages(files);
        textarea.value = `${textarea.value.trimEnd()}${textarea.value.trim() ? "\n\n" : ""}${links.join("\n")}`;
        new Notice(`已添加 ${links.length} 张图片`);
      } catch (error) {
        console.error("清简首页保存图片失败", error);
        new Notice("图片保存失败，请重试");
      } finally {
        imageInput.value = "";
        addImage.disabled = false;
      }
    });
    const controls = card.createDiv({ cls: "qj-entry-row" });
    const pathInput = controls.createEl("input", {
      type: "text",
      placeholder: "归档笔记路径",
      value: this.plugin.data.settings.defaultArchivePath
    });
    const choose = controls.createEl("button", { text: "选择" });
    choose.addEventListener("click", () => {
      new NotePicker(this.app, (file) => {
        pathInput.value = file.path;
      }).open();
    });
    const save = controls.createEl("button", { text: "记下", cls: "qj-primary" });
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
      await this.plugin.persist();
    });

    const list = card.createDiv({ cls: "qj-list" });
    if (!this.plugin.data.moments.length) this.emptyState(list, "今天还没有记录瞬间");
    this.plugin.data.moments.forEach((moment) => {
      const item = list.createDiv({ cls: "qj-moment" });
      const meta = item.createDiv({ cls: "qj-moment-meta" });
      meta.createSpan({ text: displayTime(moment.createdAt) });
      meta.createSpan({ text: `→ ${moment.targetPath}` });
      if (moment.title) item.createDiv({ text: moment.title, cls: "qj-moment-title-text" });
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

  private renderQualityContent(parent: HTMLElement): void {
    const card = this.card(parent, "优质内容收集", "链接提取，或直接粘贴");
    const linkRow = card.createDiv({ cls: "qj-entry-row" });
    const linkInput = linkRow.createEl("input", { type: "url", placeholder: "粘贴文章链接…" });
    const extract = linkRow.createEl("button", { text: "提取", cls: "qj-primary" });
    const titleInput = card.createEl("input", { type: "text", placeholder: "内容标题…", cls: "qj-quality-title" });
    const contentInput = card.createEl("textarea", {
      placeholder: "提取结果会显示在这里；没有链接时可直接粘贴内容…",
      cls: "qj-quality-input"
    });
    const status = card.createDiv({ cls: "qj-muted qj-quality-status" });

    extract.addEventListener("click", async () => {
      const url = linkInput.value.trim();
      if (!url) {
        new Notice("请先输入链接");
        return;
      }
      extract.disabled = true;
      extract.setText("提取中…");
      status.setText("正在读取网页内容");
      try {
        const result = await this.plugin.extractQualityContent(url);
        titleInput.value = result.title;
        contentInput.value = result.content;
        status.setText("提取完成，可继续编辑后保存");
      } catch (error) {
        console.error("清简首页提取内容失败", error);
        status.setText("提取失败，可直接在文本框粘贴内容");
        new Notice("网页提取失败，可能需要登录或属于动态页面");
      } finally {
        extract.disabled = false;
        extract.setText("提取");
      }
    });

    const actions = card.createDiv({ cls: "qj-inline-actions" });
    const save = actions.createEl("button", { text: "保存为笔记", cls: "qj-primary" });
    save.addEventListener("click", async () => {
      const content = contentInput.value.trim();
      if (!content) {
        new Notice("请先提取或粘贴内容");
        return;
      }
      await this.plugin.saveQualityContent(titleInput.value.trim(), content);
    });
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
      .setName("已完成待办笔记")
      .setDesc("完成的待办会从原笔记移出，并归档到这里。")
      .addText((text) => text
        .setValue(this.plugin.data.settings.completedTasksPath)
        .onChange(async (value) => {
          this.plugin.data.settings.completedTasksPath = value.trim() || "10_已完成待办/已完成待办.md";
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
      .setName("优质内容文件夹")
      .setDesc("提取或粘贴的优质内容会保存到这里。")
      .addText((text) => text
        .setValue(this.plugin.data.settings.qualityContentFolder)
        .onChange(async (value) => {
          this.plugin.data.settings.qualityContentFolder = value.trim() || "11_优质内容收集";
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
  completedTasks: CompletedTask[] = [];
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
    const createdDate = dateKey(new Date());
    await this.app.vault.append(file, `\n- [ ] ${text.replace(/\n/g, " ")}（创建：${createdDate}） <!-- qj:${priority} created:${createdDate} -->`);
    await this.scanVaultTasks();
  }

  async updateTask(task: VaultTask, changes: { priority?: Priority }): Promise<void> {
    await this.changeTaskLine(task, (line) => {
      let next = line;
      if (changes.priority) {
        next = next.replace(/\s*<!--\s*qj:(?:urgent|later)(?:\s+created:\d{4}-\d{2}-\d{2})?\s*-->\s*$/, "");
        next += ` <!-- qj:${changes.priority} created:${task.createdDate} -->`;
      }
      return next;
    });
  }

  async completeTask(task: VaultTask): Promise<void> {
    const completedDate = dateKey(new Date());
    const path = this.asMarkdownPath(this.data.settings.completedTasksPath);
    const file = await this.getOrCreateFile(path, "# 已完成待办\n");
    await this.app.vault.append(
      file,
      `\n- [x] ${task.text.replace(/\n/g, " ")}（创建：${task.createdDate}；完成：${completedDate}）`
    );
    await this.changeTaskLine(task, () => null);
    new Notice(`已归档到 ${path}`);
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
    const created = new Date(moment.createdAt);
    const date = dateKey(created);
    const time = created.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const title = moment.title?.trim() || "瞬间";
    const target = normalizePath((moment.targetPath || this.data.settings.defaultArchivePath).trim());
    let path: string;
    if (target.toLowerCase().endsWith(".md")) {
      path = this.asMarkdownPath(target);
      const file = await this.getOrCreateFile(path, "# 每日瞬间\n");
      await this.app.vault.append(file, `\n## ${date} ${time} · ${title}\n\n${moment.text.trim()}\n`);
    } else {
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "瞬间";
      path = this.asMarkdownPath(`${target}/${date}-${safeTitle}`);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        await this.app.vault.append(existing, `\n\n---\n\n创建时间：${date} ${time}\n\n${moment.text.trim()}\n`);
      } else {
        await this.getOrCreateFile(path, `# ${title}\n\n创建时间：${date} ${time}\n\n${moment.text.trim()}\n`);
      }
    }
    this.data.moments = this.data.moments.filter((entry) => entry.id !== moment.id);
    await this.persist();
    new Notice(`已归档到 ${path}`);
  }

  async saveMomentImages(files: File[]): Promise<string[]> {
    const now = new Date();
    const folder = normalizePath(`_assets/每日瞬间/${dateKey(now)}`);
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
    const links: string[] = [];
    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[\\/:*?"<>|]/g, "-").trim() || `图片-${index + 1}`;
      const dot = safeName.lastIndexOf(".");
      const base = dot > 0 ? safeName.slice(0, dot) : safeName;
      const originalExtension = dot > 0 ? safeName.slice(dot) : ".jpg";
      const compressed = await this.compressMomentImage(file, originalExtension);
      const stamp = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      let path = normalizePath(`${folder}/${stamp}-${base}${compressed.extension}`);
      let suffix = 2;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = normalizePath(`${folder}/${stamp}-${base}-${suffix}${compressed.extension}`);
        suffix += 1;
      }
      await this.app.vault.createBinary(path, compressed.data);
      links.push(`![[${path}]]`);
    }
    return links;
  }

  private async compressMomentImage(file: File, originalExtension: string): Promise<{ data: ArrayBuffer; extension: string }> {
    const original = await file.arrayBuffer();
    if (!file.type.startsWith("image/")) return { data: original, extension: originalExtension };
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("无法读取图片"));
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
      let best: Blob | null = null;
      for (const quality of [0.92, 0.88, 0.84, 0.8, 0.76, 0.72]) {
        const candidate = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!candidate || candidate.size >= file.size) continue;
        if (!best || Math.abs(candidate.size - targetSize) < Math.abs(best.size - targetSize)) best = candidate;
      }
      if (!best) return { data: original, extension: originalExtension };
      return { data: await best.arrayBuffer(), extension: ".jpg" };
    } catch {
      return { data: original, extension: originalExtension };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async extractQualityContent(rawUrl: string): Promise<{ title: string; content: string }> {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("不支持的链接协议");
    const response = await requestUrl({ url: url.toString(), method: "GET" });
    const document = new DOMParser().parseFromString(response.text, "text/html");
    document.querySelectorAll("script, style, noscript, nav, footer, header, form, button, svg, iframe")
      .forEach((element) => element.remove());
    document.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      try {
        link.setAttribute("href", new URL(href, url).toString());
      } catch {
        link.removeAttribute("href");
      }
    });
    const article = document.querySelector("article, main, [role='main'], .post-content, .entry-content, .article-content") || document.body;
    if (!article) throw new Error("网页没有可提取内容");
    const extractedImages: Array<{ token: string; markdown: string }> = [];
    article.querySelectorAll("img").forEach((image, index) => {
      const srcset = image.getAttribute("data-srcset") || image.getAttribute("srcset")
        || image.closest("picture")?.querySelector("source[data-srcset], source[srcset]")?.getAttribute("data-srcset")
        || image.closest("picture")?.querySelector("source[srcset]")?.getAttribute("srcset");
      const srcsetSource = srcset?.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean).pop();
      const source = image.getAttribute("data-original")
        || image.getAttribute("data-lazy-src")
        || image.getAttribute("data-src")
        || srcsetSource
        || image.getAttribute("src");
      if (!source || /^(data|blob):/i.test(source)) {
        image.remove();
        return;
      }
      try {
        const absoluteSource = new URL(source, url).toString();
        const alt = (image.getAttribute("alt") || image.getAttribute("title") || "图片")
          .replace(/[\\[\]]/g, "").trim() || "图片";
        const token = `QJEXTRACTEDIMAGE${index}TOKEN`;
        extractedImages.push({ token, markdown: `![${alt}](<${absoluteSource}>)` });
        image.replaceWith(document.createTextNode(`\n\n${token}\n\n`));
      } catch {
        image.remove();
      }
    });
    const title = document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim()
      || document.title.trim()
      || "未命名内容";
    let markdown = htmlToMarkdown(article as HTMLElement);
    extractedImages.forEach(({ token, markdown: imageMarkdown }) => {
      markdown = markdown.split(token).join(imageMarkdown);
    });
    markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
    if (!markdown) throw new Error("网页正文为空");
    return {
      title,
      content: `> 来源：[${url.hostname}](${url.toString()})\n\n${markdown}`
    };
  }

  async saveQualityContent(rawTitle: string, content: string): Promise<void> {
    const now = new Date();
    const title = rawTitle || `优质内容-${dateKey(now)}`;
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim() || `优质内容-${dateKey(now)}`;
    const folder = normalizePath(this.data.settings.qualityContentFolder.trim() || "11_优质内容收集");
    let path = this.asMarkdownPath(`${folder}/${safeTitle}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      path = this.asMarkdownPath(`${folder}/${safeTitle}-${time}`);
    }
    const file = await this.getOrCreateFile(path, `# ${title}\n\n${content}\n`);
    new Notice(`已保存到 ${path}`);
    await this.app.workspace.getLeaf(false).openFile(file);
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
    const completed: CompletedTask[] = [];
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
        const priority: Priority = metadata?.[1] === "urgent" ? "urgent" : "later";
        const withoutMetadata = match[2].replace(/\s*<!--\s*qj:(?:urgent|later)(?:\s+created:\d{4}-\d{2}-\d{2})?\s*-->\s*$/, "").trim();
        const visibleDate = withoutMetadata.match(/（创建：(\d{4}-\d{2}-\d{2})）\s*$/);
        const createdDate = metadata?.[2] || visibleDate?.[1] || dateKey(new Date(file.stat.ctime));
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

  private async migrateLegacyTasks(): Promise<void> {
    if (!this.data.tasks.length) return;
    const path = this.asMarkdownPath(this.data.settings.taskInboxPath);
    const file = await this.getOrCreateFile(path, "# 待办收集\n");
    const lines = this.data.tasks.map((task) => {
      const createdDate = dateKey(new Date(task.createdAt));
      return `- [${task.completed ? "x" : " "}] ${task.text.replace(/\n/g, " ")}（创建：${createdDate}） <!-- qj:${task.priority} created:${createdDate} -->`;
    });
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
