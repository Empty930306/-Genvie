import assert from "node:assert/strict";
import test from "node:test";

// Node 原生 TypeScript 测试运行器要求保留扩展名，项目编译器不允许该写法。
// @ts-expect-error -- Node 原生 TypeScript 测试运行器需要保留扩展名。
import { agentCopy, agentCopySegments } from "./agent-appearance.ts";

function plain(segments: { text: string; brand: boolean }[]) {
    return segments.map((segment) => segment.text).join("");
}

test("标题按 {agentName} 占位符切段，名称段标记为高亮", () => {
    const segments = agentCopySegments("在这里，{agentName}让灵感，慢慢成形", "造境");
    assert.deepEqual(segments, [
        { text: "在这里，", brand: false },
        { text: "造境", brand: true },
        { text: "让灵感，慢慢成形", brand: false },
    ]);
});

test("切段不改变文案原文，与 agentCopy 结果一致", () => {
    for (const template of ["在这里，{agentName}让灵感，慢慢成形", "在这里{agentName}，让灵感，慢慢成形", "{agentName}，从一句话开始。"]) {
        assert.equal(plain(agentCopySegments(template, "造境")), agentCopy(template, "造境"));
    }
});

test("没有占位符时按名称字面量切段", () => {
    const segments = agentCopySegments("在这里造境，让灵感，慢慢成形", "造境");
    assert.deepEqual(segments, [
        { text: "在这里", brand: false },
        { text: "造境", brand: true },
        { text: "，让灵感，慢慢成形", brand: false },
    ]);
});

test("占位符优先于字面量，名称重复出现时每段都高亮", () => {
    const segments = agentCopySegments("{agentName}和{agentName}", "造境");
    assert.deepEqual(segments, [
        { text: "造境", brand: true },
        { text: "和", brand: false },
        { text: "造境", brand: true },
    ]);
});

test("标题不含名称时整段为普通文字，不插入名称", () => {
    assert.deepEqual(agentCopySegments("在这里，让灵感，慢慢成形", "造境"), [{ text: "在这里，让灵感，慢慢成形", brand: false }]);
});

test("名称为空时只保留一段普通文字，不产生空高亮段", () => {
    assert.deepEqual(agentCopySegments("在这里，{agentName}让灵感", ""), [{ text: "在这里，让灵感", brand: false }]);
});
