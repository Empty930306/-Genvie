import { describe, expect, test } from "bun:test";
import { CONTENT_MODERATION_MESSAGE, generationErrorMessage, generationFailureMetadata } from "../src/lib/generation-error";
import { STORAGE_LIMIT_REASONS } from "../src/lib/workspace-storage";

test("Agent history quota explains recovery without offering file storage", () => {
    const reason = "agent_history_capacity_exceeded";
    expect(generationErrorMessage({ reason })).toContain("管理员");
    expect(generationErrorMessage({ reason })).not.toMatch(/充值|购买|素材/);
    expect(STORAGE_LIMIT_REASONS.has(reason)).toBe(false);
    expect(STORAGE_LIMIT_REASONS.has("storage_capacity_exceeded")).toBe(true);
});

describe("safe upstream error details", () => {
    const detail = "非常抱歉，生成的图片可能违反了关于裸露、色情或情色内容的防护限制。请重试或修改提示语。";
    test("drops upstream detail from the card", () => {
        const message = `模型服务拒绝了请求，请检查模型和参数；上游：${detail}`;
        expect(generationErrorMessage(new Error(message))).toBe("模型服务拒绝了请求，请检查模型和参数");
    });
    test("does not replace a safe upstream message with a generic HTTP hint", () => {
        const message = `模型服务暂时不可用（HTTP 500）；上游：${detail}`;
        expect(generationErrorMessage(message)).toBe("模型服务暂时不可用，请稍后再试。");
        expect(generationErrorMessage("模型服务暂时不可用（HTTP 500）")).toBe("模型服务暂时不可用，请稍后再试。");
    });
    test("keeps details when moderation metadata is stored", () => {
        const message = `内容审核未通过；上游：${detail}`;
        const metadata = generationFailureMetadata(message, "test prompt");
        expect(metadata.errorDetails).toBe(CONTENT_MODERATION_MESSAGE);
        expect(metadata.generationErrorCode).toBe("sensitive_words_detected");
    });
    test("gives actionable hints for known upstream failures", () => {
        expect(generationErrorMessage(`模型服务暂时不可用（HTTP 503）；上游：model_not_found request id abc`)).toContain("更换模型");
        expect(generationErrorMessage(`模型服务拒绝请求；上游：image file too large 25MB`)).toContain("压缩图片");
    });
    test("upstream marker does not bypass URL hiding", () => {
        expect(generationErrorMessage("模型服务请求失败；上游：https://private.test")).toBe("模型服务请求失败");
    });
});

describe("浏览器能力缺失不等于模型失败", () => {
    // 非安全上下文没有 crypto.subtle，取 digest 抛出的是浏览器本地异常，
    // 不能引导用户换模型或重新付费生成。
    test("crypto.subtle 缺失时提示改用 HTTPS，而不是模型服务失败", () => {
        const error = new TypeError("Cannot read properties of undefined (reading 'digest')");
        const message = generationErrorMessage(error);
        expect(message).toContain("HTTPS");
        expect(message).not.toContain("模型服务处理失败");
    });
    test("不同浏览器文案都能识别", () => {
        expect(generationErrorMessage(new Error("crypto.subtle is undefined"))).toContain("HTTPS");
        expect(generationErrorMessage(new Error("Cannot read property 'subtle' of undefined"))).toContain("HTTPS");
    });
    test("不把上游的 is not a function 误判为本地能力问题", () => {
        expect(generationErrorMessage("upstream gateway: response.text is not a function")).not.toContain("HTTPS");
    });
});
