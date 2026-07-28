const TASK_STATUSES = Object.freeze(["pending", "in-progress", "blocked", "completed", "cancelled"]);

function stamp() {
  return new Date().toISOString();
}

function taskId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `task:${suffix}`;
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

export function normalizeConversationTask(input = {}) {
  const createdAt = input.createdAt || stamp();
  const status = TASK_STATUSES.includes(input.status) ? input.status : "pending";
  return {
    id: String(input.id || taskId()),
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    status,
    dependencies: unique(input.dependencies),
    blockedReason: status === "blocked" ? String(input.blockedReason || "").trim() : "",
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    completedAt: status === "completed" ? input.completedAt || createdAt : null
  };
}

export function addConversationTask(conversation, input) {
  const task = normalizeConversationTask(input);
  if (!task.title) throw new Error("Task title is required.");
  if ((conversation.taskList || []).some((candidate) => candidate.id === task.id)) {
    throw new Error(`Task already exists: ${task.id}`);
  }
  return {
    ...conversation,
    updatedAt: stamp(),
    taskList: [...(conversation.taskList || []), task]
  };
}

export function updateConversationTask(conversation, taskIdValue, patch = {}) {
  const tasks = conversation.taskList || [];
  const current = tasks.find((task) => task.id === taskIdValue);
  if (!current) throw new Error(`Task not found: ${taskIdValue}`);
  const status = patch.status || current.status;
  if (!TASK_STATUSES.includes(status)) throw new Error(`Invalid task status: ${status}`);
  const updatedAt = stamp();
  const updated = normalizeConversationTask({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt,
    completedAt: status === "completed" ? current.completedAt || updatedAt : null
  });
  if (!updated.title) throw new Error("Task title is required.");
  return {
    ...conversation,
    updatedAt,
    taskList: tasks.map((task) => task.id === current.id ? updated : task)
  };
}

export function removeConversationTask(conversation, taskIdValue) {
  if (!(conversation.taskList || []).some((task) => task.id === taskIdValue)) {
    throw new Error(`Task not found: ${taskIdValue}`);
  }
  return {
    ...conversation,
    updatedAt: stamp(),
    taskList: conversation.taskList
      .filter((task) => task.id !== taskIdValue)
      .map((task) => task.dependencies?.includes(taskIdValue)
        ? { ...task, dependencies: task.dependencies.filter((dependency) => dependency !== taskIdValue), updatedAt: stamp() }
        : task)
  };
}

export function runnableConversationTasks(conversation) {
  const tasks = conversation.taskList || [];
  const completed = new Set(tasks.filter((task) => task.status === "completed").map((task) => task.id));
  return tasks.filter((task) => task.status === "pending" && (task.dependencies || []).every((dependency) => completed.has(dependency)));
}

export function taskListMarkdown(conversation) {
  const tasks = conversation.taskList || [];
  if (!tasks.length) return "No tasks.";
  const runnable = new Set(runnableConversationTasks(conversation).map((task) => task.id));
  return tasks.map((task) => {
    const marker = task.status === "completed" ? "x" : " ";
    const dependencyText = task.dependencies?.length ? ` · after ${task.dependencies.join(", ")}` : "";
    const runnableText = runnable.has(task.id) ? " · ready" : "";
    const blockedText = task.blockedReason ? ` · ${task.blockedReason}` : "";
    return `- [${marker}] ${task.title} (${task.id} · ${task.status}${runnableText}${dependencyText}${blockedText})`;
  }).join("\n");
}

export { TASK_STATUSES };
