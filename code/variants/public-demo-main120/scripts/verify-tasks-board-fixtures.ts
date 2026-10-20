import assert from "node:assert/strict"

import { TASK_TRANSITIONS, creationTransitionActions, reorderIds, transitionAction } from "../src/lib/tasks-board.js"

const ids = ["first", "second", "third"]

assert.deepEqual(reorderIds(ids, "third", "first"), ["third", "first", "second"])
assert.deepEqual(reorderIds(ids, "first", "third"), ["second", "first", "third"])
assert.deepEqual(reorderIds(ids, "second", null), ["first", "third", "second"])

assert.equal(transitionAction("not_started", "in_progress"), "start")
assert.equal(transitionAction("not_started", "completed"), "complete")
assert.equal(transitionAction("in_progress", "reviewed"), null)
assert.equal(transitionAction("reviewed", "in_progress"), null)
assert.equal(transitionAction("archived", "not_started"), null)
assert.deepEqual(TASK_TRANSITIONS.completed, ["completed", "reviewed", "archived"])
assert.deepEqual(creationTransitionActions("not_started"), [])
assert.deepEqual(creationTransitionActions("in_progress"), ["start"])
assert.deepEqual(creationTransitionActions("completed"), ["complete"])
assert.deepEqual(creationTransitionActions("reviewed"), ["complete", "review"])
assert.deepEqual(creationTransitionActions("archived"), ["archive"])

console.log("Tasks board ordering and lifecycle fixtures passed.")
