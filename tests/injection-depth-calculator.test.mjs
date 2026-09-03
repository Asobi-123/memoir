import assert from "node:assert/strict";
import { isMessageExcludedFromContext } from "../src/services/chat-visibility.js";
import { hasCharacterLayerAnchor } from "../src/services/injection-compatibility.js";
import { calculateAutomaticInjectionDepth } from "../src/services/injection-depth-calculator.js";

function mask(length, hiddenUntil = 0) {
    return Array.from({ length }, (_, index) => index < hiddenUntil);
}

function range(startMes, endMes) {
    return { startMes, endMes };
}

assert.equal(
    calculateAutomaticInjectionDepth(mask(100, 70), [range(0, 69)]),
    30,
    "70 hidden, summarized floors followed by 30 visible floors stays at depth 30",
);
assert.equal(
    calculateAutomaticInjectionDepth(mask(101, 70), [range(0, 69)]),
    31,
    "a new visible message moves the automatic position by one",
);
assert.equal(
    calculateAutomaticInjectionDepth([true, true, false, true], [range(0, 1)]), null);
assert.equal(
    calculateAutomaticInjectionDepth(mask(100, 70), [range(0, 68)]), null);
assert.equal(
    calculateAutomaticInjectionDepth(mask(100, 70), [range(0, 70)]), null);
assert.equal(
    calculateAutomaticInjectionDepth(mask(70, 70), [range(0, 69)]), 0);
assert.equal(
    calculateAutomaticInjectionDepth(mask(30, 0), []), null);
assert.equal(
    calculateAutomaticInjectionDepth([], []), null);

assert.equal(hasCharacterLayerAnchor("openai", new Set(["main"])), true);
assert.equal(hasCharacterLayerAnchor("openai", new Set(["core"])), false);
assert.equal(hasCharacterLayerAnchor("openai", null), false);
assert.equal(hasCharacterLayerAnchor("kobold", null), true);

const ignoreSymbol = Symbol.for("ignore");
assert.equal(isMessageExcludedFromContext({ is_system: true }, ignoreSymbol), true);
assert.equal(isMessageExcludedFromContext({ extra: { [ignoreSymbol]: true } }, ignoreSymbol), true);
assert.equal(isMessageExcludedFromContext({ is_system: false, extra: {} }, ignoreSymbol), false);

console.log("injection compatibility and depth: all assertions passed");
