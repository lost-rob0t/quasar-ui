import { describe, expect, it } from "vitest";
import {
  addConversationTask,
  removeConversationTask,
  runnableConversationTasks,
  taskListMarkdown,
  updateConversationTask
} from "./agent-tasks";

function conversation() {
  return { id: "conversation:test", taskList: [] };
}

describe("agent task orchestration", () => {
  it("adds typed tasks and only schedules tasks whose dependencies are complete", () => {
    let state = addConversationTask(conversation(), { id: "task:collect", title: "Collect sources" });
    state = addConversationTask(state, { id: "task:map", title: "Map people", dependencies: ["task:collect"] });

    expect(runnableConversationTasks(state).map((task) => task.id)).toEqual(["task:collect"]);
    state = updateConversationTask(state, "task:collect", { status: "completed" });
    expect(runnableConversationTasks(state).map((task) => task.id)).toEqual(["task:map"]);
    expect(state.taskList[0].completedAt).toBeTruthy();
  });

  it("supports lifecycle updates, blockers, and dependency-safe removal", () => {
    let state = addConversationTask(conversation(), { id: "task:first", title: "First" });
    state = addConversationTask(state, { id: "task:second", title: "Second", dependencies: ["task:first"] });
    state = updateConversationTask(state, "task:first", { status: "blocked", blockedReason: "Needs a source" });

    expect(state.taskList[0]).toMatchObject({ status: "blocked", blockedReason: "Needs a source" });
    state = removeConversationTask(state, "task:first");
    expect(state.taskList).toEqual([expect.objectContaining({ id: "task:second", dependencies: [] })]);
  });

  it("renders a compact auditable task list", () => {
    let state = addConversationTask(conversation(), { id: "task:one", title: "Verify record" });
    state = updateConversationTask(state, "task:one", { status: "in-progress" });
    expect(taskListMarkdown(state)).toContain("Verify record (task:one · in-progress)");
  });

  it("rejects missing titles and unknown task IDs", () => {
    expect(() => addConversationTask(conversation(), { title: " " })).toThrow("Task title is required");
    expect(() => updateConversationTask(conversation(), "task:missing", { status: "completed" })).toThrow("Task not found");
  });
});
